# MaRénovAide — Writing Playbook

**Tell a new session: "Read `WRITING-PLAYBOOK.md` then `CONTENT-QUEUE.md`, then continue writing."**
That should give the session enough context to write the next guide with the same standards as the previous 29.

---

## 1. Non-negotiable rules

These exist because each one was violated at least once in earlier sessions:

1. **Verify every prime amount, every legal citation, every percentage with `WebSearch` BEFORE writing.** Generic "be careful" prompts don't prevent hallucination — only a forcing function does.
2. **Never invent a `Décret YYYY-XXXX` or `arrêté du DATE`.** If the exact reference isn't on Légifrance, write `[À VÉRIFIER]` and stop. The audit gate hard-fails on placeholder markers, so the draft can't ship with an unverified citation.
3. **YMYL bar:** every numeric claim, every legal reference, every regulatory date needs a primary source URL in the Sources section. Primary sources only: `legifrance.gouv.fr`, `service-public.gouv.fr`, `anah.gouv.fr`, `france-renov.gouv.fr`, `ecologie.gouv.fr`, `agirpourlatransition.ademe.fr`. Secondary sources (blog summaries, third-party comparators) may be cross-checked but never cited as the primary source for a regulatory claim.
4. **Use dynamic data, not hand-typed numbers.** Anywhere a MaPrimeRénov forfait, plafond, or rate appears in a table, bind it from `src/data/maprimerenov.json` via `{ geste('id').primes.bleu }`. Same for DPE thresholds (`src/data/dpe-seuils.json`) and ADEME stats (`src/data/dpe.json`). See section 4.
5. **Drift before commit:** the prebuild audit (`pnpm build`) blocks on broken links, stale disclaimers, AI-tells, anglicismes, unknown CEE fiches, future-date drift, and placeholder markers. Don't `--no-verify` or skip the audit.

---

## 2. Workflow for a new guide

```
1. Open CONTENT-QUEUE.md.
   - Find the last scheduled datePublished (e.g. 2026-07-19).
   - Pick the next one: lastDate + random(1–3) days.
   - Check the "Planned" section for the next intended topic.

2. WebSearch the topic against allowed_domains (gov.fr, ademe.fr, legifrance, etc.).
   - Read at least 2 primary sources before drafting.
   - Quote the exact text for any chiffre you'll use.

3. Check if the geste/fiche already exists in src/data/maprimerenov.json:
   - If yes: import it via `geste('id')` and bind values via {formatEUR0(...)}.
   - If no: flag the gap, do NOT add it to the JSON without verifying against the ANAH PDF (currently at /tmp/anah-mpr-2026.pdf on the VPS).

4. Draft the MDX in src/content/guides/<slug>.mdx:
   - Title ≤ 80 chars
   - Description ≤ 200 chars
   - Frontmatter: hub, tags, primarySimulator, datePublished, dateModified, draft:false
   - Body: cite primary sources inline; cross-link to existing guides where natural
   - Sources section at the bottom with full URLs (these get URL-audited on demand)

5. Run audit + build:
   pnpm audit:content   # always — must be 0 hard fails
   pnpm build           # always — catches frontmatter schema issues
   pnpm audit:urls      # only if you added new external URLs (slower)

6. If new legal citations appeared, add them to data/verified-citations.txt
   with the Légifrance JORFTEXT id in a comment. Each entry MUST be
   verified against the actual Légifrance page — never copy a citation
   format alone.

7. If new CEE fiches appeared, add them to data/verified-cee-fiches.txt.

8. Commit with a descriptive message (see git log for patterns).

9. Push. Cloudflare auto-rebuilds.

10. Refresh the queue: pnpm queue (regenerates CONTENT-QUEUE.md from frontmatter).
```

---

## 3. Quality gates — what blocks the build

`scripts/audit-content.mjs` runs as `prebuild`. Hard fails (exit 1, block deploy):

| Check | Catches |
|---|---|
| AI-tells | "il convient de", "robuste", "écosystème", "en effet", "incontournable", "transformer la donne", etc. (full list in the script) |
| Anglicismes | "réaliser" (use "effectuer"/"faire"), "supporter", "challenger", "matcher", "implémenter". Whitelisted exceptions in `ANGLICISMES_WHITELIST` |
| Placeholder markers | `[VERIFY]`, `[À VÉRIFIER]`, `[TODO]`, `<<...>>` — these mean "I didn't finish verifying, don't ship" |
| Broken internal links | `](/guides/foo)` where `foo.mdx` doesn't exist (non-draft) — or `](/aides-renovation/bar)` where the .astro file doesn't exist |
| Stale disclaimers | `[…](/guides/X) (publication prochaine)` when `X.mdx` is now in the queue |
| Unknown CEE fiche | `BAR-TH-127` referenced for réseau de chaleur (actual is BAR-TH-137) — codes not in `data/verified-cee-fiches.txt` |
| Future-date drift | "depuis 2027" in a guide dated 2026 |

Soft warns (logged, don't block):
- Em-dash density (≥ 3 dashes/file with < 100 words per dash)
- Brand spam ("MaRénovAide" > 10 times in one file)
- Unverified legal citations (not in `data/verified-citations.txt`)

Treat soft warns as work-to-finish-before-commit, not "optional".

---

## 4. Dynamic data — wire guides to JSON, don't hand-type

When MPR prime amounts appear in a table, use the dynamic pattern. Calc (sister site) does this for every guide. Drift on the annual ANAH refresh becomes a single edit instead of N guide edits.

```mdx
---
title: '...'
datePublished: '2026-XX-XX'
hub: 'aides'
draft: false
---

import { geste } from '../../lib/mpr';
import { formatEUR0 } from '../../lib/locale';

export const POELE = geste('poele_granules');

## Prime MaPrimeRénov 2026
| Profil | Prime |
|---|---|
| Bleu | {formatEUR0(POELE.primes.bleu)} |
| Jaune | {formatEUR0(POELE.primes.jaune)} |
| Violet | {formatEUR0(POELE.primes.violet)} |
| Rose | non éligible |

Plafond : {formatEUR0(POELE.plafond_depense_eligible.value)}.
```

Available helpers in `src/lib/mpr.ts`:
- `geste(id: string)` — throws on unknown id (build-time guard)
- `tauxAmpleur` — uniform 80/60/45/10 % per couleur
- `plafondsAmpleur` — 30 000 / 40 000 € HT
- `ecretementParGeste` — 90/75/60/Rose-exclu

DPE thresholds and coefficient 1.9 are in `src/data/dpe-seuils.json` (read by `/simulateur-dpe`).

ADEME DPE distribution (scraped weekly): `src/data/dpe.json` (read by `dpe-2026-snapshot-diagnostics-recents.mdx`).

---

## 5. Scheduling — append to the queue

```
1. pnpm queue        # refreshes CONTENT-QUEUE.md, shows last scheduled date
2. Last date is, say, 2026-07-19.
3. New guide's datePublished = last + random(1, 2, or 3 days).
4. Don't redistribute existing dates. Guides already scheduled keep their dates.
```

The drip-publish gate is in `astro.config.mjs` and `src/pages/guides/[slug].astro` — guides with `datePublished > today` are excluded from the build and sitemap until their date arrives. The VPS runs `renov-rebuild.timer` daily at 13:45 UTC to trigger a Cloudflare rebuild, which re-evaluates the date filter.

---

## 6. Common pitfalls — real mistakes from past sessions

These were all *committed*, then caught. The audit gate now catches their format-equivalents.

| Mistake | Real example | What caught it |
|---|---|---|
| Hallucinated legal text | "Décret du 11 décembre 2025" (actual: arrêté du 13 août 2025) | Web search when writing a new guide |
| Wrong stat | "850 000 logements quittent F/G" (actual ministerial: 700 000) | Web search of ministerial press release |
| Wrong CEE fiche code | BAR-TH-127 for réseau de chaleur (actual: BAR-TH-137) | Web search + new audit allowlist (`data/verified-cee-fiches.txt`) |
| Stale "(publication prochaine)" disclaimer next to a link that's now live | poele-granules → coup-de-pouce-cee | New audit gate (stale-disclaimer) |
| Title > 80 chars | Caught at build, not audit | Astro content collection schema |
| Description > 200 chars | Caught at build, not audit | Astro content collection schema |
| Anglicisme in a link title (not just body) | "réaliser des travaux" in source link label | Audit gate (anglicismes) |
| Broken internal link to a non-existent slug | None found in current set | New audit gate (broken-link) |
| Dead external URL (link rot) | `france-renov.gouv.fr/trouver-professionnel-renovation-energetique` (404) | `pnpm audit:urls` |

Each of these is now caught by the audit. If you're writing and you can't get a chiffre verified, **stop and use `[À VÉRIFIER]`** — it'll fail the audit and force resolution.

---

## 7. What NOT to do

- Don't invent citations to fill the Sources section. Each URL must resolve to a real page that supports the claim.
- Don't add a citation to `data/verified-citations.txt` without verifying against Légifrance. The allowlist is a trust boundary — adding unverified entries undermines the audit.
- Don't hand-type MPR figures when they're in `maprimerenov.json`. Use the dynamic pattern.
- Don't link to a guide that doesn't exist yet ("(publication prochaine)" is a smell — the audit will reject it once the target is added).
- Don't redistribute existing scheduled dates. Append only.
- Don't add a new geste to `maprimerenov.json` without verifying against the ANAH PDF mode d'emploi (currently mars 2026 at `/tmp/anah-mpr-2026.pdf` on the VPS).
- Don't use em-dashes excessively. Use colons or commas. Audit soft-warns at density > 3 dashes per ~100 words.
- Don't commit work that has `[À VÉRIFIER]` markers — those mean "unfinished".

---

## 8. Strategy — long-tail focus (guides + simulateurs)

The site cannot rank for head terms (`MaPrimeRénov`, `DPE`, `audit énergétique`) — `france-renov.gouv.fr`, `service-public.gouv.fr`, `anah.gouv.fr` own those. Effy, Quelle Energie, Hellio own the next tier. A new private site without 10+ years of authority will not break that.

**Where we can win:** scenario-specific + cross-question + operational + technical edge case content that gov sites don't write (they define dispositifs, they don't navigate user cases) and private comparators write poorly (they optimize for lead capture, not user help).

5 long-tail patterns to use for guides:
1. **Scénario** : "X dans Y situation" (precise chiffres in context)
2. **Cross-question / cumul** : "A + B ensemble" (head pages won't answer)
3. **Recours / problem-path** : "X bloqué, que faire"
4. **Technical edge case** : "BAR-TH-X dans Y configuration"
5. **Operational / process** : "comment lire / fournir / vérifier X"

**Anti-patterns** (head terms locked, will lose):
- ❌ "Tout savoir sur X" / "Guide complet Y" / "Top 5 Z"
- ❌ Generic "qu'est-ce que X"

**For simulators**, the framing is slightly different: simulators don't need to rank direct on "simulateur X" head terms (mesaides.france-renov.gouv.fr is the official tool, can't out-rank). What matters is the **pull-in from guides** — each guide ending in `[ouvrir le simulateur](/simulateur-X)` is an entry node. At 29+ guides × ~5 CTAs each = 150+ entry points.

So:
- The 2 existing simulators (`/simulateur-maprimerenov`, `/simulateur-dpe`) are foundational pillars — don't rebuild for SEO.
- Future simulators target **scenario-specific intent** (e.g. `/simulateur-sortie-passoire-thermique`, `/simulateur-cumul-aides-fioul-pac`, `/simulateur-mensualite-eco-ptz`).
- Alternative low-cost: **long-tail landing pages with pre-filled simulators** (e.g. `/simulateur-pac-air-eau` is `/simulateur-maprimerenov` with PAC pre-cochée). Same logic, new SEO surface, ~30 min build per landing.

See `CONTENT-QUEUE.md` "Stratégie : focus long-tail" + "Simulateurs — stratégie long-tail" for the full backlog and rationale.

---

## 9. Where to look for current state

- `CONTENT-QUEUE.md` — scheduled drip queue, last date, planned topics
- `src/data/maprimerenov.json` — MPR forfaits, plafonds, conditions (verified vs ANAH PDF mars 2026)
- `src/data/dpe-seuils.json` — DPE class thresholds + coefficient 1.9
- `src/data/dpe.json` — ADEME open-data snapshot (refreshed weekly by VPS cron)
- `src/data/aides.ts` — registry of /aides-renovation/* landing pages
- `src/data/hubs.ts` — top-level nav hubs (simulateurs / aides / dpe / guides)
- `data/verified-citations.txt` — allowlist of legal citations (Loi, Décret, arrêté, art. Code, Règlement UE)
- `data/verified-cee-fiches.txt` — allowlist of CEE fiche codes (BAR-EN-, BAR-TH-, BAT-EN-, BAT-TH-)
- `git log --oneline -20` — recent commit history for style/conventions
