#!/usr/bin/env bash
set -euo pipefail
docker compose down 2>/dev/null || true
docker compose -f docker-compose.local.yml down 2>/dev/null || true
