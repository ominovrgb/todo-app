from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.routers.category import delete_category, update_category
from app.models.category import CategoryORM
from app.schemas.category import CategoryCreateSchema, CategoryUpdateSchema
from app.services.category import CategoryNotFound, CategoryService


@pytest.fixture
def db():
    return MagicMock(spec=Session)


def test_create_returns_schema_and_commits_once(db):
    # SQLAlchemy assigns the id at flush/commit; emulate only that database effect.
    def assign_id():
        db.add.call_args.args[0].id = 'test-id'

    db.commit.side_effect = assign_id
    result = CategoryService(db).create_category(CategoryCreateSchema(name='Learn Python'))
    assert result.model_dump() == {
        'id': 'test-id', 'name': 'Learn Python', 'complete': False,
    }
    db.commit.assert_called_once()


@pytest.mark.parametrize('value', [True, False])
def test_patch_boolean_in_both_directions(db, value):
    category = CategoryORM(id='test-id', name='Keep name', complete=not value)
    db.get.return_value = category
    result = CategoryService(db).update_category(category.id, CategoryUpdateSchema(complete=value))
    assert result.complete is value
    assert result.name == 'Keep name'
    db.commit.assert_called_once()


@pytest.mark.parametrize('payload', [{}, {'name': None, 'complete': None}])
def test_patch_omitted_and_null_fields_are_unchanged(db, payload):
    db.get.return_value = CategoryORM(id='test-id', name='Keep', complete=True)
    result = CategoryService(db).update_category('test-id', CategoryUpdateSchema(**payload))
    assert result.name == 'Keep'
    assert result.complete is True


def test_delete_commits(db):
    category = CategoryORM(id='test-id', name='Delete', complete=False)
    db.get.return_value = category
    assert CategoryService(db).delete_category(category.id) is None
    db.delete.assert_called_once_with(category)
    db.commit.assert_called_once()


@pytest.mark.parametrize('operation', ['update', 'delete'])
def test_missing_category_becomes_http_404(db, operation):
    db.get.return_value = None
    service = CategoryService(db)
    with pytest.raises(HTTPException) as error:
        if operation == 'update':
            update_category('missing', CategoryUpdateSchema(name='New'), service)
        else:
            delete_category('missing', service)
    assert error.value.status_code == 404
    assert error.value.detail == 'Category not found'
    assert isinstance(error.value.__cause__, CategoryNotFound)
    db.commit.assert_not_called()


@pytest.mark.parametrize('operation', ['create', 'update', 'delete'])
def test_failed_commit_rolls_back(db, operation):
    db.get.return_value = CategoryORM(id='test-id', name='Old', complete=False)
    db.commit.side_effect = SQLAlchemyError('test failure')
    service = CategoryService(db)
    with pytest.raises(SQLAlchemyError):
        if operation == 'create':
            service.create_category(CategoryCreateSchema(name='New'))
        elif operation == 'update':
            service.update_category('test-id', CategoryUpdateSchema(name='New'))
        else:
            service.delete_category('test-id')
    db.rollback.assert_called_once()


def test_list_serializes_orm(db):
    db.scalars.return_value.all.return_value = [
        CategoryORM(id='test-id', name='Read', complete=True),
    ]
    result = CategoryService(db).list_categories()
    assert result[0].model_dump() == {
        'id': 'test-id', 'name': 'Read', 'complete': True,
    }
    db.commit.assert_not_called()
