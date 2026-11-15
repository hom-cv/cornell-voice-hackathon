from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies.user import get_current_user
from app.db.session import get_db
from app.models import Aircraft, AircraftAssignment, User, WorkItem
from app.schemas.aircraft import AircraftInput, AircraftOut
from app.schemas.auth import EmployeeOut
from app.schemas.board import BoardOut, WorkItemInput, WorkItemOut

router = APIRouter(prefix="/aircraft", tags=["Aircraft"])


def aircraft_summaries(aircraft: list[Aircraft], db: Session) -> list[AircraftOut]:
    registrations = [plane.registration for plane in aircraft]
    counts = (
        {
            row.aircraft_registration: row
            for row in db.execute(
                select(
                    WorkItem.aircraft_registration,
                    func.sum(
                        case((WorkItem.handoff_review_required.is_(True), 1), else_=0)
                    ).label("handoff"),
                    func.count().label("total"),
                    func.sum(case((WorkItem.status == "done", 1), else_=0)).label(
                        "done"
                    ),
                    func.sum(case((WorkItem.left_open.is_(True), 1), else_=0)).label(
                        "opened"
                    ),
                )
                .where(WorkItem.aircraft_registration.in_(registrations))
                .group_by(WorkItem.aircraft_registration)
            )
        }
        if registrations
        else {}
    )
    output = []
    for plane in aircraft:
        count = counts.get(plane.registration)
        output.append(
            AircraftOut.model_validate(plane).model_copy(
                update={
                    "total_items": count.total if count else 0,
                    "completed_items": count.done if count else 0,
                    "open_items": count.opened if count else 0,
                    "handoff_items": count.handoff if count else 0,
                }
            )
        )
    return output


def lock_aircraft(registration: str, user: User, db: Session) -> Aircraft:
    if db.get(AircraftAssignment, (user.id, registration)) is None:
        raise HTTPException(404, "Aircraft not found or not assigned to you.")
    aircraft = db.scalar(
        select(Aircraft).where(Aircraft.registration == registration).with_for_update()
    )
    if aircraft is None:
        raise HTTPException(404, "Aircraft not found.")
    return aircraft


@router.get("", response_model=list[AircraftOut])
def list_aircraft(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    aircraft = db.scalars(
        select(Aircraft)
        .join(AircraftAssignment)
        .where(AircraftAssignment.user_id == user.id)
        .order_by(Aircraft.registration)
    ).all()
    return aircraft_summaries(aircraft, db)


@router.get("/{registration}", response_model=AircraftOut)
def get_aircraft(
    registration: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.get(AircraftAssignment, (user.id, registration))
    if assignment is None:
        raise HTTPException(404, "Aircraft not found or not assigned to you.")
    return aircraft_summaries([db.get(Aircraft, registration)], db)[0]


@router.post("", response_model=AircraftOut, status_code=201)
def create_aircraft(
    body: AircraftInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Opening a new arrival assigns its creator; existing planes cannot be claimed.
    aircraft = Aircraft(**body.model_dump())
    db.add(aircraft)
    try:
        db.flush()
        db.add(
            AircraftAssignment(
                user_id=user.id,
                aircraft_registration=aircraft.registration,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This aircraft already has a visit.") from None
    return aircraft


@router.get("/{registration}/board", response_model=BoardOut)
def get_board(
    registration: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    aircraft = get_aircraft(registration, user, db)
    items = db.scalars(
        select(WorkItem)
        .where(WorkItem.aircraft_registration == registration)
        .order_by(WorkItem.id)
    ).all()
    employees = db.scalars(
        select(User)
        .where(
            User.id.in_(
                select(AircraftAssignment.user_id).where(
                    AircraftAssignment.aircraft_registration == registration
                )
            )
            | User.id.in_([item.assignee_id for item in items if item.assignee_id])
        )
        .order_by(User.name)
    ).all()
    return BoardOut(
        aircraft=AircraftOut.model_validate(aircraft).model_copy(
            update={
                "total_items": len(items),
                "completed_items": sum(item.status == "done" for item in items),
                "open_items": sum(item.left_open for item in items),
                "handoff_items": sum(item.handoff_review_required for item in items),
            }
        ),
        items=[WorkItemOut.model_validate(item) for item in items],
        employees=[EmployeeOut.model_validate(employee) for employee in employees],
    )


@router.post("/{registration}/items", response_model=WorkItemOut, status_code=201)
def create_work_item(
    registration: str,
    body: WorkItemInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lock_aircraft(registration, user, db)
    values = body.model_dump()
    if body.status == "open":
        values["handoff_review_required"] = True
    item = WorkItem(
        id=str(uuid4()),
        aircraft_registration=registration,
        assignee_id=user.id,
        **values,
    )
    db.add(item)
    db.commit()
    return item


@router.put("/{registration}/items/{item_id}", response_model=WorkItemOut)
def update_work_item(
    registration: str,
    item_id: str,
    body: WorkItemInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lock_aircraft(registration, user, db)
    item = db.scalar(
        select(WorkItem)
        .where(
            WorkItem.id == item_id,
            WorkItem.aircraft_registration == registration,
        )
        .with_for_update()
    )
    if item is None:
        raise HTTPException(404, "Work item not found on this aircraft.")
    values = body.model_dump()
    if body.status == "open":
        values["handoff_review_required"] = True
    elif "handoff_review_required" not in body.model_fields_set:
        # Changing work progress must not silently clear handoff review priority.
        values.pop("handoff_review_required")
    for key, value in values.items():
        setattr(item, key, value)
    db.commit()
    return item
