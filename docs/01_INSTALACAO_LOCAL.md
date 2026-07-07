# Instalação local

Requisitos: Docker Desktop ou Docker Engine com Compose. Recomendado: 8 GB RAM, 10 GB livres.

Rodar:

```bash
bash scripts/start_local.sh
```

Status e logs:

```bash
bash scripts/status.sh
bash scripts/logs.sh
bash scripts/logs.sh teca-api
bash scripts/logs.sh erp-backend
```

Parar:

```bash
bash scripts/stop.sh
```

Apagar bancos locais e recomeçar:

```bash
bash scripts/reset_local.sh
```
