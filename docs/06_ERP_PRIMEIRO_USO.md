# ERP — primeiro uso

Local: `http://localhost:5174`. Produção: `https://erp.seudominio.com.br`.

API local: `http://localhost:3001/health`. API produção: `https://erp.seudominio.com.br/api/health`.

O ERP usa PostgreSQL próprio e migrations Prisma no início. Se demorar, acompanhe:

```bash
bash scripts/logs.sh erp-backend
```
