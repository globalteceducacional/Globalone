# 🏢 ERP Globaltec

Sistema de gestão empresarial completo desenvolvido com tecnologias modernas, oferecendo controle total sobre projetos, estoque, compras, tarefas, usuários e muito mais.

## 📋 Índice

- [Sobre o Projeto](#-sobre-o-projeto)
- [Stack Tecnológica](#-stack-tecnológica)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação e Configuração](#-instalação-e-configuração)
- [Uso](#-uso)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Sistema de Permissões](#-sistema-de-permissões)
- [API e Endpoints](#-api-e-endpoints)
- [Banco de Dados](#-banco-de-dados)
- [Docker](#-docker)
- [Desenvolvimento](#-desenvolvimento)
- [Troubleshooting](#-troubleshooting)
- [Contribuindo](#-contribuindo)

---

## 🎯 Sobre o Projeto

O **ERP Globaltec** é uma solução completa de gestão empresarial que permite:

- ✅ **Gestão de Projetos**: Criação, acompanhamento e finalização de projetos com controle de etapas e subetapas
- ✅ **Sistema de Estoque**: Controle completo de itens, alocações e movimentações
- ✅ **Gestão de Compras**: Solicitação, aprovação, cotações múltiplas e rastreamento de entregas
- ✅ **Tarefas e Etapas**: Sistema completo de workflow com checklists, entregas e aprovações
- ✅ **Comunicação Interna**: Ocorrências e requerimentos formais entre usuários
- ✅ **Gestão de Usuários**: Controle de acesso baseado em cargos (RBAC)
- ✅ **Fornecedores e Categorias**: Cadastro e integração com API de CNPJ
- ✅ **Relatórios**: Geração de PDFs e planilhas Excel com dados detalhados

---

## 🛠️ Stack Tecnológica

### Backend
- **NestJS 10.0.0** - Framework Node.js progressivo
- **Prisma 5.20.0** - ORM moderno e type-safe
- **PostgreSQL 15** - Banco de dados relacional
- **Passport + JWT** - Autenticação e autorização
- **bcrypt** - Hash de senhas
- **TypeScript 5.4.5** - Tipagem estática
- **class-validator** - Validação de DTOs
- **multer** (via `@nestjs/platform-express`) - Upload de arquivos (Excel, imagens)
- **jsPDF** + **xlsx** - Relatórios e importações em planilha

### Frontend
- **React 18.3.1** - Biblioteca UI
- **Vite 5.4.10** - Build tool e dev server
- **TypeScript 5.4.5** - Tipagem estática
- **React Router DOM 6.27.0** - Roteamento
- **Zustand 4.5.4** - Gerenciamento de estado
- **Axios 1.7.8** - Cliente HTTP
- **Tailwind CSS 3.4.14** - Framework CSS utility-first
- **jsPDF 3.0.3** - Geração de PDFs (ex.: relatório de compras)
- **xlsx + xlsx-js-style** - Planilhas Excel (exportação formatada e importações)

### DevOps
- **Docker & Docker Compose** - Containerização
- **Nginx** - Servidor web para frontend (produção)
- **PostgreSQL 15 Alpine** - Banco de dados containerizado

---

## ✨ Funcionalidades

### 🔐 Autenticação e Autorização
- Login com JWT (expiração configurável via `JWT_EXPIRES_IN`, padrão `7d`)
- Registro de novos usuários
- Sistema RBAC (Role-Based Access Control)
- Guards de autenticação e autorização
- Controle de acesso por cargo e páginas permitidas
- Ativação/desativação de usuários

### 👥 Gestão de Usuários e Cargos
- CRUD completo de usuários
- CRUD completo de cargos
- Atribuição de cargos a usuários
- Sistema de permissões granular
- Níveis de acesso (NIVEL_0 a NIVEL_4)
- Páginas permitidas por cargo (JSON configurável)

### 📁 Gestão de Projetos
- CRUD completo de projetos
- Atribuição de supervisor e responsáveis múltiplos
- Cálculo automático de progresso (baseado em checklist)
- Finalização de projetos
- Controle de valores (total e insumos)
- Visualização detalhada com etapas e compras relacionadas
- Filtros e busca

### 📋 Gestão de Etapas e Tarefas
- CRUD completo de etapas
- Subetapas com status independente
- Checklist de objetivos configurável
- Sistema de entregas com imagens e documentos
- Aprovação/rejeição de entregas
- Edição de entregas em análise
- Atribuição de executor e integrantes múltiplos
- Status: PENDENTE, EM_ANDAMENTO, EM_ANALISE, APROVADA, REPROVADA
- Cálculo de progresso baseado em checklist

### 🛒 Estoque e Compras
- CRUD completo de itens de estoque
- Sistema de alocação para projetos/etapas/usuários (e vínculo com **setores** quando aplicável)
- Cálculo automático de quantidade disponível vs alocada
- Sistema completo de compras (inclui **tags**, **“Pago por”** com métodos reutilizáveis e importação por planilha)
- **Assinaturas / recorrência mensal**: categorias com `isAssinatura` / `recorrenciaMensal`, alertas e confirmação por mês (`assinaturaConfirmadaMes`)
- Solicitação de compras com descrição e motivo
- Aprovação/rejeição de solicitações e **revisão de aprovação** (`revise-approval`)
- Cotações múltiplas por item
- Upload de imagens e arquivos (URLs / armazenamento servido em `/uploads`)
- Status: SOLICITADO, REPROVADO, PENDENTE, COMPRADO_ACAMINHO, ENTREGUE
- Integração automática: compra → estoque quando ENTREGUE (respeitando flags da categoria, ex.: `entraNoEstoque`)
- Rastreamento de entregas (previsão, data, endereço, recebido por)
- Operações em lote: exclusão de itens/compras, envio em massa para **COMPRADO_ACAMINHO**
- Filtros avançados: categoria, datas (compra, recebimento, entrega), busca textual
- Relatórios detalhados em PDF e Excel (utilitário dedicado no frontend, ex.: `purchaseReportPdf`)

### 📚 Curadoria
- Orçamentos e itens de curadoria
- Estoque de curadoria e cotações por ISBN
- Importação de orçamentos via Excel

### 🏭 Galpão
- Produtos de galpão, livros disponíveis/reservados e movimentações (entrada, alocação, baixa, avaria)
- Gestão paralela de **outros itens** além de livros
- Relatórios e listagens de avarias

### 🏢 Setores
- CRUD de setores e membros
- Opções para selects e integração com compras (`setorId`)

### 💬 Comunicações (frontend)
- Tela unificada **Comunicações** (`/communications`): ocorrências e requerimentos
- Rota legada `/requests` redireciona para `/communications`

### 🏪 Fornecedores e Categorias
- CRUD completo de fornecedores
- Integração com API ReceitaWS para busca automática por CNPJ
- Preenchimento automático de dados (razão social, endereço, etc.)
- CRUD completo de categorias de compra
- Associação de categorias a itens e compras

### 📢 Ocorrências e Requerimentos
- CRUD completo de ocorrências
- CRUD completo de requerimentos
- Envio e recebimento entre usuários
- Respostas a requerimentos
- Anexos (imagens e documentos)
- Status de pendência e resolução

### 🔔 Notificações
- Sistema de notificações em tempo real
- Tipos: INFO, SUCCESS, WARNING, ERROR
- Marcação de leitura
- Notificações por usuário

### 📊 Relatórios
- Relatórios de compras em PDF
- Relatórios de compras em Excel formatado
- Filtros e tabelas interativas no Excel
- Estatísticas detalhadas (por status, categoria, fornecedor)
- Exportação com formatação profissional

---

## 🏗️ Arquitetura

### Estrutura Geral

```
ERP-Globaltec/
├── backend/                 # API REST NestJS
│   ├── src/
│   │   ├── modules/         # Módulos de domínio
│   │   │   ├── auth/       # Autenticação
│   │   │   ├── users/      # Usuários
│   │   │   ├── cargos/     # Cargos
│   │   │   ├── projects/   # Projetos
│   │   │   ├── tasks/      # Tarefas e Etapas
│   │   │   ├── stock/      # Estoque e Compras
│   │   │   ├── suppliers/  # Fornecedores
│   │   │   ├── categories/ # Categorias
│   │   │   ├── occurrences/# Ocorrências
│   │   │   ├── requests/   # Requerimentos
│   │   │   ├── notifications/ # Notificações
│   │   │   ├── curadoria/  # Orçamentos e estoque de curadoria
│   │   │   ├── setores/    # Setores e membros
│   │   │   └── galpao/     # Galpão (livros e outros itens)
│   │   ├── common/         # Recursos compartilhados
│   │   │   ├── decorators/ # Decorators (RBAC por permissões)
│   │   │   ├── guards/     # RolesGuard e utilitários
│   │   │   └── health.controller.ts
│   │   ├── prisma/         # Serviço Prisma
│   │   └── main.ts         # Bootstrap da aplicação
│   ├── prisma/
│   │   ├── schema.prisma   # Schema do banco
│   │   ├── migrations/     # Migrações
│   │   └── seed.ts         # Seed do banco
│   ├── package.json
│   └── Dockerfile
│
├── frontend/                # Aplicação React
│   ├── src/
│   │   ├── pages/          # Páginas da aplicação
│   │   ├── components/    # Componentes reutilizáveis
│   │   │   ├── layout/     # Layout (Sidebar, Header)
│   │   │   └── stock/     # Componentes de estoque/compras (modais, tabelas, filtros)
│   │   ├── hooks/         # Hooks customizados
│   │   ├── services/      # Serviços de API
│   │   ├── store/         # Estado global (Zustand)
│   │   ├── types/         # Tipos TypeScript
│   │   ├── utils/         # Utilitários
│   │   └── constants/     # Constantes
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml      # Orquestração Docker
├── env.example            # Exemplo de variáveis de ambiente
└── README.md              # Este arquivo
```

### Fluxo de Dados

```
Frontend (React)
    ↓ (HTTP + JWT)
Backend (NestJS)
    ↓ (Prisma ORM)
PostgreSQL Database
```

### Mapa do Backend (como o `backend/` funciona)

#### Visão rápida
- **Framework**: NestJS (arquitetura modular)
- **Padrão**: Controller → Service → `PrismaService` → PostgreSQL
- **Validação**: `ValidationPipe` global (whitelist + transform) em `backend/src/main.ts`
- **Auth**: JWT + Guards (`JwtAuthGuard` + `RolesGuard`)
- **Payload / upload**: padrão **2048 MB (2 GB)** por arquivo (`UPLOAD_MAX_MB` / `VITE_UPLOAD_MAX_MB`); body parser em `backend/src/main.ts` acompanha o mesmo limite

#### Arquivos-chave
- **Bootstrap**: `backend/src/main.ts`
- **Módulo raiz**: `backend/src/app.module.ts`
- **Prisma**:
  - Schema: `backend/prisma/schema.prisma`
  - Migrations: `backend/prisma/migrations/`
  - Service: `backend/src/prisma/prisma.service.ts`
  - Module global: `backend/src/prisma/prisma.module.ts`
- **Guards/Decorators (RBAC)**:
  - `backend/src/modules/auth/guards/jwt-auth.guard.ts` (JWT)
  - `backend/src/common/guards/roles.guard.ts` (permissões declaradas com `@Permissions(...)`)
  - `backend/src/common/decorators/permissions.decorator.ts`
  - `backend/src/common/decorators/current-user.decorator.ts`

#### Módulos principais
- **Auth**: `backend/src/modules/auth/` (login/register, JWT strategy)
- **Users**: `backend/src/modules/users/` (CRUD usuários, ativar/desativar, trocar senha, opções para selects)
- **Cargos**: `backend/src/modules/cargos/` (CRUD cargos, páginas permitidas e permissões)
- **Projects**: `backend/src/modules/projects/` (CRUD projetos, responsáveis, finalizar, importação Excel)
- **Tasks**: `backend/src/modules/tasks/` (etapas, subetapas, entregas, checklist, revisão)
- **Stock**: `backend/src/modules/stock/` (itens de estoque, compras, aprovações e alocações)
- **Suppliers**: `backend/src/modules/suppliers/` (CRUD fornecedores, consulta CNPJ)
- **Categories**: `backend/src/modules/categories/` (CRUD categorias de compra)
- **Requests**: `backend/src/modules/requests/` (requerimentos enviados/recebidos, responder, tipo COMPRA)
- **Notifications**: `backend/src/modules/notifications/` (notificações)
- **Occurrences**: `backend/src/modules/occurrences/` (ocorrências)
- **Curadoria**: `backend/src/modules/curadoria/` (orçamentos, itens, estoque, importação XLSX)
- **Setores**: `backend/src/modules/setores/` (setores, membros, opções)
- **Galpão**: `backend/src/modules/galpao/` (produtos, livros, outros itens, avarias)

#### Rotas (referência rápida)

**Auth** (`backend/src/modules/auth/auth.controller.ts`)
- `POST /auth/login`
- `POST /auth/register`

**Projects** (`backend/src/modules/projects/projects.controller.ts`)
- `GET /projects`
- `GET /projects/:id`
- `POST /projects`
- `PATCH /projects/:id`
- `PATCH /projects/:id/responsibles`
- `PATCH /projects/:id/finalize`
- `DELETE /projects/:id`
- `POST /projects/import` (upload Excel)

**Tasks / Etapas** (`backend/src/modules/tasks/tasks.controller.ts`)
- `GET /tasks/my`
- `POST /tasks`
- `PATCH /tasks/:id`
- `PATCH /tasks/:id/status`
- `DELETE /tasks/:id`
- Entregas:
  - `POST /tasks/:id/deliver`
  - `PATCH /tasks/:id/deliver/:entregaId`
  - `POST /tasks/:id/approve`
  - `POST /tasks/:id/reject`
- Subetapas:
  - `POST /tasks/:id/subtasks`
  - `PATCH /tasks/:id/subtasks/:subtaskId`
  - `DELETE /tasks/:id/subtasks/:subtaskId`
- Checklist:
  - `PATCH /tasks/:id/checklist`
  - `POST /tasks/:id/checklist/:index/submit` (suporta `?subitemIndex=0..n`)
  - `PATCH /tasks/:id/checklist/:index/review` (suporta `?subitemIndex=0..n`)

**Stock** (`backend/src/modules/stock/stock.controller.ts`)
- Itens:
  - `GET /stock/items`
  - `POST /stock/items`
  - `PATCH /stock/items/:id`
  - `DELETE /stock/items/:id`
  - `POST /stock/items/batch-delete`
  - `POST /stock/items/import-sheet`
- Compras e fluxos relacionados:
  - `GET /stock/purchases`
  - `GET /stock/purchases/signatures/alerts` (alertas de assinatura / mês)
  - `GET /stock/books/isbn/:isbn`
  - `GET /stock/pago-por-metodos` / `POST /stock/pago-por-metodos`
  - `POST /stock/purchases`
  - `POST /stock/purchases/curadoria-register`
  - `POST /stock/purchases/import-xlsx` / `POST /stock/purchases/import-sheet`
  - `PATCH /stock/purchases/:id/status`
  - `PATCH /stock/purchases/batch-acaminho`
  - `PATCH /stock/purchases/tags/apply` / `PATCH /stock/purchases/tags/remove`
  - `PATCH /stock/purchases/:id`
  - `PATCH /stock/purchases/:id/signatures/confirm-month`
  - `DELETE /stock/purchases/:id`
  - `POST /stock/purchases/batch-delete`
  - `POST /stock/purchases/:id/approve` / `POST /stock/purchases/:id/revise-approval` / `POST /stock/purchases/:id/reject`
- Alocações:
  - `GET /stock/alocacoes`
  - `POST /stock/alocacoes`
  - `PATCH /stock/alocacoes/:id`
  - `DELETE /stock/alocacoes/:id`

**Curadoria** (`backend/src/modules/curadoria/curadoria.controller.ts`, prefixo `/curadoria`)
- Orçamentos: `GET/POST/PATCH/DELETE /curadoria/orcamentos`, `GET /curadoria/orcamentos/:id`
- Itens do orçamento: `POST/PATCH/DELETE /curadoria/orcamentos/:id/itens/...`
- Estoque e ISBN: `GET /curadoria/estoque`, `DELETE /curadoria/estoque/:isbn`, `GET /curadoria/estoque/:isbn/cotacoes`, `GET /curadoria/books/isbn/:isbn`
- Importação: `POST /curadoria/orcamentos/import-xlsx`

**Galpão** (`backend/src/modules/galpao/galpao.controller.ts`, prefixo `/galpao`)
- Produtos: `GET/POST/PATCH/DELETE /galpao/produtos`
- Livros: entradas, alocação, baixa, avaria sob `/galpao/produtos/:id/livros/...` e rotas agregadas (`/galpao/livros-disponiveis`, `/galpao/livros-alocados`, relatórios de avaria, etc.)
- Outros itens: rotas espelhadas em `/galpao/.../outros-itens/...`

**Setores** (`backend/src/modules/setores/setores.controller.ts`, prefixo `/setores`)
- `GET /setores/options`
- `GET/POST/PATCH/DELETE /setores` e `GET/PATCH/DELETE /setores/:id`
- `PATCH /setores/:id/members`

**Suppliers** (`backend/src/modules/suppliers/suppliers.controller.ts`)
- `GET /suppliers` / `GET /suppliers/all`
- `POST /suppliers`
- `PATCH /suppliers/:id`
- `PATCH /suppliers/:id/toggle-active`
- `DELETE /suppliers/:id`
- `GET /suppliers/cnpj/:cnpj`

**Categories** (`backend/src/modules/categories/categories.controller.ts`)
- `GET /categories` / `GET /categories/all`
- `POST /categories`
- `PATCH /categories/:id`
- `PATCH /categories/:id/toggle-active`
- `DELETE /categories/:id`

**Requests** (`backend/src/modules/requests/requests.controller.ts`)
- `POST /requests`
- `GET /requests/sent`
- `GET /requests/received`
- `GET /requests/:id`
- `POST /requests/:id/respond`
- `DELETE /requests/:id`

#### Checklist/Subitens (detalhes importantes)
- O checklist é persistido em `Etapa.checklistJson` (JSON).
- Entregas do checklist são persistidas em `ChecklistItemEntrega` com unicidade por:
  - **(etapaId, checklistIndex, subitemIndex)**
- O envio de arquivos do checklist trabalha com arrays:
  - `imagensUrls` e `documentosUrls` (JSON)
  - reenvios **mesclam** (acrescentam) ao invés de substituir.

### Mapa do Frontend (como o `frontend/` funciona)

#### Visão rápida
- **Framework**: React + Vite + TypeScript + Tailwind
- **Páginas (rotas)**: ficam em `frontend/src/pages/`
- **Layout**: `frontend/src/components/layout/AppLayout.tsx` (Sidebar + Header)
- **Proteção**: `frontend/src/components/ProtectedRoute.tsx`
- **Estado (auth)**: Zustand em `frontend/src/store/auth.ts` (persist em `localStorage`)
- **API**: Axios em `frontend/src/services/api.ts` (interceptors com JWT)
- **Erros/Toast**: `frontend/src/utils/toast.ts` (`formatApiError()` + `toast.*`)

#### Arquivos-chave
- **Entrypoints**:
  - `frontend/src/main.tsx`
  - `frontend/src/App.tsx`
- **Rotas** (ver `frontend/src/App.tsx`):
  - `/login` (pública)
  - Demais rotas protegidas por `<ProtectedRoute />` dentro de `<AppLayout />`, incluindo: `/dashboard`, `/projects`, `/projects/import`, `/projects/:id`, `/tasks/my`, `/stock`, `/curadoria`, `/curadoria/:id`, `/galpao`, `/galpao/:id`, `/communications`, `/notifications`, `/users`, `/cargos`, `/setores`, `/suppliers`, `/categories`
  - `/requests` → redireciona para `/communications`
- **Permissões de navegação**:
  - `frontend/src/utils/getFirstAllowedPage.ts` (primeira página permitida por cargo)
  - `AppLayout` também impede acesso a páginas fora de `paginasPermitidas`

#### Comunicação com o backend (padrão)
- O cliente HTTP é `frontend/src/services/api.ts`:
  - `baseURL`: se `VITE_API_URL` estiver **vazio** ou for **`/api`**, em **desenvolvimento** usa `http://localhost:3000`; em **produção** usa `/api` (proxy Nginx no mesmo domínio). Caso contrário, usa o valor definido em `VITE_API_URL`.
  - **Request interceptor**: injeta `Authorization: Bearer <token>` a partir do `authStore`
  - **Response interceptor**: em **401**, faz logout e redireciona para `/login` (**403** não desloga)

#### Onde ficam as “partes” do sistema
- **Projetos**: `frontend/src/pages/Projects.tsx`, `frontend/src/pages/ProjectDetails.tsx`, `frontend/src/pages/ImportProjects.tsx`
- **Meu Trabalho (tarefas)**: `frontend/src/pages/MyTasks.tsx`
- **Compras & Estoque**: `frontend/src/pages/Stock.tsx` + hooks em `frontend/src/hooks/`
  - Dados: `frontend/src/hooks/useStockData.ts`
  - Filtros/ordenação: `frontend/src/hooks/usePurchaseFilters.ts`
  - Componentes: `frontend/src/components/stock/*` (inclui `modals/`, tabelas, PDF em `frontend/src/utils/purchaseReportPdf.ts`)
- **Curadoria**: `frontend/src/pages/Curadoria.tsx`, `frontend/src/pages/CuradoriaBudgetDetails.tsx`
- **Galpão**: `frontend/src/pages/Galpao.tsx`, `frontend/src/pages/GalpaoProdutoDetails.tsx`
- **Comunicações**: `frontend/src/pages/Communications.tsx` (ocorrências + requerimentos)
- **Setores**: `frontend/src/pages/Setores.tsx`
- **Notificações**: `frontend/src/pages/NotificationsPage.tsx`

### Padrões de Arquitetura

- **Backend**: Arquitetura modular (NestJS Modules)
- **Frontend**: Component-based architecture (React)
- **Estado**: Zustand para estado global, useState para estado local
- **Roteamento**: React Router com rotas protegidas
- **API**: RESTful com DTOs validados
- **Banco**: Relacional com Prisma ORM

---

## 📦 Pré-requisitos

### Para Desenvolvimento Local
- **Node.js** 20+ ([Download](https://nodejs.org/))
- **PostgreSQL** 15+ ([Download](https://www.postgresql.org/download/))
- **npm** ou **yarn**
- **Git**

### Para Docker
- **Docker** 20+ ([Download](https://www.docker.com/get-started))
- **Docker Compose** 2.0+

### Recomendado
- **VS Code** com extensões:
  - ESLint
  - Prettier
  - Prisma
  - Tailwind CSS IntelliSense

---

## 🚀 Instalação e Configuração

### Opção 1: Docker (Recomendado para Produção)

1. **Clone o repositório**:
```bash
git clone <repository-url>
cd ERP-Globaltec-main
```

2. **Configure as variáveis de ambiente**:
```powershell
Copy-Item env.example .env
# Edite o .env com suas configurações (opcional)
```

3. **Inicie os serviços**:
```powershell
docker-compose up -d --build
```

4. **Migrações e seed**: o serviço `backend` no `docker-compose.yml` já executa `prisma migrate deploy` e tenta `db seed` na subida. Se precisar rodar manualmente:
```powershell
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npx prisma db seed
```

5. **Acesse a aplicação**:
- Frontend: http://localhost:5174
- Backend: http://localhost:3001
- Health Check: http://localhost:3001/health

**Ver logs**:
```powershell
docker-compose logs -f
```

**Parar serviços**:
```powershell
docker-compose down
```

### Opção 2: Desenvolvimento Local

#### 1. Configurar Banco de Dados PostgreSQL

**Opção A: Usar Docker apenas para o banco**:
```powershell
docker-compose up db -d
```

**Opção B: PostgreSQL local**:
```sql
-- Conecte ao PostgreSQL (psql -U postgres)
CREATE DATABASE erpdb;
CREATE USER erp WITH PASSWORD 'senha123';
GRANT ALL PRIVILEGES ON DATABASE erpdb TO erp;
\c erpdb
GRANT ALL ON SCHEMA public TO erp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO erp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO erp;
```

#### 2. Configurar Backend

```powershell
cd backend

# Instalar dependências
npm install

# Criar arquivo .env
# Copie o conteúdo abaixo:
# DATABASE_URL="postgresql://erp:senha123@localhost:5432/erpdb"
# JWT_SECRET="troque-este-segredo-por-um-seguro"
# PORT=3000

# Gerar cliente Prisma
npm run prisma:generate

# Executar migrações
npm run prisma:migrate

# Popular banco com dados de exemplo (opcional)
npm run prisma:seed

# Iniciar servidor de desenvolvimento
npm run start:dev
```

#### 3. Configurar Frontend

```powershell
cd frontend

# Instalar dependências
npm install

# Criar arquivo .env
# Copie o conteúdo abaixo:
# VITE_API_URL=http://localhost:3000

# Iniciar servidor de desenvolvimento
npm run dev
```

#### 4. Acessar a Aplicação

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health Check: http://localhost:3000/health

### Credenciais Padrão (após seed)

- **Administrador**: `admin@globaltec.com` / `admin123`
- **Supervisor**: `supervisor@globaltec.com` / `senha123`
- **Executor**: `executor@globaltec.com` / `senha123`
- **Cotador**: `cotador@globaltec.com` / `senha123`
- **Pagador**: `pagador@globaltec.com` / `senha123`

---

## 📖 Uso

### Autenticação

1. Acesse a página de login
2. Informe email e senha
3. O sistema redireciona automaticamente para a primeira página permitida ao seu cargo

### Navegação

O sistema possui um menu lateral (Sidebar) que filtra automaticamente as opções baseado no cargo e nas **permissões** configuradas:

- **Dashboard**: Visão geral (conforme permissões)
- **Projetos**: Gestão e importação de projetos
- **Meu Trabalho**: Tarefas atribuídas
- **Compras & Estoque**: Estoque, compras, assinaturas e fluxos relacionados
- **Curadoria**: Orçamentos e estoque de curadoria
- **Galpão**: Produtos, livros e movimentações de galpão
- **Comunicações**: Ocorrências e requerimentos na mesma área (`/communications`)
- **Notificações**: Centro de notificações
- **Usuários**: Gestão de usuários
- **Cargos**: Cargos e permissões
- **Setores**: Setores e membros
- **Fornecedores**: Cadastro de fornecedores
- **Categorias**: Categorias de compra (inclui opções para assinatura/recorrência)

### Funcionalidades Principais

#### Criar Projeto
1. Acesse "Projetos"
2. Clique em "Novo Projeto"
3. Preencha os dados (nome, valores, supervisor, responsáveis)
4. Salve

#### Criar Compra
1. Acesse "Compras & Estoque" → aba "Compras"
2. Clique em "Nova Compra"
3. Selecione projeto, preencha item e quantidade
4. Adicione cotações (múltiplas opções)
5. Salve

#### Alocar Estoque
1. Acesse "Compras & Estoque" → aba "Estoque"
2. Clique em "Alocar" no item desejado
3. Selecione projeto/etapa/usuário e quantidade
4. Confirme

#### Gerar Relatório
1. Acesse "Compras & Estoque" → aba "Compras"
2. Use os filtros para selecionar as compras desejadas
3. Clique em "Gerar Relatório"
4. Escolha entre PDF ou Excel

---

## 📁 Estrutura do Projeto

### Backend (`backend/`)

```
backend/
├── src/
│   ├── modules/              # Módulos de domínio
│   │   ├── auth/            # Autenticação JWT
│   │   ├── users/           # Gestão de usuários
│   │   ├── cargos/          # Gestão de cargos
│   │   ├── projects/        # Gestão de projetos
│   │   ├── tasks/           # Gestão de etapas/tarefas
│   │   ├── stock/           # Estoque e compras
│   │   ├── suppliers/       # Fornecedores
│   │   ├── categories/      # Categorias
│   │   ├── occurrences/     # Ocorrências
│   │   ├── requests/        # Requerimentos
│   │   ├── notifications/   # Notificações
│   │   ├── curadoria/       # Curadoria
│   │   ├── setores/         # Setores
│   │   └── galpao/          # Galpão
│   ├── common/              # Recursos compartilhados
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── permissions.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── guards/
│   │   │   └── roles.guard.ts
│   │   └── health.controller.ts
│   ├── prisma/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   └── main.ts              # Entry point
├── prisma/
│   ├── schema.prisma        # Schema do banco
│   ├── migrations/          # Histórico de migrações
│   └── seed.ts              # Dados iniciais
├── package.json
├── tsconfig.json
└── Dockerfile
```

### Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── pages/               # Páginas da aplicação
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Projects.tsx
│   │   ├── ProjectDetails.tsx
│   │   ├── ImportProjects.tsx
│   │   ├── MyTasks.tsx
│   │   ├── Stock.tsx
│   │   ├── Communications.tsx
│   │   ├── Curadoria.tsx
│   │   ├── CuradoriaBudgetDetails.tsx
│   │   ├── Galpao.tsx
│   │   ├── GalpaoProdutoDetails.tsx
│   │   ├── NotificationsPage.tsx
│   │   ├── Users.tsx
│   │   ├── Cargos.tsx
│   │   ├── Setores.tsx
│   │   ├── Suppliers.tsx
│   │   └── Categories.tsx
│   ├── components/         # Componentes reutilizáveis
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── stock/
│   │   │   ├── modals/
│   │   │   ├── filters/
│   │   │   └── tables/
│   │   ├── ProtectedRoute.tsx
│   │   ├── Notifications.tsx
│   │   └── ToastContainer.tsx
│   ├── hooks/              # Hooks customizados
│   │   ├── useStockData.ts
│   │   └── usePurchaseFilters.ts
│   ├── services/
│   │   └── api.ts          # Cliente Axios
│   ├── store/
│   │   └── auth.ts         # Estado de autenticação
│   ├── types/              # Tipos TypeScript
│   │   ├── stock.ts
│   │   └── types.ts
│   ├── utils/              # Utilitários
│   │   ├── validation.ts
│   │   ├── toast.ts
│   │   ├── getFirstAllowedPage.ts
│   │   └── purchaseReportPdf.ts
│   ├── constants/          # Constantes
│   │   └── stock.ts
│   ├── App.tsx             # Componente raiz
│   └── main.tsx            # Entry point
├── package.json
├── vite.config.ts
├── tailwind.config.cjs
└── Dockerfile
```

---

## 🔐 Sistema de Permissões

### Cargos e permissões

Os **cargos** (`Cargo`) possuem níveis (`NIVEL_0` … `NIVEL_4`) e um conjunto de **permissões** (`Permission` / `CargoPermission`) que definem o que cada usuário pode fazer e quais itens do menu aparecem. Exemplos típicos de perfil:

1. **DIRETOR** (NIVEL_4): visão ampla do sistema (dashboard, projetos, usuários, cargos, etc.), conforme permissões atribuídas ao cargo no banco.
2. **SUPERVISOR** (NIVEL_3): acompanhamento de projetos e etapas, aprovações, comunicações.
3. **EXECUTOR** (NIVEL_2): execução de tarefas, entregas, comunicações.
4. **COTADOR** / **PAGADOR** (NIVEL_1): fluxos de compras, estoque e pagamentos, com escopos distintos definidos nas permissões do cargo.

Para o detalhamento exato de cada rota, use o decorator `@Permissions(...)` nos controllers do backend e os registros de `CargoPermission` após o seed.

### Implementação

**Backend**:
- Guards: `JwtAuthGuard` (autenticação) + `RolesGuard` (autorização por permissões)
- Decorator: `@Permissions('recurso:acao', ...)` nas rotas; permissões vinculadas ao cargo no banco
- `@CurrentUser()` para obter usuário do JWT

**Frontend**:
- Sidebar filtra links baseado no cargo
- `ProtectedRoute` verifica autenticação
- Redirecionamento para primeira página permitida

---

## 🌐 API e Endpoints

### Autenticação

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| POST | `/auth/login` | Login | Público |
| POST | `/auth/register` | Registro | Público |

### Projetos

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/projects` | Listar projetos | DIRETOR |
| GET | `/projects/:id` | Detalhes do projeto | Autenticado |
| POST | `/projects` | Criar projeto | DIRETOR |
| PATCH | `/projects/:id` | Atualizar projeto | DIRETOR |
| PATCH | `/projects/:id/finalize` | Finalizar projeto | DIRETOR |
| PATCH | `/projects/:id/responsibles` | Atualizar responsáveis | DIRETOR |
| POST | `/projects/import` | Importar projetos via Excel | DIRETOR |

### Tarefas/Etapas

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/tasks/my` | Minhas tarefas | Autenticado |
| POST | `/tasks/:id/deliver` | Entregar tarefa | EXECUTOR+ |
| POST | `/tasks/:id/approve` | Aprovar entrega | SUPERVISOR+ |
| POST | `/tasks/:id/reject` | Rejeitar entrega | SUPERVISOR+ |
| PATCH | `/tasks/:id/checklist` | Atualizar checklist da etapa | Autenticado (executor/integrante) |
| POST | `/tasks/:id/checklist/:index/submit` | Enviar entrega de objetivo/subobjetivo | Autenticado (executor/integrante) |
| PATCH | `/tasks/:id/checklist/:index/review` | Revisar objetivo/subobjetivo | SUPERVISOR+ |

### Estoque e Compras

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/stock/items` | Listar itens | `@Permissions` no controller |
| POST | `/stock/items` | Criar item | idem |
| POST | `/stock/items/batch-delete` | Exclusão em lote de itens | idem |
| POST | `/stock/items/import-sheet` | Importar estoque (planilha) | idem |
| GET | `/stock/purchases` | Listar compras | idem |
| GET | `/stock/purchases/signatures/alerts` | Alertas de assinatura | idem |
| POST | `/stock/purchases` | Criar compra | idem |
| POST | `/stock/purchases/import-xlsx` | Importar compras (XLSX) | idem |
| PATCH | `/stock/purchases/batch-acaminho` | Marcar várias como COMPRADO_ACAMINHO | idem |
| PATCH | `/stock/purchases/tags/apply` / `.../remove` | Tags nas compras | idem |
| PATCH | `/stock/purchases/:id/signatures/confirm-month` | Confirmar mês de assinatura | idem |
| POST | `/stock/purchases/:id/revise-approval` | Revisar aprovação | idem |
| POST | `/stock/alocacoes` | Alocar estoque | idem |
| POST | `/stock/purchases/:id/approve` | Aprovar compra | idem |
| POST | `/stock/purchases/:id/reject` | Rejeitar compra | idem |

*(Lista completa de rotas de estoque na seção [Rotas (referência rápida)](#rotas-referência-rápida).)*

### Curadoria, Galpão e Setores

| Prefixo | Exemplos | Descrição |
|---------|----------|-----------|
| `/curadoria` | `GET /curadoria/orcamentos`, `POST /curadoria/orcamentos/import-xlsx` | Orçamentos, itens e estoque de curadoria |
| `/galpao` | `GET /galpao/produtos`, `POST /galpao/produtos/:id/livros/entrada` | Galpão: produtos, livros e outros itens |
| `/setores` | `GET /setores`, `PATCH /setores/:id/members` | Setores e membros |

### Usuários

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/users` | Listar usuários | DIRETOR |
| GET | `/users/options` | Opções para select | Autenticado |
| PATCH | `/users/:id/activate` | Ativar usuário | DIRETOR |
| PATCH | `/users/:id/deactivate` | Desativar usuário | DIRETOR |
| PATCH | `/users/:id/role` | Alterar cargo | DIRETOR |

### Fornecedores

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/suppliers` | Listar fornecedores | Autenticado |
| POST | `/suppliers` | Criar fornecedor | Autenticado |
| GET | `/suppliers/cnpj/:cnpj` | Buscar por CNPJ | Autenticado |
| PATCH | `/suppliers/:id` | Atualizar fornecedor | Autenticado |
| DELETE | `/suppliers/:id` | Deletar fornecedor | Autenticado |

### Categorias

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/categories` | Listar categorias | Autenticado |
| POST | `/categories` | Criar categoria | Autenticado |
| PATCH | `/categories/:id` | Atualizar categoria | Autenticado |
| DELETE | `/categories/:id` | Deletar categoria | Autenticado |

### Ocorrências

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/occurrences/sent` | Ocorrências enviadas | Autenticado |
| GET | `/occurrences/received` | Ocorrências recebidas | Autenticado |
| POST | `/occurrences` | Criar ocorrência | Autenticado |

### Requerimentos

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/requests/sent` | Requerimentos enviados | Autenticado |
| GET | `/requests/received` | Requerimentos recebidos | Autenticado |
| POST | `/requests` | Criar requerimento | Autenticado |
| POST | `/requests/:id/respond` | Responder requerimento | Autenticado |

### Notificações

| Método | Endpoint | Descrição | Permissão |
|--------|----------|-----------|-----------|
| GET | `/notifications` | Listar notificações | Autenticado |
| PATCH | `/notifications/:id/read` | Marcar como lida | Autenticado |

---

## 🗄️ Banco de Dados

### Schema Principal

O banco de dados utiliza **PostgreSQL** com **Prisma ORM**. Principais entidades:

- **Usuario**: Usuários do sistema
- **Cargo**: Cargos, níveis e relação com **Permission** / **CargoPermission**
- **Setor** / **SetorUsuario**: Setores e membros
- **Projeto**: Projetos da empresa
- **Etapa**: Etapas dos projetos
- **Subetapa**: Subetapas das etapas
- **Compra**: Solicitações e compras (tags, pago por, assinatura, vínculo com setor)
- **MetodoPagoCompra**: Métodos reutilizáveis em “Pago por”
- **Estoque**: Itens em estoque
- **EstoqueAlocacao**: Alocações de estoque
- **CuradoriaOrcamento** / **CuradoriaItem**: Curadoria
- **GalpaoProduto** e modelos relacionados (**GalpaoProdutoLivroMovimento**, reservas, avarias, etc.): Galpão
- **Fornecedor**: Fornecedores cadastrados
- **CategoriaCompra**: Categorias de compra
- **Ocorrencia**: Ocorrências entre usuários
- **Requerimento**: Requerimentos formais
- **Notificacao**: Notificações do sistema

### Migrações

As migrações estão em `backend/prisma/migrations/`. Para criar uma nova migração:

```bash
cd backend
npx prisma migrate dev --name nome_da_migracao
```

### Seed

O arquivo `backend/prisma/seed.ts` popula o banco com dados de exemplo. Execute:

```bash
npm run prisma:seed
```

---

## 🐳 Docker

### Estrutura Docker

O projeto utiliza **Docker Compose** para orquestrar três serviços:

1. **db** (PostgreSQL): Banco de dados
2. **backend** (NestJS): API REST
3. **frontend** (React + Nginx): Interface web

### Comandos Docker

```powershell
# Iniciar todos os serviços
docker-compose up -d

# Reconstruir imagens
docker-compose build --no-cache

# Ver logs
docker-compose logs -f

# Parar serviços
docker-compose down

# Parar e remover volumes
docker-compose down -v

# Executar migrações manualmente (se necessário)
docker-compose exec backend npx prisma migrate deploy
```

### Variáveis de Ambiente (Docker)

Configure no arquivo `.env` na raiz:

```env
# PostgreSQL
POSTGRES_USER=erp
POSTGRES_PASSWORD=senha123
POSTGRES_DB=erpdb
POSTGRES_PORT=5432

# Backend
DATABASE_URL=postgresql://erp:senha123@db:5432/erpdb
JWT_SECRET=super-segredo-alterar-em-producao
JWT_EXPIRES_IN=7d
BACKEND_PORT=3001
NODE_ENV=production

# Frontend (Docker local: aponte para o host que o navegador usa para a API)
VITE_API_URL=http://localhost:3001
FRONTEND_PORT=5174
```

### Observações importantes (Docker)

- **Uploads**: o `docker-compose.yml` monta o volume **`/var/erp-uploads:/app/uploads`** no backend. Em **Windows/macOS** esse caminho absoluto de Linux pode falhar; ajuste para uma pasta local (ex. `./uploads:/app/uploads`) ou crie o diretório esperado na máquina de deploy (VPS/Linux).
- **API no navegador**: com o frontend em Docker, `VITE_API_URL` é embutida no **build**. Para o browser acessar o backend no host, use `http://localhost:3001` (ou o host/IP correto). Em produção com Nginx no mesmo domínio, prefira `VITE_API_URL` vazio ou `/api` e configure o proxy conforme `deploy/nginx-erp.conf` e `env.example`.
- **Desenvolvimento sem Docker**: backend costuma usar porta **3000** (`PORT` no `.env` do backend); frontend Vite em **5173**. O `api.ts` já trata `VITE_API_URL` vazio em modo dev com fallback para `http://localhost:3000`.

---

## 💻 Desenvolvimento

### Scripts Disponíveis

#### Backend

```bash
npm run build          # Compilar TypeScript
npm run start          # Iniciar em produção
npm run start:dev      # Iniciar em desenvolvimento (watch)
npm run lint           # Executar ESLint
npm run prisma:generate # Gerar Prisma Client
npm run prisma:migrate # Criar/executar migrações
npm run prisma:seed    # Popular banco com seed
npm run db:setup       # Setup completo (generate + migrate + seed)
```

#### Frontend

```bash
npm run dev            # Servidor de desenvolvimento
npm run build          # Build para produção
npm run preview        # Preview da build
```

### Convenções de Código

- **TypeScript**: Tipagem estrita habilitada
- **ESLint**: Configurado para React e NestJS
- **Prettier**: Formatação automática
- **Nomenclatura**:
  - Componentes: PascalCase (`UserCard.tsx`)
  - Funções/Variáveis: camelCase (`getUserData`)
  - Constantes: UPPER_SNAKE_CASE (`API_BASE_URL`)
  - Tipos/Interfaces: PascalCase (`UserData`)

### Estrutura de Commits

```
feat: adiciona funcionalidade de relatórios
fix: corrige erro de validação em compras
refactor: reorganiza componentes de estoque
docs: atualiza README com novas instruções
style: ajusta formatação do código
test: adiciona testes para módulo de usuários
chore: atualiza dependências
```

---

## 🔧 Troubleshooting

### Erro: "Cannot find module"
```bash
# Backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Erro: "PrismaClient is not configured"
```bash
cd backend
npm run prisma:generate
```

### Erro: "Database connection failed"
1. Verifique se PostgreSQL está rodando
2. Confirme `DATABASE_URL` no `.env`
3. Teste conexão: `psql -U erp -d erpdb`

### Erro: "Port already in use"
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### Erro no Docker: "Container keeps restarting"
```bash
# Ver logs detalhados
docker-compose logs backend

# Verificar health check
docker-compose ps
```

### Erro: "JWT token expired"
- Faça logout e login novamente
- Ajuste `JWT_EXPIRES_IN` no `.env` (ex.: `7d`, `30d`) se precisar sessão mais longa

### Frontend não conecta ao backend
1. Verifique `VITE_API_URL` no `.env` do frontend
2. Confirme que backend está rodando
3. Verifique CORS no backend (deve permitir origem do frontend)

---

## 🤝 Contribuindo

1. **Fork** o projeto
2. **Crie** uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** suas mudanças (`git commit -m 'feat: Adiciona AmazingFeature'`)
4. **Push** para a branch (`git push origin feature/AmazingFeature`)
5. **Abra** um Pull Request

### Checklist para Pull Requests

- [ ] Código segue as convenções do projeto
- [ ] Testes passam localmente
- [ ] Documentação atualizada (se necessário)
- [ ] Sem erros de lint
- [ ] Commits seguem o padrão de mensagens

---

## 📄 Licença

Este projeto é privado e de uso interno da Globaltec.

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte a documentação em `CONFIGURACAO_AMBIENTES.md`
2. Veja `backend/COMO_CONFIGURAR_BANCO.md` para problemas de banco
3. Verifique `ANALISE_MVP.md` para funcionalidades implementadas

---

**Desenvolvido com ❤️ pela equipe Globaltec**
