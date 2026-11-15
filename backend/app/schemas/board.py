import base64
import binascii
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from app.schemas.aircraft import AircraftOut
from app.schemas.auth import EmployeeOut


class WorkItemOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True, alias_generator=to_camel, populate_by_name=True
    )
    id: str
    title: str
    area: str
    assignee_id: str | None
    status: Literal["not_started", "open", "in_progress", "blocked", "done"]
    stopped_at: str
    left_open: bool
    handoff_review_required: bool
    manual_reference: str
    found: str
    work_done: str
    next_action: str
    photo_data: str


class BoardOut(BaseModel):
    aircraft: AircraftOut
    items: list[WorkItemOut]
    employees: list[EmployeeOut]


class WorkItemInput(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="forbid",
    )
    title: str = Field(min_length=1, max_length=300)
    area: str = Field(min_length=1, max_length=160)
    status: Literal["not_started", "open", "in_progress", "blocked", "done"] = (
        "not_started"
    )
    stopped_at: str = Field(default="", max_length=1000)
    left_open: bool = False
    handoff_review_required: bool = False
    manual_reference: str = Field(default="", max_length=300)
    found: str = Field(default="", max_length=2000)
    work_done: str = Field(default="", max_length=2000)
    next_action: str = Field(default="", max_length=1000)

    photo_data: str = Field(default="", max_length=2_800_000)

    @field_validator("photo_data")
    @classmethod
    def validate_photo(cls, value: str) -> str:
        if not value:
            return value
        prefix, separator, payload = value.partition(",")
        allowed = {
            "data:image/jpeg;base64": "jpeg",
            "data:image/png;base64": "png",
            "data:image/webp;base64": "webp",
        }
        if not separator or prefix not in allowed:
            raise ValueError("Use a JPEG, PNG, or WebP photo.")
        try:
            decoded = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("The photo data is not valid base64.") from None
        if len(decoded) > 2 * 1024 * 1024:
            raise ValueError("The photo must be 2 MB or smaller.")
        valid = (
            (allowed[prefix] == "jpeg" and decoded.startswith(b"\xff\xd8\xff"))
            or (allowed[prefix] == "png" and decoded.startswith(b"\x89PNG\r\n\x1a\n"))
            or (
                allowed[prefix] == "webp"
                and decoded[:4] == b"RIFF"
                and decoded[8:12] == b"WEBP"
            )
        )
        if not valid:
            raise ValueError("The photo content does not match its image type.")
        return value

    @model_validator(mode="after")
    def validate_open_condition(self):
        if self.status == "done" and self.left_open:
            raise ValueError("A completed item cannot be left open on the aircraft.")
        return self
