/**
 * Rattachement des conventions collectives à un secteur, pour le maillage
 * interne entre pages IDCC.
 *
 * Cette table est tenue à la main, contrairement au reste des données
 * conventions qui vient du scraper. Deux approches automatiques ont été
 * essayées puis écartées : le recoupement de mots-clés sur le titre court
 * rapprochait « Handicapés : établissements et services » de « Services de
 * l'automobile » sur le seul mot « services », et le titre complet dégradait
 * encore le signal en y ajoutant des numéros de décret. La donnée officielle
 * ne porte aucune information de secteur ; la classer explicitement est le
 * seul moyen d'obtenir des rapprochements justes.
 *
 * Une convention absente de cette table n'affiche simplement pas de bloc de
 * conventions proches. C'est le comportement attendu pour toute convention
 * ajoutée par le scraper avant d'être classée ici.
 */

export interface Secteur {
  id: string;
  label: string;
}

export const SECTEURS: Record<string, Secteur> = {
  batiment_tp: { id: 'batiment_tp', label: 'Bâtiment et travaux publics' },
  commerce: { id: 'commerce', label: 'Commerce et distribution' },
  sante_social: { id: 'sante_social', label: 'Santé, social et médico-social' },
  industrie: { id: 'industrie', label: 'Industrie' },
  transport: { id: 'transport', label: 'Transport' },
  hotellerie: { id: 'hotellerie', label: 'Hôtellerie, restauration et métiers de bouche' },
  services_entreprises: { id: 'services_entreprises', label: 'Services aux entreprises' },
  services_particuliers: { id: 'services_particuliers', label: 'Services aux particuliers' },
  finance_immobilier: { id: 'finance_immobilier', label: 'Banque, assurance et immobilier' },
  education_culture: { id: 'education_culture', label: 'Éducation, culture, médias et sport' },
  automobile: { id: 'automobile', label: 'Automobile et matériels' },
};

/** IDCC -> identifiant de secteur. */
export const SECTEUR_PAR_IDCC: Record<number, string> = {
  // Bâtiment et travaux publics
  1596: 'batiment_tp',
  1597: 'batiment_tp',
  2609: 'batiment_tp',
  2420: 'batiment_tp',
  1740: 'batiment_tp',
  1702: 'batiment_tp',
  2614: 'batiment_tp',

  // Commerce et distribution
  2216: 'commerce',
  573: 'commerce',
  675: 'commerce',
  1517: 'commerce',
  1505: 'commerce',
  1606: 'commerce',
  1483: 'commerce',

  // Santé, social et médico-social
  413: 'sante_social',
  2264: 'sante_social',
  29: 'sante_social',
  2941: 'sante_social',
  1147: 'sante_social',
  1996: 'sante_social',

  // Industrie
  3248: 'industrie',
  44: 'industrie',
  176: 'industrie',
  292: 'industrie',

  // Transport
  16: 'transport',
  275: 'transport',

  // Hôtellerie, restauration et métiers de bouche
  1979: 'hotellerie',
  1501: 'hotellerie',
  1266: 'hotellerie',
  843: 'hotellerie',

  // Services aux entreprises
  1486: 'services_entreprises',
  2098: 'services_entreprises',
  787: 'services_entreprises',
  86: 'services_entreprises',
  1351: 'services_entreprises',
  3043: 'services_entreprises',
  2148: 'services_entreprises',

  // Services aux particuliers
  3127: 'services_particuliers',
  3239: 'services_particuliers',
  2596: 'services_particuliers',
  1043: 'services_particuliers',

  // Banque, assurance et immobilier
  2120: 'finance_immobilier',
  1672: 'finance_immobilier',
  1527: 'finance_immobilier',

  // Éducation, culture, médias et sport
  1518: 'education_culture',
  1516: 'education_culture',
  2511: 'education_culture',
  1480: 'education_culture',

  // Automobile et matériels
  1090: 'automobile',
  1404: 'automobile',
};

export interface ConventionMinimale {
  idcc: number;
  slug: string;
  name: string;
  effectif?: number | null;
}

/** Chemin public d'une page convention, dérivé de l'IDCC et du slug. */
export const cheminConvention = (c: ConventionMinimale): string =>
  `/conventions-collectives/${c.idcc}-${c.slug.replace(/_/g, '-')}`;

/**
 * Conventions du même secteur, hors la convention courante, les plus
 * représentatives d'abord. Retourne une liste vide si la convention n'est pas
 * classée ou si elle est seule dans son secteur.
 *
 * La limite par défaut vaut la taille du plus grand secteur moins un, pour que
 * le maillage soit complet à l'intérieur d'un secteur. Avec une limite plus
 * basse, les conventions au plus faible effectif n'entraient dans la liste
 * d'aucune autre et restaient avec le seul lien du catalogue : c'était le cas
 * de la publicité, du commerce de détail de l'habillement et du bâtiment
 * région parisienne, derniers de secteurs qui comptent sept membres.
 */
export function conventionsProches<T extends ConventionMinimale>(
  courante: ConventionMinimale,
  toutes: T[],
  limite = 6,
): T[] {
  const secteur = SECTEUR_PAR_IDCC[Number(courante.idcc)];
  if (!secteur) return [];
  return toutes
    .filter(
      (c) =>
        Number(c.idcc) !== Number(courante.idcc) &&
        SECTEUR_PAR_IDCC[Number(c.idcc)] === secteur,
    )
    .sort((a, b) => (b.effectif ?? 0) - (a.effectif ?? 0) || Number(a.idcc) - Number(b.idcc))
    .slice(0, limite);
}
