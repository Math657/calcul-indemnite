/**
 * Generate Calcul Indemnité brand assets (one-shot — re-run when palette or
 * brand changes).
 *
 *   public/favicon.svg               — vector mark
 *   public/apple-touch-icon.png      — derived from favicon.svg, 180×180
 *   public/og/default.png            — social-share preview, 1200×630
 *
 * Usage:
 *   node scripts/gen-brand-assets.mjs
 *
 * Pinned color: indigo-600 (#4f46e5) per Header/Footer + theme-color in
 * Base.astro. Update the hex below if the brand palette changes.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const PUBLIC = resolve(ROOT, 'public');

const BRAND_HEX = '#4f46e5';        // indigo-600
const BRAND_DARK_HEX = '#3730a3';   // indigo-800
const TINT_HEX = '#c7d2fe';         // indigo-200
const TINT_LIGHT_HEX = '#e0e7ff';   // indigo-100

const SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" fill="${BRAND_HEX}"/>
  <text x="32" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="white">C</text>
</svg>`;

const SVG_OG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND_HEX}"/>
      <stop offset="100%" stop-color="${BRAND_DARK_HEX}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="96" height="96" rx="18" fill="white"/>
  <text x="108" y="134" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="${BRAND_HEX}">C</text>
  <text x="60" y="360" font-family="Arial, sans-serif" font-size="84" font-weight="900" fill="white">Calcul Indemnité</text>
  <text x="60" y="440" font-family="Arial, sans-serif" font-size="36" font-weight="600" fill="${TINT_LIGHT_HEX}">Indemnité de licenciement, rupture</text>
  <text x="60" y="490" font-family="Arial, sans-serif" font-size="36" font-weight="600" fill="${TINT_LIGHT_HEX}">conventionnelle, barème prud’hommes</text>
  <text x="60" y="560" font-family="Arial, sans-serif" font-size="26" font-weight="500" fill="${TINT_HEX}">calcul-indemnite.fr</text>
</svg>`;

async function gen() {
  await writeFile(resolve(PUBLIC, 'favicon.svg'), SVG_ICON + '\n', 'utf8');
  console.log('  ✓ public/favicon.svg');

  await sharp(Buffer.from(SVG_ICON))
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(resolve(PUBLIC, 'apple-touch-icon.png'));
  console.log('  ✓ public/apple-touch-icon.png (180×180)');

  await mkdir(resolve(PUBLIC, 'og'), { recursive: true });
  await sharp(Buffer.from(SVG_OG))
    .png({ compressionLevel: 9 })
    .toFile(resolve(PUBLIC, 'og', 'default.png'));
  console.log('  ✓ public/og/default.png (1200×630)');
}

gen().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
