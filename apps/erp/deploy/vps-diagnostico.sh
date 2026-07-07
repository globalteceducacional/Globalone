#!/bin/sh
# Diagnóstico rápido na VPS quando /api retorna 502 (backend fora do ar).
# Uso: cd /opt/ERP-Globaltec && sh deploy/vps-diagnostico.sh

set -e

echo "=== Containers ==="
docker compose ps

echo ""
echo "=== Health backend (host :3001) ==="
wget -qO- http://127.0.0.1:3001/health 2>/dev/null || echo "FALHA: backend não responde em 127.0.0.1:3001"

echo ""
echo "=== Últimas 80 linhas do log do backend ==="
docker compose logs --tail=80 backend

echo ""
echo "=== Status das migrations ==="
docker compose exec -T backend prisma migrate status 2>/dev/null || echo "Não foi possível consultar migrations (container parado?)"

echo ""
echo "=== Se o backend estiver reiniciando, tente ==="
echo "  docker compose logs -f backend"
echo "  docker compose up -d --build backend"
echo "  curl -s http://127.0.0.1:3001/health"
