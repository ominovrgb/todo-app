import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str
    cors_allowed_origins: list[str]


def get_settings() -> Settings:
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set in the environment or backend .env")
    return Settings(
        DATABASE_URL=database_url,
        cors_allowed_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    )
