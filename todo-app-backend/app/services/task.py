from sqlalchemy.orm import Session

from app.repositories.task import TaskRepository
from app.schemas.task import TaskCreateSchema, TaskSchema, TaskUpdateSchema


class TaskNotFound(Exception):
    def __init__(self) -> None:
        super().__init__("Task not found")


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.task_repository = TaskRepository(db)

    def list_tasks(self) -> list[TaskSchema]:
        return [TaskSchema.model_validate(task) for task in self.task_repository.get_all()]

    def create_task(self, task_create: TaskCreateSchema) -> TaskSchema:
        try:
            task = self.task_repository.create(title=task_create.title)
            self.db.commit()
            return TaskSchema.model_validate(task)
        except Exception:
            self.db.rollback()
            raise

    def update_task(self, task_id: str, task_update: TaskUpdateSchema) -> TaskSchema:
        try:
            task = self.task_repository.get_by_id(task_id)
            if task is None:
                raise TaskNotFound()
            if task_update.title is not None:
                task.title = task_update.title
            if task_update.completed is not None:
                task.completed = task_update.completed
            self.db.commit()
            return TaskSchema.model_validate(task)
        except Exception:
            self.db.rollback()
            raise

    def delete_task(self, task_id: str) -> None:
        try:
            task = self.task_repository.get_by_id(task_id)
            if task is None:
                raise TaskNotFound()
            self.task_repository.delete(task)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
