from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_category_service
from app.schemas.category import CategoryCreateSchema, CategorySchema, CategoryUpdateSchema
from app.services.category import CategoryNotFound, CategoryService

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategorySchema])
def read_categories(category_service: CategoryService = Depends(get_category_service)):
    return category_service.list_categories()


@router.post("", response_model=CategorySchema, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreateSchema,
    category_service: CategoryService = Depends(get_category_service),
):
    return category_service.create_category(payload)


@router.patch("/{category_id}", response_model=CategorySchema)
def update_category(
    category_id: str,
    payload: CategoryUpdateSchema,
    category_service: CategoryService = Depends(get_category_service),
):
    try:
        return category_service.update_category(category_id, payload)
    except CategoryNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: str,
    category_service: CategoryService = Depends(get_category_service),
) -> None:
    try:
        category_service.delete_category(category_id)
    except CategoryNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
