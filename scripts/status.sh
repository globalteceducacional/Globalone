#!/usr/bin/env bash
set -euo pipefail
if docker compose ps >/dev/null 2>&1; then docker compose ps; fi
if docker compose -f docker-compose.local.yml ps >/dev/null 2>&1; then docker compose -f docker-compose.local.yml ps; fi
printf "\nSaúde local provável:\n"
for url in http://localhost:8080/health http://localhost:8081 http://localhost:5174/health http://localhost:3001/health http://localhost:8083 http://localhost:3002/health; do
  printf "- %s : " "$url"
  curl -fsS --max-time 4 "$url" >/dev/null 2>&1 && echo OK || echo "não respondeu ainda"
done
