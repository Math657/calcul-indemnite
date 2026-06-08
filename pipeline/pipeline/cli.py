"""indemnite CLI — entry point for cron jobs and manual operations.

Examples (once scrapers are registered in step 13+):
  python -m pipeline.cli migrate
  python -m pipeline.cli scrape ademe_dpe
  python -m pipeline.cli scrape-all
  python -m pipeline.cli export
  python -m pipeline.cli health
"""
from __future__ import annotations

import logging
import sys

import typer

from . import export as export_mod
from . import health as health_mod
from . import migrate as migrate_mod
from .db import connect
from .scrapers import REGISTRY

app = typer.Typer(add_completion=False, no_args_is_help=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)


@app.command()
def migrate() -> None:
    """Apply pending SQL migrations."""
    applied = migrate_mod.run()
    if not applied:
        typer.echo("Nothing to apply — schema is up to date.")
    else:
        for v in applied:
            typer.echo(f"applied {v}")


@app.command()
def scrape(source: str) -> None:
    """Run a single named scraper (e.g. 'ademe_dpe')."""
    cls = REGISTRY.get(source)
    if cls is None:
        typer.echo(f"Unknown source: {source}. Known: {', '.join(REGISTRY) or '(none registered yet)'}", err=True)
        raise typer.Exit(code=2)
    with connect() as conn:
        result = cls(conn).run()
    typer.echo(result)


@app.command("scrape-all")
def scrape_all() -> None:
    """Run every registered scraper sequentially."""
    if not REGISTRY:
        typer.echo("No scrapers registered yet. Add one in pipeline/scrapers/ and re-run.")
        return
    failures = []
    with connect() as conn:
        for name, cls in REGISTRY.items():
            try:
                result = cls(conn).run()
                typer.echo(f"{name}: {result}")
            except Exception as e:  # noqa: BLE001 — top-level orchestrator
                failures.append((name, str(e)))
                typer.echo(f"{name}: FAILED — {e}", err=True)
    if failures:
        raise typer.Exit(code=1)


@app.command()
def export(target: str = "all") -> None:
    """Export latest DB snapshots to src/data/*.json. Only target='all' until scrapers land."""
    if target != "all":
        typer.echo(f"Unknown target: {target}. Use 'all'.", err=True)
        raise typer.Exit(code=2)
    paths = export_mod.export_all()
    if not paths:
        typer.echo("No exports registered yet. Add scraper + matching export in pipeline/export.py.")
        return
    for path in paths:
        typer.echo(f"wrote {path}")


@app.command()
def health() -> None:
    """Check scraper run health. Exits non-zero (and webhooks) on issues."""
    healthy, text = health_mod.report()
    typer.echo(text)
    if not healthy:
        raise typer.Exit(code=1)


if __name__ == "__main__":
    sys.exit(app())
