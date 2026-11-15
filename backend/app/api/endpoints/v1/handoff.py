from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.user import get_current_user
from app.api.endpoints.v1.aircraft import get_board
from app.db.session import get_db
from app.models import User
from app.schemas.handoff import (
    HandoffAcknowledgeInput,
    HandoffAnswersTextInput,
    HandoffAnswersTextOut,
    HandoffPreviewOut,
    HandoffRecord,
    HandoffReportInput,
    HandoffReportOut,
    HandoffReviewOut,
    HandoffStartInput,
    HandoffSummary,
    HandoffVerifyInput,
)
from app.services import handover
from app.services.handoff import build_report, fill_answers, review_board

router = APIRouter(prefix="/aircraft", tags=["Handoff"])


@router.post("/{registration}/handoff/review", response_model=HandoffReviewOut)
async def review_handoff(
    registration: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board = get_board(registration, user, db)
    return await review_board(board)


@router.post(
    "/{registration}/handoff/answers/text", response_model=HandoffAnswersTextOut
)
async def fill_handoff_answers(
    registration: str,
    body: HandoffAnswersTextInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board = get_board(registration, user, db)
    return await fill_answers(board, body)


@router.post("/{registration}/handoff/report", response_model=HandoffReportOut)
def generate_handoff_report(
    registration: str,
    body: HandoffReportInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    board = get_board(registration, user, db)
    return build_report(board, body.answers, user.name)


@router.post(
    "/{registration}/handoff/start", response_model=HandoffRecord, status_code=201
)
async def start_handover(
    registration: str,
    body: HandoffStartInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await handover.start_handoff(registration, body, user, db)


@router.post("/{registration}/handoff/preview", response_model=HandoffPreviewOut)
async def preview_handover(
    registration: str,
    body: HandoffReportInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await handover.preview_handoff(registration, body, user, db)


@router.get("/{registration}/handoff", response_model=list[HandoffSummary])
def handover_history(
    registration: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return handover.list_handoffs(registration, user, db)


@router.get("/{registration}/handoff/{handoff_id}", response_model=HandoffRecord)
def read_handover(
    registration: str,
    handoff_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return handover.get_handoff(registration, handoff_id, user, db)


@router.post(
    "/{registration}/handoff/{handoff_id}/verify", response_model=HandoffRecord
)
def verify_handover(
    registration: str,
    handoff_id: str,
    body: HandoffVerifyInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return handover.verify_incoming(registration, handoff_id, body, user, db)


@router.post(
    "/{registration}/handoff/{handoff_id}/acknowledge", response_model=HandoffRecord
)
def acknowledge_handover(
    registration: str,
    handoff_id: str,
    body: HandoffAcknowledgeInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return handover.acknowledge_task(registration, handoff_id, body, user, db)


@router.post(
    "/{registration}/handoff/{handoff_id}/confirm", response_model=HandoffRecord
)
def confirm_handover(
    registration: str,
    handoff_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return handover.confirm_handoff(registration, handoff_id, user, db)


@router.post(
    "/{registration}/handoff/{handoff_id}/finish", response_model=HandoffRecord
)
def finish_handover(
    registration: str,
    handoff_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return handover.finish_handoff(registration, handoff_id, user, db)
