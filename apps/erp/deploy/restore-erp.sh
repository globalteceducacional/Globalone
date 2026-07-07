#!/bin/sh
# Restaura backup gerado por deploy/backup-erp.sh
#
# ATENÇÃO: sobrescreve o banco atual e a pasta de uploads.
#
# Uso:
#   cd /opt/ERP-Globaltec
#   sh deploy/restore-erp.sh /var/backups/erp/erp_backup_20260519_030000.tar.gz
#
# Recomendado: pare o backend durante a restauração do banco.

set -eu

ARCHIVE="${1:-}"
PROJECT_DIR="${ERP_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
UPLOADS_DIR="${ERP_UPLOADS_DIR:-/var/erp-uploads}"
WORK_DIR="$(mktemp -d)"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Uso: sh deploy/restore-erp.sh /caminho/erp_backup_YYYYMMDD_HHMMSS.tar.gz"
  exit 1
fi

cd "$PROJECT_DIR"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-erp}"
POSTGRES_DB="${POSTGRES_DB:-erpdb}"

log "Extraindo ${ARCHIVE}..."
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
INNER="$(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
if [ -z "$INNER" ]; then
  log "ERRO: estrutura do backup inválida."
  exit 1
fi

if [ ! -f "${INNER}/database.sql.gz" ]; then
  log "ERRO: database.sql.gz não encontrado no backup."
  exit 1
fi

printf '%s\n' "Isso vai SOBRESCREVER o banco ${POSTGRES_DB} e os uploads em ${UPLOADS_DIR}."
printf '%s' 'Digite RESTAURAR para continuar: '
read -r CONFIRM
if [ "$CONFIRM" != "RESTAURAR" ]; then
  log "Cancelado."
  exit 0
fi

log "Parando serviços que usam o banco..."
docker compose stop backend frontend 2>/dev/null || true

log "Restaurando banco..."
gunzip -c "${INNER}/database.sql.gz" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

if [ -f "${INNER}/uploads.tar.gz" ]; then
  log "Restaurando uploads..."
  PARENT="$(dirname "$UPLOADS_DIR")"
  BASE="$(basename "$UPLOADS_DIR")"
  mkdir -p "$PARENT"
  rm -rf "${UPLOADS_DIR}.old"
  if [ -d "$UPLOADS_DIR" ]; then
    mv "$UPLOADS_DIR" "${UPLOADS_DIR}.old"
  fi
  tar -xzf "${INNER}/uploads.tar.gz" -C "$PARENT"
  log "Uploads restaurados. Backup anterior em ${UPLOADS_DIR}.old (remova manualmente quando validar)."
fi

log "Subindo serviços..."
docker compose up -d backend frontend

log "Restauração concluída. Valide login, arquivos e relatórios."
