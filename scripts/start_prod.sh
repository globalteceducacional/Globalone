#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Arquivo .env não encontrado. Rode: bash scripts/prepare_env.sh"
  exit 1
fi

GONE_DOMAIN="$(grep '^GONE_DOMAIN=' .env | cut -d= -f2- | tr -d '\r')"
LETSENCRYPT_EMAIL="$(grep '^LETSENCRYPT_EMAIL=' .env | cut -d= -f2- | tr -d '\r')"

if [ -z "$GONE_DOMAIN" ] || echo "$GONE_DOMAIN" | grep -qE 'seudominio\.com\.br|example\.com|seu-dominio'; then
  echo "Edite GONE_DOMAIN no .env (ex.: globaltecone.tech): nano .env"
  exit 1
fi

if [ -z "$LETSENCRYPT_EMAIL" ] || echo "$LETSENCRYPT_EMAIL" | grep -qE 'seu-email@|example\.com|@seudominio'; then
  echo "Edite LETSENCRYPT_EMAIL no .env com e-mail real: nano .env"
  exit 1
fi

docker compose up -d --build

cat <<MSG

G.One Portal iniciado em PRODUÇÃO.

Acesse: https://${GONE_DOMAIN}

Status: bash scripts/status.sh
Logs:   bash scripts/logs.sh
MSG
