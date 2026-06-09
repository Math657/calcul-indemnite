# indemnite pipeline

Python pipeline that ingests French labour-law reference data (conventions collectives metadata, SMIC + plafond de la Sécurité sociale, watched legal sources) into Postgres on the VPS, and exports build-time JSON snapshots for the Astro frontend.

## Layout

```
pipeline/
├── pyproject.toml
├── migrations/                  # numbered raw-SQL migrations
└── pipeline/
    ├── settings.py              # env-driven config (.env, .env.local)
    ├── db.py                    # psycopg connection helper
    ├── migrate.py               # applies pending migrations
    ├── export.py                # DB → src/data/*.json snapshots
    ├── cli.py                   # entry point: `python -m pipeline.cli <cmd>`
    └── scrapers/
        ├── base.py              # BaseScraper: fetch → write → log
        ├── cdtn_conventions.py  # conventions collectives metadata (IDCC)
        ├── cdtn_watch.py        # content-hash watch on SocialGouv legal models
        └── social_params.py     # SMIC horaire + plafond mensuel Sécu (URSSAF publicodes)
```

## First-time setup on the VPS

```bash
cd ~/indemnite/pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Set DB credentials at the **repo root** in `.env.local` (gitignored):

```
PG_HOST=localhost
PG_PORT=5432
PG_USER=indemnite_app
PG_DB=indemnite
PG_PASSWORD=<from 00-postgres-setup.sh output>
```

## Apply migrations

```bash
python -m pipeline.cli migrate
```

Re-running is safe (idempotent).

## Run a scraper

```bash
python -m pipeline.cli scrape social_params    # SMIC + plafond Sécu
python -m pipeline.cli scrape cdtn_conventions  # conventions collectives
```

Or run them all:

```bash
python -m pipeline.cli scrape-all
```

Each run logs to `scrape_runs` for monitoring:

```sql
SELECT source, status, rows_written, started_at, finished_at, error_message
  FROM scrape_runs
 ORDER BY started_at DESC
 LIMIT 20;
```

## Adding a new scraper

1. Add a class in `pipeline/scrapers/<source>.py` extending `BaseScraper`.
2. Register it in `pipeline/scrapers/__init__.py` under a stable key.
3. Add tables in a new migration `migrations/00N_<source>.sql`.
4. Run `python -m pipeline.cli migrate`, then `scrape <source>`.
5. Add an `export_<source>()` function in `pipeline/pipeline/export.py` and append it to `export_all()`.
6. Add the matching `src/data/<source>.json` path to `DATA_FILES` in `scripts/vps/publish.sh` so the bot publishes drift.

## Cron

Cron entries live in `scripts/vps/` (separate from the Python package). The pipeline doesn't manage its own scheduler — Linux cron + systemd timers do the timing, the Python CLI just exposes one-shot commands.
