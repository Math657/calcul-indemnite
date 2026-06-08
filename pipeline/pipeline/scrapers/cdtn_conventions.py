"""Conventions collectives scraper (official metadata + decision factors).

Sources (both government-maintained, machine-readable, refreshed on schedule):
  - SocialGouv/code-du-travail-numerique GitHub tree → the list of conventions
    covered by the official publicodes models, and each model's *decision
    factors* (the user-facing parameters that drive the conventional amount).
  - SocialGouv/kali-data → the official KALI/Légifrance metadata per IDCC:
    accented short title, full title, Légifrance URL, effectif.

No legal VALUE is computed (publicodes is a rule engine; reducing it to prose
would be unreliable). Each detail page links to the official calculator for the
exact amount.
"""
from __future__ import annotations

import re
from typing import Any

import requests
import yaml
from psycopg.types.json import Json

from ..settings import load
from .base import BaseScraper

TREE_URL = (
    "https://api.github.com/repos/SocialGouv/code-du-travail-numerique/"
    "git/trees/master?recursive=1"
)
RAW_BASE = (
    "https://raw.githubusercontent.com/SocialGouv/code-du-travail-numerique/"
    "master/packages/code-du-travail-modeles/src/modeles/conventions"
)
KALI_URL = "https://raw.githubusercontent.com/SocialGouv/kali-data/master/data/index.json"
CONV_RE = re.compile(
    r"packages/code-du-travail-modeles/src/modeles/conventions/(\d+)_([^/]+)/"
)


def _extract_factors(yaml_text: str) -> list[str]:
    """Concise, human-readable decision factors from a publicodes model.

    A rule with a ``question`` field is a user input. We keep its ``titre``
    (or leaf name) when it's a short, label-like string — long sentence titres
    are skipped so the displayed factor list stays clean.
    """
    try:
        doc = yaml.safe_load(yaml_text)
    except yaml.YAMLError:
        return []
    if not isinstance(doc, dict):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for key, val in doc.items():
        if not isinstance(val, dict) or not val.get("question"):
            continue
        titre = str(val.get("titre") or key.split(".")[-1]).strip()
        if not titre or len(titre) > 80 or titre in seen:
            continue
        seen.add(titre)
        out.append(titre)
    return out[:6]


class CdtnConventionsScraper(BaseScraper):
    source_name = "cdtn_conventions"

    def _kali_index(self, ua: dict[str, str]) -> dict[int, dict[str, Any]]:
        try:
            r = requests.get(KALI_URL, headers=ua, timeout=60)
            if r.status_code != 200:
                return {}
            out: dict[int, dict[str, Any]] = {}
            for rec in r.json():
                num = rec.get("num")
                if num and str(num).isdigit():
                    out[int(num)] = rec
            return out
        except (requests.RequestException, ValueError):
            return {}

    def fetch(self) -> dict[str, Any]:
        settings = load()
        ua = {"User-Agent": settings.user_agent}
        self.log.info("GET tree")
        r = requests.get(
            TREE_URL, headers={**ua, "Accept": "application/vnd.github+json"}, timeout=60
        )
        r.raise_for_status()
        seen: dict[int, str] = {}
        for item in r.json().get("tree", []):
            m = CONV_RE.match(item.get("path", ""))
            if m:
                seen[int(m.group(1))] = m.group(2)
        if not seen:
            raise RuntimeError(
                "No conventions parsed from the GitHub tree — the SocialGouv "
                "modeles layout may have changed; verify the path regex."
            )

        kali = self._kali_index(ua)
        self.log.info("kali-data: %d official entries", len(kali))

        convs: list[dict[str, Any]] = []
        for idcc, slug in sorted(seen.items()):
            meta = kali.get(idcc, {})
            official = str(meta.get("shortTitle") or "").strip()
            name = official or slug.replace("_", " ").strip().capitalize()
            full_name = str(meta.get("title") or "").strip() or None
            kid = meta.get("id")
            legifrance_url = (
                f"https://www.legifrance.gouv.fr/conv_coll/id/{kid}" if kid else None
            )
            eff = meta.get("effectif")
            effectif = int(eff) if isinstance(eff, (int, float)) and eff else None

            factors: list[str] = []
            url = f"{RAW_BASE}/{idcc}_{slug}/indemnite-licenciement.yaml"
            try:
                d = requests.get(url, headers=ua, timeout=30)
                if d.status_code == 200:
                    factors = _extract_factors(d.text)
            except requests.RequestException as e:
                self.log.warning("factors fetch failed for %s: %s", idcc, e)

            convs.append(
                {
                    "idcc": idcc,
                    "slug": slug,
                    "name": name,
                    "full_name": full_name,
                    "legifrance_url": legifrance_url,
                    "effectif": effectif,
                    "factors": factors,
                }
            )
        self.log.info("parsed %d conventions (meta + factors)", len(convs))
        return {"conventions": convs}

    def write(self, raw: dict[str, Any]) -> tuple[int, str]:
        convs = raw["conventions"]
        with self.conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM conventions")
            before = cur.fetchone()[0]
            for c in convs:
                cur.execute(
                    """
                    INSERT INTO conventions
                        (idcc, slug, name, full_name, legifrance_url, effectif, factors, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (idcc) DO UPDATE
                       SET slug = EXCLUDED.slug,
                           name = EXCLUDED.name,
                           full_name = EXCLUDED.full_name,
                           legifrance_url = EXCLUDED.legifrance_url,
                           effectif = EXCLUDED.effectif,
                           factors = EXCLUDED.factors,
                           updated_at = now()
                    """,
                    (
                        c["idcc"],
                        c["slug"],
                        c["name"],
                        c["full_name"],
                        c["legifrance_url"],
                        c["effectif"],
                        Json(c["factors"]),
                    ),
                )
            cur.execute("SELECT count(*) FROM conventions")
            after = cur.fetchone()[0]
        self.conn.commit()
        status = "success" if after != before else "no_change"
        return (len(convs), status)
