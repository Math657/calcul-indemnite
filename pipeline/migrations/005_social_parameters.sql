-- Revalorized social parameters (SMIC, plafond de la Sécurité sociale) used as
-- floors/ceilings by the simulators (notably the future rupture-conventionnelle
-- chômage estimator). One row per (parameter, date of entry into force) so the
-- full revalorization history is kept; the export picks the value effective at
-- build time. Populated by the social_params scraper from the URSSAF/betagouv
-- publicodes source (mon-entreprise), which carries dated values + décret refs.

CREATE TABLE IF NOT EXISTS social_parameters (
  param          text NOT NULL,        -- 'smic_horaire_brut', 'pmss_mensuel'
  effective_from date NOT NULL,        -- date d'entrée en vigueur
  value          numeric NOT NULL,
  unit           text NOT NULL,        -- '€/heure', '€/mois'
  source_url     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (param, effective_from)
);
