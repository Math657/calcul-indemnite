#!/usr/bin/env node
/**
 * FR content audit gate. Runs in `prebuild` so Cloudflare CI fails
 * deployments that introduce regressions.
 *
 * What it checks
 * ──────────────
 * HARD FAIL (exit 1):
 *   1. AI-tell vocabulary (case-insensitive whole-word match against a
 *      curated list of phrases that mark AI-generated French).
 *   2. Anglicismes flagged by [[feedback-fr-content-audit]] rule §2.
 *   3. Unresolved placeholder markers: [VERIFY], [À VÉRIFIER], [TODO],
 *      `<<...>>` template-style markers left over from drafts.
 *
 * SOFT WARN (exit 0, printed):
 *   4. Em-dash density in raw file contents (naive — does not exclude
 *      label-list em-dashes, so this is a yellow flag for human review).
 *   5. "MaRénovAide" brand-name density above 10 occurrences per file.
 *   6. Legal citations not present in `data/verified-citations.txt`.
 *      Catches hallucination patterns: fabricated décret numbers, wrong
 *      Loi attributions, invented arrêté dates. The allowlist grows as
 *      citations are web-verified against primary sources (legifrance.gouv.fr,
 *      service-public.fr, anah.gouv.fr, ademe.fr).
 *
 * The deeper editorial passes (source URLs accessible, regulatory
 * interpretation correct, simulator values matching the latest barème
 * PDF) are not mechanical — they remain a manual review responsibility.
 *
 * Run manually:   node scripts/audit-content.mjs
 * Run via build:  pnpm build  (chained from prebuild)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Phrases that should never appear in FR copy on this site.
// Whole-word, case-insensitive. Sourced from [[feedback-fr-content-audit]]
// memory + observed AI-FR-output overuse patterns.
const AI_TELLS = [
  // The corporate / consulting AI-FR register
  "il convient de",
  "il est important de noter",
  "il est important de souligner",
  "force est de constater",
  "à l'instar de",
  "dans le cadre de",
  "à juste titre",
  "à la pointe de",
  "fort de",
  "incontournable",
  "transformer la donne",
  "révolutionner",
  // Generic overused AI verbs
  "permettre de",
  "souligner que",
  "embrasser",
  "embarquer dans",
  "naviguer dans",
  "explorer notre",
  "découvrez notre",
  // The Anglo-Saxon-pollinated FR
  "robuste",
  "écosystème",
  "innovant",
  "leader",
  "best practices",
  "permettez-nous",
  // Common AI rhetorical bridges
  "en effet",
  "en somme",
  "en définitive",
  "en dernière analyse",
  "ainsi donc",
];

// Anglicismes that have legitimate French equivalents. Hard-fail per
// [[feedback-fr-content-audit]] rule §2 — these regressions are easy
// to introduce when reading anglo sources and translating loosely.
const ANGLICISMES = [
  { bad: "supporter", reason: 'use "prendre en charge" / "supporter les frais" is the only OK use' },
  { bad: "supporte", reason: 'same — anglicisme except for "supporte les frais" (legal)' },
  { bad: "réaliser", reason: 'as a generic "do/perform/conduct" verb — use "faire" / "effectuer"' },
  { bad: "challenger", reason: 'use "remettre en question" / "défier"' },
  { bad: "matcher", reason: 'use "correspondre"' },
  { bad: "implémenter", reason: 'in non-tech contexts — use "mettre en place"' },
];

// Allow a small whitelist of phrases that contain the anglicisme but in
// a legitimate compound construction. Anglicisme check skips these.
const ANGLICISMES_WHITELIST = [
  "supporte les frais",           // legal/CGU usage
  "supporter les frais",
  "permet à l'éditeur de supporter",
];

const FILE_PATTERNS = [
  'src/content/guides/**/*.mdx',
  'src/pages/**/*.astro',
];

// Don't audit pages that intentionally reference AI/marketing terms in
// QUOTES as examples (e.g., a future "what is AI Overview" guide). None
// today, but reserved for the future.
const EXCLUDE_PATTERNS = [];

const CITATIONS_FILE = 'data/verified-citations.txt';
const CEE_FICHES_FILE = 'data/verified-cee-fiches.txt';

const BRAND = 'MaRénovAide';
const BRAND_SPAM_THRESHOLD = 10;

/**
 * Build the set of valid internal-link targets by enumerating what the
 * Astro build will actually generate:
 *   - /guides/<slug> for each non-draft guide in src/content/guides
 *   - /<filename without .astro> for each static page in src/pages
 *   - /<dir> for each src/pages/<dir>/index.astro
 *   - / for src/pages/index.astro
 * Dynamic routes ([slug].astro) are skipped — their slugs are covered by
 * the content collection.
 */
function collectValidLinkTargets() {
  const targets = new Set();

  const guidesDir = path.join(ROOT, 'src/content/guides');
  if (fs.existsSync(guidesDir)) {
    for (const f of fs.readdirSync(guidesDir)) {
      if (!/\.mdx?$/.test(f)) continue;
      const content = fs.readFileSync(path.join(guidesDir, f), 'utf8');
      const draftMatch = content.match(/^draft:\s*(true|false)/m);
      const isDraft = draftMatch && draftMatch[1] === 'true';
      if (isDraft) continue;
      targets.add(`/guides/${f.replace(/\.mdx?$/, '')}`);
    }
  }

  const pagesDir = path.join(ROOT, 'src/pages');
  function walkPages(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sub = `${prefix}/${entry.name}`;
        if (fs.existsSync(path.join(dir, entry.name, 'index.astro'))) {
          targets.add(sub);
        }
        walkPages(path.join(dir, entry.name), sub);
      } else if (entry.name.endsWith('.astro')) {
        if (entry.name.startsWith('[')) continue; // dynamic route, handled via collection
        if (entry.name === 'index.astro') {
          targets.add(prefix || '/');
          continue;
        }
        const slug = entry.name.replace(/\.astro$/, '');
        targets.add(`${prefix}/${slug}`);
      }
    }
  }
  walkPages(pagesDir, '');

  return targets;
}

// Match Markdown internal links: [label](/path) — captures the href, line
// index needed via separate match. Stops on whitespace / closing paren.
const INTERNAL_LINK_RE = /\]\((\/(?!\/)[^\s)#?]+)(?:[#?][^)]*)?\)/g;

// Stale "publication prochaine" / "à paraître" disclaimers placed in
// parentheses immediately after a link to a guide that already exists.
const STALE_DISCLAIMER_RE = /^\s*\(\s*(publication\s+prochaine|à\s+paraître|prochainement|bientôt\s+publié|(?:article|guide)\s+à\s+venir|à\s+publier)\s*\)/i;

// CEE fiche codes — BAR/BAT prefix, TH/EN domain, 3-digit number.
// Allowlist is loaded from data/verified-cee-fiches.txt.
const CEE_FICHE_RE = /\b(BAR|BAT)-(TH|EN)-(\d{3})\b/g;

// "depuis YYYY" or "depuis le DD mois YYYY" — a past-reference assertion.
// Year captured for comparison against the guide's own datePublished.
const FR_MONTHS = 'janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre';
const DEPUIS_DATE_RE = new RegExp(
  `\\bdepuis\\s+(?:le\\s+\\d{1,2}(?:er)?\\s+(?:${FR_MONTHS})\\s+)?(\\d{4})\\b`,
  'gi',
);

function collectFiles(patterns) {
  const out = new Set();
  for (const pattern of patterns) {
    if (typeof fs.globSync === 'function') {
      for (const f of fs.globSync(pattern, { cwd: ROOT })) {
        out.add(path.join(ROOT, f));
      }
    } else {
      const [dir, ext] = (() => {
        if (pattern.endsWith('.mdx')) return ['src/content/guides', '.mdx'];
        if (pattern.endsWith('.astro')) return ['src/pages', '.astro'];
        return [null, null];
      })();
      if (!dir) continue;
      const walk = (d) => {
        if (!fs.existsSync(d)) return;
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(ext)) out.add(full);
        }
      };
      walk(path.join(ROOT, dir));
    }
  }
  return [...out].filter((f) => !EXCLUDE_PATTERNS.some((p) => f.includes(p))).sort();
}

/**
 * Strip non-prose: Astro/MDX frontmatter, JS/TS line comments, block comments.
 * Used for em-dash density (we don't want to flag dashes in code comments).
 */
function stripNonProse(content, ext) {
  let s = content;
  if (ext === '.astro' || ext === '.mdx') {
    s = s.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  }
  s = s.replace(/\/\/.*$/gm, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  return s;
}

function countWords(s) {
  return s.split(/\s+/).filter((w) => /[\wÀ-ÿ]/.test(w)).length;
}

function lineOf(content, charIndex) {
  return content.slice(0, charIndex).split('\n').length;
}

/**
 * Citation extraction for FR legal references. Each pattern captures a
 * citation and a `normalize` function returns its canonical form for
 * allowlist comparison.
 *
 * Patterns ordered by specificity — more specific patterns first.
 */
const CITATION_PATTERNS = [
  // Lois with explicit year: Loi 2021-1104, Loi n° 2021-1104
  {
    kind: 'loi-numero',
    re: /\bLoi\s+(?:n[°º.]?\s*)?(\d{4})[-‑](\d{1,5})\b/gi,
    normalize: (m) => `Loi ${m[1]}-${m[2]}`,
  },
  // Lois with a named title: "Loi Climat & Résilience" etc. — captured loosely as the named law
  {
    kind: 'loi-nommee',
    re: /\bLoi\s+(Climat\s*(?:&|et)\s*R[ée]silience|Informatique\s+et\s+Libert[ée]s|LCEN|Hamon|Brottes|ELAN)\b/gi,
    normalize: (m) => `Loi ${m[1].replace(/\s+/g, ' ')}`,
  },
  // Décrets: décret 2024-XXX, décret n° 2024-XXX, décret 2024-1234 du DD/MM/YYYY
  {
    kind: 'decret',
    re: /\bd[ée]cret\s+(?:n[°º.]?\s*)?(\d{4})[-‑](\d{1,5})\b/gi,
    normalize: (m) => `Décret ${m[1]}-${m[2]}`,
  },
  // Arrêtés with date: arrêté du 14 janvier 2020, arrêté du 1er janvier 2026
  {
    kind: 'arrete-date',
    re: /\barr[êe]t[ée]\s+du\s+(\d{1,2}(?:er)?)\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})\b/gi,
    normalize: (m) => `arrêté du ${m[1].replace('er', '')} ${m[2].toLowerCase()} ${m[3]}`,
  },
  // Articles of LCEN: article 6 III de la LCEN, art. 6 LCEN
  {
    kind: 'art-lcen',
    re: /\bart(?:icle|\.)\s+(\d{1,3})(?:\s+([IVX]+))?\s+(?:(?:III?\s+)?)(?:de\s+)?(?:la\s+)?LCEN\b/gi,
    normalize: (m) => `art. ${m[1]}${m[2] ? ' ' + m[2] : ''} LCEN`,
  },
  // Articles of RGPD: art. 6 du RGPD, art. 6.1.f RGPD, article 22 RGPD
  {
    kind: 'art-rgpd',
    re: /\bart(?:icle|\.)\s+(\d{1,3}(?:\.\d{1,2}(?:\.[a-z])?)?)\s+(?:du\s+)?RGPD\b/gi,
    normalize: (m) => `art. ${m[1]} RGPD`,
  },
  // Articles of Code (consommation, urbanisme, construction, énergie, etc.)
  {
    kind: 'art-code',
    re: /\bart(?:icle|\.)\s+(L\.?\s*)?(\d{1,4}(?:[-.]?\d{1,4})?)\s+(?:du\s+)?Code\s+(de\s+l[ae'’]?\s+)?(consommation|urbanisme|construction(?:\s+et\s+de\s+l['’]?\s*habitation)?|environnement|[ée]nergie|propri[ée]t[ée]\s+intellectuelle|p[ée]nal|civil)\b/gi,
    normalize: (m) => `art. ${m[1] ? 'L.' : ''}${m[2]} Code ${m[4]}`,
  },
  // Règlement UE: Règlement UE 2016/679, Règlement (UE) 2016/679
  {
    kind: 'reglement-ue',
    re: /\bR[ée]glement(?:\s+\(?UE\)?)?\s+(\d{4})\/(\d{1,5})\b/gi,
    normalize: (m) => `Règlement UE ${m[1]}/${m[2]}`,
  },
  // Conseil d'État: arrêt CE 1234, décision CE 1234
  {
    kind: 'conseil-etat',
    re: /\b(?:arr[êe]t|d[ée]cision)\s+CE\s+(\d{1,7})\b/gi,
    normalize: (m) => `arrêt CE ${m[1]}`,
  },
  // Conseil constitutionnel: décision 2023-XXX QPC
  {
    kind: 'cons-const',
    re: /\bd[ée]cision\s+(\d{4})[-‑](\d{1,4})\s+(QPC|DC)\b/gi,
    normalize: (m) => `décision ${m[1]}-${m[2]} ${m[3].toUpperCase()}`,
  },
];

function extractCitations(content) {
  const results = [];
  for (const { kind, re, normalize } of CITATION_PATTERNS) {
    const pattern = new RegExp(re.source, re.flags);
    let m;
    while ((m = pattern.exec(content)) !== null) {
      results.push({
        kind,
        canonical: normalize(m),
        raw: m[0],
        line: lineOf(content, m.index),
      });
    }
  }
  return results;
}

function loadAllowlist() {
  const filepath = path.join(ROOT, CITATIONS_FILE);
  if (!fs.existsSync(filepath)) {
    console.warn(`\n[citations] WARN: ${CITATIONS_FILE} not found — citation check disabled.\n`);
    return null;
  }
  const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/);
  const allow = new Set();
  for (const raw of lines) {
    const cleaned = raw.replace(/\s+#.*$/, '').trim();
    if (!cleaned || cleaned.startsWith('#')) continue;
    allow.add(cleaned);
  }
  return allow;
}

/**
 * Load the CEE fiche allowlist. Format: `<code> | <description>` — only
 * the code is kept. Lines starting with # or blank are ignored.
 */
function loadCeeFicheAllowlist() {
  const filepath = path.join(ROOT, CEE_FICHES_FILE);
  if (!fs.existsSync(filepath)) {
    console.warn(`\n[cee] WARN: ${CEE_FICHES_FILE} not found — CEE fiche check disabled.\n`);
    return null;
  }
  const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/);
  const allow = new Set();
  for (const raw of lines) {
    const stripped = raw.replace(/#.*$/, '').trim();
    if (!stripped) continue;
    // Code is the first space-or-pipe-delimited token (BAR-TH-148 etc.)
    const m = stripped.match(/^([A-Z]{3}-(?:TH|EN)-\d{3})/);
    if (m) allow.add(m[1]);
  }
  return allow;
}

/**
 * Read the guide's own datePublished from MDX frontmatter. Returns the
 * year as a number, or null for non-guide files (pages) or missing frontmatter.
 */
function guideYear(content, ext) {
  if (ext !== '.mdx' && ext !== '.md') return null;
  const m = content.match(/^datePublished:\s*['"]?(\d{4})-\d{2}-\d{2}/m);
  return m ? parseInt(m[1], 10) : null;
}

function auditFile(filepath, allowlist, validTargets, ceeAllowlist) {
  const content = fs.readFileSync(filepath, 'utf8');
  const ext = path.extname(filepath);
  const prose = stripNonProse(content, ext);
  const guideYr = guideYear(content, ext);

  const findings = { hardFail: [], softWarn: [] };

  // HARD: CEE fiche codes not in the allowlist. Catches BAR-TH-127 (VMC)
  // typed where BAR-TH-137 (réseau de chaleur) was meant, etc.
  if (ceeAllowlist) {
    const seen = new Set();
    let cm;
    CEE_FICHE_RE.lastIndex = 0;
    while ((cm = CEE_FICHE_RE.exec(content)) !== null) {
      const code = `${cm[1]}-${cm[2]}-${cm[3]}`;
      if (ceeAllowlist.has(code)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      findings.hardFail.push({
        kind: 'unknown-cee-fiche',
        code,
        line: lineOf(content, cm.index),
      });
    }
  }

  // HARD: "depuis YYYY" where YYYY > guide's own publication year.
  // Catches drift like "depuis 2027" in a guide dated 2026.
  if (guideYr !== null) {
    let dm;
    DEPUIS_DATE_RE.lastIndex = 0;
    while ((dm = DEPUIS_DATE_RE.exec(content)) !== null) {
      const refYear = parseInt(dm[1], 10);
      if (refYear > guideYr) {
        findings.hardFail.push({
          kind: 'future-depuis',
          refYear,
          guideYr,
          line: lineOf(content, dm.index),
          snippet: dm[0],
        });
      }
    }
  }

  // HARD: broken internal links (target doesn't resolve to a built page or
  // a published guide) and stale "publication prochaine" disclaimers
  // (parenthetical after a link whose target already exists in the queue).
  if (validTargets) {
    let lm;
    INTERNAL_LINK_RE.lastIndex = 0;
    while ((lm = INTERNAL_LINK_RE.exec(content)) !== null) {
      const href = lm[1];
      const line = lineOf(content, lm.index);
      if (validTargets.has(href)) {
        const after = content.slice(lm.index + lm[0].length, lm.index + lm[0].length + 80);
        const dm = after.match(STALE_DISCLAIMER_RE);
        if (dm) {
          findings.hardFail.push({
            kind: 'stale-disclaimer',
            href,
            disclaimer: dm[1],
            line,
          });
        }
      } else {
        findings.hardFail.push({ kind: 'broken-link', href, line });
      }
    }
  }

  // HARD: AI tells
  for (const tell of AI_TELLS) {
    const re = new RegExp(`(^|[^\\wÀ-ÿ])(${tell.replace(/'/g, "['’]")})($|[^\\wÀ-ÿ])`, 'gi');
    let m;
    while ((m = re.exec(content)) !== null) {
      findings.hardFail.push({
        kind: 'ai-tell',
        tell,
        line: lineOf(content, m.index + m[1].length),
        snippet: m[2],
      });
    }
  }

  // HARD: anglicismes (with whitelist exception)
  for (const { bad, reason } of ANGLICISMES) {
    const re = new RegExp(`(^|[^\\wÀ-ÿ])(${bad})($|[^\\wÀ-ÿ])`, 'gi');
    let m;
    while ((m = re.exec(content)) !== null) {
      const charIdx = m.index + m[1].length;
      // Check the surrounding ~30 chars to see if the match is inside a whitelisted phrase.
      const context = content.slice(Math.max(0, charIdx - 20), charIdx + bad.length + 20).toLowerCase();
      if (ANGLICISMES_WHITELIST.some((w) => context.includes(w))) continue;
      findings.hardFail.push({
        kind: 'anglicisme',
        bad,
        line: lineOf(content, charIdx),
        snippet: m[2],
        reason,
      });
    }
  }

  // HARD: unresolved placeholder markers
  const placeholderRe = /\[(?:VERIFY|À\s*VÉRIFIER|TODO|FONTE\?|FILL\s+IN)\]|<<[^<>]{1,80}>>/gi;
  let m;
  while ((m = placeholderRe.exec(content)) !== null) {
    findings.hardFail.push({
      kind: 'placeholder',
      line: lineOf(content, m.index),
      snippet: m[0],
    });
  }

  // SOFT: em-dash density
  const emDashes = (prose.match(/—/g) || []).length;
  const words = countWords(prose);
  if (emDashes >= 3 && words > 0) {
    const wordsPerDash = Math.round(words / emDashes);
    if (wordsPerDash < 100) {
      findings.softWarn.push({
        kind: 'em-dash-density',
        emDashes,
        words,
        wordsPerDash,
      });
    }
  }

  // SOFT: brand spam
  const brandCount = (content.match(new RegExp(`\\b${BRAND}\\b`, 'gi')) || []).length;
  if (brandCount > BRAND_SPAM_THRESHOLD) {
    findings.softWarn.push({ kind: 'brand-spam', brandCount });
  }

  // SOFT: unverified citations
  if (allowlist) {
    const citations = extractCitations(content);
    const seenUnverified = new Set();
    for (const cit of citations) {
      if (allowlist.has(cit.canonical)) continue;
      if (seenUnverified.has(cit.canonical)) continue;
      seenUnverified.add(cit.canonical);
      findings.softWarn.push({
        kind: 'unverified-citation',
        canonical: cit.canonical,
        raw: cit.raw,
        line: cit.line,
      });
    }
  }

  return findings;
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll('\\', '/');
}

const allowlist = loadAllowlist();
const ceeAllowlist = loadCeeFicheAllowlist();
const validTargets = collectValidLinkTargets();
const files = collectFiles(FILE_PATTERNS);
let hardFailCount = 0;
let softWarnCount = 0;
let unverifiedCitationsTotal = 0;
const unverifiedCitationsByName = new Map();

for (const f of files) {
  const { hardFail, softWarn } = auditFile(f, allowlist, validTargets, ceeAllowlist);
  if (hardFail.length === 0 && softWarn.length === 0) continue;

  console.log(`\n${rel(f)}`);
  for (const v of hardFail) {
    hardFailCount += 1;
    if (v.kind === 'ai-tell') {
      console.log(`  FAIL  L${v.line}  ai-tell: "${v.snippet}"`);
    } else if (v.kind === 'anglicisme') {
      console.log(`  FAIL  L${v.line}  anglicisme: "${v.snippet}" — ${v.reason}`);
    } else if (v.kind === 'placeholder') {
      console.log(`  FAIL  L${v.line}  placeholder marker: ${v.snippet}`);
    } else if (v.kind === 'broken-link') {
      console.log(`  FAIL  L${v.line}  broken internal link: ${v.href}`);
    } else if (v.kind === 'stale-disclaimer') {
      console.log(
        `  FAIL  L${v.line}  stale disclaimer "(${v.disclaimer})" next to link ${v.href} — target already exists in the queue, remove the parenthetical`,
      );
    } else if (v.kind === 'unknown-cee-fiche') {
      console.log(
        `  FAIL  L${v.line}  unknown CEE fiche code: ${v.code} — not in data/verified-cee-fiches.txt. Verify on calculateur-cee.ademe.fr; either fix the code or add it to the allowlist.`,
      );
    } else if (v.kind === 'future-depuis') {
      console.log(
        `  FAIL  L${v.line}  date drift: "${v.snippet}" — references ${v.refYear} but guide is dated ${v.guideYr}. Either fix the year or change "depuis" to "à partir de" if it's a future reference.`,
      );
    }
  }
  for (const v of softWarn) {
    softWarnCount += 1;
    if (v.kind === 'em-dash-density') {
      console.log(
        `  WARN  em-dash density: ${v.emDashes} dashes / ${v.words} words = 1 per ${v.wordsPerDash}`,
      );
    } else if (v.kind === 'brand-spam') {
      console.log(`  WARN  "${BRAND}" appears ${v.brandCount} times (>${BRAND_SPAM_THRESHOLD} may be spam)`);
    } else if (v.kind === 'unverified-citation') {
      console.log(`  WARN  L${v.line}  unverified citation: ${v.canonical}`);
      unverifiedCitationsTotal += 1;
      const count = unverifiedCitationsByName.get(v.canonical) || 0;
      unverifiedCitationsByName.set(v.canonical, count + 1);
    }
  }
}

console.log(
  `\nContent audit: ${files.length} files scanned, ${hardFailCount} hard fail(s), ${softWarnCount} soft warning(s).`,
);

if (allowlist && unverifiedCitationsTotal > 0) {
  console.log(
    `\nUnverified citations (${unverifiedCitationsByName.size} unique across ${unverifiedCitationsTotal} occurrences):`,
  );
  const sorted = [...unverifiedCitationsByName.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`  ${count}× ${name}`);
  }
  console.log(
    '\nTo silence these warnings, verify each citation against a primary source\n(legifrance.gouv.fr, service-public.fr, anah.gouv.fr, ademe.fr) and add it to\n' +
      `${CITATIONS_FILE}. Wrong citations should be FIXED in the guide,\nnot added to the allowlist.`,
  );
}

if (hardFailCount > 0) {
  console.log('\nHard failures block the build. Fix and re-run.');
  process.exit(1);
}
