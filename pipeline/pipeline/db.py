"""Postgres connection helper."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg

from .settings import load


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    settings = load()
    conn = psycopg.connect(settings.dsn)
    try:
        yield conn
    finally:
        conn.close()
