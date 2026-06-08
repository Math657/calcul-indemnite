"""Apply pending SQL migrations in `pipeline/migrations/` in lexical order.

Idempotent: tracks applied versions in the `schema_migrations` table.
The very first migration is responsible for creating that table.
"""
from __future__ import annotations

from pathlib import Path

import psycopg

from .db import connect

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def _applied_versions(conn: psycopg.Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT to_regclass('public.schema_migrations') IS NOT NULL"
        )
        exists = cur.fetchone()[0]
        if not exists:
            return set()
        cur.execute("SELECT version FROM schema_migrations")
        return {row[0] for row in cur.fetchall()}


def _record_version(conn: psycopg.Connection, version: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s) "
            "ON CONFLICT (version) DO NOTHING",
            (version,),
        )


def run() -> list[str]:
    """Apply pending migrations. Returns the list of versions newly applied."""
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        return []

    applied: list[str] = []
    with connect() as conn:
        already = _applied_versions(conn)
        for f in files:
            version = f.stem
            if version in already:
                continue
            sql = f.read_text(encoding="utf-8")
            with conn.cursor() as cur:
                cur.execute(sql)
            _record_version(conn, version)
            conn.commit()
            applied.append(version)
    return applied
