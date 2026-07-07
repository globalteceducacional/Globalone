#!/usr/bin/env bash
set -euo pipefail
SERVICE=${1:-}
if [ -z "$SERVICE" ]; then
  docker compose logs -f --tail=150 2>/dev/null || docker compose -f docker-compose.local.yml logs -f --tail=150
else
  docker compose logs -f --tail=150 "$SERVICE" 2>/dev/null || docker compose -f docker-compose.local.yml logs -f --tail=150 "$SERVICE"
fi
