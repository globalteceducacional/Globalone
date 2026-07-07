# Solução de problemas

Ver containers: `bash scripts/status.sh`.

Logs gerais: `bash scripts/logs.sh`.

Logs específicos: `bash scripts/logs.sh gateway`, `bash scripts/logs.sh ava-moodle`, `bash scripts/logs.sh erp-backend`, `bash scripts/logs.sh teca-api`.

HTTPS falhando: confira DNS, portas 80/443, e logs do gateway.

TECA sem IA real: configure `GEMINI_API_KEY` ou `TECA_TCP_ENABLED=true`.
