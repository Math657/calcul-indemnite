"""Export latest scraped snapshots to ``src/data/*.json`` for the Astro build.

Astro reads these JSON files at build time (no DB connection in CI). Workflow:

1. Scraper writes new records to Postgres on the VPS.
2. The renov-publish.service systemd unit (weekly Fri 02:00 UTC) runs
   ``python -m pipeline.cli export`` then ``publish.sh`` commits + pushes
   any JSON drift to origin/main.
3. Cloudflare Workers Builds auto-rebuilds Astro with the new data.

Each export function returns the Path of the file written so the publish
chain can git-add it. ``export_all()`` aggregates every registered export.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .db import connect

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "src" / "data"


def _serialize(value: Any) -> Any:
    """Generic JSON serializer for Postgres-returned types (Decimal, datetime, date)."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return float(value) if hasattr(value, "as_tuple") else value


# Letters in DPE order so the JSON is iterable in display order without re-sorting.
_DPE_LETTERS = ["A", "B", "C", "D", "E", "F", "G"]


def export_dpe() -> Path:
    """Export aggregate stats from dpe_records to src/data/dpe.json.

    Frontend renders distributions / counts; raw records stay in Postgres
    (14.7M would be too heavy to ship as JSON).
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "dpe.json"

    data: dict[str, Any] = {
        "source": "ADEME — Diagnostic de Performance Énergétique (logements existants)",
        "source_url": "https://data.ademe.fr/datasets/dpe03existant",
        "last_updated": None,
        "total_records": 0,
        "distribution_by_etiquette_dpe": {letter: 0 for letter in _DPE_LETTERS},
        "distribution_by_etiquette_ges": {letter: 0 for letter in _DPE_LETTERS},
        "by_type_batiment": {},
        "by_zone_climatique": {},
        "by_periode_construction": {},
    }

    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.dpe_records')")
        if cur.fetchone()[0] is None:
            # Table doesn't exist yet — write the empty shell anyway so the
            # frontend has a JSON file to load (avoids 404 on first deploys).
            _write(out, data)
            return out

        cur.execute("SELECT COUNT(*), MAX(scraped_at) FROM dpe_records")
        total, last = cur.fetchone()
        data["total_records"] = total or 0
        data["last_updated"] = _serialize(last)

        if not total:
            _write(out, data)
            return out

        # Letter distributions — keep zero entries for letters with no records
        # so the frontend can iterate A–G without missing-key checks.
        for col, key in [
            ("etiquette_dpe", "distribution_by_etiquette_dpe"),
            ("etiquette_ges", "distribution_by_etiquette_ges"),
        ]:
            cur.execute(
                f"SELECT {col}, COUNT(*) FROM dpe_records "  # noqa: S608 — col is hardcoded
                f"WHERE {col} IS NOT NULL GROUP BY {col}"
            )
            for letter, count in cur.fetchall():
                if letter in data[key]:
                    data[key][letter] = count

        # Free-form group-bys
        for col, key in [
            ("type_batiment", "by_type_batiment"),
            ("zone_climatique", "by_zone_climatique"),
            ("periode_construction", "by_periode_construction"),
        ]:
            cur.execute(
                f"SELECT {col}, COUNT(*) FROM dpe_records "  # noqa: S608
                f"WHERE {col} IS NOT NULL GROUP BY {col} ORDER BY {col}"
            )
            data[key] = {row[0]: row[1] for row in cur.fetchall()}

    _write(out, data)
    return out


def _write(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def export_all() -> list[Path]:
    """Run every registered export. Returns paths actually written."""
    return [export_dpe()]
