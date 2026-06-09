-- Content-hash watch table. Each row tracks one upstream legal source the site
-- relies on (a SocialGouv publicodes base model). The cdtn_watch scraper stores
-- a hash per source and flags a change so the simulator data + dossiers citing
-- that rule get reviewed. It never edits content — it only signals drift.

CREATE TABLE IF NOT EXISTS source_hashes (
  source          text PRIMARY KEY,
  source_url      text NOT NULL,
  last_hash       text NOT NULL,
  last_checked    timestamptz NOT NULL DEFAULT now(),
  last_changed    timestamptz,
  content_snippet text
);
