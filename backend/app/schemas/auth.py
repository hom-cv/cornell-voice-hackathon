from pydantic import BaseModel, ConfigDict, Field


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str


class LoginInput(BaseModel):
    user_id: str = Field(min_length=1, max_length=36)
    pin: str = Field(pattern=r"^[0-9]{6}$", strict=True)


class LoginOut(BaseModel):
    token: str
    employee: EmployeeOut
