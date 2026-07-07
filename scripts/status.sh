#!/usr/bin/env bash
set -euo pipefail

docker compose ps 2>/dev/null || true
docker compose -f docker-compose.local.portal.yml ps 2>/dev/null || true
docker compose -f docker-compose.full.yml ps 2>/dev/null || true
docker compose -f docker-compose.local.yml ps 2>/dev/null || true

printf "\nSaúde:\n"
for url in http://localhost:8080/health; do
  printf "- %s : " "$url"
  curl -fsS --max-time 4 "$url" >/dev/null 2>&1 && echo OK || echo "não respondeu"
done

if [ -f .env ] && grep -q '^GONE_DOMAIN=' .env; then
  DOMAIN="$(grep '^GONE_DOMAIN=' .env | cut -d= -f2-)"
  printf "- https://%s : " "$DOMAIN"
  curl -fsS --max-time 6 "https://${DOMAIN}/health" >/dev/null 2>&1 && echo OK || echo "não respondeu ainda"
fi
