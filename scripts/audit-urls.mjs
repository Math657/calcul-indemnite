#!/usr/bin/env node
/**
 * URL liveness check. Walks src/content/guides + src/pages, extracts
 * every external http(s) URL, and probes each with a HEAD request.
 * Reports non-2xx responses, redirects (3xx), connection errors, and
 * timeouts.
 *
 *   pnpm audit:urls           # standard run (parallel, summary report)
 *   pnpm audit:urls --strict  # exit 1 if any URL fails (for periodic CI)
 *
 * Not wired into prebuild (would be too slow and too flaky for the
 * build path — third-party sites go down or rate-limit). Run on demand
 * (monthly) to catch link rot in Sources sections.
 *
 * Some servers return 405 Method Not Allowed for HEAD. The script falls
 * back to a Range-limited GET for those before failing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  'MaRenovAideUrlAudit/1.0 (+https://ma-renov-aide.fr)';

const STRICT = process.argv.includes('--strict');

/**
 * Known false-positive hosts: official .gouv.fr / public-service sites
 * that block HEAD or non-browser User-Agents but work fine in a real
 * browser. Verified manually. URLs on these hosts are reported as
 * "info: bot-blocked" rather than failures.
 *
 * If a URL on these hosts is genuinely broken, the audit won't catch it —
 * accept the trade-off vs. spamming false failures every run.
 */
const KNOWN_BOT_BLOCKED = new Set([
  'observatoire-dpe-audit.ademe.fr',
  'observatoire-dpe.ademe.fr',
  'annuaire-diagnostiqueurs.application.developpement-durable.gouv.fr',
  'www.energie-mediateur.fr',
  'racc.enedis.fr',
  // emmy.fr — Teneur officiel du registre CEE (kWh cumac mensuel). Real site,
  // works in browsers, bot-blocks automated HEAD/GET. Verified via WebSearch.
  'www.emmy.fr',
]);

const URL_RE = /https?:\/\/[^\s)"'<>]+/g;
// Trailing punctuation often grabbed by the greedy regex — strip these.
const TRAILING_TRIM = /[.,;:!?)\]'"”»]+$/;

function collectFiles() {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mdx?|astro)$/.test(entry.name)) out.push(full);
    }
  }
  walk(path.join(ROOT, 'src/content/guides'));
  walk(path.join(ROOT, 'src/pages'));
  return out;
}

function extractUrls(content) {
  const urls = new Set();
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(content)) !== null) {
    const cleaned = m[0].replace(TRAILING_TRIM, '');
    urls.add(cleaned);
  }
  return urls;
}

async function probe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const opts = {
    method: 'HEAD',
    redirect: 'follow',
    signal: ctrl.signal,
    headers: { 'User-Agent': USER_AGENT },
  };
  try {
    let res = await fetch(url, opts);
    // Some servers refuse HEAD — fall back to a Range-limited GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        ...opts,
        method: 'GET',
        headers: { ...opts.headers, Range: 'bytes=0-1023' },
      });
    }
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, finalUrl: res.url };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

async function probeAll(urls) {
  const results = new Map();
  const queue = [...urls];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const url = queue.shift();
      if (!url) return;
      const r = await probe(url);
      results.set(url, r);
    }
  });
  await Promise.all(workers);
  return results;
}

const files = collectFiles();
const urlToFiles = new Map(); // url → Set<file>
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const urls = extractUrls(content);
  for (const u of urls) {
    if (!urlToFiles.has(u)) urlToFiles.set(u, new Set());
    urlToFiles.get(u).add(path.relative(ROOT, f).replaceAll('\\', '/'));
  }
}

const uniqueUrls = [...urlToFiles.keys()];
console.log(`Probing ${uniqueUrls.length} unique URLs across ${files.length} files (concurrency=${CONCURRENCY})...`);

const start = Date.now();
const results = await probeAll(uniqueUrls);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

let okCount = 0;
let redirectCount = 0;
let failCount = 0;
let botBlockedCount = 0;
const failures = [];
const redirects = [];
const botBlocked = [];

for (const [url, r] of results) {
  if (r.ok && r.status >= 200 && r.status < 300) {
    okCount++;
    if (r.finalUrl && r.finalUrl !== url) {
      redirects.push({ url, finalUrl: r.finalUrl });
      redirectCount++;
    }
  } else {
    const host = (() => {
      try { return new URL(url).host; } catch { return ''; }
    })();
    if (KNOWN_BOT_BLOCKED.has(host)) {
      botBlockedCount++;
      botBlocked.push({ url, ...r });
    } else {
      failCount++;
      failures.push({ url, ...r });
    }
  }
}

if (failures.length) {
  console.log(`\n${failCount} URL(s) failed:`);
  for (const f of failures.sort((a, b) => (b.status || 0) - (a.status || 0))) {
    const refs = [...(urlToFiles.get(f.url) || [])];
    const refSummary = refs.length === 1 ? refs[0] : `${refs.length} files`;
    const status = f.status ? `HTTP ${f.status}` : f.error || 'error';
    console.log(`  ${status}  ${f.url}`);
    console.log(`    └─ ${refSummary}`);
  }
}

if (redirects.length) {
  console.log(`\n${redirectCount} URL(s) followed redirect to a different final URL (informational):`);
  for (const r of redirects.slice(0, 10)) {
    console.log(`  ${r.url}`);
    console.log(`    → ${r.finalUrl}`);
  }
  if (redirects.length > 10) console.log(`  … and ${redirects.length - 10} more.`);
}

if (botBlocked.length) {
  console.log(`\n${botBlockedCount} URL(s) on bot-blocked hosts (informational, not failures):`);
  for (const b of botBlocked) {
    console.log(`  ${b.status ? `HTTP ${b.status}` : b.error || 'error'}  ${b.url}`);
  }
}

console.log(
  `\nURL audit: ${okCount}/${uniqueUrls.length} ok` +
    (redirectCount ? `, ${redirectCount} redirected` : '') +
    (botBlockedCount ? `, ${botBlockedCount} bot-blocked` : '') +
    (failCount ? `, ${failCount} failed` : '') +
    ` in ${elapsed}s.`,
);

if (STRICT && failCount > 0) {
  console.log('\n--strict: exiting non-zero due to failed URLs.');
  process.exit(1);
}
