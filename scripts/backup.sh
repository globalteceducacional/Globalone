#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p backups
source .env

echo "Backup ERP PostgreSQL..."
docker exec gone-erp-db pg_dump -U "$ERP_POSTGRES_USER" "$ERP_POSTGRES_DB" > "backups/erp_${TS}.sql" || \
docker exec gone-erp-db-local pg_dump -U "$ERP_POSTGRES_USER" "$ERP_POSTGRES_DB" > "backups/erp_local_${TS}.sql" || true

echo "Backup AVA MariaDB..."
docker exec gone-ava-db mariadb-dump -u root -p"$AVA_MYSQL_ROOT_PASSWORD" "$AVA_MYSQL_DATABASE" > "backups/ava_${TS}.sql" || \
docker exec gone-ava-db-local mariadb-dump -u root -p"$AVA_MYSQL_ROOT_PASSWORD" "$AVA_MYSQL_DATABASE" > "backups/ava_local_${TS}.sql" || true

echo "Backup TECA PostgreSQL..."
docker exec gone-teca-db pg_dump -U "$TECA_POSTGRES_USER" "$TECA_POSTGRES_DB" > "backups/teca_${TS}.sql" || \
docker exec gone-teca-db-local pg_dump -U "$TECA_POSTGRES_USER" "$TECA_POSTGRES_DB" > "backups/teca_local_${TS}.sql" || true

echo "Backups em ./backups"
