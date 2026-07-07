#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Arquivo .env não encontrado."
  echo "Rode: cp .env.gone-only.example .env && nano .env"
  exit 1
fi

if grep -q 'seudominio.com.br' .env || grep -q 'seu-email@' .env; then
  echo "Edite o .env com domínio e e-mail reais: nano .env"
  exit 1
fi

docker compose -f docker-compose.gone-only.yml up -d --build

GONE_DOMAIN="$(grep '^GONE_DOMAIN=' .env | cut -d= -f2-)"

cat <<MSG

G.One Portal iniciado (somente portal).

Acesse: https://${GONE_DOMAIN}

Status: docker compose -f docker-compose.gone-only.yml ps
Logs:   docker compose -f docker-compose.gone-only.yml logs -f
Parar:  docker compose -f docker-compose.gone-only.yml down
MSG
