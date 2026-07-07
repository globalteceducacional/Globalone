# Verificação de integração — Globaltec One

## Resultado da verificação

Com os dados enviados, é possível instalar a Globaltec One como uma suite única aparente contendo:

- Portal/Repositório G.One
- AVA/Moodle
- ERP Globaltec
- Teca.ia Web/API
- Gateway Caddy com HTTPS automático
- Docker Compose único

A estrutura de containers está presente e organizada para hospedagem em VPS com Docker.

## O que já está pronto

- `docker-compose.yml` com serviços para G.One, AVA, ERP, TECA e gateway.
- `gateway/Caddyfile` com roteamento por subdomínios.
- `apps/gone/` com portal visual original.
- `apps/ava/` com Moodle em PHP/Apache.
- `apps/erp/` com backend NestJS, frontend React e banco PostgreSQL.
- `apps/teca-api/` com API Node/Express, banco PostgreSQL e suporte a Gemini/TCP/fallback.
- `apps/teca-web/` com interface web da TECA.
- scripts de instalação, status, logs, backup e inicialização.
- documentação de instalação local, VPS, segurança, backup, primeiro uso e checklist.

## Limite identificado

A versão anterior integrava os módulos principalmente por links/flutuantes. Isso permite abrir AVA, ERP e TECA a partir do G.One, mas ainda não garante um fluxo profundo como:

`Tecnologia do Repositório → Curso específico do AVA → Projeto específico no ERP → Chat TECA contextualizado`

Por isso esta versão adiciona uma camada de ponte visual e especifica para o Manus a integração profunda que deve ser finalizada na implantação.

## Melhor arquitetura para a integração aparente

Usar o G.One como portal/shell principal:

- O usuário entra no G.One.
- A partir do repositório, cada tecnologia deve ter botões contextuais:
  - Ver curso no AVA
  - Abrir/criar projeto no ERP
  - Perguntar à TECA sobre essa tecnologia
- AVA, ERP e TECA podem abrir em subdomínios próprios, mas devem parecer módulos da mesma plataforma.

## Requisitos para o Manus concluir

1. Validar que todos os containers sobem.
2. Corrigir mídias quebradas do G.One.
3. Mapear cada tecnologia por `technology_id` ou `slug`.
4. Criar links profundos para AVA, ERP e TECA.
5. Garantir que o ERP aceite criação/filtragem de projetos por tecnologia.
6. Garantir que o Moodle tenha cursos pesquisáveis e linkáveis.
7. Garantir que a TECA aceite contexto via URL ou API.
8. Persistir edições Master do G.One em arquivo/banco/API, não apenas localStorage.
9. Testar navegação real no navegador.

