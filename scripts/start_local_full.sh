#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.full.example .env
  echo "Criei .env a partir de .env.full.example para teste local completo."
fi

docker compose -f docker-compose.local.yml up -d --build

cat <<MSG

Suite COMPLETA iniciada em modo LOCAL.

Acesse:
- G.One:    http://localhost:8080
- AVA:      http://localhost:8081
- ERP:      http://localhost:5174
- TECA.IA:  http://localhost:8083

Logs: bash scripts/logs.sh
MSG
