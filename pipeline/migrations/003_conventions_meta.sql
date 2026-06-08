-- Official metadata per convention from SocialGouv kali-data (KALI / Légifrance):
-- accented short title (stored in name), full official title, Légifrance URL,
-- and effectif (employees covered). Enriches each /conventions-collectives page.

ALTER TABLE conventions
  ADD COLUMN IF NOT EXISTS full_name      text,
  ADD COLUMN IF NOT EXISTS legifrance_url text,
  ADD COLUMN IF NOT EXISTS effectif       integer;
