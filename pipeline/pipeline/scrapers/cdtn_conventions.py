"""Conventions collectives scraper.

Source: the SocialGouv/code-du-travail-numerique GitHub tree. Every folder
``packages/code-du-travail-modeles/src/modeles/conventions/<idcc>_<slug>/``
is one convention collective covered by the official (government-maintained)
publicodes models. We list them — IDCC + slug — so the site surfaces a
maintained, dated catalogue of conventions, refreshed on a schedule.

No legal VALUE is extracted here (publicodes rule-parsing is intentionally out
of scope to avoid mis-reading a rule engine into prose). This scraper produces
the authoritative *list*, which grows as SocialGouv adds convention models.
"""
from __future__ import annotations

import re
from typing import Any

import requests

from ..settings import load
from .base import BaseScraper

TREE_URL = (
    "https://api.github.com/repos/SocialGouv/code-du-travail-numerique/"
    "git/trees/master?recursive=1"
)
CONV_RE = re.compile(
    r"packages/code-du-travail-modeles/src/modeles/conventions/(\d+)_([^/]+)/"
)


class CdtnConventionsScraper(BaseScraper):
    source_name = "cdtn_conventions"

    def fetch(self) -> dict[str, Any]:
        settings = load()
        headers = {
            "User-Agent": settings.user_agent,
            "Accept": "application/vnd.github+json",
        }
        self.log.info("GET %s", TREE_URL)
        r = requests.get(TREE_URL, headers=headers, timeout=60)
        r.raise_for_status()
        tree = r.json().get("tree", [])
        seen: dict[int, str] = {}
        for item in tree:
            m = CONV_RE.match(item.get("path", ""))
            if m:
                seen[int(m.group(1))] = m.group(2)
        convs = [
            {"idcc": k, "slug": v, "name": v.replace("_", " ").strip().capitalize()}
            for k, v in sorted(seen.items())
        ]
        if not convs:
            raise RuntimeError(
                "No conventions parsed from the GitHub tree — the SocialGouv "
                "modeles layout may have changed; verify the path regex."
            )
        self.log.info("parsed %d conventions", len(convs))
        return {"conventions": convs}

    def write(self, raw: dict[str, Any]) -> tuple[int, str]:
        convs = raw["conventions"]
        with self.conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM conventions")
            before = cur.fetchone()[0]
            for c in convs:
                cur.execute(
                    """
                    INSERT INTO conventions (idcc, slug, name, updated_at)
                    VALUES (%s, %s, %s, now())
                    ON CONFLICT (idcc) DO UPDATE
                       SET slug = EXCLUDED.slug,
                           name = EXCLUDED.name,
                           updated_at = now()
                    """,
                    (c["idcc"], c["slug"], c["name"]),
                )
            cur.execute("SELECT count(*) FROM conventions")
            after = cur.fetchone()[0]
        self.conn.commit()
        # 'success' when the set grew/shrank; otherwise a routine refresh.
        status = "success" if after != before else "no_change"
        return (len(convs), status)
