/**
 * Site-wide constants. Single source for brand identity, social links,
 * legal contact, and other repeated metadata.
 */
export const SITE = {
  url: 'https://calcul-indemnite.fr',
  name: 'CalculIndemnité',
  tagline: 'Calcul des indemnités de licenciement, rupture conventionnelle et barème prud’hommes',
  description:
    'Simulateurs et barèmes à jour : indemnité de licenciement (légale et conventionnelle), rupture conventionnelle, barème Macron aux prud’hommes. Sources Légifrance et Code du travail. Gratuit et sans inscription.',
  contactEmail: 'contact@calcul-indemnite.fr',
  privacyEmail: 'rgpd@calcul-indemnite.fr',
  founded: 2026,
  social: {
    twitter: '',
    linkedin: '',
  },
  newsletter: {
    /**
     * Newsletter provider. Currently Buttondown (https://buttondown.com).
     * Public subscribe page: https://buttondown.com/<username>
     * Empty string = component renders "Bientôt" placeholder.
     */
    provider: 'buttondown' as const,
    username: '',
  },
};

export type SiteConfig = typeof SITE;
