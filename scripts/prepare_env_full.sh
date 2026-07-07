#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  echo "Arquivo .env já existe. Não sobrescrevi."
  exit 0
fi

cp .env.full.example .env

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

replace_var() {
  local key="$1"
  local value="$2"
  sed -i "s|^${key}=.*|${key}=${value}|" .env
}

replace_var ERP_POSTGRES_PASSWORD "erp_$(random_secret)"
replace_var ERP_JWT_SECRET "$(random_secret)$(random_secret)"
replace_var AVA_MYSQL_PASSWORD "ava_$(random_secret)"
replace_var AVA_MYSQL_ROOT_PASSWORD "ava_root_$(random_secret)"
replace_var TECA_POSTGRES_PASSWORD "teca_$(random_secret)"
replace_var TECA_JWT_SECRET "$(random_secret)$(random_secret)"
replace_var TECA_ADMIN_PASSWORD "teca_admin_$(random_secret | cut -c1-18)"

echo "Arquivo .env criado para suite COMPLETA com senhas aleatórias."
echo "Edite domínios e e-mail: nano .env"
echo "Anote TECA_ADMIN_PASSWORD no .env."
echo "Depois: bash scripts/start_full.sh"
