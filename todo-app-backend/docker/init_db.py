"""Create missing tables for Compose; never drop data or alter existing tables."""
from app.db.session import engine
from app.models.base import Base
from app.models.category import CategoryORM  # noqa: F401 - register table metadata
from app.models.task import TaskORM  # noqa: F401 - register table metadata


try:
    Base.metadata.create_all(engine)
finally:
    engine.dispose()
