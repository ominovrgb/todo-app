from uuid import uuid4

from fastapi import FastAPI, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"]
)

class TaskSchema(BaseModel):
    id: str
    title: str
    completed: bool

class TaskCreateSchema(BaseModel):
    title: str

class TaskUpdateSchema(BaseModel):
    title: str | None=None
    completed: bool | None=None

tasks: list[TaskSchema] = []


@app.get("/tasks")
def read_tasks() -> list[TaskSchema]:
    return tasks

@app.post("/tasks", status_code=status.HTTP_201_CREATED)
def create_task(payload:TaskCreateSchema) -> TaskSchema:
    new_task = TaskSchema(id=str(uuid4()), title = payload.title, completed = False)
    tasks.append(new_task)
    return new_task

@app.patch("/tasks/{task_id}")
def update_task(task_id: str, payload: TaskUpdateSchema):
    for task in tasks:
        if task.id == task_id:
            if payload.title:
                task.title = payload.title
            if payload.completed is not None:
                task.completed = payload.completed
            return task

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id):
    for task in tasks:
        if task.id == task_id:
            tasks.remove(task)
            return

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")


class  CategorySchema(BaseModel):
    id: str
    name: str
    complete: bool

class CategoryCreateSchema(BaseModel):
    name: str

class CategoryUpdateSchema(BaseModel):
    name: str | None = None
    complete: bool | None = None

categories: list[CategorySchema] = []
@app.get("/categories")
def read_categories() -> list[CategorySchema]:
    return categories

@app.post("/categories", status_code=status.HTTP_201_CREATED)
def create_new_category(payload:CategoryCreateSchema) -> CategorySchema:
    new_category = CategorySchema(id=str(uuid4()), name = payload.name, complete = False)
    categories.append(new_category)
    return new_category


@app.patch("/categories/{category_id}")
def update_category(category_id: str, payload: CategoryUpdateSchema):
    for category in categories:
        if category.id == category_id:
            if payload.name is not None:
                category.name = payload.name
            if payload.complete is not None:
                category.complete = payload.complete
            return category

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

@app.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: str):
    for category in categories:
        if category.id == category_id:
            categories.remove(category)
            return

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")