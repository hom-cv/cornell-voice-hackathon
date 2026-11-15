from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AircraftInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    registration: str = Field(min_length=1, max_length=20, pattern=r"^[A-Z0-9-]+$")
    model: str = Field(min_length=1, max_length=80)
    location: str = Field(min_length=1, max_length=160)
    work: str = Field(min_length=1, max_length=300)
    due: str = Field(min_length=1, max_length=100)


class AircraftOut(AircraftInput):
    model_config = ConfigDict(
        from_attributes=True, alias_generator=to_camel, populate_by_name=True
    )
    handoff_items: int = 0
    open_items: int
    completed_items: int
    total_items: int
