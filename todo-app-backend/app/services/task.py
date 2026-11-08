from time import perf_counter
from app.cache.redis import RedisCacheBackend
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.repositories.task import TaskRepository
from app.core.config import get_settings
from app.schemas.task import TaskCreateSchema, TaskSchema, TaskUpdateSchema


settings = get_settings()


class TaskNotFound(Exception):
    def __init__(self) -> None:
        super().__init__("Task not found")


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.task_repository = TaskRepository(db)
        self.cache = RedisCacheBackend(settings.redis_url, settings.cache_ttl_seconds)

    def list_tasks(self) -> list[TaskSchema]:
        start_time = perf_counter()
        cashed_tasks = self.cache.get(settings.cache_tasks_key)
        if cashed_tasks is not None:
            print(f"Отримання списку задач по кешу тривало {perf_counter() - start_time} с")
            return [TaskSchema.model_validate(task) for task in cashed_tasks]

        tasks = self.task_repository.get_all()

        task_read = [TaskSchema.model_validate(task) for task in tasks]
        tasks_for_cache = [task.model_dump() for task in task_read]
        self.cache.set(settings.cache_tasks_key, tasks_for_cache)

        return task_read

    def create_task(self, payload: TaskCreateSchema) -> TaskSchema:
        task = self.task_repository.create(title=payload.title)
        try:
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            raise
        self.cache.delete(settings.cache_tasks_key)
        self.db.refresh(task)
        return TaskSchema.model_validate(task)

    def update_task(self, task_id: str, payload: TaskUpdateSchema) -> TaskSchema:
        task = self.task_repository.get_by_id(task_id)
        if task is None:
            raise TaskNotFound()

        if payload.title is not None:
            task.title = payload.title
        if payload.completed is not None:
            task.completed = payload.completed

        try:
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            raise
        self.cache.delete(settings.cache_tasks_key)
        self.db.refresh(task)
        return TaskSchema.model_validate(task)


    def delete_task(self, task_id: str) -> None:
        task = self.task_repository.get_by_id(task_id)
        if task is None:
            raise TaskNotFound()

        self.task_repository.delete(task)
        try:
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            raise
        self.cache.delete(settings.cache_tasks_key)
