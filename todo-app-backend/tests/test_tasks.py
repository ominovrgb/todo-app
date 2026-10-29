from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routers.task import delete_task, update_task
from app.models.task import TaskORM
from app.schemas.task import TaskCreateSchema, TaskUpdateSchema
from app.services.task import TaskNotFound, TaskService


@pytest.fixture
def db():
    return MagicMock(spec=Session)


def test_create_returns_schema_and_commits_once(db):
    # SQLAlchemy assigns the id at flush/commit; emulate only that database effect.
    def assign_id():
        db.add.call_args.args[0].id = 'test-id'

    db.commit.side_effect = assign_id
    result = TaskService(db).create_task(TaskCreateSchema(title='Learn Python'))
    assert result.model_dump() == {
        'id': 'test-id', 'title': 'Learn Python', 'completed': False,
    }
    db.commit.assert_called_once()


@pytest.mark.parametrize('value', [True, False])
def test_patch_boolean_in_both_directions(db, value):
    task = TaskORM(id='test-id', title='Keep title', completed=not value)
    db.get.return_value = task
    result = TaskService(db).update_task(task.id, TaskUpdateSchema(completed=value))
    assert result.completed is value
    assert result.title == 'Keep title'
    db.commit.assert_called_once()


@pytest.mark.parametrize('payload', [{}, {'title': None, 'completed': None}])
def test_patch_omitted_and_null_fields_are_unchanged(db, payload):
    db.get.return_value = TaskORM(id='test-id', title='Keep', completed=True)
    result = TaskService(db).update_task('test-id', TaskUpdateSchema(**payload))
    assert result.title == 'Keep'
    assert result.completed is True


def test_delete_commits(db):
    task = TaskORM(id='test-id', title='Delete', completed=False)
    db.get.return_value = task
    assert TaskService(db).delete_task(task.id) is None
    db.delete.assert_called_once_with(task)
    db.commit.assert_called_once()


@pytest.mark.parametrize('operation', ['update', 'delete'])
def test_missing_task_becomes_http_404(db, operation):
    db.get.return_value = None
    service = TaskService(db)
    with pytest.raises(HTTPException) as error:
        if operation == 'update':
            update_task('missing', TaskUpdateSchema(title='New'), service)
        else:
            delete_task('missing', service)
    assert error.value.status_code == 404
    assert error.value.detail == 'Task not found'
    assert isinstance(error.value.__cause__, TaskNotFound)
    db.commit.assert_not_called()


@pytest.mark.parametrize('operation', ['create', 'update', 'delete'])
def test_failed_commit_rolls_back(db, operation):
    db.get.return_value = TaskORM(id='test-id', title='Old', completed=False)
    db.commit.side_effect = SQLAlchemyError('test failure')
    service = TaskService(db)
    with pytest.raises(SQLAlchemyError):
        if operation == 'create':
            service.create_task(TaskCreateSchema(title='New'))
        elif operation == 'update':
            service.update_task('test-id', TaskUpdateSchema(title='New'))
        else:
            service.delete_task('test-id')
    db.rollback.assert_called_once()


def test_list_serializes_orm(db):
    db.scalars.return_value.all.return_value = [
        TaskORM(id='test-id', title='Read', completed=True),
    ]
    result = TaskService(db).list_tasks()
    assert result[0].model_dump() == {
        'id': 'test-id', 'title': 'Read', 'completed': True,
    }
    db.commit.assert_not_called()
