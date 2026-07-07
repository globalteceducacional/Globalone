#!/usr/bin/env bash
set -euo pipefail

echo "== G.One Suite Doctor =="

if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: Docker não encontrado. Rode scripts/install_ubuntu_vps.sh em Ubuntu ou instale Docker Desktop."
  exit 1
fi

docker compose version >/dev/null 2>&1 || { echo "ERRO: Docker Compose plugin não encontrado."; exit 1; }

echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version)"

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado. Rode: cp .env.example .env ou bash scripts/prepare_env.sh"
  exit 1
fi

missing=0
for v in GONE_DOMAIN ERP_DOMAIN AVA_DOMAIN TECA_DOMAIN ERP_POSTGRES_USER ERP_POSTGRES_PASSWORD ERP_POSTGRES_DB AVA_MYSQL_DATABASE AVA_MYSQL_USER AVA_MYSQL_PASSWORD AVA_MYSQL_ROOT_PASSWORD TECA_POSTGRES_USER TECA_POSTGRES_PASSWORD TECA_POSTGRES_DB TECA_JWT_SECRET TECA_ADMIN_EMAIL TECA_ADMIN_PASSWORD; do
  if ! grep -q "^${v}=" .env; then
    echo "FALTA no .env: ${v}"
    missing=1
  fi
done
[ "$missing" = "0" ] || exit 1

for port in 80 443 8080 8081 5174 3001 8083 3002; do
  if command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -q ":${port}$"; then
    echo "Aviso: porta ${port} já está em uso. Isso pode atrapalhar teste local/produção."
  fi
done

echo "Validando docker-compose.local.yml..."
docker compose -f docker-compose.local.yml config >/tmp/gone_compose_local_config.yml

echo "Validando docker-compose.yml..."
docker compose config >/tmp/gone_compose_prod_config.yml

echo "OK: pacote aparenta estar pronto para rodar."
