# Plan opérationnel : Site FR #4 — CalculIndemnité

**Document de référence d'exécution**
**Version 0.2 — 2026-06-09**
**Statut : Phases 0–1 livrées + Phase 2 quasi complète. Repo `Math657/calcul-indemnite` live (Astro 5, brand indigo « Calcul Indemnité »), infra VPS `indemnite-*` (slot Mardi), Cloudflare câblé, pages légales + institutionnelles, hubs. Scrapers conventions (`cdtn_conventions`, `cdtn_watch`) + 47 pages IDCC. Moteur drip dossiers : 19 articles, 2 publiés, 17 en file jusqu'au 11 août. Les DEUX simulateurs de launch sont livrés : `/calcul-indemnite-licenciement` et `/calcul-bareme-macron`. Prochaine action : Phase 2 step 9 — scraper SMIC/PMSS (débloque l'estimateur chômage rupture conventionnelle, moat réforme 09-2026).**

---

## 0. Contexte

Quatrième site du portfolio, deuxième site FR après [[reference-vps|renov]] (MaRénovAide). Lancé pendant la phase observationnelle de renov (3 semaines live au 2026-06-08, drip + indexation en cours autonome) : le temps actif est parallélisé sur un nouveau seed plutôt que sur des features renov non validées par un signal de ranking.

**Justifications structurelles (héritées de renov)** :
- Opérateur natif FR → **zero native QA tax**
- FR residency → **full affiliate access** + Adsense FR finance/droit RPM élevé
- Réutilisation de **~70–80 % de l'infra** (Astro 5 + Cloudflare Workers Builds + Postgres VPS + Python scrapers + drip-publish + audit gate YMYL)
- **Zero cannibalisation** : droit du travail vs rénovation énergétique (renov) vs PT-BR (calc/concursoja)
- Infra **deux fois prouvée** (calc live + earning, renov shipped clean) → site #4 moins cher à produire que #3

**Niche** : droit du travail — indemnités (licenciement légal + conventionnel, rupture conventionnelle), barème Macron / prud'hommes, préavis, solde de tout compte, estimation chômage post-rupture.

**Pourquoi maintenant (freshness moat)** :
- **Réforme assurance chômage adoptée définitivement le 2026-06-02, en vigueur le 2026-09-01** : réduit la durée max d'indemnisation pour les ruptures conventionnelles individuelles ; règles cadres distinctes au 2026-04. Cycle de presse réglementaire qui pique en septembre 2026 — un site shipped maintenant est indexé/âgé avant le pic. C'est l'analogue exact du moat réforme DPE de renov. (info.gouv.fr ; culture-rh « ruptures conventionnelles septembre 2026 »)
- **Barème Macron stable** : validé Cass. ass. plén. 11 mai 2022, reconfirmé 2023-2025, opposable aux juges en 2026 (art. L1235-3 C. trav.). Le cœur computationnel ne bouge pas → tables de calcul qui ne pourrissent pas, pendant que la réforme fournit l'angle « actu ». Meilleur des deux mondes.

---

## 1. Filtrage des niches (site #4)

### 1.1 Candidats §8 du plan renov

| Candidat | Verdict | Raison (recherche 2026-06-08) |
|---|---|---|
| **Droit du travail / indemnités** | **RETENU** | Meilleure surface calc/tool (AIO-resistant), freshness hook réforme chômage 09-2026, cœur barème Macron stable, surface programmatique large (conventions collectives), monétisation legal lead-gen + Adsense |
| PEA / PER comparateurs | éliminé | Déjà éliminé en renov §1.2 (« slot fermé », saturation 5–10 ans). Rien n'a rouvert le slot pour un domaine frais |
| CPF / reconversion | éliminé | Crackdown qui **s'intensifie**, pas se stabilise : reste à charge 150 € (+45 %) depuis 2026-04-02, plafonds par action depuis 2026-02-26, nouvelle fraude ~7 M€ révélée 2026-05-08. Condition §8 (« si crackdown se stabilise ») non remplie |

### 1.2 Finaliste : droit du travail / indemnités

**Surface programmatique** : indemnité légale licenciement × convention collective (IDCC, ~700 dont ~50 à fort volume : Syntec, métallurgie, BTP, HCR, transport, commerce) × ancienneté × salaire ; barème Macron prud'hommes × ancienneté × taille entreprise ; rupture conventionnelle (+ réforme chômage 09-2026) ; préavis ; solde de tout compte. Plus dossiers éditoriaux sourcés.

**Compétition (fragmentée, même gap que renov)** :
- Gov volontairement limité : `code.travail.gouv.fr/outils/indemnite-licenciement` (CDI temps plein only) — mais **open source + API** (github.com/SocialGouv/code-du-travail-numerique), exploitable comme source de données.
- Portails : Juritravail, JustiJob, OnConteste, ACY, blogs d'avocats (lebouard, dairia, sancy).
- Incumbent fort : `indemnite-licenciement.fr` (se présente « le plus complet, 50+ conventions, sans inscription »).
- **Personne ne combine simulateur + tables conventions collectives complètes + pipeline freshness réforme + signaux barème datés.** On l'out-data et out-freshness, on ne l'out-existe pas.

**Monétisation** :
- **Legal lead-gen / avocat referral** (contestation prud'hommes = lead haute valeur). Moins turnkey que l'écosystème Effy/Awin de renov — à sourcer (réseaux d'avocats, marketplaces juridiques, plateformes défense salarié).
- **Adsense FR droit/finance** — RPM décent.
- Tier 2 : services « défense salarié » / accompagnement rupture.

**Caveats honnêtes** (non disqualifiants) :
1. Monétisation plus thin / bespoke que renov (pas de réseau affilié turnkey pour le juridique).
2. Moat données plus mince que l'ADEME de renov : l'indemnité **légale** est une formule stable ; l'indemnité **conventionnelle** exige de parser ~50 conventions (texte juridique, pas table). Le pipeline freshness repose donc surtout sur (a) revalorisations annuelles SMIC/PMSS, (b) paramètres de réforme (durées chômage), (c) liste IDCC + métadonnées via API Code du travail numérique — pas un flux open-data riche type ADEME.

### 1.3 Critères §1.1 renov — scorecard

1. Format data-driven / calc / tool (AIO-resistant) → **fort** (simulateurs indemnité + barème)
2. Pas de cannibalisation linguistique → **OK** (FR, niche distincte de renov)
3. Monétisation viable opérateur FR → **moyen** (legal lead-gen + Adsense ; moins dense que renov)
4. Réutilisation pattern calc → **fort** (même stack)
5. Volume FR significatif → **fort** (« calcul indemnité licenciement », « rupture conventionnelle », « prud'hommes » = très gros volume)
6. Reform freshness / gap UX → **fort** (réforme chômage 09-2026 + gap simulateur+données)

---

## 2. Garde-fous

Hérités de [[feedback-footprint-hygiene]] — appliqués au 4e site :

- **Pas de cross-link** calc ↔ concursoja ↔ renov ↔ #4 (aucun lien inter-sites)
- **Grammaire URL distincte** de renov : renov utilise `/simulateur-X`, `/aides-renovation/`, `/guides/`. Site #4 → `/calcul-X`, `/conventions-collectives/<idcc>/`, `/dossiers/<slug>/` (voir §3.2)
- **Cron times distincts** des 3 autres sites (voir §3.3)
- **IndexNow key nouvelle** (distincte de calc/concursoja/renov)
- **Pas de fake credentials YMYL** ([[feedback-no-fake-ymyl]]) — autorité par Méthodologie + citations Légifrance/Cassation, Organization byline (comme renov, voir [[project-byline-strategy]])
- **AdSense** : property/compte conformément à [[project-google-account-strategy]] (Gmail dédié clean, jamais le portfolio flaggé)

---

## 3. Architecture proposée

### 3.1 Décisions techniques

| Composant | Valeur proposée | Statut |
|---|---|---|
| **Domaine** | `calcul-indemnite.fr` (+ `.com` défensif) | **acheté (OVH)** |
| **Brand display** | `Calcul Indemnité` (wordmark) | **livré** |
| **Couleur brand** | `indigo-700` (distinct de sky=calc, emerald=renov) | **livré** (favicon/OG indigo) |
| **Repo GitHub** | `Math657/calcul-indemnite` | **livré** (réutilise `Math657`) |
| **Cloudflare** | même compte, Workers Builds, zone + Workers project séparés | héré [[reference-cloudflare-workers-builds]] |
| **VPS** | `ubuntu@51.91.78.189` (partagé), nouvelle DB | héré [[reference-vps]] |
| **Postgres** | DB `indemnite`, roles `indemnite_app` (R/W) / `indemnite_ro` (R/O), localhost only, dump quotidien dédié | **créée** |
| **Stack** | Astro 5 + Tailwind v4 + `@astrojs/cloudflare` (static), `formatEUR`/`parseFR`/`formatDateLong` réutilisés | **livré** |
| **IndexNow key** | nouvelle clé | **générée** |

### 3.2 Grammaire URL proposée (distincte de renov)

| Pattern | Type |
|---|---|
| `/` | Homepage |
| `/calcul-indemnite-licenciement` | Simulateur principal (légal + conventionnel) |
| `/calcul-bareme-macron` | Simulateur prud'hommes (contestation — angle monétisation) |
| `/calcul-rupture-conventionnelle` | Simulateur rupture + estimation chômage (hook réforme 09-2026) |
| `/conventions-collectives/` | Hub conventions |
| `/conventions-collectives/<idcc-slug>/` | Page par convention (indemnité conventionnelle, préavis) |
| `/bareme-macron`, `/rupture-conventionnelle`, `/preavis`, `/solde-de-tout-compte` | Hubs thématiques |
| `/dossiers/` + `/dossiers/<slug>/` | Long-form éditorial sourcé (équivalent `/guides/` de renov, slug distinct) |
| `/mentions-legales`, `/politique-de-confidentialite`, `/cgu`, `/contact`, `/a-propos`, `/404` | Légales (noindex) + institutionnel |

### 3.3 Cron staggering (4 sites, zéro collision)

| Site | Scrape | Publish | Rebuild | IndexNow | Health | DB backup |
|---|---|---|---|---|---|---|
| calc | Lun 03:00 | Lun 04:00 | 09:00 | 09:30 | 06:00 | 03:17 |
| concursoja | Mer 03:30 | Mer 06:30 | 07:00 | 11:00 | 12:00 | — |
| renov | Ven 01:00 | Ven 02:00 | 13:30 | 14:00 | 18:00 | 04:42 |
| **#4 indemnite** | **Mar 02:00** | **Mar 03:00** | **16:00** | **16:30** | **20:00** | **05:30** |

(UTC. À vérifier `systemctl list-timers` après install.)

### 3.4 Sources de données (scrapers)

1. **SMIC + PMSS (plafond mensuel sécu)** — valeurs revalorisées, machine-readable (URSSAF / data.gouv). **Premier scraper** (path of least resistance, analogue ADEME). Alimentent plancher indemnité + plafonds chômage.
2. **Barème Macron** — table statique L1235-3 (ancienneté × taille entreprise). Pas un scraper : data file versionné + watch Légifrance sur l'article.
3. **Liste IDCC + métadonnées conventions** — via API/open-source Code du travail numérique (SocialGouv) ou data.gouv. Alimente les pages `/conventions-collectives/`.
4. **Paramètres réforme chômage 09-2026** — durées d'indemnisation rupture conventionnelle (data file + watch info.gouv/Légifrance).
5. **Légifrance / Cassation** — jurisprudence barème + décrets (citations, watch).

Pattern : `BaseScraper` (déjà dans le repo calc/renov) + table `scrape_runs`. `france_renov_verify`-style content-hash watch pour Légifrance/réforme.

### 3.5 Simulateurs (launch = 2, comme renov)

1. **`/calcul-indemnite-licenciement`** — **livré.** Indemnité légale (¼ mois/an ≤10 ans + ⅓ mois/an >10 ans). 100 % client-side, zero PII, lit `indemnite-licenciement.json`.
2. **`/calcul-bareme-macron`** — **livré (2026-06-09).** Prud'hommes, contestation (angle lead-gen). Fourchette plancher/plafond par ancienneté × taille entreprise + cas licenciement nul (6 mois, sans plafond). Lit `bareme-macron.json` (table L1235-3 vérifiée, voir [[legal-data-verification]]). Tableau année par année affiché.
3. (Wave 2) **`/calcul-rupture-conventionnelle`** — montant mini légal + estimation chômage post-réforme (hook 09-2026). **Dépend du scraper SMIC/PMSS (step 9).**

---

## 4. Monétisation cible

| Programme | Type | Note |
|---|---|---|
| Réseaux avocats / contestation prud'hommes | lead-gen / CPA | À sourcer (pas de réseau turnkey ; bespoke) |
| Plateformes défense salarié / rupture | lead / referral | Tier 2 |
| Google AdSense FR droit/finance | RPM | **Nouveau Gmail dédié** ([[project-google-account-strategy]]) |
| Awin FR (programmes juridiques/RH éventuels) | affiliate | À explorer |

Inscription **après premières impressions GSC** (même logique que renov step 15 : valider le ranking avant d'ouvrir les comptes monétisation).

---

## 5. Projection revenue

Plus modeste que renov à surface équivalente (monétisation moins dense), mais lead juridique CPA élevé et très gros volume de recherche sur les head terms. Indicatif :
- **M+3** : 0–100 €/mois si indexation rapide
- **M+6** : 100–400 €/mois selon traction + premiers leads
- **M+12** : 300–1 000 €/mois selon Wave 2 + monétisation lead-gen mature

Avantage timing : indexé/âgé avant le pic presse réforme chômage (septembre 2026 et suites).

---

## 6. Décisions ouvertes (à trancher avant/pendant exécution)

| Question | Options | Reco |
|---|---|---|
| **Compte GitHub** | Réutiliser `Math657` (lie renov↔#4 publiquement via le compte) **vs** nouveau compte (renov/#4 non liés) | Réutiliser `Math657` si renov+#4 = portfolio FR « clean » assumé sous l'identité opérateur ; nouveau compte si on veut les délier |
| **AdSense Gmail** | Partager le Gmail AdSense clean de renov (un seul publisher ID FR, mais lie les sites via ads.txt) **vs** nouveau Gmail | À trancher selon stratégie portfolio publisher |
| **Brand display** | `CalculIndemnité` vs autre | `CalculIndemnité` |
| **Couleur brand** | slate-700 / indigo-700 / autre | placeholder, révisable |
| **Profondeur conventions au launch** | Top 5 / top 20 / top 50 IDCC | Démarrer top ~10 (Syntec, métallurgie, BTP, HCR, commerce…), élargir si traction |

---

## 7. Roadmap d'exécution (mirror renov, steps 1–15)

**Phase 0 — bloquant opérateur**
- [x] Achat `calcul-indemnite.fr` (+ `.com`) sur OVH
- [x] Trancher décisions §6 (compte GitHub = `Math657`)

**Phase 1 — bootstrap (mirror renov steps 1–12)**
1. [x] Sanity check + entrées mémoire site #4
2. [x] Duplication repo calc → `calcul-indemnite`, git init, identité locale
3. [x] Strip fichiers calc-spécifiques + rebrand layer (brand, config, couleur indigo)
4. [x] Locale FR — `formatEUR`/`parseFR`/`formatDateLong` réutilisés
5. [x] Pages FR (légales + about + contact + 404 + hubs + home), privacy pass
6. [x] Scripts VPS `renov-*` → `indemnite-*`, cron staggering Mardi (§3.3)
7. [x] GitHub repo + push ; Cloudflare Workers Builds + zone + custom domain
8. [x] VPS : DB `indemnite` + roles + deploy key + clone + venv + timers systemd

**Phase 2 — contenu data-driven (mirror renov steps 13–14)**
9. [ ] **Premier scraper (SMIC/PMSS) + migration + export JSON + timer — PROCHAINE ACTION**
10. [x] Simulateur `/calcul-indemnite-licenciement` (full-dynamic, zero hardcode)
11. [x] Simulateur `/calcul-bareme-macron` (table L1235-3 vérifiée, fourchette + nul, tableau)
12. [~] Hubs `/conventions-collectives/` (47 IDCC), `/bareme-macron`, `/rupture-conventionnelle` faits ; hubs `/preavis` et `/solde-de-tout-compte` (§3.2) **manquants**
13. [x] Drip queue dossiers éditoriaux (audit gate YMYL actif : 0 fail) — 19 articles, 2 publiés, 17 en file

**Phase 3 — observationnel + monétisation**
14. [ ] Soumission GSC (Gmail principal) + Bing Webmaster Tools + sitemap
15. [ ] Inscriptions monétisation (après premières impressions) : AdSense nouveau Gmail, réseaux lead-gen juridique

**Reste à faire (synthèse 2026-06-09)** : (9) scraper SMIC/PMSS → (Wave 2) `/calcul-rupture-conventionnelle` avec estimation chômage post-réforme → hubs `/preavis` + `/solde-de-tout-compte` → soumission GSC/Bing.

---

## 8. Changelog

- v0.2 (2026-06-09) : doc resynchronisée avec l'état réel du repo (la v0.1 décrivait l'exécution comme non démarrée alors que Phases 0–1 + Phase 2 quasi complètes étaient livrées). Décisions §6 tranchées (compte `Math657`, brand `Calcul Indemnité`, couleur indigo-700). Deuxième simulateur de launch livré : `/calcul-bareme-macron` (table L1235-3 vérifiée depuis source primaire, voir [[legal-data-verification]] — Légifrance bloque les bots, valeurs recoupées sur reproductions + sanity-check arithmétique). Prochaine action recalée sur step 9 (scraper SMIC/PMSS).
- v0.1 (2026-06-08) : niche site #4 sélectionnée (droit du travail / indemnités) via filtrage §1 + recherche 2026 (réforme chômage 09-2026, CPF/PEA éliminés). Domaine `calcul-indemnite.fr` (+`.com`) choisi et dispo confirmée (RDAP). Architecture proposée (réutilise stack renov), grammaire URL distincte, cron staggering Mardi, sources de données identifiées. Exécution non démarrée — bloquant : achat domaine OVH + décisions §6.

**Fin du document.**
