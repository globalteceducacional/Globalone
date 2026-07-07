#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Arquivo .env não encontrado. Rode: bash scripts/prepare_env_full.sh"
  exit 1
fi

for v in GONE_DOMAIN ERP_DOMAIN AVA_DOMAIN TECA_DOMAIN; do
  if ! grep -q "^${v}=" .env || grep -qE 'seudominio\.com\.br|seu-email@' .env; then
    echo "Configure os 4 domínios no .env antes da suite completa: nano .env"
    exit 1
  fi
done

if grep -q 'troque_por' .env; then
  echo "Troque as senhas padrão: bash scripts/prepare_env_full.sh"
  exit 1
fi

docker compose -f docker-compose.full.yml up -d --build

cat <<MSG

Suite COMPLETA iniciada (G.One + AVA + ERP + TECA).

Acesse:
- https://$(grep '^GONE_DOMAIN=' .env | cut -d= -f2-)
- https://$(grep '^AVA_DOMAIN=' .env | cut -d= -f2-)
- https://$(grep '^ERP_DOMAIN=' .env | cut -d= -f2-)
- https://$(grep '^TECA_DOMAIN=' .env | cut -d= -f2-)

Status: docker compose -f docker-compose.full.yml ps
Logs:   docker compose -f docker-compose.full.yml logs -f
MSG
