# Configuração do .env

Domínios:

```env
GONE_DOMAIN=one.seudominio.com.br
ERP_DOMAIN=erp.seudominio.com.br
AVA_DOMAIN=ava.seudominio.com.br
TECA_DOMAIN=teca.seudominio.com.br
LETSENCRYPT_EMAIL=seu-email@seudominio.com.br
```

Gerar senhas fortes:

```bash
rm -f .env
bash scripts/prepare_env.sh
nano .env
```

IA real da TECA:

```env
GEMINI_API_KEY=sua_chave
```

ou servidor TCP original:

```env
TECA_TCP_ENABLED=true
TECA_IA_HOST=IP_OU_HOST_DO_SERVIDOR_TECA
TECA_IA_PORT=6000
```
