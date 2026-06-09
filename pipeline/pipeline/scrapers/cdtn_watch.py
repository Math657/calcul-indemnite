"""Legal-source watch scraper.

Monitors the SocialGouv publicodes *base* models that encode the rules the site
relies on (indemnité de licenciement, préavis, rupture conventionnelle,
indemnité de précarité). It content-hashes each and alerts — via a failed
scrape_run that health.py surfaces — when a source changes. That's the signal
to review the simulator data file and the dossiers citing that rule.

It never edits content. It tells us *when* the law/model moved, so the static
editorial pages get reviewed exactly when they need to, instead of drifting.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

import requests

from ..settings import load
from .base import BaseScraper

BASE = (
    "https://raw.githubusercontent.com/SocialGouv/code-du-travail-numerique/"
    "master/packages/code-du-travail-modeles/src/modeles/base"
)
WATCHED = {
    "cdtn_indemnite_licenciement": f"{BASE}/indemnite-licenciement.yaml",
    "cdtn_preavis_licenciement": f"{BASE}/preavis-licenciement.yaml",
    "cdtn_rupture_conventionnelle": f"{BASE}/rupture-conventionnelle.yaml",
    "cdtn_indemnite_precarite": f"{BASE}/indemnite-precarite.yaml",
}
_WS = re.compile(r"\s+")


def _hash(text: str) -> tuple[str, str]:
    norm = _WS.sub(" ", text).strip()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest(), norm[:160]


class CdtnWatchScraper(BaseScraper):
    source_name = "cdtn_watch"

    def fetch(self) -> dict[str, Any]:
        settings = load()
        ua = {"User-Agent": settings.user_agent}
        out: dict[str, Any] = {}
        for key, url in WATCHED.items():
            r = requests.get(url, headers=ua, timeout=30)
            r.raise_for_status()
            h, snip = _hash(r.text)
            out[key] = {"url": url, "hash": h, "snippet": snip}
            self.log.info("%s hash=%s", key, h[:16])
        return out

    def write(self, raw: dict[str, Any]) -> tuple[int, str]:
        changed: list[str] = []
        with self.conn.cursor() as cur:
            for key, info in raw.items():
                cur.execute("SELECT last_hash FROM source_hashes WHERE source = %s", (key,))
                row = cur.fetchone()
                prev = row[0] if row else None
                if prev is None:
                    cur.execute(
                        """
                        INSERT INTO source_hashes (source, source_url, last_hash, last_checked, content_snippet)
                        VALUES (%s, %s, %s, now(), %s)
                        ON CONFLICT (source) DO UPDATE
                           SET last_hash = EXCLUDED.last_hash,
                               last_checked = now(),
                               content_snippet = EXCLUDED.content_snippet
                        """,
                        (key, info["url"], info["hash"], info["snippet"]),
                    )
                elif prev == info["hash"]:
                    cur.execute(
                        "UPDATE source_hashes SET last_checked = now() WHERE source = %s", (key,)
                    )
                else:
                    cur.execute(
                        """
                        UPDATE source_hashes
                           SET last_hash = %s, last_checked = now(), last_changed = now(), content_snippet = %s
                         WHERE source = %s
                        """,
                        (info["hash"], info["snippet"], key),
                    )
                    changed.append(key)
        self.conn.commit()
        if changed:
            # The new baseline is already stored, so the next run won't re-alert.
            raise RuntimeError(
                "SOURCE_CHANGED: "
                + ", ".join(changed)
                + " — review the simulator data + dossiers citing these rules."
            )
        return (len(raw), "no_change")
