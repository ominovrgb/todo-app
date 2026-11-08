from unittest.mock import MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import session
from app.models.task import TaskORM


@pytest.mark.parametrize('request_failed', [False, True])
def test_dependency_closes_session_and_discards_uncommitted_work(database_engine, monkeypatch, request_failed):
    db = Session(database_engine)
    close = MagicMock(wraps=db.close)
    monkeypatch.setattr(db, 'close', close)
    monkeypatch.setattr(session, 'SessionLocal', lambda: db)
    dependency = session.get_db()
    try:
        assert next(dependency) is db
        db.add(TaskORM(title='Uncommitted', completed=False))
        db.flush()
        if request_failed:
            error = RuntimeError('request failed')
            with pytest.raises(RuntimeError) as caught:
                dependency.throw(error)
            assert caught.value is error
        else:
            with pytest.raises(StopIteration):
                next(dependency)
        close.assert_called_once_with()
        assert not db.in_transaction()
        with Session(database_engine) as reader:
            assert reader.scalars(select(TaskORM)).all() == []
    finally:
        dependency.close()
        db.close()
