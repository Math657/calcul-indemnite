import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync } from 'node:fs';

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://calcul-indemnite.fr';

// Map /guides/<slug> → frontmatter dateModified so the sitemap reflects
// per-guide update times, not the uniform build-time. Without this, a
// bulk Wave 3 deploy of N guides would emit identical lastmod values
// across all of them — a uniformity Google reads as low-quality signal.
const guideLastmod = new Map();
// Guides in scheduled-drip mode (datePublished > today). Excluded from
// sitemap so search engines don't see them before the drip date. The
// route also returns 404 (filter in getStaticPaths). Daily rebuild cron
// re-evaluates on each build, so guides auto-surface on their date.
const scheduledGuidePaths = new Set();
const TODAY = new Date(new Date().toISOString().slice(0, 10)); // midnight UTC, date-only

try {
  for (const file of readdirSync('src/content/dossiers')) {
    if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
    const content = readFileSync(`src/content/guides/${file}`, 'utf-8');
    const slug = file.replace(/\.mdx?$/, '');
    const path = `/dossiers/${slug}`;
    const dm = content.match(/^dateModified:\s*['"]?([\d-]+)/m);
    if (dm) guideLastmod.set(path, dm[1]);
    const dp = content.match(/^datePublished:\s*['"]?([\d-]+)/m);
    const dr = content.match(/^draft:\s*(true|false)/m);
    if (dr && dr[1] === 'true') {
      scheduledGuidePaths.add(path);
    } else if (dp) {
      const publishAt = new Date(dp[1]);
      if (publishAt > TODAY) scheduledGuidePaths.add(path);
    }
  }
} catch {
  // Guides dir missing or empty — no entries to map, sitemap falls back
  // to Astro's default lastmod for simulator pages and other routes.
}

// Map /<simulator-slug> → UPDATED const in each simulateur-*.astro file.
// Used by the IndexNow ping script on the VPS (filters URLs by lastmod=today).
// Without this, the sitemap omits <lastmod> for simulator pages and IndexNow
// finds zero URLs to submit on drip-publish days.
const simulatorLastmod = new Map();
try {
  for (const file of readdirSync('src/pages')) {
    if (!file.endsWith('.astro')) continue;
    if (!/^calcul-/.test(file)) continue;
    const updated = readFileSync(`src/pages/${file}`, 'utf-8').match(
      /const\s+UPDATED\s*=\s*['"]([\d-]+)['"]/,
    );
    if (updated) simulatorLastmod.set(`/${file.replace(/\.astro$/, '')}`, updated[1]);
  }
} catch {
  // Pages dir unreadable — defensive only; should never happen in build.
}

// Simulator paths in scheduled-drip mode (publishAt > today). Their .astro
// file still builds the route, but we exclude from sitemap so Google doesn't
// pick them up before the drip date. Source-of-truth is src/data/simulators.ts
// (created when the first simulator registry is added in step 14).
const scheduledSimulatorPaths = new Set();
try {
  const src = readFileSync('src/data/simulators.ts', 'utf-8');
  const today = new Date();
  // Match each Simulator object literal and extract slug + publishAt.
  const re = /\{[^}]*slug:\s*['"]([\w-]+)['"][^}]*publishAt:\s*['"]([\d-]+)['"][^}]*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const slug = m[1];
    const publishAt = new Date(m[2]);
    if (publishAt > today) scheduledSimulatorPaths.add(`/${slug}`);
  }
} catch {
  // simulators.ts not yet created — block silently no-ops until step 14.
}

export default defineConfig({
  site: SITE,
  // Pure static output — every page is prerendered. Cloudflare Workers
  // Static Assets handles serving + trailing-slash redirects natively.
  // No SSR adapter needed; if we ever want SSR routes, add @astrojs/cloudflare
  // back here and re-add `main` to wrangler.jsonc.
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        if (page.includes('/preview/') || page.includes('/404')) return false;
        const pathname = new URL(page).pathname.replace(/\/$/, '');
        // Pages flagged `noindex: true` in their seo props: also excluded
        // from sitemap so crawlers aren't even told these URLs exist by
        // name. Currently the two legal pages (mentions-legales,
        // politique-de-confidentialite) to keep the editor's name out of
        // search-engine awareness, per [[feedback-minimize-operator-name]].
        if (pathname === '/mentions-legales' || pathname === '/politique-de-confidentialite') {
          return false;
        }
        // Scheduled-future simulators: their route exists but they shouldn't
        // be crawl-discoverable until the drip date.
        if (scheduledSimulatorPaths.has(pathname)) return false;
        // Scheduled-future guides: same logic — excluded until publish date.
        if (scheduledGuidePaths.has(pathname)) return false;
        return true;
      },
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '');
        return {
          url: item.url.replace(/\/$/, ''),
          lastmod: guideLastmod.get(path) ?? simulatorLastmod.get(path) ?? item.lastmod,
        };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
