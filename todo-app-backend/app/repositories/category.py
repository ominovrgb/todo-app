from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import CategoryORM


class CategoryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(self) -> Sequence[CategoryORM]:
        return self.db.scalars(select(CategoryORM)).all()

    def get_by_id(self, category_id: str) -> CategoryORM | None:
        return self.db.get(CategoryORM, category_id)

    def create(self, name: str) -> CategoryORM:
        category = CategoryORM(name=name, complete=False)
        self.db.add(category)
        return category

    def delete(self, category: CategoryORM) -> None:
        self.db.delete(category)
