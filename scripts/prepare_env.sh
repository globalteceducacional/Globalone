#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  echo "Arquivo .env já existe. Não sobrescrevi."
  echo "Para gerar outro: rm .env && bash scripts/prepare_env.sh"
  exit 0
fi

cp .env.example .env

echo "Arquivo .env criado para o portal G.One."
echo "Edite domínio e e-mail: nano .env"
echo "Depois: bash scripts/start_prod.sh"
