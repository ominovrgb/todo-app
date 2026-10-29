from sqlalchemy.orm import Session

from app.repositories.category import CategoryRepository
from app.schemas.category import CategoryCreateSchema, CategorySchema, CategoryUpdateSchema


class CategoryNotFound(Exception):
    def __init__(self) -> None:
        super().__init__("Category not found")


class CategoryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.category_repository = CategoryRepository(db)

    def list_categories(self) -> list[CategorySchema]:
        return [CategorySchema.model_validate(category) for category in self.category_repository.get_all()]

    def create_category(self, category_create: CategoryCreateSchema) -> CategorySchema:
        try:
            category = self.category_repository.create(name=category_create.name)
            self.db.commit()
            return CategorySchema.model_validate(category)
        except Exception:
            self.db.rollback()
            raise

    def update_category(self, category_id: str, category_update: CategoryUpdateSchema) -> CategorySchema:
        try:
            category = self.category_repository.get_by_id(category_id)
            if category is None:
                raise CategoryNotFound()
            if category_update.name is not None:
                category.name = category_update.name
            if category_update.complete is not None:
                category.complete = category_update.complete
            self.db.commit()
            return CategorySchema.model_validate(category)
        except Exception:
            self.db.rollback()
            raise

    def delete_category(self, category_id: str) -> None:
        try:
            category = self.category_repository.get_by_id(category_id)
            if category is None:
                raise CategoryNotFound()
            self.category_repository.delete(category)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
