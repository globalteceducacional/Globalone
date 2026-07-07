#!/usr/bin/env bash
set -euo pipefail
if [ ! -f .env ]; then
  echo "Arquivo .env não encontrado. Rode: bash scripts/prepare_env.sh e edite domínios/senhas."
  exit 1
fi

if grep -q 'seudominio.com.br' .env; then
  echo "ATENÇÃO: .env ainda usa seudominio.com.br. Edite GONE_DOMAIN, AVA_DOMAIN, ERP_DOMAIN e TECA_DOMAIN antes de produção."
  echo "Exemplo: nano .env"
  exit 1
fi

if grep -q 'troque_por' .env; then
  echo "ATENÇÃO: .env ainda possui senhas padrão. Rode scripts/prepare_env.sh ou edite manualmente."
  exit 1
fi

docker compose up -d --build
cat <<MSG

Plataforma iniciada em PRODUÇÃO.

Acesse:
- https://$(grep '^GONE_DOMAIN=' .env | cut -d= -f2-)
- https://$(grep '^AVA_DOMAIN=' .env | cut -d= -f2-)
- https://$(grep '^ERP_DOMAIN=' .env | cut -d= -f2-)
- https://$(grep '^TECA_DOMAIN=' .env | cut -d= -f2-)

Verifique certificados/saúde com: bash scripts/status.sh
Logs: bash scripts/logs.sh
MSG
