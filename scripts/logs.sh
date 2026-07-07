#!/usr/bin/env bash
set -euo pipefail

SERVICE=${1:-}

run_logs() {
  local file="$1"
  shift
  if [ -n "$SERVICE" ]; then
    docker compose -f "$file" logs -f --tail=150 "$SERVICE"
  else
    docker compose -f "$file" logs -f --tail=150
  fi
}

if docker compose ps >/dev/null 2>&1; then
  run_logs docker-compose.yml "$SERVICE"
elif docker compose -f docker-compose.local.portal.yml ps >/dev/null 2>&1; then
  run_logs docker-compose.local.portal.yml "$SERVICE"
elif docker compose -f docker-compose.full.yml ps >/dev/null 2>&1; then
  run_logs docker-compose.full.yml "$SERVICE"
elif docker compose -f docker-compose.local.yml ps >/dev/null 2>&1; then
  run_logs docker-compose.local.yml "$SERVICE"
else
  echo "Nenhum stack ativo encontrado."
  exit 1
fi
