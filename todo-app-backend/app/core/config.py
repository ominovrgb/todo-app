from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    DATABASE_URL: str
    redis_url: str
    cache_ttl_seconds: int
    cache_tasks_key: str
    cache_category_key: str
    cors_allowed_origins: list[str] = ["http://localhost:3000","http://127.0.0.1:3000",]
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env")

@lru_cache
def get_settings() -> Settings:
    return Settings(
        cache_ttl_seconds=3600,
        cache_tasks_key="cache:tasks_list",
        cache_category_key="cache:categories_list",
    )