"""Scraper registry — populated as scrapers are added.

Each scraper module exposes its class; this file maps a stable string key
(used by ``python -m pipeline.cli scrape <key>``, systemd template instance
``indemnite-scrape@<key>.timer``, and the ``scrape_runs.source`` column) to
the class.

To add a scraper:

1. Create ``pipeline/scrapers/<source>.py`` with a class extending
   ``BaseScraper``.
2. Add the import + REGISTRY entry below.
3. Add a migration in ``pipeline/migrations/00N_<source>.sql``.
4. Enable the timer:
   ``sudo systemctl enable --now indemnite-scrape@<source>.timer``
"""
from __future__ import annotations

from .base import BaseScraper
from .cdtn_conventions import CdtnConventionsScraper

REGISTRY: dict[str, type[BaseScraper]] = {
    "cdtn_conventions": CdtnConventionsScraper,
}
