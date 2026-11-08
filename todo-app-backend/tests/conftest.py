"""Keep test configuration and storage independent of development services."""
import os
from unittest.mock import MagicMock

import pytest
import psycopg
from redis import Redis
from redis.connection import Connection
from sqlalchemy import create_engine


# Set these before test collection imports the application's cached settings.
# The Uvicorn subprocess inherits these values as well.
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['REDIS_URL'] = 'redis://127.0.0.1:0/0'
os.environ['CORS_ALLOWED_ORIGINS'] = '["http://localhost:3000", "http://127.0.0.1:3000"]'


@pytest.fixture
def database_engine(tmp_path):
    from app.models.base import Base
    from app.models.category import CategoryORM  # Register both tables.
    from app.models.task import TaskORM

    # A file gives independent sessions independent connections and lets API
    # requests use their normal worker threads. It is removed with tmp_path.
    engine = create_engine(f'sqlite:///{tmp_path / "test.sqlite"}')
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def forbid_postgres_connections(monkeypatch):
    def forbid_connection(*args, **kwargs):
        raise AssertionError('Tests must not connect to a PostgreSQL server')

    monkeypatch.setattr(psycopg, 'connect', forbid_connection)


@pytest.fixture(autouse=True)
def redis_stub(monkeypatch):
    # Share data across service instances within one test, never across tests.
    # Keep the real RedisCacheBackend's JSON encoding/decoding in the test path.
    values = {}
    client = MagicMock(spec=Redis)
    client.get.side_effect = values.get

    def set_value(key, value, ex=None):
        values[key] = value
        return True

    def delete_value(*keys):
        removed = 0
        for key in keys:
            if key in values:
                del values[key]
                removed += 1
        return removed

    client.set.side_effect = set_value
    client.delete.side_effect = delete_value
    monkeypatch.setattr(Redis, 'from_url', MagicMock(return_value=client))

    def forbid_connection(*args, **kwargs):
        raise AssertionError('Tests must not connect to a Redis server')

    monkeypatch.setattr(Connection, 'connect', forbid_connection)
    return client
