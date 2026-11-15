from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.schemas.aircraft import AircraftOut
from app.schemas.auth import EmployeeOut
from app.schemas.board import WorkItemOut


class HandoffQuestion(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )
    task_id: str = Field(min_length=1, max_length=36)
    question: str = Field(min_length=1, max_length=300)


class HandoffAnswer(HandoffQuestion):
    answer: str = Field(min_length=1, max_length=2000)


class HandoffReviewOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    questions: list[HandoffQuestion] = Field(max_length=3)
    reviewed_task_count: int = Field(ge=0)
    warnings: list[str] = Field(default_factory=list)


class HandoffReportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[HandoffAnswer] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def unique_answers(self):
        pairs = {
            (answer.task_id, answer.question.casefold()) for answer in self.answers
        }
        if len(pairs) != len(self.answers):
            raise ValueError("Answer each handoff question only once.")
        return self


class HandoffReportOut(BaseModel):
    report: str
    warnings: list[str] = Field(default_factory=list)


class HandoffVerifyInput(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )
    user_id: str = Field(min_length=1, max_length=36)
    pin: str = Field(pattern=r"^[0-9]{6}$", strict=True)


class HandoffAcknowledgeInput(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )
    task_id: str = Field(min_length=1, max_length=36)
    question: str = Field(default="", max_length=500)
    resolution: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def question_is_resolved(self):
        if bool(self.question) != bool(self.resolution):
            raise ValueError(
                "A question and its agreed resolution must be recorded together."
            )
        return self


class HandoffAcknowledgement(HandoffAcknowledgeInput):
    acknowledged_at: datetime


class HandoffRecord(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: str
    aircraft: AircraftOut
    items: list[WorkItemOut]
    employees: list[EmployeeOut]
    outgoing: EmployeeOut
    incoming: EmployeeOut | None
    recipients: list[EmployeeOut]
    status: Literal["draft", "confirmed", "completed"]
    acknowledged_task_ids: list[str]
    required_task_ids: list[str]
    acknowledgements: list[HandoffAcknowledgement]
    answers: list[HandoffAnswer]
    report: str
    created_at: datetime
    verified_at: datetime | None
    confirmed_at: datetime | None
    completed_at: datetime | None


class HandoffAnswerDraft(HandoffQuestion):
    answer: str = Field(default="", max_length=2000)


class HandoffAnswersTextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    transcript: str = Field(min_length=1, max_length=12000)
    questions: list[HandoffAnswerDraft] = Field(min_length=1, max_length=3)


class HandoffAnswersTextOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[Annotated[str, Field(strict=True, max_length=2000)]] = Field(
        min_length=1, max_length=3
    )
    transcript: str
