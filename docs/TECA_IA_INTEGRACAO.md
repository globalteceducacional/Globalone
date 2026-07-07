# Integração da Teca.ia na Suite G.One

Esta versão integra a Teca.ia como quarto módulo da plataforma:

- `one.seudominio.com.br` — Portal G.One
- `ava.seudominio.com.br` — AVA/Moodle
- `erp.seudominio.com.br` — ERP Globaltec
- `teca.seudominio.com.br` — Teca.ia Web

## O que foi integrado

O pacote `TecaAPP-main.zip` foi analisado e incluído na suite. Ele contém um aplicativo Flutter com autenticação JWT, histórico de chats, modos de conversa e cliente TCP para servidor de IA. Como navegadores não abrem socket TCP bruto diretamente, a versão online recebeu uma ponte de servidor:

```txt
teca-web  -> interface web da Teca.ia
teca-api  -> API HTTP/JWT, banco de chats e ponte com IA
teca-db   -> PostgreSQL da Teca.ia
```

A pasta original do Flutter foi preservada em:

```txt
apps/teca-flutter-source/
```

Ela pode ser usada para gerar APK, app Windows ou app desktop/mobile. Para uso online no navegador, use `apps/teca-web` + `apps/teca-api`.

## Por que não publiquei o Flutter direto como web

O app Flutter enviado usa `dart:io`, `Socket.connect` e protocolo TCP direto em `lib/services/ia_socket_client.dart`. Esse padrão funciona em desktop/mobile, mas não é compatível com navegador web comum. Por isso, a suite cria uma API intermediária que fala HTTP com o navegador e, quando configurado, TCP com o servidor original da IA.

## Modos da Teca

A interface web mantém três modos:

- Voz — função original `responda`
- Explicativo — função original `responda_explicativo`
- Matemática — função original `responda_matematica`

## Ordem de prioridade da resposta

Quando o usuário pergunta algo, a `teca-api` tenta responder nesta ordem:

1. Servidor TCP original da TECA, se `TECA_TCP_ENABLED=true` e `TECA_IA_HOST` estiver definido.
2. Gemini, se `GEMINI_API_KEY` estiver configurada.
3. Resposta demonstrativa/fallback, para a interface não quebrar.

## Variáveis no `.env`

```env
TECA_DOMAIN=teca.seudominio.com.br
TECA_POSTGRES_USER=teca
TECA_POSTGRES_PASSWORD=troque_por_senha_forte_teca
TECA_POSTGRES_DB=tecadb
TECA_JWT_SECRET=troque_por_um_segredo_teca_com_64_caracteres
TECA_ADMIN_EMAIL=admin@teca.local
TECA_ADMIN_PASSWORD=troque_essa_senha_admin_teca
TECA_ADMIN_NAME=Administrador TECA

TECA_TCP_ENABLED=false
TECA_IA_HOST=
TECA_IA_PORT=6000
TECA_TCP_TIMEOUT_MS=120000

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

## Para usar a IA original por TCP

Se você já tem o servidor da Teca rodando em uma máquina acessível pela VPS:

```env
TECA_TCP_ENABLED=true
TECA_IA_HOST=IP_OU_HOST_DO_SERVIDOR_TECA
TECA_IA_PORT=6000
```

O host precisa ser acessível a partir do container `teca-api`. Se o servidor estiver na mesma VPS, use o nome do serviço/container, IP interno Docker ou `host.docker.internal` quando disponível.

## Para usar IA online via Gemini

Preencha:

```env
GEMINI_API_KEY=sua_chave
GEMINI_MODEL=gemini-2.0-flash
```

Se o TCP estiver desligado, a Teca responde via Gemini.

## Teste local

```bash
cp .env.example .env
bash scripts/start_local.sh
```

Acesse:

```txt
Teca.ia: http://localhost:8083
Teca API: http://localhost:3002/health
```

Usuário inicial padrão vem do `.env`:

```txt
admin@teca.local
admin123456
```

Troque esses valores antes de publicar.

## Produção

No DNS, crie:

```txt
teca.seudominio.com.br -> IP da VPS
```

Depois rode:

```bash
bash scripts/start_prod.sh
```

Acesse:

```txt
https://teca.seudominio.com.br
```
