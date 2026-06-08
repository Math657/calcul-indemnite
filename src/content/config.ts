import { defineCollection, z } from 'astro:content';

/**
 * Dossiers collection — long-form editorial content at /dossiers/<slug>.
 *
 * Frontmatter:
 * - hub: top-level category for cross-linking (a key of HUBS).
 * - tags: free-form, used for related-dossier cross-linking.
 * - draft: true keeps it out of the build entirely.
 * - datePublished in the future → drip-published: the route 404s and the
 *   URL is excluded from the sitemap until that date (see astro.config.mjs).
 * - author: leave unset — Organisation byline per [[project-byline-strategy]].
 */
const dossiers = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(20).max(80),
    description: z.string().min(120).max(200),
    hub: z.enum(['licenciement', 'bareme', 'rupture', 'conventions']).optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
    datePublished: z.string(),
    dateModified: z.string(),
    draft: z.boolean().default(false),
    ogImage: z.string().optional(),
  }),
});

export const collections = { dossiers };
