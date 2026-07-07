Você é um engenheiro DevOps/full-stack sênior. Sua missão é hospedar, corrigir, integrar e deixar plenamente funcional a plataforma Globaltec One como uma única suite aparente, usando o pacote fornecido.

## Pacote recebido

Use o pacote `GONE_SUITE_GLOBALTEC_ONE_MANUS_FINAL_v1_3.zip` como base principal.

Ele contém:

- G.One Portal/Repositório em `apps/gone/`
- AVA/Moodle em `apps/ava/`
- ERP Globaltec em `apps/erp/`
- Teca.ia em `apps/teca-web/` e `apps/teca-api/`
- Gateway Caddy em `gateway/Caddyfile`
- Docker Compose produção/local
- scripts de instalação, backup, logs e diagnóstico
- docs completos
- editor Master discreto em `apps/gone/assets/js/master_content_editor.js`
- correção/fallback de mídias em `apps/gone/assets/js/media_compatibility_guard.js`
- ponte visual Repositório → AVA/ERP/TECA em `apps/gone/assets/js/gone_repository_bridge.js`

## Objetivo final

Entregar a Globaltec One online em HTTPS, com aparência de plataforma única:

- `https://one.DOMINIO` → G.One/Repositório
- `https://ava.DOMINIO` → AVA/Moodle
- `https://erp.DOMINIO` → ERP Globaltec
- `https://teca.DOMINIO` → Teca.ia

O usuário deve conseguir, a partir do repositório G.One:

1. encontrar uma tecnologia;
2. abrir/ver curso correspondente no AVA;
3. abrir/criar projeto correspondente no ERP;
4. conversar com a TECA já contextualizada naquela tecnologia.

## Não recriar do zero

Não recrie a plataforma do zero. Corrija e complemente o pacote existente.

Preserve:

- visual original do G.One;
- Moodle/AVA;
- ERP React + NestJS;
- Teca.ia Web/API;
- estrutura Docker Compose;
- Caddy como gateway.

## Primeira etapa — auditoria obrigatória

1. Descompacte o pacote.
2. Liste os arquivos principais.
3. Confirme a presença de:
   - `docker-compose.yml`
   - `docker-compose.local.yml`
   - `.env.example`
   - `gateway/Caddyfile`
   - `apps/gone/index.html`
   - `apps/gone/assets/js/master_content_editor.js`
   - `apps/gone/assets/js/media_compatibility_guard.js`
   - `apps/gone/assets/js/gone_repository_bridge.js`
   - `apps/ava/Dockerfile`
   - `apps/erp/backend/Dockerfile`
   - `apps/erp/frontend/Dockerfile`
   - `apps/teca-api/Dockerfile`
   - `apps/teca-web/Dockerfile`
4. Corrija permissões dos scripts.
5. Corrija quebras de linha Windows/Unix.

## Segunda etapa — subir a suite

Em VPS Ubuntu 22.04/24.04:

1. Instale Docker Engine e Docker Compose Plugin.
2. Aponte DNS para o IP da VPS:
   - `one.DOMINIO`
   - `ava.DOMINIO`
   - `erp.DOMINIO`
   - `teca.DOMINIO`
3. Copie `.env.example` para `.env`.
4. Configure domínios, e-mail e senhas fortes.
5. Rode `docker compose up -d --build`.
6. Verifique `docker compose ps`.
7. Corrija qualquer container que reinicie ou falhe.

## Terceira etapa — corrigir mídias bugadas

Verifique imagens e vídeos do G.One.

Corrija obrigatoriamente:

- imagens inexistentes;
- imagens HEIC/HEIF/TIFF/RAW/PSD;
- vídeos que não sejam MP4/WebM/Ogg;
- vídeos com codecs não aceitos por navegador;
- caminhos quebrados em `assets/`;
- carrosséis que apontem para arquivos inexistentes.

Padronize:

- imagens em `.webp` ou `.jpg`;
- vídeo principal em `.mp4` H.264/AAC;
- nomes sem acentos, espaços ou caracteres especiais;
- fallback visual para qualquer mídia ausente.

O script `media_compatibility_guard.js` ajuda no fallback, mas a correção final deve ser no arquivo/caminho correto.

## Quarta etapa — integração profunda Repositório → AVA/ERP/TECA

A ponte visual atual adiciona botões contextuais, mas você deve torná-la robusta.

### Criar identificador único por tecnologia

Cada tecnologia deve ter:

- `technology_id` ou `slug`
- nome
- área temática
- resumo
- `ava_course_url` ou `ava_course_id`
- `erp_project_template_id` ou rota de criação
- `teca_context`

### Repositório

Em cada card/detalhe de tecnologia, incluir botões:

- `Ver curso no AVA`
- `Abrir/criar projeto no ERP`
- `Perguntar à TECA`

### AVA/Moodle

Configurar cursos pesquisáveis/linkáveis.

Se não houver curso específico, abrir busca do Moodle com o nome da tecnologia:

`/course/search.php?search=NOME_DA_TECNOLOGIA`

Se houver curso específico, abrir o curso diretamente.

### ERP

Garantir que o ERP aceite:

- filtro por tecnologia: `/projects?technology=SLUG`
- criação de projeto por tecnologia: `/projects/new?technology=SLUG&title=NOME`

Se essas rotas não existirem, implemente ou adapte no frontend/backend do ERP.

O ERP deve permitir criar projeto com:

- tecnologia vinculada;
- objetivo;
- metas;
- etapas;
- BOM;
- evidências;
- cronograma;
- responsável.

### TECA

Garantir que a Teca Web aceite contexto por URL:

`/?context=technology:SLUG&q=PERGUNTA`

E que a API aceite metadados de contexto no chat:

```json
{
  "message": "Explique esta tecnologia e gere um plano de implantação",
  "context": {
    "type": "technology",
    "slug": "openloong",
    "source": "gone-repository"
  }
}
```

A TECA deve responder usando esse contexto.

## Quinta etapa — editor Master/Admin sem programação

O usuário Master/Admin deve conseguir editar conteúdo do G.One pelo item Configurações.

### Requisitos

1. Configurações deve aparecer de forma discreta.
2. Não usar botões chamativos em todos os blocos por padrão.
3. Dentro de Configurações, oferecer:
   - ativar três pontinhos sutis;
   - editar qualquer ponto da página;
   - exportar edições.
4. Ao clicar nos três pontinhos ou no bloco, abrir pop-up.
5. O pop-up deve editar:
   - título;
   - texto;
   - imagem;
   - vídeo;
   - HTML interno avançado.
6. As edições devem persistir no servidor, não apenas localStorage.
7. Apenas perfil Master/Admin pode editar.

### Persistência recomendada

Crie um serviço simples para o G.One, se ainda não existir:

- `gone-cms-api`
- Node/Express ou NestJS
- banco SQLite, PostgreSQL ou arquivo JSON protegido

Endpoints mínimos:

- `GET /api/gone-content/edits`
- `POST /api/gone-content/edits`
- `GET /api/gone-content/media`
- `POST /api/gone-content/media`

Conecte esses endpoints ao `master_content_editor.js` por:

```js
window.GONE_MASTER_EDITOR_CONFIG = {
  loadEndpoint: '/api/gone-content/edits',
  saveEndpoint: '/api/gone-content/edits'
}
```

Se preferir, pode salvar essas edições no banco do ERP, desde que mantenha permissão Master/Admin.

## Sexta etapa — testes de aceite

Não finalize a tarefa antes de todos estes testes passarem.

### Containers

`docker compose ps` deve mostrar todos os serviços principais rodando:

- gateway
- gone
- erp-db
- erp-backend
- erp-frontend
- ava-db
- ava-moodle
- teca-db
- teca-api
- teca-web

### URLs

Abrir em HTTPS:

- `https://one.DOMINIO`
- `https://ava.DOMINIO`
- `https://erp.DOMINIO`
- `https://teca.DOMINIO`

### G.One

Testar:

- visual original preservado;
- imagens principais carregando;
- vídeo principal carregando;
- repositório navegável;
- botões para AVA/ERP/TECA funcionando;
- editor Master em Configurações;
- salvamento persistente das edições.

### AVA

Testar:

- Moodle carrega;
- banco conecta;
- curso pode ser acessado ou pesquisado a partir do repositório;
- login/admin funcional.

### ERP

Testar:

- frontend carrega;
- API responde;
- projeto pode ser criado a partir de tecnologia;
- projeto persiste após recarregar;
- evidências podem ser enviadas.

### TECA

Testar:

- Teca Web carrega;
- API responde em `/api/health`;
- login funciona;
- chat funciona;
- contexto da tecnologia enviado pelo G.One aparece na conversa;
- IA usa Gemini/TCP/fallback conforme configuração.

### Persistência

Reinicie a VPS/containers e confirme que:

- Moodle mantém dados;
- ERP mantém projetos;
- TECA mantém chats;
- G.One mantém edições Master.

## Relatório final obrigatório

Ao concluir, entregue:

1. URLs públicas.
2. Status dos containers.
3. Evidência dos testes.
4. Lista de mídias corrigidas.
5. Como editar conteúdo pelo Master.
6. Como criar projeto a partir do repositório.
7. Como acessar curso a partir do repositório.
8. Como acionar TECA contextualizada.
9. Credenciais iniciais, se autorizado pelo usuário.
10. Pendências reais, se houver.

## Critério final

A plataforma só está concluída quando o usuário consegue entrar no G.One, navegar no repositório, escolher uma tecnologia e, a partir dela, acessar curso, projeto e TECA de forma compreensível, com os quatro módulos online em HTTPS.
