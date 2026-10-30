from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    DATABASE_URL: str
    cors_allowed_origins: list[str] = ["http://localhost:3000","http://127.0.0.1:3000",]
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env")

@lru_cache
def get_settings() -> Settings:
    return Settings()