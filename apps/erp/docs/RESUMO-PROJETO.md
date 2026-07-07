# Resumo do Projeto — ERP Globaltec

> Documento sintético gerado a partir da leitura do código e do `README.md` do repositório.
> Para detalhes operacionais (instalação, Docker, troubleshooting), consulte o [`README.md`](../README.md) na raiz.
> Para endpoints HTTP, ver [`API-ENDPOINTS.md`](./API-ENDPOINTS.md). Para padrões de tabelas no frontend, ver [`ANALISE-TABELAS.md`](./ANALISE-TABELAS.md).

---

## 1. Visão geral

O **ERP Globaltec** é um sistema de gestão empresarial completo, voltado para uso interno da Globaltec Educacional. Ele cobre desde processos administrativos (projetos, estoque, compras, fornecedores) até gestão de pessoas (RH, ponto eletrônico, banco de horas, férias, treinamentos) e curadoria de livros / galpão editorial.

O ecossistema é composto por **quatro aplicações** que compartilham o mesmo backend:

| App | Pasta | Tecnologia | Função |
|-----|-------|------------|--------|
| **API REST** | `backend/` | NestJS 10 + Prisma 5 + PostgreSQL 15 | Núcleo do sistema; expõe todos os recursos via HTTP/JWT. |
| **Web (operação)** | `frontend/` | React 18 + Vite + Tailwind | Aplicação principal usada por todos os perfis (operação diária). |
| **Painel administrativo** | `Erp_Painel/` | React 18 + Vite + shadcn/ui + Recharts | Dashboard executivo, ranking de produtividade e *modo TV*. |
| **Mobile** | `mobile/erp_mobile/` | Flutter 3.10 (Dart) | App híbrido (WebView + nativo) para ponto eletrônico, notificações e geolocalização. |

```
┌──────────────────────────────────────────────────────────┐
│                    PostgreSQL 15                         │
└────────────────────────▲─────────────────────────────────┘
                         │ Prisma ORM
┌────────────────────────┴─────────────────────────────────┐
│              Backend NestJS (API REST + JWT)             │
│   Auth · RBAC · Uploads · Cron RH · 18 módulos           │
└──┬────────────────┬────────────────────┬─────────────────┘
   │                │                    │
   ▼                ▼                    ▼
 frontend/      Erp_Painel/       mobile/erp_mobile/
 (operação)     (dashboards)      (WebView + Flutter)
```

---

## 2. Stack tecnológica consolidada

### Backend (`backend/`)
- **NestJS 10** (arquitetura modular: Controller → Service → Prisma)
- **Prisma 5.20** + **PostgreSQL 15**
- **Passport + JWT** para autenticação; `bcrypt` para hash
- **TypeScript 5.4** com `class-validator` (DTOs validados via `ValidationPipe` global)
- **Multer** (`@nestjs/platform-express`) para uploads (imagens, planilhas)
- **jsPDF** + **xlsx** para relatórios e importações
- Limite de body: **20 MB** (`backend/src/main.ts`)

### Frontend principal (`frontend/`)
- **React 18.3** + **Vite 5** + **TypeScript 5.4**
- **React Router 6** (rotas protegidas com `<ProtectedRoute>`)
- **Zustand 4.5** (estado global, principalmente auth — persistido em `localStorage`)
- **Axios** com interceptors (injeção de JWT + logout em 401)
- **Tailwind CSS 3.4** (tema escuro, tokens próprios)
- **jsPDF**, **xlsx**, **xlsx-js-style** (relatórios)

### Painel admin (`Erp_Painel/`)
- React 18 + Vite + TypeScript
- **shadcn/ui** (Radix UI) + **Tailwind**
- **Recharts** (gráficos: barras, pizza, ranking)
- **TanStack Query** (`@tanstack/react-query`)
- React Hook Form + Zod
- Vitest + Testing Library

### Mobile (`mobile/erp_mobile/`)
- Flutter SDK ^3.10
- `webview_flutter` 4.13 (carrega o frontend web)
- `flutter_local_notifications` 21
- `geolocator`, `permission_handler`, `image_picker`, `file_picker`, `connectivity_plus`
- `shared_preferences` (cache local)
- Função: app "casca" para acesso ao ERP com recursos nativos (notificações push, GPS para ponto eletrônico, câmera).

### DevOps
- **Docker Compose** (3 serviços: `db`, `backend`, `frontend`)
- **Nginx** servindo o build do frontend em produção (com proxy reverso para `/api`)
- Volumes para uploads (`/app/uploads`)

---

## 3. Domínios funcionais

O backend está dividido em **18 módulos** sob `backend/src/modules/`. Eles podem ser agrupados em quatro grandes áreas:

### 3.1 Núcleo / acesso
| Módulo | Responsabilidade |
|--------|------------------|
| `auth` | Login, registro, JWT strategy. |
| `users` | CRUD de usuários, ativar/desativar, troca de senha, opções para selects. |
| `cargos` | Cargos, níveis (`NIVEL_0`…`NIVEL_4`), páginas permitidas e relação com **permissões** granulares. |
| `setores` | Setores e membros (usados por compras, RH e relatórios). |

### 3.2 Operação / projetos
| Módulo | Responsabilidade |
|--------|------------------|
| `projects` | CRUD de projetos, supervisor, responsáveis múltiplos, finalização, importação Excel. |
| `tasks` | Etapas, subetapas, **checklist com subitens**, entregas (com imagens/documentos), aprovação/rejeição. |
| `calendario` | Eventos e agendamentos compartilhados. |
| `uploads` | Endpoint genérico para upload e servir arquivos em `/uploads`. |

### 3.3 Compras / estoque / editorial
| Módulo | Responsabilidade |
|--------|------------------|
| `stock` | Itens de estoque, **alocações**, compras (cotações múltiplas, tags, "pago por", **assinaturas/recorrência mensal**, importação XLSX, batch operations, fluxo `SOLICITADO → COMPRADO_ACAMINHO → ENTREGUE`, integração compra→estoque). |
| `suppliers` | CRUD de fornecedores + integração com **ReceitaWS** (consulta CNPJ). |
| `categories` | Categorias de compra (`entraNoEstoque`, `isAssinatura`, `recorrenciaMensal`). |
| `curadoria` | Orçamentos editoriais, itens, estoque por **ISBN**, cotações, importação XLSX. |
| `galpao` | Produtos do galpão, **livros** (entrada / alocação / baixa / **avaria**) e **outros itens**, com relatórios. |

### 3.4 Comunicação e RH
| Módulo | Responsabilidade |
|--------|------------------|
| `occurrences` | Ocorrências entre usuários (com anexos). |
| `requests` | Requerimentos formais (enviados/recebidos, respostas, tipo `COMPRA`). |
| `notifications` | Notificações in-app (`INFO`, `SUCCESS`, `WARNING`, `ERROR`). |
| `rh` | **Sub-módulo grande** — ver detalhamento abaixo. |

#### 3.4.1 Submódulo `rh/` — Recursos Humanos completo

Estruturado em **4 fases** (conforme docstring de `rh.module.ts`):

| Fase | Submódulos |
|------|------------|
| **Fase 0** | `ponto` (registro de ponto eletrônico, comprovante público) |
| **Fase 1** | `jornada` (escalas + **geocerca individual**), `espelho` (espelho de ponto calculado), `solicitacoes` (ajustes de ponto) |
| **Fase 2** | `banco-horas`, `ferias`, `afastamentos`, `documentos` |
| **Fase 3** | `desempenho` (avaliação), `treinamentos`, `analytics` (KPIs/folha), `empregador` (configurações da empresa), `afd` (Arquivo Fonte de Dados — CLT) |
| **Infra** | `cron` — `RhCronService` (rotinas agendadas, ex.: fechamento mensal) |

> Atenção: este módulo não está descrito no `README.md` raiz, mas é uma das partes mais robustas do sistema.

---

## 4. Estrutura do frontend principal

`frontend/src/pages/` concentra as telas (rotas em `App.tsx`):

| Área | Arquivos relevantes |
|------|--------------------|
| Auth / perfil | `Login.tsx`, `UserProfile.tsx`, `PerfilRedirect.tsx` |
| Dashboard | `Dashboard.tsx` |
| Projetos | `Projects.tsx`, `ProjectDetails.tsx`, `ImportProjects.tsx` |
| Tarefas | `MyTasks.tsx` |
| Compras / estoque | `Stock.tsx` (+ `components/stock/*` e hooks `useStockData`, `usePurchaseFilters`) |
| Curadoria | `Curadoria.tsx`, `CuradoriaBudgetDetails.tsx` |
| Galpão | `Galpao.tsx`, `GalpaoProdutoDetails.tsx` |
| Comunicação | `Communications.tsx` (unifica ocorrências + requerimentos; rota legada `/requests` → `/communications`) |
| Notificações | `NotificationsPage.tsx` |
| Calendário | `Calendar.tsx` |
| Cadastros | `Users.tsx`, `Cargos.tsx`, `Setores.tsx`, `SetorDetails.tsx`, `Suppliers.tsx`, `Categories.tsx` |
| **RH** | `RhCentral.tsx`, `RhPonto.tsx`, `RhEspelho.tsx`, `RhBancoHorasColaborador.tsx`, `RhDocumentosColaborador.tsx` (+ `components/rh/TabJornada.tsx`, `TabGeocerca.tsx`, `GeocercaPicker.tsx`) |

**Layout e proteção:** `components/layout/AppLayout.tsx` (Sidebar + Header) com filtragem automática de itens de menu por **`paginasPermitidas`** + permissões do cargo. `ProtectedRoute` valida JWT e `getFirstAllowedPage` decide a primeira rota após login.

**Cliente HTTP:** `services/api.ts`
- Em **dev**: usa `http://localhost:3000` quando `VITE_API_URL` está vazio ou é `/api`
- Em **prod**: usa `/api` (proxy Nginx)
- Interceptor de **request** anexa `Authorization: Bearer <token>`
- Interceptor de **response** desloga em **401** (mas **não em 403**)

---

## 5. Sistema de permissões (RBAC)

O modelo é baseado em **cargos** com **permissões granulares**:

```
Usuario ──► Cargo ──► CargoPermission ──► Permission ("recurso:acao")
                 └──► nivel (NIVEL_0..NIVEL_4)
                 └──► paginasPermitidas (JSON)
```

### Backend
- `JwtAuthGuard` valida o token (em `modules/auth/guards/`).
- `RolesGuard` (em `common/guards/roles.guard.ts`) checa se o usuário possui as permissões declaradas via `@Permissions('recurso:acao', ...)`.
- `@CurrentUser()` injeta o usuário autenticado nos handlers.

### Frontend
- `Sidebar` filtra os itens por `paginasPermitidas` do cargo.
- `ProtectedRoute` valida sessão.
- `getFirstAllowedPage` redireciona após login.

### Perfis típicos (após seed)
| Perfil | Nível | Foco |
|--------|-------|------|
| Diretor | NIVEL_4 | Visão ampla (gestão e cadastros) |
| Supervisor | NIVEL_3 | Acompanha projetos, aprova entregas/compras |
| Executor | NIVEL_2 | Executa tarefas, faz entregas |
| Cotador / Pagador | NIVEL_1 | Fluxo de compras / pagamentos |

Credenciais padrão estão documentadas no `README.md` (seção "Credenciais Padrão").

---

## 6. Banco de dados (Prisma)

Schema em `backend/prisma/schema.prisma`. Principais entidades:

| Domínio | Entidades chave |
|---------|----------------|
| Identidade | `Usuario`, `Cargo`, `Permission`, `CargoPermission`, `Setor`, `SetorUsuario` |
| Projetos | `Projeto`, `Etapa`, `Subetapa`, `ChecklistItemEntrega` |
| Estoque | `Estoque`, `EstoqueAlocacao` |
| Compras | `Compra`, `MetodoPagoCompra`, `Fornecedor`, `CategoriaCompra` |
| Editorial | `CuradoriaOrcamento`, `CuradoriaItem`, `GalpaoProduto`, `GalpaoProdutoLivroMovimento` (+ reservas/avarias) |
| Comunicação | `Ocorrencia`, `Requerimento`, `Notificacao` |
| Calendário | entidades em `modules/calendario/` |
| RH | tabelas de ponto, jornada, espelho, banco de horas, férias, afastamentos, documentos, desempenho, treinamentos, AFD, geocerca individual (ver migrations recentes em `prisma/migrations/`) |

**Particularidade do checklist (etapas):**
- Persistido em `Etapa.checklistJson` (JSON).
- Entregas em `ChecklistItemEntrega`, com unicidade por `(etapaId, checklistIndex, subitemIndex)`.
- Reenvio de arquivos faz **merge** dos arrays `imagensUrls` / `documentosUrls` em vez de substituir.

**Integração compra → estoque:** quando uma `Compra` muda para `ENTREGUE` e a categoria possui `entraNoEstoque = true`, o estoque é incrementado automaticamente.

**Migrações recentes (relevantes):**
- `20260429140000_rh_fase_completo` — base do módulo RH
- `20260507150000_seed_permissoes_rh_compliance` — permissões de compliance do RH
- `20260507153000_jornada_geocerca_individual` — geocerca por colaborador

---

## 7. Como rodar (resumo)

### Docker (produção / homologação)
```powershell
Copy-Item env.example .env ;
docker-compose up -d --build
```
- Frontend: http://localhost:5174
- Backend: http://localhost:3001 (health: `/health`)

> Em Windows/macOS, ajuste o volume `/var/erp-uploads:/app/uploads` para um caminho local (ex.: `./uploads:/app/uploads`).

### Desenvolvimento local
```powershell
cd backend ;
npm install ;
npm run db:setup ;
npm run start:dev
```
```powershell
cd frontend ;
npm install ;
npm run dev
```
- Frontend dev: http://localhost:5173
- Backend dev: http://localhost:3000

Para detalhes completos (variáveis de ambiente, troubleshooting, comandos Prisma), consulte o `README.md` raiz.

---

## 8. Pontos de atenção e observações técnicas

1. **API sem prefixo global**: não há `setGlobalPrefix('/api')` no `main.ts`; o prefixo `/api` é adicionado pelo proxy Nginx em produção.
2. **`VITE_API_URL` é embutida no build**: ao gerar a imagem Docker do frontend, o valor já é fixado. Para apontar para outro host, refaça o build.
3. **Logout em 401 ≠ 403**: o interceptor do Axios só desloga em 401; 403 (sem permissão) apenas exibe erro, mantendo a sessão.
4. **`/communications` substitui `/requests`**: a rota antiga ainda existe e redireciona, mas novos usos devem apontar para `/communications`.
5. **Uploads servidos por `/uploads`**: imagens e documentos vêm como URL absoluta a partir desse prefixo (configurado no backend para servir arquivos estáticos).
6. **Body limit de 20 MB** no backend permite upload de planilhas e imagens em base64 sem problemas.
7. **`Erp_Painel/` aponta para `https://erp.alenxandriaglobaltec.com`** por padrão (configurado em `src/services/api.ts`). Esse painel é independente do `frontend/` e pode ser deployado separadamente.
8. **Mobile** é predominantemente uma WebView com camada nativa para notificações, GPS e câmera — útil principalmente para o módulo de ponto eletrônico do RH.

---

## 9. Roteiro de leitura sugerido para novos devs

1. Ler [`README.md`](../README.md) raiz (instalação, arquitetura geral).
2. Ler este resumo (visão consolidada).
3. Conferir [`API-ENDPOINTS.md`](./API-ENDPOINTS.md) para integração externa.
4. Estudar `backend/src/app.module.ts` e `backend/prisma/schema.prisma`.
5. No frontend: começar por `App.tsx` → `services/api.ts` → `store/auth.ts` → `components/layout/AppLayout.tsx`, depois mergulhar na página da feature de interesse.
6. Para o módulo RH: ler `backend/src/modules/rh/rh.module.ts` (mapa de fases) antes de abrir os submódulos.

---

_Documento gerado em 07/05/2026 a partir da estrutura atual do repositório._
