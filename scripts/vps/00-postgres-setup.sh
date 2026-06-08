#!/usr/bin/env bash
# Postgres setup for ma-renov-aide.fr on the existing shared Ubuntu VPS.
# Coexists alongside calc + concursoja databases on the same Postgres instance.
# Idempotent: safe to re-run.
# Listens on localhost only — connect from dev via SSH tunnel.
#
# Usage on the VPS:
#   sudo bash 00-postgres-setup.sh
#
# Optional: pre-set RENOV_DB_PASS to use a known password instead of generating one.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

DB_NAME="renov"
APP_ROLE="renov_app"
RO_ROLE="renov_ro"

if command -v psql >/dev/null 2>&1; then
  echo "[1/6] Postgres already installed: $(psql --version)"
else
  echo "[1/6] Installing Postgres 16..."
  apt-get update -qq
  apt-get install -y -qq postgresql-16 postgresql-client-16
fi

echo "[2/6] Ensuring service is enabled and running..."
systemctl enable --now postgresql

APP_PASS="${RENOV_DB_PASS:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)}"
RO_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"

echo "[3/6] Creating roles and database (idempotent)..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${APP_ROLE}', '${APP_PASS}');
  ELSE
    EXECUTE format('ALTER ROLE %I PASSWORD %L', '${APP_ROLE}', '${APP_PASS}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RO_ROLE}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${RO_ROLE}', '${RO_PASS}');
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${APP_ROLE}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT CONNECT ON DATABASE ${DB_NAME} TO ${RO_ROLE};
SQL

echo "[4/6] Locking listen_addresses to localhost..."
PG_CONF=$(sudo -u postgres psql -tA -c "SHOW config_file;")
if grep -qE "^[# ]*listen_addresses" "$PG_CONF"; then
  sed -i "s/^[# ]*listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"
else
  echo "listen_addresses = 'localhost'" >> "$PG_CONF"
fi

echo "[5/6] Restarting Postgres..."
systemctl restart postgresql

echo "[6/6] Preparing backup directory..."
mkdir -p /var/backups/postgres
chown postgres:postgres /var/backups/postgres
chmod 700 /var/backups/postgres

echo ""
echo "=========================================="
echo "  SUCCESS — renov Postgres is ready."
echo "=========================================="
echo ""
echo "Database:      ${DB_NAME}"
echo "App role:      ${APP_ROLE}"
echo "App password:  ${APP_PASS}"
echo ""
echo "Read-only role: ${RO_ROLE}"
echo "RO password:   ${RO_PASS}"
echo ""
echo "Save the app password to your local .env now. It is NOT stored anywhere else."
echo ""
echo "Connect from local dev:"
echo "  ssh -L 5434:localhost:5432 ubuntu@51.91.78.189"
echo "  psql -h localhost -p 5434 -U ${APP_ROLE} -d ${DB_NAME}"
echo ""
echo "Note: port 5433 is in use by calc's SSH tunnel — use 5434 (or another free local port)."
echo ""
echo "Next: run 01-postgres-backup-cron.sh to install daily backups."
