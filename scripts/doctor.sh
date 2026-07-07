#!/usr/bin/env bash
set -euo pipefail

echo "== G.One Doctor =="

if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: Docker não encontrado. Rode scripts/install_ubuntu_vps.sh"
  exit 1
fi

docker compose version >/dev/null 2>&1 || { echo "ERRO: Docker Compose plugin não encontrado."; exit 1; }

echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version)"

if [ -f .env ]; then
  missing=0
  for v in GONE_DOMAIN LETSENCRYPT_EMAIL; do
    if ! grep -q "^${v}=" .env; then
      echo "FALTA no .env: ${v}"
      missing=1
    fi
  done
  [ "$missing" = "0" ] || exit 1
else
  echo "Aviso: .env não encontrado (opcional para teste local do portal)."
fi

for port in 80 443 8080; do
  if command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -q ":${port}$"; then
    echo "Aviso: porta ${port} já está em uso."
  fi
done

echo "Validando docker-compose.yml (portal)..."
docker compose config >/tmp/gone_compose_config.yml

echo "Validando docker-compose.local.portal.yml..."
docker compose -f docker-compose.local.portal.yml config >/tmp/gone_compose_local_config.yml

echo "OK: pronto para rodar o portal G.One."
