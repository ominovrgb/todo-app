from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints


class CategorySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    complete: bool


class CategoryCreateSchema(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class CategoryUpdateSchema(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)] | None = None
    complete: bool | None = None
