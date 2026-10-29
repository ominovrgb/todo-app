from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import TaskORM


class TaskRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(self) -> Sequence[TaskORM]:
        return self.db.scalars(select(TaskORM)).all()

    def get_by_id(self, task_id: str) -> TaskORM | None:
        return self.db.get(TaskORM, task_id)

    def create(self, title: str) -> TaskORM:
        task = TaskORM(title=title, completed=False)
        self.db.add(task)
        return task

    def delete(self, task: TaskORM) -> None:
        self.db.delete(task)
