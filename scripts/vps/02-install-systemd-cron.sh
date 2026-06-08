#!/usr/bin/env bash
# Install systemd timers for renov scrapers + publish + rebuild + indexnow + health.
# Coexists alongside calculify-* and concursoja-* timers on the same VPS.
# Idempotent — safe to re-run.
#
# Usage on the VPS:
#   sudo bash ~/renov/scripts/vps/02-install-systemd-cron.sh
#
# Optional env var: ALERT_WEBHOOK_URL — ntfy.sh / Slack / Discord URL.
# Add it to ~/renov/.env.local; the service file reads from there.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

REPO_DIR="/home/ubuntu/renov"
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
install -m 0644 "${UNITS_SRC}/renov-scrape@.service"  "${SYSTEMD_DIR}/renov-scrape@.service"
install -m 0644 "${UNITS_SRC}/renov-scrape@.timer"    "${SYSTEMD_DIR}/renov-scrape@.timer"
install -m 0644 "${UNITS_SRC}/renov-health.service"   "${SYSTEMD_DIR}/renov-health.service"
install -m 0644 "${UNITS_SRC}/renov-health.timer"     "${SYSTEMD_DIR}/renov-health.timer"
install -m 0644 "${UNITS_SRC}/renov-publish.service"  "${SYSTEMD_DIR}/renov-publish.service"
install -m 0644 "${UNITS_SRC}/renov-publish.timer"    "${SYSTEMD_DIR}/renov-publish.timer"
install -m 0644 "${UNITS_SRC}/renov-rebuild.service"  "${SYSTEMD_DIR}/renov-rebuild.service"
install -m 0644 "${UNITS_SRC}/renov-rebuild.timer"    "${SYSTEMD_DIR}/renov-rebuild.timer"
install -m 0644 "${UNITS_SRC}/renov-indexnow.service" "${SYSTEMD_DIR}/renov-indexnow.service"
install -m 0644 "${UNITS_SRC}/renov-indexnow.timer"   "${SYSTEMD_DIR}/renov-indexnow.timer"

echo "[2/5] Ensuring scripts are executable..."
chmod +x "${REPO_DIR}/scripts/vps/publish.sh"
chmod +x "${REPO_DIR}/scripts/vps/daily-rebuild.sh"
chmod +x "${REPO_DIR}/scripts/vps/indexnow-ping.sh"

echo "[3/5] Reloading systemd..."
systemctl daemon-reload

echo "[4/5] Enabling and starting non-scraper timers..."
systemctl enable --now "renov-health.timer"
systemctl enable --now "renov-publish.timer"
systemctl enable --now "renov-rebuild.timer"
systemctl enable --now "renov-indexnow.timer"
# Per-scraper timers are enabled when each scraper is registered.
# Example after step 13 (ADEME DPE scraper):
#   sudo systemctl enable --now "renov-scrape@ademe_dpe.timer"

echo "[5/5] Done. Current state:"
echo ""
systemctl list-timers --no-pager | grep -E "renov|NEXT" | head -10

echo ""
echo "Test commands (after the first scraper is registered):"
echo "  sudo systemctl start renov-scrape@ademe_dpe.service    # run one scrape now"
echo "  sudo systemctl start renov-publish.service             # publish JSON drift now"
echo "  sudo systemctl start renov-rebuild.service             # trigger drip-publish rebuild now"
echo "  sudo systemctl start renov-health.service              # run health check now"
echo "  journalctl -u 'renov-*' --since today --no-pager       # see today's logs"
echo "  sudo systemctl list-timers renov-*                     # next-fire times"
