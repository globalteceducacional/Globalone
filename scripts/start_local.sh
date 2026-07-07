#!/usr/bin/env bash
set -euo pipefail
if [ ! -f .env ]; then
  cp .env.pronto.local .env 2>/dev/null || cp .env.example .env
  echo "Criei .env para teste local. Para produção, troque senhas e domínios."
fi

docker compose -f docker-compose.local.yml up -d --build
cat <<MSG

Plataforma iniciada em modo LOCAL.

Acesse:
- G.One:    http://localhost:8080
- AVA:      http://localhost:8081
- ERP:      http://localhost:5174
- TECA.IA:  http://localhost:8083
- ERP API:  http://localhost:3001/health
- TECA API: http://localhost:3002/health

TECA admin inicial: veja TECA_ADMIN_EMAIL e TECA_ADMIN_PASSWORD no arquivo .env.
Para logs: bash scripts/logs.sh
Para status: bash scripts/status.sh
MSG
