/**
 * Editorial authors registry — intentionally empty.
 *
 * E-E-A-T strategy for this FR YMYL site: Organisation byline (no named
 * author on guides). Same pattern as calculify.app and concursoja.com.
 *
 * Rationale: Mathieu does not hold a topical credential (no RGE / OPQIBI /
 * Mon Accompagnateur Rénov' / conseiller en rénovation énergétique title)
 * and his day-job background doesn't anchor authority on rénovation
 * content. In this niche, sourced data + cited decrees carry trust more
 * than a personal byline.
 *
 * Topical authority is carried by:
 *   1. `src/components/Methodology.astro` block on each editorial page
 *      ("toutes les données proviennent de [source] mise à jour le [date]")
 *   2. Decree citations on every regulatory claim (legifrance.gouv.fr links)
 *   3. Organisation schema.org node emitted from every page (lib/schema.ts).
 *
 * Mentions légales (LCEN art. 6) still lists Mathieu as directeur de la
 * publication — that is a legal requirement, separate from guide bylines.
 *
 * If a topic genuinely needs expert opinion, quote a named credentialed
 * expert with a link, or punt to "consultez un conseiller France Rénov gratuit".
 *
 * When a credentialed reviewer joins: add them to AUTHORS, set
 * `author: '<slug>'` on the matching guide frontmatter, and reintroduce
 * the AuthorBio component alongside Methodology (not in place of it).
 * Also re-add personSchema() to lib/schema.ts (removed when this registry
 * was emptied).
 */

export interface Author {
  slug: string;
  name: string;
  jobTitle: string;
  bio: string;
  photo?: string;
  social?: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    site?: string;
  };
  /**
   * Verifiable credential string (e.g. "RGE QualiPAC 12345", "OPQIBI 0905").
   * Required ONLY for authors who actually hold such credentials. Leave
   * undefined if the author is a data-aggregator / journalist / homeowner
   * rather than a credentialed professional.
   */
  credentials?: string;
}

export const AUTHORS: Record<string, Author> = {};

export const findAuthor = (slug?: string): Author | undefined =>
  slug ? AUTHORS[slug] : undefined;
