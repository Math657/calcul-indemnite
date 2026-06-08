#!/usr/bin/env bash
# Install systemd timers for indemnite scrapers + publish + rebuild + indexnow + health.
# Coexists alongside calculify-* and concursoja-* timers on the same VPS.
# Idempotent — safe to re-run.
#
# Usage on the VPS:
#   sudo bash ~/indemnite/scripts/vps/02-install-systemd-cron.sh
#
# Optional env var: ALERT_WEBHOOK_URL — ntfy.sh / Slack / Discord URL.
# Add it to ~/indemnite/.env.local; the service file reads from there.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

REPO_DIR="/home/ubuntu/indemnite"
SYSTEMD_DIR="/etc/systemd/system"
UNITS_SRC="${REPO_DIR}/scripts/vps/systemd"

if [[ ! -d "${REPO_DIR}/pipeline/.venv" ]]; then
  echo "ERROR: ${REPO_DIR}/pipeline/.venv does not exist — run pipeline setup first." >&2
  exit 1
fi

if [[ ! -f "${REPO_DIR}/.env.local" ]]; then
  echo "ERROR: ${REPO_DIR}/.env.local does not exist — required for DB credentials." >&2
  exit 1
fi

echo "[1/5] Installing systemd units..."
install -m 0644 "${UNITS_SRC}/indemnite-scrape@.service"  "${SYSTEMD_DIR}/indemnite-scrape@.service"
install -m 0644 "${UNITS_SRC}/indemnite-scrape@.timer"    "${SYSTEMD_DIR}/indemnite-scrape@.timer"
install -m 0644 "${UNITS_SRC}/indemnite-health.service"   "${SYSTEMD_DIR}/indemnite-health.service"
install -m 0644 "${UNITS_SRC}/indemnite-health.timer"     "${SYSTEMD_DIR}/indemnite-health.timer"
install -m 0644 "${UNITS_SRC}/indemnite-publish.service"  "${SYSTEMD_DIR}/indemnite-publish.service"
install -m 0644 "${UNITS_SRC}/indemnite-publish.timer"    "${SYSTEMD_DIR}/indemnite-publish.timer"
install -m 0644 "${UNITS_SRC}/indemnite-rebuild.service"  "${SYSTEMD_DIR}/indemnite-rebuild.service"
install -m 0644 "${UNITS_SRC}/indemnite-rebuild.timer"    "${SYSTEMD_DIR}/indemnite-rebuild.timer"
install -m 0644 "${UNITS_SRC}/indemnite-indexnow.service" "${SYSTEMD_DIR}/indemnite-indexnow.service"
install -m 0644 "${UNITS_SRC}/indemnite-indexnow.timer"   "${SYSTEMD_DIR}/indemnite-indexnow.timer"

echo "[2/5] Ensuring scripts are executable..."
chmod +x "${REPO_DIR}/scripts/vps/publish.sh"
chmod +x "${REPO_DIR}/scripts/vps/daily-rebuild.sh"
chmod +x "${REPO_DIR}/scripts/vps/indexnow-ping.sh"

echo "[3/5] Reloading systemd..."
systemctl daemon-reload

echo "[4/5] Enabling and starting non-scraper timers..."
systemctl enable --now "indemnite-health.timer"
systemctl enable --now "indemnite-publish.timer"
systemctl enable --now "indemnite-rebuild.timer"
systemctl enable --now "indemnite-indexnow.timer"
# Per-scraper timers are enabled when each scraper is registered.
# Example after step 13 (ADEME DPE scraper):
#   sudo systemctl enable --now "indemnite-scrape@ademe_dpe.timer"

echo "[5/5] Done. Current state:"
echo ""
systemctl list-timers --no-pager | grep -E "indemnite|NEXT" | head -10

echo ""
echo "Test commands (after the first scraper is registered):"
echo "  sudo systemctl start indemnite-scrape@ademe_dpe.service    # run one scrape now"
echo "  sudo systemctl start indemnite-publish.service             # publish JSON drift now"
echo "  sudo systemctl start indemnite-rebuild.service             # trigger drip-publish rebuild now"
echo "  sudo systemctl start indemnite-health.service              # run health check now"
echo "  journalctl -u 'indemnite-*' --since today --no-pager       # see today's logs"
echo "  sudo systemctl list-timers indemnite-*                     # next-fire times"
