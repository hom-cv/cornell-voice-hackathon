from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.dependencies.user import get_current_user
from app.db.session import get_db
from app.models import AircraftAssignment, User
from app.schemas.capture import (
    CaptureDraft,
    CaptureOut,
    CaptureTextInput,
    TranscriptionOut,
)
from app.services.capture import MAX_AUDIO_BYTES, extract_form, transcribe_audio

router = APIRouter(prefix="/aircraft", tags=["Voice capture"])


async def read_audio_upload(audio: UploadFile) -> bytes:
    try:
        content = await audio.read(MAX_AUDIO_BYTES + 1)
    finally:
        await audio.close()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Record a shorter clip (maximum 90 seconds).")
    return content


def require_assignment(registration: str, user: User, db: Session) -> None:
    if db.get(AircraftAssignment, (user.id, registration)) is None:
        raise HTTPException(404, "Aircraft not found or not assigned to you.")


@router.post("/{registration}/capture/text", response_model=CaptureOut)
async def capture_text(
    registration: str,
    body: CaptureTextInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_assignment(registration, user, db)
    return await extract_form(body.transcript, body.draft, body.clarifications)


@router.post("/{registration}/capture/audio", response_model=CaptureOut)
async def capture_audio(
    registration: str,
    audio: Annotated[UploadFile, File()],
    draft: Annotated[str, Form(max_length=2_850_000)] = "{}",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_assignment(registration, user, db)
    try:
        current = CaptureDraft.model_validate_json(draft)
    except ValidationError:
        raise HTTPException(422, "The current form contains invalid fields.") from None
    content = await read_audio_upload(audio)
    transcript = await transcribe_audio(content)
    try:
        return await extract_form(transcript, current)
    except HTTPException as exc:
        # Keep successfully transcribed speech so users can retry extraction.
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "transcript": transcript},
        )


@router.post("/{registration}/capture/transcribe", response_model=TranscriptionOut)
async def transcribe_answer(
    registration: str,
    audio: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_assignment(registration, user, db)
    content = await read_audio_upload(audio)
    transcript = (await transcribe_audio(content)).strip()
    if not transcript:
        raise HTTPException(422, "No speech was recognized. Try a short answer.")
    if len(transcript) > 2000:
        raise HTTPException(
            422,
            "That answer is too long. Record a shorter answer "
            "(maximum 2,000 characters).",
        )
    return TranscriptionOut(transcript=transcript)
