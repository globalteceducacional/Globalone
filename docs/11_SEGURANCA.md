# Segurança

Não publique com senhas padrão. Gere segredos com:

```bash
rm -f .env
bash scripts/prepare_env.sh
nano .env
```

Não envie `.env` para GitHub público. Chaves de IA ficam só no servidor. Faça backup antes de atualizar.
