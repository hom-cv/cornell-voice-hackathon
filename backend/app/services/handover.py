"""Persisted, witnessed handover state transitions and immutable board snapshots."""

import hashlib
import json
from datetime import timedelta
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.endpoints.v1.aircraft import get_board, lock_aircraft
from app.api.endpoints.v1.auth import DUMMY_HASH
from app.core.security import as_utc, utc_now, verify_pin
from app.models import AircraftAssignment, Handoff, HandoffPreview, User, WorkItem
from app.schemas.auth import EmployeeOut
from app.schemas.board import BoardOut, WorkItemInput
from app.schemas.capture import CaptureDraft, Clarification
from app.schemas.handoff import (
    HandoffAcknowledgeInput,
    HandoffPreviewOut,
    HandoffRecord,
    HandoffReportInput,
    HandoffStartInput,
    HandoffSummary,
    HandoffTaskChange,
    HandoffVerifyInput,
)
from app.services.capture import extract_form
from app.services.handoff import build_report


def _snapshot(board: BoardOut) -> dict:
    result = board.model_dump(by_alias=True)
    for item in result["items"]:
        item["photoData"] = ""
    return result


def _fingerprint(snapshot: dict) -> str:
    content = json.dumps(
        {"aircraft": snapshot["aircraft"], "items": snapshot["items"]},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(content.encode()).hexdigest()


def _required_ids(record: Handoff) -> list[str]:
    return [
        item["id"]
        for item in record.snapshot["items"]
        if item["status"] != "done" or item["leftOpen"] or item["handoffReviewRequired"]
    ]


def _recipients(record: Handoff, db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(AircraftAssignment)
            .where(
                AircraftAssignment.aircraft_registration
                == record.aircraft_registration,
                User.active.is_(True),
                User.id != record.outgoing_user_id,
            )
            .order_by(User.name)
        ).all()
    )


def _audit_report(record: Handoff, db: Session) -> str:
    incoming = (
        db.get(User, record.incoming_user_id) if record.incoming_user_id else None
    )

    def stamp(value):
        return as_utc(value).strftime("%Y-%m-%d %H:%M:%S UTC") if value else "Not yet"

    lines = [
        record.report,
        "",
        "JOINT HANDOVER ACKNOWLEDGMENT",
        f"Handoff ID: {record.id}",
        f"Lifecycle status: {record.status}",
        f"Outgoing employee: {record.snapshot['outgoing']['name']}",
        f"Incoming employee: {incoming.name if incoming else 'Not verified'}",
        f"Prepared: {stamp(record.created_at)}",
        f"Incoming PIN verified: {stamp(record.verified_at)}",
        f"Walkthrough confirmed: {stamp(record.confirmed_at)}",
        f"Handover completed: {stamp(record.completed_at)}",
        f"Acknowledged attention items: {len(record.acknowledgements)} "
        f"of {len(_required_ids(record))}",
    ]
    titles = {item["id"]: item["title"] for item in record.snapshot["items"]}
    for acknowledgment in record.acknowledgements:
        lines += [
            "",
            f"Understood: {titles[acknowledgment['taskId']]}",
            f"Task ID: {acknowledgment['taskId']}",
            f"Acknowledged at: {acknowledgment['acknowledgedAt']}",
        ]
        if acknowledgment["question"]:
            lines += [
                f"Question discussed together: {acknowledgment['question']}",
                f"Agreed resolution: {acknowledgment['resolution']}",
            ]
    if record.status == "completed":
        lines += [
            "",
            "The incoming employee acknowledged every attention item.",
            "Unfinished tasks were flagged for the next handoff. Review priority "
            "was cleared only for completed items explicitly acknowledged together.",
            "The final acknowledgment did not change work status or "
            "physical-open flags.",
        ]
    return "\n".join(lines)


def handoff_output(record: Handoff, db: Session) -> HandoffRecord:
    return HandoffRecord(
        id=record.id,
        aircraft=record.snapshot["aircraft"],
        items=record.snapshot["items"],
        employees=record.snapshot["employees"],
        outgoing=record.snapshot["outgoing"],
        incoming=(
            EmployeeOut.model_validate(db.get(User, record.incoming_user_id))
            if record.incoming_user_id
            else None
        ),
        recipients=[
            EmployeeOut.model_validate(user) for user in _recipients(record, db)
        ],
        status=record.status,
        acknowledged_task_ids=[item["taskId"] for item in record.acknowledgements],
        required_task_ids=_required_ids(record),
        acknowledgements=record.acknowledgements,
        answers=record.answers,
        report=_audit_report(record, db),
        created_at=record.created_at,
        verified_at=record.verified_at,
        confirmed_at=record.confirmed_at,
        completed_at=record.completed_at,
    )


def _load(
    registration: str,
    handoff_id: str,
    actor: User,
    db: Session,
    *,
    mutate: bool,
) -> Handoff:
    # All application task writes acquire the same aircraft lock before row locks.
    # This keeps snapshot validation and final review-flag transfer atomic.
    lock_aircraft(registration, actor, db)
    query = select(Handoff).where(
        Handoff.id == handoff_id,
        Handoff.aircraft_registration == registration,
    )
    if mutate:
        query = query.with_for_update()
    record = db.scalar(query)
    if record is None or (
        actor.id not in {record.outgoing_user_id, record.incoming_user_id}
        and (mutate or record.status != "completed")
    ):
        raise HTTPException(404, "Handoff not found.")
    if mutate and actor.id != record.outgoing_user_id:
        raise HTTPException(
            403, "Continue this handoff from the outgoing employee's session."
        )
    return record


def get_handoff(registration: str, handoff_id: str, actor: User, db: Session):
    return handoff_output(_load(registration, handoff_id, actor, db, mutate=False), db)


async def preview_handoff(
    registration: str,
    body: HandoffReportInput,
    actor: User,
    db: Session,
) -> HandoffPreviewOut:
    board = get_board(registration, actor, db)
    original_hash = _fingerprint(_snapshot(board))
    items = {item.id: item for item in board.items}
    grouped: dict[str, list[Clarification]] = {}
    for answer in body.answers:
        if answer.task_id not in items:
            raise HTTPException(404, "A reviewed task is no longer on this aircraft.")
        grouped.setdefault(answer.task_id, []).append(
            Clarification(question=answer.question, answer=answer.answer)
        )
    # Release the read transaction before inference; no row locks span model calls.
    db.rollback()
    candidates = {}
    for task_id, clarifications in grouped.items():
        values = items[task_id].model_dump(exclude={"id", "assignee_id", "photo_data"})
        draft = CaptureDraft.model_validate(values)
        result = await extract_form(
            "", draft, clarifications, require_reconciliation=True
        )
        if result.questions:
            raise HTTPException(
                502,
                "Nimbus could not reconcile the answers. "
                "No tasks were saved; review your answers.",
            )
        try:
            candidates[task_id] = WorkItemInput.model_validate(
                result.draft.model_dump()
            )
        except ValidationError:
            raise HTTPException(
                502,
                "Nimbus returned an incomplete task update. No tasks were "
                "saved. Review the answers and retry.",
            ) from None
    lock_aircraft(registration, actor, db)
    db.expire_all()
    current = get_board(registration, actor, db)
    if _fingerprint(_snapshot(current)) != original_hash:
        raise HTTPException(
            409,
            "Aircraft tasks changed while answers were being "
            "processed. Review the board and prepare the handoff again.",
        )
    changes = []
    serialized = {}
    for task_id, candidate in candidates.items():
        if candidate.status == "open":
            candidate.handoff_review_required = True
        before = CaptureDraft.model_validate(
            items[task_id].model_dump(exclude={"id", "assignee_id", "photo_data"})
        )
        after = CaptureDraft.model_validate(candidate.model_dump())
        serialized[task_id] = candidate.model_dump(exclude={"photo_data"})
        if before != after:
            changes.append(
                HandoffTaskChange(
                    task_id=task_id,
                    title=items[task_id].title,
                    before=before,
                    after=after,
                )
            )
    preview = HandoffPreview(
        id=str(uuid4()),
        aircraft_registration=registration,
        user_id=actor.id,
        board_hash=original_hash,
        answers=[answer.model_dump(by_alias=True) for answer in body.answers],
        candidates=serialized,
        expires_at=utc_now() + timedelta(minutes=30),
    )
    db.add(preview)
    db.commit()
    return HandoffPreviewOut(
        preview_id=preview.id, changes=changes, expires_at=preview.expires_at
    )


async def start_handoff(
    registration: str, body: HandoffStartInput, actor: User, db: Session
) -> HandoffRecord:
    lock_aircraft(registration, actor, db)
    answers = [answer.model_dump(by_alias=True) for answer in body.answers]
    preview = None
    if body.preview_id:
        preview = db.scalar(
            select(HandoffPreview)
            .where(
                HandoffPreview.id == body.preview_id,
                HandoffPreview.aircraft_registration == registration,
                HandoffPreview.user_id == actor.id,
            )
            .with_for_update()
        )
        if preview is None:
            raise HTTPException(404, "Handoff preview not found.")
        if preview.answers != answers:
            raise HTTPException(409, "Answers changed. Preview the task updates again.")
        if preview.handoff_id:
            return handoff_output(db.get(Handoff, preview.handoff_id), db)
        if as_utc(preview.expires_at) <= utc_now():
            raise HTTPException(409, "Preview expired. Preview the task updates again.")
        current = get_board(registration, actor, db)
        if _fingerprint(_snapshot(current)) != preview.board_hash:
            raise HTTPException(
                409, "Aircraft tasks changed. Preview the updates again."
            )
        for task_id, values in preview.candidates.items():
            item = db.get(WorkItem, task_id)
            for field, value in values.items():
                setattr(item, field, value)
    elif body.answers:
        raise HTTPException(409, "Preview the task changes before saving the handoff.")
    db.flush()
    board = get_board(registration, actor, db)
    report = build_report(board, body.answers, actor.name, answers_applied=True)
    snapshot = _snapshot(board)
    snapshot["outgoing"] = EmployeeOut.model_validate(actor).model_dump()
    record = Handoff(
        id=str(uuid4()),
        aircraft_registration=registration,
        outgoing_user_id=actor.id,
        status="draft",
        snapshot=snapshot,
        snapshot_hash=_fingerprint(snapshot),
        report=report.report,
        answers=[answer.model_dump(by_alias=True) for answer in body.answers],
        acknowledgements=[],
        created_at=utc_now(),
    )
    db.add(record)
    db.flush()
    if preview is not None:
        preview.handoff_id = record.id
    db.commit()
    return handoff_output(record, db)


def _unchanged(record: Handoff, actor: User, db: Session) -> None:
    current = _snapshot(get_board(record.aircraft_registration, actor, db))
    if _fingerprint(current) != record.snapshot_hash:
        raise HTTPException(
            409,
            "Aircraft tasks changed after this handoff was prepared. "
            "Return to the board and prepare a fresh handoff together.",
        )


def _verified_incoming(record: Handoff, db: Session) -> User:
    if not record.incoming_user_id or not record.verified_at:
        raise HTTPException(409, "Verify the incoming employee's PIN first.")
    incoming = db.scalar(
        select(User).where(User.id == record.incoming_user_id).with_for_update()
    )
    if (
        incoming is None
        or not incoming.active
        or db.get(
            AircraftAssignment, (record.incoming_user_id, record.aircraft_registration)
        )
        is None
    ):
        raise HTTPException(
            409, "The incoming employee is no longer active or assigned."
        )
    return incoming


def verify_incoming(
    registration: str,
    handoff_id: str,
    body: HandoffVerifyInput,
    actor: User,
    db: Session,
) -> HandoffRecord:
    record = _load(registration, handoff_id, actor, db, mutate=True)
    if record.status != "draft":
        raise HTTPException(
            409, "The incoming employee cannot change after confirmation."
        )
    _unchanged(record, actor, db)
    if record.acknowledgements and record.incoming_user_id != body.user_id:
        raise HTTPException(
            409, "Start a new handoff to change an acknowledged recipient."
        )
    incoming = db.scalar(select(User).where(User.id == body.user_id).with_for_update())
    assigned = db.get(AircraftAssignment, (body.user_id, registration)) is not None
    if (
        incoming is None
        or not incoming.active
        or not assigned
        or incoming.id == actor.id
    ):
        verify_pin(body.pin, DUMMY_HASH)
        raise HTTPException(
            422, "Choose another active employee assigned to this aircraft."
        )
    now = utc_now()
    if incoming.locked_until and as_utc(incoming.locked_until) > now:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    if incoming.locked_until:
        incoming.failed_attempts = 0
        incoming.locked_until = None
    if not verify_pin(body.pin, incoming.pin_hash):
        incoming.failed_attempts += 1
        if incoming.failed_attempts >= 5:
            incoming.locked_until = now + timedelta(minutes=15)
        db.commit()
        # Deliberately not 401: outgoing authentication remains valid.
        raise HTTPException(422, "The incoming employee's PIN is incorrect.")
    incoming.failed_attempts = 0
    incoming.locked_until = None
    record.incoming_user_id = incoming.id
    record.verified_at = now
    db.commit()
    return handoff_output(record, db)


def acknowledge_task(
    registration: str,
    handoff_id: str,
    body: HandoffAcknowledgeInput,
    actor: User,
    db: Session,
) -> HandoffRecord:
    record = _load(registration, handoff_id, actor, db, mutate=True)
    if record.status != "draft":
        raise HTTPException(409, "The walkthrough is already confirmed.")
    _unchanged(record, actor, db)
    _verified_incoming(record, db)
    if body.task_id not in _required_ids(record):
        raise HTTPException(422, "This task is not in the handoff attention list.")
    existing = next(
        (ack for ack in record.acknowledgements if ack["taskId"] == body.task_id), None
    )
    if existing:
        if (
            existing["question"] != body.question
            or existing["resolution"] != body.resolution
        ):
            raise HTTPException(
                409,
                "This acknowledgment is already recorded. "
                "Prepare a new handoff to change it.",
            )
        return handoff_output(record, db)
    record.acknowledgements = [
        *record.acknowledgements,
        {
            **body.model_dump(by_alias=True),
            "acknowledgedAt": utc_now().isoformat(),
        },
    ]
    db.commit()
    return handoff_output(record, db)


def _ready(record: Handoff, actor: User, db: Session) -> None:
    _unchanged(record, actor, db)
    _verified_incoming(record, db)
    expected = set(_required_ids(record))
    actual = {item["taskId"] for item in record.acknowledgements}
    if actual != expected:
        raise HTTPException(
            409, "The incoming employee must acknowledge every attention item."
        )
    if any(
        item["question"] and not item["resolution"] for item in record.acknowledgements
    ):
        raise HTTPException(409, "Resolve each walkthrough question together first.")


def confirm_handoff(
    registration: str,
    handoff_id: str,
    actor: User,
    db: Session,
) -> HandoffRecord:
    record = _load(registration, handoff_id, actor, db, mutate=True)
    if record.status in {"confirmed", "completed"}:
        return handoff_output(record, db)
    _ready(record, actor, db)
    record.status = "confirmed"
    record.confirmed_at = utc_now()
    db.commit()
    return handoff_output(record, db)


def finish_handoff(
    registration: str,
    handoff_id: str,
    actor: User,
    db: Session,
) -> HandoffRecord:
    record = _load(registration, handoff_id, actor, db, mutate=True)
    if record.status == "completed":
        return handoff_output(record, db)
    if record.status != "confirmed":
        raise HTTPException(409, "Confirm the walkthrough before finishing.")
    _ready(record, actor, db)
    acknowledged = {item["taskId"] for item in record.acknowledgements}
    items = db.scalars(
        select(WorkItem)
        .where(WorkItem.aircraft_registration == registration)
        .with_for_update()
    ).all()
    for item in items:
        if item.status != "done":
            item.handoff_review_required = True
        elif item.id in acknowledged and not item.left_open:
            # Explicitly walking a completed carry-over task closes review only.
            item.handoff_review_required = False
    record.status = "completed"
    record.completed_at = utc_now()
    db.commit()
    return handoff_output(record, db)


def list_handoffs(registration: str, actor: User, db: Session):
    get_board(registration, actor, db)
    records = db.scalars(
        select(Handoff)
        .where(
            Handoff.aircraft_registration == registration,
            (Handoff.status == "completed")
            | (Handoff.outgoing_user_id == actor.id)
            | (Handoff.incoming_user_id == actor.id),
        )
        .order_by(Handoff.created_at.desc())
    ).all()
    return [
        HandoffSummary(
            id=record.id,
            outgoing=record.snapshot["outgoing"],
            incoming=(
                EmployeeOut.model_validate(db.get(User, record.incoming_user_id))
                if record.incoming_user_id
                else None
            ),
            status=record.status,
            created_at=record.created_at,
            completed_at=record.completed_at,
        )
        for record in records
    ]
