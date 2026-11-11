from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints


class TaskSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    completed: bool


class TaskCreateSchema(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TaskUpdateSchema(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)] | None = None
    completed: bool | None = None
