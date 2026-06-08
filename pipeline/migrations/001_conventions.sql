-- Conventions collectives covered by the SocialGouv code-du-travail publicodes
-- models. One row per IDCC. Populated by the cdtn_conventions scraper from the
-- SocialGouv/code-du-travail-numerique GitHub tree. The IDCC is the authoritative
-- identifier; name is derived from the SocialGouv folder slug.

CREATE TABLE IF NOT EXISTS conventions (
  idcc       integer PRIMARY KEY,
  slug       text NOT NULL,
  name       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
