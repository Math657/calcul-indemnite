# VPS bootstrap scripts

Scripts run **on the shared Ubuntu VPS**, not locally. Coexist with calc's
`calculify-*` and concursoja's `concursoja-*` units on the same host.

## Order

```
ssh ubuntu@51.91.78.189
mkdir -p ~/indemnite-bootstrap && cd ~/indemnite-bootstrap

# Copy scripts here, then:
sudo bash 00-postgres-setup.sh
sudo bash 01-postgres-backup-cron.sh
# Then clone the repo to ~/indemnite before running 02:
git clone git@github.com-mathieu:Math657/calcul-indemnite.git ~/indemnite
sudo bash ~/indemnite/scripts/vps/02-install-systemd-cron.sh
```

## What each script does

| Script | What it does | Idempotent |
|---|---|---|
| `00-postgres-setup.sh` | Installs Postgres 16 (if absent), creates `indemnite` DB + `indemnite_app` (rw) + `indemnite_ro` (read-only) roles, locks listener to localhost. Coexists with `calculify` + `concursoja` DBs on the same instance. | Yes |
| `01-postgres-backup-cron.sh` | Installs `/usr/local/sbin/indemnite-pg-backup` + `/etc/cron.d/indemnite-pg-backup` for daily 05:30 UTC dumps with 14-day retention. Staggered against calc's 03:17 UTC. | Yes |
| `02-install-systemd-cron.sh` | Installs systemd timers (indemnite-*): weekly scrape (Tue 02:00 UTC), weekly publish (Tue 03:00 UTC) that pushes JSON drift to git, daily rebuild (16:00 UTC), daily IndexNow (16:30 UTC), daily health check (20:00 UTC). | Yes |
| `publish.sh` | Auto-publish script — called by `indemnite-publish.service`. Pulls main, exports DB → JSON, commits + pushes only if files actually drifted. Empty `DATA_FILES` list initially — add entries once scrapers register exports in `pipeline/export.py`. | Yes |
| `daily-rebuild.sh` | Empty-commit + push to trigger Cloudflare Workers rebuild — surfaces scheduled drip-publish content on its publication date. | Yes |
| `indexnow-ping.sh` | Submits today's surfaced URLs to IndexNow API (Bing, Yandex, DDG, Seznam, Naver). Reads lastmod from the live sitemap. Key: `33b7a5fe9fdca653d276366a5d3b653a` (matches `public/33b7a5fe9fdca653d276366a5d3b653a.txt`). | Yes |

## After install

The setup script prints the app password **once** and does not store it.
Copy it to your local `.env` immediately.

To connect from local dev (port 5434 since 5433 is in use by calc's tunnel):
```
ssh -L 5434:localhost:5432 ubuntu@51.91.78.189
# in another shell:
psql -h localhost -p 5434 -U indemnite_app -d indemnite
```

## Optional: alerting webhook

The health-check service reads `ALERT_WEBHOOK_URL` from `~/indemnite/.env.local`.
Add a line and it'll auto-detect the format:

```
ALERT_WEBHOOK_URL=https://ntfy.sh/indemnite-alerts-<random-suffix>
```

ntfy.sh is free, no signup needed — install the mobile app, subscribe to the
same topic name. Other supported formats: Slack incoming webhook, Discord
webhook. Leave unset to log-only (visible in journal).

## Useful queries

```bash
# Latest run per source
psql -U indemnite_app -d indemnite -c "
  SELECT DISTINCT ON (source) source, status, started_at, finished_at, rows_written, error_message
    FROM scrape_runs ORDER BY source, started_at DESC"

# All failed runs in the last 30 days
psql -U indemnite_app -d indemnite -c "
  SELECT source, started_at, error_message
    FROM scrape_runs
   WHERE status='failed' AND started_at > now() - interval '30 days'
   ORDER BY started_at DESC"

# When does each timer fire next?
systemctl list-timers indemnite-*
```

## Auto-publish chain

The data flow from scraper to live site:

```
indemnite-scrape@*.timer    Tue 02:00 UTC   → updates Postgres
indemnite-publish.timer     Tue 03:00 UTC   → exports DB → src/data/*.json
                                         → git diff: pushes only on drift
                                         → Cloudflare auto-redeploys on push
indemnite-rebuild.timer     Daily 16:00 UTC → empty commit, triggers drip-publish
indemnite-indexnow.timer    Daily 16:30 UTC → pings Bing/Yandex/etc.
indemnite-health.timer      Daily 20:00 UTC → checks scrape_runs for stuck/failed
```

The publish + rebuild units use the bot identity `Calcul Indemnité Bot
<bot@calcul-indemnite.fr>` for commits, so auto-refreshes are visually
distinct from human commits in `git log`.

**Required setup**: the GitHub deploy key on the VPS must have **write
access** (repo Settings → Deploy keys → re-add with "Allow write access"
checked) — distinct deploy key from calc/concursoja, on the
`mathieu.dessaint10` GitHub account. SSH host alias: `github.com-mathieu`.
See [[reference-github-identity]] for setup.

**Test the chain end-to-end after install:**
```bash
sudo systemctl start indemnite-publish.service
journalctl -u indemnite-publish.service -n 50 --no-pager
```
Expected output is "No scraper-fed data files registered yet" until step 13
adds the first scraper + export entry to `DATA_FILES` in `publish.sh`.

## Future

- Off-site backup sync (S3/B2) — add `03-backup-sync.sh` once a bucket is provisioned
- Read replica or pgBackRest if data volume grows
- Health check could also alert on publish failures (currently only scrape failures trigger webhook)
