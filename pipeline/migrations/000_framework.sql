-- Framework tables required by the pipeline before any per-scraper migration.
--
-- schema_migrations: tracks which numbered migrations have been applied.
--   Read by pipeline/pipeline/migrate.py.
--
-- scrape_runs: per-scraper execution log. BaseScraper.run() writes a row at
--   start (status='running') and updates it at end (status='success' /
--   'no_change' / 'failed'). Used by pipeline.cli health check and Metabase
--   dashboards.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id            serial PRIMARY KEY,
  source        text   NOT NULL,
  status        text   NOT NULL CHECK (status IN ('running', 'success', 'no_change', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  rows_written  integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_source_started
  ON scrape_runs(source, started_at DESC);
