"""Service contracts backed by real SQLAlchemy sessions and isolated Redis data."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.category import CategoryORM
from app.models.task import TaskORM
from app.schemas.category import CategoryCreateSchema, CategorySchema, CategoryUpdateSchema
from app.schemas.task import TaskCreateSchema, TaskSchema, TaskUpdateSchema
from app.services.category import CategoryNotFound, CategoryService
from app.services.task import TaskNotFound, TaskService


@pytest.fixture(params=['task', 'category'])
def resource(request, database_engine, monkeypatch):
    # A nondefault value catches services that ignore configured TTLs.
    monkeypatch.setattr(get_settings(), 'cache_ttl_seconds', 73)
    if request.param == 'task':
        model, service_type = TaskORM, TaskService
        create_schema, update_schema, schema = TaskCreateSchema, TaskUpdateSchema, TaskSchema
        text, flag, missing = 'title', 'completed', TaskNotFound
        plural, key = 'tasks', get_settings().cache_tasks_key
    else:
        model, service_type = CategoryORM, CategoryService
        create_schema, update_schema, schema = CategoryCreateSchema, CategoryUpdateSchema, CategorySchema
        text, flag, missing = 'name', 'complete', CategoryNotFound
        plural, key = 'categories', get_settings().cache_category_key
    with Session(database_engine) as db:
        service = service_type(db)
        yield SimpleNamespace(
            db=db, model=model, schema=schema, text=text, flag=flag, missing=missing,
            create_schema=create_schema, update_schema=update_schema,
            service=service, key=key,
            create=getattr(service, f'create_{request.param}'),
            update=getattr(service, f'update_{request.param}'),
            delete=getattr(service, f'delete_{request.param}'),
            list=getattr(service, f'list_{plural}'),
        )


def seed(resource, **values):
    row = resource.model(**{resource.text: 'Original', resource.flag: False, **values})
    resource.db.add(row)
    resource.db.commit()
    return row.id


def persisted(resource):
    # Read through an independent connection, not the service's identity map.
    with Session(resource.db.bind) as reader:
        return {
            row.id: resource.schema.model_validate(row).model_dump()
            for row in reader.scalars(select(resource.model)).all()
        }


def listed(resource):
    return {row.id: row.model_dump() for row in resource.list()}


def test_create_persists_schema_and_invalidates_cache(resource, monkeypatch):
    other_id = seed(resource)
    before = persisted(resource)
    assert listed(resource) == before  # Populate a nonempty cache before writing.
    commit = MagicMock(wraps=resource.db.commit)
    monkeypatch.setattr(resource.db, 'commit', commit)

    created = resource.create(resource.create_schema(**{resource.text: 'New'}))

    commit.assert_called_once_with()
    assert isinstance(created, resource.schema)
    assert created.id and created.id != other_id
    expected = {'id': created.id, resource.text: 'New', resource.flag: False}
    assert created.model_dump() == expected
    assert persisted(resource) == {**before, created.id: expected}
    assert resource.service.cache.get(resource.key) is None
    assert listed(resource) == persisted(resource)


def test_patch_persists_fields_and_invalidates_cache(resource, monkeypatch):
    row_id = seed(resource)
    other_id = seed(resource, **{resource.text: 'Unchanged'})
    expected = persisted(resource)
    commit = MagicMock(wraps=resource.db.commit)
    monkeypatch.setattr(resource.db, 'commit', commit)

    for payload in (
        {resource.flag: True}, {resource.flag: False}, {resource.text: 'Renamed'},
        {}, {resource.text: None, resource.flag: None},
    ):
        assert listed(resource) == expected
        commit.reset_mock()
        updated = resource.update(row_id, resource.update_schema(**payload))
        expected[row_id].update({key: value for key, value in payload.items() if value is not None})
        assert updated.model_dump() == expected[row_id]
        commit.assert_called_once_with()
        assert persisted(resource) == expected
        if any(value is not None for value in payload.values()):
            assert resource.service.cache.get(resource.key) is None
        assert listed(resource) == expected
        assert expected[other_id][resource.text] == 'Unchanged'


def test_delete_persists_and_invalidates_cache(resource, monkeypatch):
    row_id = seed(resource)
    other_id = seed(resource, **{resource.text: 'Keep'})
    expected = listed(resource)
    commit = MagicMock(wraps=resource.db.commit)
    monkeypatch.setattr(resource.db, 'commit', commit)

    assert resource.delete(row_id) is None

    commit.assert_called_once_with()
    expected.pop(row_id)
    assert set(expected) == {other_id}
    assert persisted(resource) == expected
    assert resource.service.cache.get(resource.key) is None
    assert listed(resource) == expected


def test_missing_resource_does_not_write_or_invalidate(resource, monkeypatch):
    seed(resource)
    before = listed(resource)
    commit = MagicMock(wraps=resource.db.commit)
    monkeypatch.setattr(resource.db, 'commit', commit)
    for operation in (
        lambda: resource.update('missing', resource.update_schema(**{resource.text: 'New'})),
        lambda: resource.delete('missing'),
    ):
        with pytest.raises(resource.missing):
            operation()
        assert persisted(resource) == before
        assert resource.service.cache.get(resource.key) == list(before.values())
    commit.assert_not_called()


@pytest.mark.parametrize('row_count', [0, 2], ids=['empty', 'nonempty'])
def test_list_cache_miss_then_hit_preserves_schemas(resource, row_count, redis_stub, monkeypatch):
    for index in range(row_count):
        seed(resource, **{resource.text: f'Задача {index} "quoted"\n', resource.flag: bool(index)})
    expected = persisted(resource)
    commit = MagicMock(wraps=resource.db.commit)
    monkeypatch.setattr(resource.db, 'commit', commit)

    assert resource.service.cache.get(resource.key) is None
    assert listed(resource) == expected
    assert redis_stub.set.call_args.kwargs == {'ex': 73}

    def forbid_query(*args, **kwargs):
        pytest.fail('A cache hit must not query the database, including cached []')

    monkeypatch.setattr(resource.db, 'scalars', forbid_query)
    assert listed(resource) == expected
    commit.assert_not_called()


@pytest.mark.parametrize('operation', ['create', 'update', 'delete'])
def test_failed_commit_preserves_storage_and_cache_and_session_recovers(resource, operation, monkeypatch):
    row_id = seed(resource)
    before = listed(resource)
    cached_before = resource.service.cache.get(resource.key)
    rollback = MagicMock(wraps=resource.db.rollback)
    refresh = MagicMock(wraps=resource.db.refresh)
    monkeypatch.setattr(resource.db, 'rollback', rollback)
    monkeypatch.setattr(resource.db, 'refresh', refresh)

    def invalid_row_at_commit(db):
        # A real NOT NULL constraint violation during flush, after repository work.
        db.add(resource.model())

    event.listen(resource.db, 'before_commit', invalid_row_at_commit, once=True)
    database_errors = []
    event.listen(
        resource.db.bind, 'handle_error',
        lambda context: database_errors.append(context.sqlalchemy_exception),
    )

    def write():
        if operation == 'create':
            return resource.create(resource.create_schema(**{resource.text: 'New'}))
        if operation == 'update':
            return resource.update(row_id, resource.update_schema(**{resource.text: 'New'}))
        return resource.delete(row_id)

    with pytest.raises(IntegrityError) as error:
        write()
    assert error.value is database_errors[0]
    rollback.assert_called_once_with()
    refresh.assert_not_called()
    assert resource.db.is_active
    assert persisted(resource) == before
    assert resource.service.cache.get(resource.key) == cached_before

    # The same session must successfully retry and make a durable change.
    result = write()
    expected = dict(before)
    if operation == 'delete':
        expected.pop(row_id)
    else:
        expected[result.id] = result.model_dump()
    assert persisted(resource) == expected
    assert resource.service.cache.get(resource.key) is None
    assert listed(resource) == expected


def test_category_delete_invalidates_both_lists_without_deleting_tasks(database_engine):
    with Session(database_engine) as db:
        tasks, categories = TaskService(db), CategoryService(db)
        task = tasks.create_task(TaskCreateSchema(title='Keep'))
        category = categories.create_category(CategoryCreateSchema(name='Remove'))
        assert tasks.list_tasks() == [task]
        assert categories.list_categories() == [category]

        categories.delete_category(category.id)

        settings = get_settings()
        assert categories.cache.get(settings.cache_tasks_key) is None
        assert categories.cache.get(settings.cache_category_key) is None
        assert tasks.list_tasks() == [task]
        assert categories.list_categories() == []
