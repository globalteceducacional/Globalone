# Teca.ia — primeiro uso

Local: `http://localhost:8083`. Produção: `https://teca.seudominio.com.br`.

Credenciais admin iniciais ficam no `.env`:

```env
TECA_ADMIN_EMAIL=
TECA_ADMIN_PASSWORD=
```

A TECA responde por: servidor TCP original, Gemini ou fallback demonstrativo.

Endpoints principais:

```txt
GET  /api/health
POST /api/auth/login
POST /api/auth/register
GET  /api/me
POST /api/chats
GET  /api/chats
POST /api/ai/chat
```
