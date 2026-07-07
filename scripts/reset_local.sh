#!/usr/bin/env bash
set -euo pipefail
cat <<'WARN'
Isto vai remover containers e volumes do modo local/prod desta pasta, apagando bancos locais.
Digite APAGAR para continuar:
WARN
read -r ok
if [ "$ok" != "APAGAR" ]; then
  echo "Cancelado."
  exit 0
fi

docker compose -f docker-compose.local.yml down -v --remove-orphans || true
docker compose down -v --remove-orphans || true
rm -rf backups/tmp 2>/dev/null || true
echo "Ambiente limpo."
