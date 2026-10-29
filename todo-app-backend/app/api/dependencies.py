from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.category import CategoryService
from app.services.task import TaskService


def get_task_service(db: Session = Depends(get_db)) -> TaskService:
    return TaskService(db=db)


def get_category_service(db: Session = Depends(get_db)) -> CategoryService:
    return CategoryService(db=db)
