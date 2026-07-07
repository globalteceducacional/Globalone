#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.local.portal.yml up -d --build

cat <<MSG

G.One Portal iniciado em modo LOCAL.

Acesse: http://localhost:8080

Para suite completa local: bash scripts/start_local_full.sh
Logs: bash scripts/logs.sh
MSG
