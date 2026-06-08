#!/usr/bin/env bash
# Install daily Postgres backup cron for the indemnite database.
# Backups go to /var/backups/postgres with 14-day retention.
# Coexists alongside calc's (03:17 UTC) and concursoja's backup crons.
# Idempotent.
#
# Usage on the VPS:
#   sudo bash 01-postgres-backup-cron.sh

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

BACKUP_SCRIPT="/usr/local/sbin/indemnite-pg-backup"
CRON_FILE="/etc/cron.d/indemnite-pg-backup"

cat > "${BACKUP_SCRIPT}" <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/var/backups/postgres"
DB_NAME="indemnite"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"

sudo -u postgres pg_dump -Fc "${DB_NAME}" | gzip -9 > "${DUMP_FILE}"
chmod 600 "${DUMP_FILE}"
find "${BACKUP_DIR}" -name "${DB_NAME}-*.sql.gz" -mtime +${RETENTION_DAYS} -delete

logger -t indemnite-pg-backup "wrote ${DUMP_FILE}"
BACKUP

chmod 700 "${BACKUP_SCRIPT}"

cat > "${CRON_FILE}" <<CRON
# Daily Postgres backup for indemnite at 05:30 UTC (staggered against calc 03:17 UTC)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

30 5 * * * root ${BACKUP_SCRIPT}
CRON

chmod 644 "${CRON_FILE}"

echo "Installed daily backup cron at 05:30 UTC."
echo "Backups: /var/backups/postgres/indemnite-*.sql.gz (14-day retention)"
echo ""
echo "Test now with:"
echo "  sudo ${BACKUP_SCRIPT}"
echo "  ls -lh /var/backups/postgres/indemnite-*"
