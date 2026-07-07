#!/bin/sh
# Backup físico semanal do ERP Globaltec (VPS / Linux).
#
# Inclui:
#   - Dump PostgreSQL (pg_dump)
#   - Arquivos de upload (/var/erp-uploads)
#   - Cópia do .env (guarde o arquivo final em local seguro)
#
# Uso manual:
#   cd /opt/ERP-Globaltec
#   sh deploy/backup-erp.sh
#
# Variáveis opcionais (export ou no .env):
#   ERP_BACKUP_DIR=/var/backups/erp
#   ERP_UPLOADS_DIR=/var/erp-uploads
#   ERP_BACKUP_RETAIN_WEEKS=8
#   ERP_PROJECT_DIR=/opt/ERP-Globaltec

set -eu

PROJECT_DIR="${ERP_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_ROOT="${ERP_BACKUP_DIR:-/var/backups/erp}"
UPLOADS_DIR="${ERP_UPLOADS_DIR:-/var/erp-uploads}"
RETAIN_WEEKS="${ERP_BACKUP_RETAIN_WEEKS:-8}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WORK_DIR="$(mktemp -d)"
STAMP_NAME="erp_backup_${TIMESTAMP}"
STAMP_DIR="${WORK_DIR}/${STAMP_NAME}"
ARCHIVE="${BACKUP_ROOT}/${STAMP_NAME}.tar.gz"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [ ! -d "$PROJECT_DIR" ]; then
  log "ERRO: diretório do projeto não encontrado: $PROJECT_DIR"
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

if ! docker compose ps --status running 2>/dev/null | grep -q 'erp-db'; then
  log "ERRO: container erp-db não está em execução. Rode: docker compose up -d db"
  exit 1
fi

mkdir -p "$STAMP_DIR" "$BACKUP_ROOT"

log "Gerando dump do banco (${POSTGRES_DB})..."
docker compose exec -T db pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --format=plain \
  > "${STAMP_DIR}/database.sql"

if [ ! -s "${STAMP_DIR}/database.sql" ]; then
  log "ERRO: dump do banco ficou vazio."
  exit 1
fi

gzip -9 "${STAMP_DIR}/database.sql"

if [ -d "$UPLOADS_DIR" ]; then
  log "Compactando uploads (${UPLOADS_DIR})..."
  tar -czf "${STAMP_DIR}/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
else
  log "AVISO: pasta de uploads não encontrada: $UPLOADS_DIR"
fi

if [ -f .env ]; then
  cp .env "${STAMP_DIR}/env.backup"
fi

{
  echo "timestamp=${TIMESTAMP}"
  echo "hostname=$(hostname 2>/dev/null || echo unknown)"
  echo "project_dir=${PROJECT_DIR}"
  echo "postgres_db=${POSTGRES_DB}"
  echo "uploads_dir=${UPLOADS_DIR}"
  docker compose ps 2>/dev/null || true
} > "${STAMP_DIR}/manifest.txt"

log "Criando arquivo final ${ARCHIVE}..."
tar -czf "$ARCHIVE" -C "$WORK_DIR" "$STAMP_NAME"

BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
log "Backup concluído (${BYTES} bytes): ${ARCHIVE}"

if [ "$RETAIN_WEEKS" -gt 0 ] 2>/dev/null; then
  RETAIN_DAYS=$((RETAIN_WEEKS * 7))
  DELETED="$(find "$BACKUP_ROOT" -maxdepth 1 -name 'erp_backup_*.tar.gz' -type f -mtime +"$RETAIN_DAYS" -print -delete | wc -l | tr -d ' ')"
  log "Retenção: ${RETAIN_WEEKS} semana(s); removidos ${DELETED} arquivo(s) antigo(s)."
fi

log "Pronto. Copie o .tar.gz para outro disco/servidor (backup off-site)."
