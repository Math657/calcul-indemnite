#!/usr/bin/env bash
# Calcul Indemnité auto-publish: export DB → JSON → git push (if drift).
#
# Runs weekly via indemnite-publish.timer, after the scrapers complete.
# Refreshes the static JSON files from Postgres, and only commits + pushes
# when values actually drift from HEAD — so no commit churn on quiet weeks.
#
# On push success, Cloudflare Workers Builds auto-redeploys from main.
#
# Manual one-off:
#   sudo systemctl start indemnite-publish.service
#   journalctl -u indemnite-publish.service -n 50

set -euo pipefail

REPO_DIR="/home/ubuntu/indemnite"
PYTHON="${REPO_DIR}/pipeline/.venv/bin/python"
BOT_NAME="Calcul Indemnité Bot"
BOT_EMAIL="bot@calcul-indemnite.fr"
DATA_FILES=(
  "src/data/dpe.json"
  # Add entries as new scrapers + exports are registered in pipeline/export.py.
  # Examples for future scrapers:
  #   "src/data/maprimeindemnite.json"
  #   "src/data/anah_plafonds.json"
  #   "src/data/cee_baremes.json"
)

cd "${REPO_DIR}"

if [ "${#DATA_FILES[@]}" -eq 0 ]; then
  echo "No scraper-fed data files registered yet. Nothing to export or push."
  echo "Add entries to DATA_FILES once pipeline/export.py exports indemnite scrapers."
  exit 0
fi

echo "[1/5] Pulling latest main (rebase if local commits exist)..."
if ! git pull --rebase origin main; then
  echo "ERROR: rebase failed. Aborting and leaving the tree intact."
  git rebase --abort >/dev/null 2>&1 || true
  exit 1
fi

echo "[2/5] Exporting DB → src/data/*.json..."
# `export` defaults to target=all. Typer treats the default-valued kwarg as
# an option, not positional, so passing `export all` errors out.
"${PYTHON}" -m pipeline.cli export

echo "[3/5] Staging DATA_FILES + checking for drift..."
# Stage first so an untracked file (initial-add case) is also detected.
# `git diff --cached --quiet` returns non-zero if the index differs from HEAD,
# which covers both new files and modified-tracked files.
git -c user.name="${BOT_NAME}" -c user.email="${BOT_EMAIL}" \
  add -- "${DATA_FILES[@]}"
if git diff --cached --quiet -- "${DATA_FILES[@]}"; then
  echo "No drift detected. Nothing to push."
  exit 0
fi

echo "[4/5] Drift detected. Committing as ${BOT_NAME}..."
git -c user.name="${BOT_NAME}" -c user.email="${BOT_EMAIL}" \
  commit -m "data: weekly refresh from scrapers"

echo "[5/5] Pushing to origin/main..."
if ! git push origin main; then
  echo "Push rejected — likely a race with another commit. Rebasing and retrying once..."
  git pull --rebase origin main
  git push origin main
fi

echo "Done. Cloudflare Workers Builds will redeploy on push."
