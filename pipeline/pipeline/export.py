"""Export latest scraped snapshots to ``src/data/*.json`` for the Astro build.

Astro reads these JSON files at build time (no DB connection in CI). Workflow:

1. Scraper writes new records to Postgres on the VPS.
2. The indemnite-publish.service systemd unit runs ``python -m pipeline.cli
   export`` then ``publish.sh`` commits + pushes any JSON drift to origin/main.
3. Cloudflare Workers Builds auto-rebuilds Astro with the new data.

Each export function returns the Path of the file written so the publish chain
can git-add it. ``export_all()`` aggregates every registered export.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .db import connect

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "src" / "data"


def _serialize(value: Any) -> Any:
    """JSON serializer for Postgres-returned types (datetime, date, Decimal)."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return float(value) if hasattr(value, "as_tuple") else value


def _write(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def export_conventions() -> Path:
    """Export the conventions catalogue to src/data/conventions.json.

    ``source_verified_at`` is the most recent row refresh — the freshness
    signal surfaced on /conventions-collectives.
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "conventions.json"

    data: dict[str, Any] = {
        "source": "SocialGouv — code-du-travail (modèles publicodes)",
        "source_url": "https://github.com/SocialGouv/code-du-travail-numerique",
        "source_verified_at": None,
        "count": 0,
        "conventions": [],
    }

    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.conventions')")
        if cur.fetchone()[0] is None:
            # Table not migrated yet — keep a valid shell so the build never 404s.
            _write(out, data)
            return out

        cur.execute(
            "SELECT idcc, slug, name, full_name, legifrance_url, effectif, factors "
            "FROM conventions ORDER BY idcc"
        )
        rows = cur.fetchall()
        data["count"] = len(rows)
        data["conventions"] = [
            {
                "idcc": r[0],
                "slug": r[1],
                "name": r[2],
                "full_name": r[3],
                "legifrance_url": r[4],
                "effectif": r[5],
                "factors": r[6] or [],
            }
            for r in rows
        ]

        cur.execute("SELECT max(updated_at) FROM conventions")
        data["source_verified_at"] = _serialize(cur.fetchone()[0])

    _write(out, data)
    return out


def export_all() -> list[Path]:
    """Run every registered export. Returns paths actually written."""
    return [export_conventions()]
