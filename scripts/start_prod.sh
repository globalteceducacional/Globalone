#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Arquivo .env não encontrado. Rode: bash scripts/prepare_env.sh"
  exit 1
fi

if grep -qE 'seudominio\.com\.br|seu-email@' .env; then
  echo "Edite o .env com domínio e e-mail reais: nano .env"
  exit 1
fi

docker compose up -d --build

GONE_DOMAIN="$(grep '^GONE_DOMAIN=' .env | cut -d= -f2-)"

cat <<MSG

G.One Portal iniciado em PRODUÇÃO.

Acesse: https://${GONE_DOMAIN}

Status: bash scripts/status.sh
Logs:   bash scripts/logs.sh
MSG
