-- Add per-convention decision factors (the user-facing parameters of each
-- convention's indemnité-conventionnelle publicodes model). Extracted by the
-- cdtn_conventions scraper. Used to give each /conventions-collectives/<idcc>
-- page genuine, convention-specific substance.

ALTER TABLE conventions
  ADD COLUMN IF NOT EXISTS factors jsonb NOT NULL DEFAULT '[]'::jsonb;
