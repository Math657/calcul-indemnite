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
# Dump quotidien de la base indemnite.
#
# Écrit d'abord dans un fichier .part, vérifie que le résultat est exploitable,
# et ne le publie sous son nom définitif qu'ensuite. Une redirection directe
# vers le nom final crée le fichier avant même que pg_dump ne tourne : base
# indisponible, on obtient un dump de 0 octet que la rétention compte ensuite
# comme une sauvegarde valide. C'est arrivé du 21 au 27 juillet 2026 pendant
# l'indisponibilité du VPS, sept jours sans sauvegarde exploitable et sans
# le moindre signal.
set -euo pipefail
BACKUP_DIR="/var/backups/postgres"
DB_NAME="indemnite"
RETENTION_DAYS=14
MIN_BYTES=1024
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"
TMP_FILE="${DUMP_FILE}.part"

# Le répertoire des dumps n'est lisible que par postgres. Cet état, lui, est
# lisible par le health check (qui tourne en ubuntu) et lui sert de compte rendu.
STATUS_DIR="/var/lib/indemnite"
STATUS_FILE="${STATUS_DIR}/backup-status.json"
mkdir -p "${STATUS_DIR}"
chmod 755 "${STATUS_DIR}"

trap 'rm -f "${TMP_FILE}"' EXIT

write_status() {
  local status="$1" bytes="$2" detail="$3"
  cat > "${STATUS_FILE}" <<STATUS
{
  "db": "${DB_NAME}",
  "at": "$(date -u +%Y-%m-%dT%H:%M:%S+00:00)",
  "status": "${status}",
  "bytes": ${bytes},
  "file": "$(basename "${DUMP_FILE}")",
  "detail": "${detail}"
}
STATUS
  chmod 644 "${STATUS_FILE}"
}

fail() {
  logger -t indemnite-pg-backup -p user.err "$1"
  write_status "failed" 0 "$1"
  echo "$1" >&2
  exit 1
}

if ! sudo -u postgres pg_dump -Fc "${DB_NAME}" | gzip -9 > "${TMP_FILE}"; then
  fail "pg_dump a échoué pour ${DB_NAME} — aucune sauvegarde écrite"
fi

SIZE=$(stat -c %s "${TMP_FILE}" 2>/dev/null || echo 0)
if [[ "${SIZE}" -lt "${MIN_BYTES}" ]]; then
  fail "dump suspect pour ${DB_NAME} : ${SIZE} octets (< ${MIN_BYTES}) — rejeté"
fi

if ! gzip -t "${TMP_FILE}" 2>/dev/null; then
  fail "archive gzip corrompue pour ${DB_NAME} — rejetée"
fi

MAGIC=$(gzip -dc "${TMP_FILE}" 2>/dev/null | head -c 5 || true)
if [[ "${MAGIC}" != "PGDMP" ]]; then
  fail "en-tête pg_dump absent pour ${DB_NAME} (lu: '${MAGIC}') — rejeté"
fi

mv "${TMP_FILE}" "${DUMP_FILE}"
chmod 600 "${DUMP_FILE}"

# Purge les dumps vides laissés par l'ancienne version du script, qui seraient
# sinon retenus 14 jours en se faisant passer pour des sauvegardes.
find "${BACKUP_DIR}" -name "${DB_NAME}-*.sql.gz" -size -1k -delete
find "${BACKUP_DIR}" -name "${DB_NAME}-*.sql.gz" -mtime +${RETENTION_DAYS} -delete

write_status "ok" "${SIZE}" "dump vérifié (gzip + en-tête PGDMP)"
logger -t indemnite-pg-backup "wrote ${DUMP_FILE} (${SIZE} octets)"
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
