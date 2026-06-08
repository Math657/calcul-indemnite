"""Environment-driven settings. Loads from .env at the repo root if present."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / ".env.local", override=True)


@dataclass(frozen=True)
class Settings:
    pg_host: str
    pg_port: int
    pg_user: str
    pg_password: str
    pg_db: str
    user_agent: str

    @property
    def dsn(self) -> str:
        return (
            f"host={self.pg_host} port={self.pg_port} "
            f"user={self.pg_user} password={self.pg_password} dbname={self.pg_db}"
        )


def load() -> Settings:
    def _req(key: str) -> str:
        v = os.environ.get(key)
        if not v:
            raise RuntimeError(f"Missing required env var: {key}")
        return v

    return Settings(
        pg_host=os.environ.get("PG_HOST", "localhost"),
        pg_port=int(os.environ.get("PG_PORT", "5432")),
        pg_user=_req("PG_USER"),
        pg_password=_req("PG_PASSWORD"),
        pg_db=_req("PG_DB"),
        user_agent=os.environ.get(
            "SCRAPER_USER_AGENT",
            "calcul-indemnite-bot/0.1 (+https://calcul-indemnite.fr)",
        ),
    )
