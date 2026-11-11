"""Check HTTP readiness, the database schema, and Redis without changing data."""
from urllib.request import urlopen

from redis import Redis
from sqlalchemy import create_engine, text

from app.core.config import get_settings


settings = get_settings()
with urlopen("http://127.0.0.1:8080/openapi.json", timeout=2) as response:
    assert response.status == 200

engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 2})
try:
    with engine.connect() as connection:
        connection.execute(text("SET statement_timeout = '2s'"))
        connection.execute(text("SELECT id, title, completed FROM tasks LIMIT 0"))
        connection.execute(text("SELECT id, name, complete FROM categories LIMIT 0"))
finally:
    engine.dispose()

with Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2) as cache:
    assert cache.ping()
