import { defineCollection, z } from 'astro:content';

/**
 * Guides collection — long-tail editorial content (Wave 3 per the plan).
 *
 * Each markdown file in `src/content/guides/` becomes a page at
 * `/guides/<slug>` via `src/pages/guides/[slug].astro`.
 *
 * Frontmatter conventions:
 * - hub: which top-level category the guide belongs to (for cross-linking)
 * - primarySimulator: the simulator this guide is companion content for
 * - tags: free-form, used for guide-to-guide cross-linking
 * - draft: true to keep out of the build (won't be generated as a page)
 * - author: leave unset — site uses Organisation byline per
 *   [[project-byline-strategy]]. Setting this field has no effect until
 *   a credentialed reviewer is added to src/data/authors.ts.
 */
const guides = defineCollection({
  type: 'content',
  // Note: `slug` is reserved by Astro and not part of the schema. Astro derives
  // it from the filename automatically (e.g. `isolation-combles-2026.mdx` →
  // slug `isolation-combles-2026`). Authors can override via frontmatter `slug:`
  // but consumers should read `entry.slug`, not `entry.data.slug`.
  schema: z.object({
    title: z.string().min(20).max(80),
    description: z.string().min(120).max(200),
    hub: z.enum(['simulateurs', 'aides', 'dpe']).optional(),
    tags: z.array(z.string()).default([]),
    primarySimulator: z.string().optional(),
    /** Currently unused — Organisation byline strategy. See file header. */
    author: z.string().optional(),
    datePublished: z.string(),
    dateModified: z.string(),
    draft: z.boolean().default(false),
    ogImage: z.string().optional(),
  }),
});

export const collections = { guides };
