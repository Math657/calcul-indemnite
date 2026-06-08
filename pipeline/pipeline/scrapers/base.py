"""Base class for scrapers.

Each scraper subclass:
- declares `source_name` (used in scrape_runs and registry)
- implements `fetch()` -> raw payload (dict)
- implements `write(raw)` -> int (rows written), comparing to latest snapshot

`run()` orchestrates: create scrape_runs row, fetch, write, mark final status.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

import psycopg

log = logging.getLogger(__name__)


class BaseScraper(ABC):
    source_name: str = ""

    def __init__(self, conn: psycopg.Connection):
        if not self.source_name:
            raise RuntimeError(f"{type(self).__name__} must define source_name")
        self.conn = conn
        self.log = logging.getLogger(f"scraper.{self.source_name}")

    @abstractmethod
    def fetch(self) -> dict[str, Any]:
        """Fetch raw data. Returns a dict that is safe to JSON-serialize."""

    @abstractmethod
    def write(self, raw: dict[str, Any]) -> tuple[int, str]:
        """Persist parsed data. Returns (rows_written, status).
        status is one of 'success' or 'no_change'.
        """

    def run(self) -> dict[str, Any]:
        run_id = self._start_run()
        try:
            raw = self.fetch()
            rows, status = self.write(raw)
            self._finish_run(run_id, status=status, rows_written=rows)
            return {"run_id": run_id, "status": status, "rows_written": rows}
        except Exception as e:
            self.log.exception("Scrape failed")
            self._finish_run(run_id, status="failed", error_message=str(e))
            raise

    def _start_run(self) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO scrape_runs (source, status) VALUES (%s, 'running') RETURNING id",
                (self.source_name,),
            )
            run_id = cur.fetchone()[0]
        self.conn.commit()
        return run_id

    def _finish_run(
        self,
        run_id: int,
        status: str,
        rows_written: int = 0,
        error_message: str | None = None,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE scrape_runs
                   SET finished_at = now(),
                       status = %s,
                       rows_written = %s,
                       error_message = %s
                 WHERE id = %s
                """,
                (status, rows_written, error_message, run_id),
            )
        self.conn.commit()
