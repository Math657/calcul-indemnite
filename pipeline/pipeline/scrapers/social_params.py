"""Social parameters scraper — SMIC horaire + plafond mensuel Sécurité sociale.

Source: ``betagouv/mon-entreprise`` ``modele-social/règles/base.publicodes``.
This is the URSSAF-maintained publicodes model behind mon-entreprise.urssaf.fr.
It is government-maintained, machine-readable (YAML), raw-fetchable from GitHub
(no bot-blocking, unlike Légifrance), and — crucially — carries every dated
revalorization with its décret reference. Same sourcing philosophy as the
``cdtn_*`` scrapers.

We store the full dated history (one row per entry-into-force date); the export
picks the value effective at build time. The metropolitan SMIC is taken (the
``sinon`` branch of the Mayotte split). No value is invented here — the scraper
reflects whatever the live source asserts, so a mid-year revalorization flows
through on the next run.
"""
from __future__ import annotations

import datetime as dt
import re
from typing import Any

import requests
import yaml

from ..settings import load
from .base import BaseScraper

BASE_URL = (
    "https://raw.githubusercontent.com/betagouv/mon-entreprise/master/"
    "modele-social/r%C3%A8gles/base.publicodes"
)
SOURCE_REF = "https://github.com/betagouv/mon-entreprise (modele-social, publicodes URSSAF)"

_AMOUNT_RE = re.compile(r"([\d]+(?:[.,]\d+)?)\s*€")
_DATE_RE = re.compile(r"date\s*>=\s*(\d{1,2})(?:/(\d{1,2}))?/?(\d{4})")


def _parse_date(condition: str) -> dt.date | None:
    """Parse a publicodes ``date >= MM/YYYY`` or ``date >= DD/MM/YYYY`` clause."""
    m = _DATE_RE.search(condition or "")
    if not m:
        return None
    a, b, year = m.group(1), m.group(2), m.group(3)
    if b:  # DD/MM/YYYY
        day, month = int(a), int(b)
    else:  # MM/YYYY
        day, month = 1, int(a)
    try:
        return dt.date(int(year), month, day)
    except ValueError:
        return None


def _parse_amount(value: Any) -> float | None:
    m = _AMOUNT_RE.search(str(value))
    return float(m.group(1).replace(",", ".")) if m else None


def _dated_values(variations: Any) -> list[tuple[dt.date, float]]:
    """Extract (effective_date, amount) pairs from a publicodes variations list.

    Skips the ``sinon`` fallback (undated baseline) — only explicit dated
    thresholds are kept.
    """
    out: list[tuple[dt.date, float]] = []
    if not isinstance(variations, list):
        return out
    for item in variations:
        if not isinstance(item, dict) or "si" not in item:
            continue
        date = _parse_date(str(item["si"]))
        amount = _parse_amount(item.get("alors"))
        if date and amount is not None:
            out.append((date, amount))
    return out


def _metropole_branch(node: dict[str, Any]) -> Any:
    """SMIC . horaire splits on Mayotte first, métropole is the ``sinon`` branch."""
    for item in node.get("variations", []):
        if isinstance(item, dict) and "sinon" in item:
            sinon = item["sinon"]
            if isinstance(sinon, dict):
                return sinon.get("variations")
    return None


class SocialParamsScraper(BaseScraper):
    source_name = "social_params"

    def fetch(self) -> dict[str, Any]:
        settings = load()
        ua = {"User-Agent": settings.user_agent}
        r = requests.get(BASE_URL, headers=ua, timeout=30)
        r.raise_for_status()
        doc = yaml.safe_load(r.text)
        if not isinstance(doc, dict):
            raise RuntimeError("base.publicodes did not parse to a mapping")

        pss = doc.get("plafond sécurité sociale", {})
        pmss = _dated_values(pss.get("variations"))

        smic_node = doc.get("SMIC . horaire", {})
        smic = _dated_values(_metropole_branch(smic_node))

        if not pmss or not smic:
            raise RuntimeError(
                "SMIC or PMSS not parsed — the mon-entreprise publicodes layout "
                "may have changed; verify base.publicodes structure."
            )

        params = {
            "smic_horaire_brut": {"unit": "€/heure", "values": smic},
            "pmss_mensuel": {"unit": "€/mois", "values": pmss},
        }
        for key, info in params.items():
            latest = max(info["values"], key=lambda t: t[0])
            self.log.info("%s: %d dated values, latest %s = %s", key, len(info["values"]), latest[0], latest[1])
        return {"params": params}

    def write(self, raw: dict[str, Any]) -> tuple[int, str]:
        params = raw["params"]
        inserted = 0
        with self.conn.cursor() as cur:
            for key, info in params.items():
                for effective_from, value in info["values"]:
                    cur.execute(
                        """
                        INSERT INTO social_parameters (param, effective_from, value, unit, source_url, updated_at)
                        VALUES (%s, %s, %s, %s, %s, now())
                        ON CONFLICT (param, effective_from) DO UPDATE
                           SET value = EXCLUDED.value,
                               unit = EXCLUDED.unit,
                               source_url = EXCLUDED.source_url,
                               updated_at = now()
                         WHERE social_parameters.value IS DISTINCT FROM EXCLUDED.value
                        """,
                        (key, effective_from, value, info["unit"], SOURCE_REF),
                    )
                    inserted += cur.rowcount
        self.conn.commit()
        total = sum(len(info["values"]) for info in params.values())
        status = "success" if inserted else "no_change"
        return (total, status)
