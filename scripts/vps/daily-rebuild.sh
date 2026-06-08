#!/usr/bin/env bash
# Daily rebuild trigger for scheduled drip-publishing.
#
# Static-site builds only see "today's" reality at build time. To make
# guides (dateModified filter in getStaticPaths) and simulators
# (publishAt field) auto-appear on their scheduled date, we need a daily
# rebuild even when nothing else has changed.
#
# Strategy: empty commit + push → Cloudflare auto-builds → Astro reruns
# getStaticPaths with the new "today" → freshly-due guides appear and
# scheduled simulators leave the sitemap-exclusion list.
#
# Runs daily ~13:30 UTC via renov-rebuild.timer (with ±30 min jitter to
# avoid looking like a metronomic bot). Slot distinct from calc's 09:00 UTC.

set -euo pipefail

REPO_DIR="/home/ubuntu/renov"
BOT_NAME="MaRénovAide Bot"
BOT_EMAIL="bot@ma-renov-aide.fr"

cd "${REPO_DIR}"

echo "[1/3] git pull --rebase..."
if ! git pull --rebase origin main; then
  echo "ERROR: rebase failed. Aborting."
  git rebase --abort >/dev/null 2>&1 || true
  exit 1
fi

echo "[2/3] empty commit for scheduled-publish refresh..."
DATESTAMP=$(date -u +%Y-%m-%d)
git -c user.name="${BOT_NAME}" -c user.email="${BOT_EMAIL}" \
  commit --allow-empty -m "chore: daily rebuild ${DATESTAMP}"

echo "[3/3] pushing to origin/main..."
if ! git push origin main; then
  echo "Push rejected — likely a race with another commit. Rebasing and retrying once..."
  git pull --rebase origin main
  git push origin main
fi

echo "Done. Cloudflare will rebuild and any due-today scheduled content goes live."
