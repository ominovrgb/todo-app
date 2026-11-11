from time import perf_counter

from app.cache.redis import RedisCacheBackend
from app.core.config import get_settings
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.repositories.category import CategoryRepository
from app.schemas.category import CategoryCreateSchema, CategorySchema, CategoryUpdateSchema


settings = get_settings()

class CategoryNotFound(Exception):
    def __init__(self) -> None:
        super().__init__("Category not found")


class CategoryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.category_repository = CategoryRepository(db)
        self.cache = RedisCacheBackend(settings.redis_url, settings.cache_ttl_seconds)

    def list_categories(self) -> list[CategorySchema]:
        start_time = perf_counter()
        cashed_categories = self.cache.get(settings.cache_category_key)
        if cashed_categories is not None:
            print(f"Отримання списку категорій по кешу тривало {perf_counter() - start_time} с")
            return [CategorySchema.model_validate(category) for category in cashed_categories]

        categories = self.category_repository.get_all()

        category_read = [CategorySchema.model_validate(category) for category in categories]
        category_for_cache = [category.model_dump() for category in category_read]
        self.cache.set(settings.cache_category_key, category_for_cache)

        return category_read

    def create_category(self, payload: CategoryCreateSchema) -> CategorySchema:
        category = self.category_repository.create(name=payload.name)
        try:
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            raise
        self.cache.delete(settings.cache_category_key)
        self.db.refresh(category)
        return CategorySchema.model_validate(category)

    def update_category(self, category_id: str, payload: CategoryUpdateSchema) -> CategorySchema:
        category = self.category_repository.get_by_id(category_id)
        if category is None:
            raise CategoryNotFound()

        if payload.name is not None:
            category.name = payload.name
        if payload.complete is not None:
            category.complete = payload.complete

        try:
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            raise
        self.cache.delete(settings.cache_category_key)
        self.db.refresh(category)
        return CategorySchema.model_validate(category)

    def delete_category(self, category_id: str) -> None:
        category = self.category_repository.get_by_id(category_id)
        if category is None:
            raise CategoryNotFound()

        self.category_repository.delete(category)
        try:
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            raise
        self.cache.delete(settings.cache_category_key)
