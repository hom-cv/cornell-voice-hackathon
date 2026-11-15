from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.board import WorkItemInput


class CaptureDraft(WorkItemInput):
    """An unsaved form may still be missing its title and location."""

    title: str = Field(default="", max_length=300)
    area: str = Field(default="", max_length=160)
    status: Literal["not_started", "open", "in_progress", "blocked", "done"] = (
        "not_started"
    )


class Clarification(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    question: str = Field(min_length=1, max_length=300)
    answer: str = Field(min_length=1, max_length=2000)


class CaptureTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    transcript: str = Field(min_length=1, max_length=12000)
    draft: CaptureDraft = Field(default_factory=CaptureDraft)
    clarifications: list[Clarification] = Field(default_factory=list, max_length=2)


class CaptureOut(BaseModel):
    transcript: str
    draft: CaptureDraft
    warnings: list[str]

    questions: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(
        default_factory=list, max_length=2
    )


class TranscriptionOut(BaseModel):
    transcript: str = Field(min_length=1, max_length=2000)
