/**
 * Navigation hubs — top-level sections referenced by Header.astro and
 * Footer.astro. URL grammar distinct from the other portfolio sites
 * (calc /calculadora-X/, concursoja /orgaos/X/, renov /simulateur-X +
 * /aides-renovation/) — see [[feedback-footprint-hygiene]].
 *
 * Some hub targets are content stubs at launch; /dossiers fills in as
 * editorial content ships.
 */

export interface Hub {
  slug: string;
  title: string;
  shortTitle: string;
  path: string;
  description: string;
}

export const HUBS: Record<string, Hub> = {
  licenciement: {
    slug: 'licenciement',
    title: 'Indemnité de licenciement',
    shortTitle: 'Licenciement',
    path: '/calcul-indemnite-licenciement',
    description:
      'Calculez votre indemnité légale de licenciement à partir de votre salaire de référence et de votre ancienneté. Formule du Code du travail (un quart puis un tiers de mois par année), sans inscription.',
  },
  bareme: {
    slug: 'bareme-macron',
    title: 'Barème prud’hommes',
    shortTitle: 'Prud’hommes',
    path: '/bareme-macron',
    description:
      'Le barème Macron encadre l’indemnité versée par le conseil de prud’hommes pour un licenciement sans cause réelle et sérieuse : plancher, plafond selon l’ancienneté et cas où le plafond ne s’applique pas.',
  },
  rupture: {
    slug: 'rupture-conventionnelle',
    title: 'Rupture conventionnelle',
    shortTitle: 'Rupture conv.',
    path: '/rupture-conventionnelle',
    description:
      'Indemnité minimale de rupture conventionnelle et conséquences de la réforme de l’assurance chômage applicable au 1ᵉʳ septembre 2026 sur la durée d’indemnisation après la rupture.',
  },
  conventions: {
    slug: 'conventions-collectives',
    title: 'Conventions collectives',
    shortTitle: 'Conventions',
    path: '/conventions-collectives',
    description:
      'Catalogue des conventions collectives couvertes (indemnité conventionnelle, préavis) — liste maintenue à partir des modèles officiels du Code du travail numérique.',
  },
  dossiers: {
    slug: 'dossiers',
    title: 'Dossiers',
    shortTitle: 'Dossiers',
    path: '/dossiers',
    description:
      'Dossiers pratiques sur le licenciement, la rupture conventionnelle, le préavis, le solde de tout compte et les conventions collectives.',
  },
};

export const hubList = (): Hub[] => Object.values(HUBS);
