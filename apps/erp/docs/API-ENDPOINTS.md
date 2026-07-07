# API HTTP do backend ERP (NestJS)

Documentação dos endpoints expostos pelo backend para integração externa e referência do frontend.

**Base URL (backend direto):** `http://localhost:3000` — porta em `PORT` no `.env` do backend.

**Prefixo global:** não há `setGlobalPrefix`; os caminhos abaixo são relativos à raiz do servidor Nest.

**Versão:** sincronizado com os controllers em `backend/src/modules` (atualizar ao alterar rotas).

---

## Formas de acesso à API

| Ambiente | URL que o cliente usa | Observação |
|----------|----------------------|------------|
| **Dev local (Vite)** | `http://localhost:5173/api/...` | Proxy Vite reescreve `/api` → backend (`vite.config.ts`). `VITE_API_URL=/api` no frontend. |
| **Backend direto** | `http://localhost:3000/...` | Swagger/Postman, integrações na mesma máquina. |
| **Produção (VPS)** | `https://seu-dominio/api/...` | Nginx faz proxy `/api/` → backend (ver `deploy/nginx-erp.conf`). |

Arquivos estáticos:

| Caminho | Descrição |
|---------|-----------|
| `/uploads/...` | Arquivos públicos (proxy Vite em dev; Nginx → backend em prod). |
| `/uploads-protegido/:tipo/:filename` | Arquivos sensíveis (RH/ponto/afastamentos) — **JWT obrigatório** + regra de dono/permissão. |

---

## Convenções

| Item | Detalhe |
|------|---------|
| **JSON** | `Content-Type: application/json` (salvo upload/multipart). |
| **Validação** | `ValidationPipe` global; campos extras no DTO podem gerar erro. |
| **CORS** | Origens em `CORS_ORIGINS` (prod); liberado em dev. |
| **Rate limit** | `POST /auth/login` (5/min) e `POST /auth/register` (3/h) por IP. |
| **Token renovado** | Algumas rotas podem devolver header `x-renewed-token`. |

---

## Autenticação e autorização

### Sem JWT (público)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/health` | Saúde do serviço. |
| `POST` | `/auth/login` | Corpo: `LoginDto` (`email`, `senha`). Resposta: **`token`** (JWT) e **`user`**. |
| `POST` | `/auth/register` | Registro de usuário. |
| `GET` | `/push/vapid-public-key` | Chave VAPID para Web Push. |
| `GET` | `/rh/comprovante/conferir/:comprovanteId` | HTML público de conferência de comprovante de ponto (QR). |

### Com JWT

```http
Authorization: Bearer <token>
```

O token é o campo **`token`** de `POST /auth/login`.

### `RolesGuard` e `@Permissions`

- Rotas com `@Permissions(...)` exigem **qualquer uma** das permissões listadas no JWT.
- `sistema:administrar` concede acesso total.
- Sem `@Permissions` na rota: basta JWT válido (ex.: `GET /tasks/my`, `GET /notifications`).
- Validações adicionais podem ocorrer no **service** (escopo por projeto, dono do registro, etc.).

Módulos com **apenas** `JwtAuthGuard` (sem `RolesGuard`): `uploads`.

---

## Fluxo sugerido para API externa / BI

1. `POST /auth/login` com usuário de serviço (permissões de leitura necessárias).
2. Guardar `token` com segurança; renovar ao receber **401**.
3. Consumir endpoints `GET` (e exports XLSX/CSV quando aplicável).
4. Respeitar escopo: projetos/tarefas filtram por participação e permissões do usuário.

---

## Leituras úteis para relatórios (resumo)

| Área | Endpoints principais |
|------|---------------------|
| **Compras / assinaturas** | `GET /stock/purchases`, `GET /stock/purchases/signatures/alerts`, `GET /stock/purchases/signatures/report`, `GET /stock/alocacoes`, `GET /stock/items` |
| **Projetos** | `GET /projects`, `GET /projects/options`, `GET /projects/export`, `GET /projects/:id`, `GET /projects/:id/export`, `GET /projects/tasks-em-analise` |
| **Tarefas** | `GET /tasks/my?status=&projetoId=` |
| **Galpão** | `GET /galpao/livros-alocados`, `GET /galpao/livros/avarias-relatorio`, `GET /galpao/livros-disponiveis`, `GET /galpao/produtos` |
| **Curadoria** | `GET /curadoria/orcamentos`, `GET /curadoria/estoque`, `GET /curadoria/orcamentos/:id` |
| **Financeiro** | `GET /financeiro/resumo`, `GET /financeiro/pagamentos-mensais?mes=`, `GET /financeiro/projetos` |
| **RH** | `GET /rh/indicadores`, `GET /rh/espelho`, `GET /rh/ponto/exportar`, `GET /rh/afd/exportar`, `GET /rh/folha/exportar` |
| **Cadastros** | `GET /categories`, `GET /suppliers`, `GET /setores`, `GET /users`, `GET /cargos` |
| **Calendário** | `GET /calendario/eventos` |
| **Notificações** | `GET /notifications?unread=true` |

---

## Tabela completa de endpoints

Legenda: **Auth** = `JWT` | `JWT+Roles` | `nenhum`. **Perm.** = permissões quando há `@Permissions` (basta uma).

### Raiz

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/health` | nenhum | — |

### `auth`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `POST` | `/auth/login` | nenhum | Throttle 5/min |
| `POST` | `/auth/register` | nenhum | Throttle 3/h |
| `GET` | `/auth/me` | JWT | Perfil completo do usuário autenticado (sync no startup do front) |

### `stock`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/stock/items` | JWT+Roles | `estoque:visualizar`, `estoque:movimentar`, `setores:visualizar`, `setores:editar`, `setores:gerenciar`; query `search` |
| `POST` | `/stock/items` | JWT+Roles | `estoque:criar`, `estoque:movimentar` |
| `PATCH` | `/stock/items/:id` | JWT+Roles | `estoque:movimentar` |
| `DELETE` | `/stock/items/:id` | JWT+Roles | `estoque:excluir`, `estoque:movimentar` |
| `POST` | `/stock/items/batch-delete` | JWT+Roles | `estoque:excluir`, `estoque:movimentar` |
| `POST` | `/stock/items/import-sheet` | JWT+Roles | `estoque:criar`, `estoque:movimentar` (multipart) |
| `POST` | `/stock/items/export-sheet` | JWT+Roles | `estoque:visualizar`, `estoque:movimentar` — body `ids[]` |
| `GET` | `/stock/purchases` | JWT+Roles | `compras:visualizar`, `compras:solicitar`, `compras:aprovar`, `trabalhos:visualizar`; queries: `status`, `projetoId`, `etapaId`, `excludeSolicitado`, `mesReferenciaAssinatura` |
| `GET` | `/stock/purchases/signatures/alerts` | JWT+Roles | idem; query `mesReferencia` |
| `GET` | `/stock/purchases/signatures/report` | JWT+Roles | query `mesReferencia` (YYYY-MM), opc. `projetoId`, `setorId`, `categoriaId` |
| `GET` | `/stock/books/isbn/:isbn` | JWT+Roles | idem compras |
| `GET` | `/stock/pago-por-metodos` | JWT+Roles | idem |
| `POST` | `/stock/pago-por-metodos` | JWT+Roles | `compras:solicitar`, `compras:aprovar` |
| `POST` | `/stock/purchases` | JWT+Roles | idem |
| `POST` | `/stock/purchases/curadoria-register` | JWT+Roles | idem |
| `POST` | `/stock/purchases/import-xlsx` | JWT+Roles | multipart |
| `POST` | `/stock/purchases/import-sheet` | JWT+Roles | multipart |
| `PATCH` | `/stock/purchases/:id/status` | JWT+Roles | `compras:aprovar` |
| `PATCH` | `/stock/purchases/batch-acaminho` | JWT+Roles | `compras:aprovar` |
| `PATCH` | `/stock/purchases/tags/apply` | JWT+Roles | `compras:solicitar`, `compras:aprovar` |
| `PATCH` | `/stock/purchases/tags/remove` | JWT+Roles | idem |
| `PATCH` | `/stock/purchases/:id` | JWT+Roles | idem |
| `PATCH` | `/stock/purchases/:id/signatures/confirm-month` | JWT+Roles | idem |
| `PATCH` | `/stock/purchases/:id/signatures/month-entry` | JWT+Roles | NF/comprovante por mês (assinatura) |
| `DELETE` | `/stock/purchases/:id` | JWT+Roles | `compras:excluir`, `compras:solicitar`, `compras:aprovar` |
| `POST` | `/stock/purchases/batch-delete` | JWT+Roles | idem |
| `POST` | `/stock/purchases/:id/approve` | JWT+Roles | `compras:aprovar` |
| `POST` | `/stock/purchases/:id/revise-approval` | JWT+Roles | idem |
| `POST` | `/stock/purchases/:id/reject` | JWT+Roles | idem |
| `POST` | `/stock/alocacoes` | JWT+Roles | `estoque:movimentar`, `estoque:visualizar`, `setores:editar`, `setores:gerenciar` |
| `GET` | `/stock/alocacoes` | JWT+Roles | `estoque:visualizar`, `estoque:movimentar`, `setores:*`; queries: `estoqueId`, `projetoId`, `etapaId`, `usuarioId`, `setorId`, `contextSetorId` |
| `PATCH` | `/stock/alocacoes/:id` | JWT+Roles | `estoque:movimentar`, `setores:editar`, `setores:gerenciar` |
| `PATCH` | `/stock/alocacoes/:id/reassign` | JWT+Roles | idem — realoca destino |
| `DELETE` | `/stock/alocacoes/:id` | JWT+Roles | idem |

### `projects`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/projects/options` | JWT+Roles | Escopo pelo ator; query opc. `todas` |
| `GET` | `/projects` | JWT+Roles | `projetos:visualizar`, `projetos:editar`, `projetos:aprovar`; `status`, `search` |
| `GET` | `/projects/tasks-em-analise` | JWT+Roles | `projetos:visualizar`, `projetos:editar`, `projetos:aprovar`, `trabalhos:avaliar` |
| `GET` | `/projects/export` | JWT+Roles | XLSX |
| `GET` | `/projects/:id/export` | JWT+Roles | XLSX um projeto |
| `POST` | `/projects/:id/sessoes` | JWT+Roles | `projetos:editar` |
| `PATCH` | `/projects/:id/sessoes/:sessaoId` | JWT+Roles | idem |
| `DELETE` | `/projects/:id/sessoes/:sessaoId` | JWT+Roles | idem, 204 |
| `GET` | `/projects/:id` | JWT+Roles | Detalhe (etapas, sessões, abas, checklist, entregas) |
| `POST` | `/projects` | JWT+Roles | `projetos:criar` |
| `PATCH` | `/projects/:id` | JWT+Roles | `projetos:editar` |
| `PATCH` | `/projects/:id/responsibles` | JWT+Roles | idem |
| `PATCH` | `/projects/:id/etapas/reorder` | JWT+Roles | idem |
| `PATCH` | `/projects/:id/abas/rename` | JWT+Roles | idem |
| `PATCH` | `/projects/:id/abas/delete` | JWT+Roles | idem |
| `PATCH` | `/projects/:id/finalize` | JWT+Roles | `projetos:editar`, `projetos:aprovar` |
| `DELETE` | `/projects/:id` | JWT+Roles | `projetos:excluir`, 204 |
| `POST` | `/projects/import` | JWT+Roles | `projetos:importar`, multipart |
| `POST` | `/projects/:id/descricao-files` | JWT+Roles | `projetos:editar`, multipart |
| `DELETE` | `/projects/:id/descricao-files` | JWT+Roles | body `url` |

### `tasks`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/tasks/my` | JWT+Roles | Sem `@Permissions`; query `status`, `projetoId` |
| `POST` | `/tasks` | JWT+Roles | `projetos:criar`, `projetos:editar` |
| `POST` | `/tasks/uploads` | JWT+Roles | multipart — URLs em `/uploads/tasks/` |
| `PATCH` | `/tasks/:id` | JWT+Roles | `projetos:editar` |
| `PATCH` | `/tasks/:id/status` | JWT+Roles | `projetos:editar`, `projetos:aprovar` |
| `POST` | `/tasks/:id/deliver` | JWT+Roles | `trabalhos:registrar`, `trabalhos:avaliar` |
| `PATCH` | `/tasks/:id/deliver/:entregaId` | JWT+Roles | idem |
| `POST` | `/tasks/:id/approve` | JWT+Roles | Sem `@Permissions` — validação no service |
| `POST` | `/tasks/:id/reject` | JWT+Roles | idem |
| `POST` | `/tasks/:id/subtasks` | JWT+Roles | `trabalhos:registrar`, `projetos:editar` |
| `PATCH` | `/tasks/:id/subtasks/:subtaskId` | JWT+Roles | idem |
| `PATCH` | `/tasks/:id/checklist` | JWT+Roles | Sem `@Permissions` |
| `POST` | `/tasks/:id/checklist/:index/submit` | JWT+Roles | query opc. `subitemIndex` |
| `PATCH` | `/tasks/:id/checklist/:index/review` | JWT+Roles | query opc. `subitemIndex` |
| `DELETE` | `/tasks/:id/subtasks/:subtaskId` | JWT+Roles | `trabalhos:registrar`, `projetos:editar` |
| `DELETE` | `/tasks/:id` | JWT+Roles | `projetos:excluir`, `projetos:editar` |

### `galpao`

Leitura: `estoque:visualizar`, `estoque:movimentar`, `almoxarifado:visualizar`, `almoxarifado:movimentar`.  
Escrita: `estoque:movimentar` ou `almoxarifado:movimentar`.

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/galpao/produtos` | JWT+Roles | Leitura; `search` |
| `POST` | `/galpao/produtos` | JWT+Roles | Escrita |
| `PATCH` | `/galpao/produtos/:id` | JWT+Roles | Escrita |
| `DELETE` | `/galpao/produtos/:id` | JWT+Roles | Escrita |
| `GET` | `/galpao/produtos/:id/livros-disponiveis` | JWT+Roles | `search`, `categoriaId` |
| `GET` | `/galpao/livros-disponiveis` | JWT+Roles | idem |
| `GET` | `/galpao/produtos/:id/livros-reservados` | JWT+Roles | — |
| `GET` | `/galpao/livros-disponiveis-por-fornecedor` | JWT+Roles | `isbn`, opc. `categoriaId` |
| `POST` | `/galpao/produtos/:id/livros/entrada` | JWT+Roles | Escrita |
| `POST` | `/galpao/produtos/:id/livros/alocar` | JWT+Roles | Escrita |
| `POST` | `/galpao/produtos/:id/livros/baixa` | JWT+Roles | Escrita |
| `POST` | `/galpao/produtos/:id/livros/avaria` | JWT+Roles | Escrita |
| `POST` | `/galpao/livros/avaria` | JWT+Roles | Escrita global |
| `GET` | `/galpao/livros/avarias` | JWT+Roles | `isbn`, opc. `categoriaId` |
| `PATCH` | `/galpao/livros/avarias/:id` | JWT+Roles | Escrita |
| `DELETE` | `/galpao/livros/avarias/:id` | JWT+Roles | Escrita |
| `GET` | `/galpao/livros-alocados` | JWT+Roles | `search`, `categoriaId`, `produtoId` |
| `GET` | `/galpao/livros/avarias-relatorio` | JWT+Roles | idem |
| `DELETE` | `/galpao/livros-disponiveis/:isbn` | JWT+Roles | Escrita; opc. `categoriaId` |
| `GET` | `/galpao/produtos/:id/outros-itens-disponiveis` | JWT+Roles | `search` |
| `GET` | `/galpao/outros-itens-disponiveis` | JWT+Roles | `search` |
| `GET` | `/galpao/produtos/:id/outros-itens-alocados` | JWT+Roles | — |
| `POST` | `/galpao/produtos/:id/outros-itens/entrada` | JWT+Roles | Escrita |
| `POST` | `/galpao/produtos/:id/outros-itens/alocar` | JWT+Roles | Escrita |
| `POST` | `/galpao/produtos/:id/outros-itens/baixa` | JWT+Roles | Escrita |
| `POST` | `/galpao/produtos/:id/outros-itens/avaria` | JWT+Roles | Escrita |
| `GET` | `/galpao/outros-itens/:estoqueId/avarias` | JWT+Roles | — |
| `PATCH` | `/galpao/outros-itens/avarias/:id` | JWT+Roles | Escrita |
| `DELETE` | `/galpao/outros-itens/avarias/:id` | JWT+Roles | Escrita |
| `DELETE` | `/galpao/outros-itens/:estoqueId` | JWT+Roles | Escrita |
| `GET` | `/galpao/curadoria-orcamentos/a-caminho` | JWT+Roles | — |
| `POST` | `/galpao/curadoria-orcamentos/:id/marcar-entregue` | JWT+Roles | Escrita |

### `curadoria`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/curadoria/orcamentos` | JWT+Roles | `curadoria:visualizar`, `curadoria:criar`, `curadoria:editar`, `curadoria:gerenciar`; `search` |
| `GET` | `/curadoria/estoque` | JWT+Roles | idem |
| `GET` | `/curadoria/estoque/livro-avarias` | JWT+Roles | `isbn`, opc. `categoriaId` |
| `DELETE` | `/curadoria/estoque/:isbn` | JWT+Roles | `curadoria:excluir`, `curadoria:gerenciar` |
| `GET` | `/curadoria/estoque/:isbn/cotacoes` | JWT+Roles | — |
| `GET` | `/curadoria/orcamentos/:id` | JWT+Roles | — |
| `POST` | `/curadoria/orcamentos` | JWT+Roles | `curadoria:criar`, `curadoria:gerenciar` |
| `DELETE` | `/curadoria/orcamentos/:id` | JWT+Roles | query `deleteStock` |
| `PATCH` | `/curadoria/orcamentos/:id` | JWT+Roles | `curadoria:editar`, `curadoria:gerenciar` |
| `POST` | `/curadoria/orcamentos/:id/itens` | JWT+Roles | idem |
| `PATCH` | `/curadoria/orcamentos/:id/itens/:itemId` | JWT+Roles | idem |
| `DELETE` | `/curadoria/orcamentos/:id/itens/:itemId` | JWT+Roles | idem |
| `POST` | `/curadoria/orcamentos/import-xlsx` | JWT+Roles | multipart |
| `GET` | `/curadoria/books/isbn/:isbn` | JWT+Roles | — |

### `financeiro`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/financeiro/resumo` | JWT+Roles | `financeiro:visualizar`, `financeiro:visao`, `financeiro:ponto`, `financeiro:pagamentos`, `financeiro:projetos`, `financeiro:curadoria`, `financeiro:compras` |
| `GET` | `/financeiro/ponto-planejamento` | JWT+Roles | `financeiro:visualizar`, `financeiro:ponto`, `banco_horas:ver_todos`, `banco_horas:fechar`, `jornada:configurar`; query `mes` |
| `GET` | `/financeiro/pagamentos-mensais` | JWT+Roles | `financeiro:visualizar`, `financeiro:pagamentos`, `banco_horas:ver_todos`, `banco_horas:fechar`, `jornada:configurar`; query `mes` |
| `GET` | `/financeiro/projetos` | JWT+Roles | `financeiro:visualizar`, `financeiro:projetos` |

### `users`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/users` | JWT+Roles | `usuarios:visualizar`, `usuarios:criar`, `usuarios:editar`, `usuarios:gerenciar` |
| `GET` | `/users/options` | JWT+Roles | — |
| `GET` | `/users/ranking` | JWT+Roles | — |
| `POST` | `/users` | JWT+Roles | `usuarios:criar`, `usuarios:gerenciar` |
| `PATCH` | `/users/me/profile` | JWT+Roles | — |
| `PATCH` | `/users/me/password` | JWT+Roles | — |
| `POST` | `/users/me/profile-photo` | JWT+Roles | multipart |
| `DELETE` | `/users/me/profile-photo` | JWT+Roles | — |
| `POST` | `/users/:id/profile-photo` | JWT+Roles | `usuarios:editar`, `usuarios:gerenciar` |
| `DELETE` | `/users/:id/profile-photo` | JWT+Roles | idem |
| `GET` | `/users/:id` | JWT+Roles | idem |
| `PATCH` | `/users/:id` | JWT+Roles | idem |
| `PATCH` | `/users/:id/activate` | JWT+Roles | idem |
| `PATCH` | `/users/:id/deactivate` | JWT+Roles | idem |
| `PATCH` | `/users/:id/role` | JWT+Roles | idem |
| `DELETE` | `/users/:id` | JWT+Roles | `usuarios:excluir`, `usuarios:gerenciar` |

### `cargos`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/cargos` | JWT+Roles | `usuarios:visualizar`, `usuarios:criar`, `usuarios:editar`, `usuarios:gerenciar`, `sistema:administrar` |
| `GET` | `/cargos/all` | JWT+Roles | idem |
| `GET` | `/cargos/permissions` | JWT+Roles | `usuarios:editar`, `usuarios:gerenciar`, `sistema:administrar` |
| `GET` | `/cargos/:id` | JWT+Roles | visualização/gestão |
| `POST` | `/cargos` | JWT+Roles | `usuarios:criar`, `usuarios:gerenciar` |
| `PATCH` | `/cargos/:id` | JWT+Roles | `usuarios:editar`, `usuarios:gerenciar` |
| `DELETE` | `/cargos/:id` | JWT+Roles | `usuarios:excluir`, `usuarios:gerenciar` |

### `setores`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/setores/options` | JWT+Roles | setores, projetos, compras, curadoria (várias permissões) |
| `GET` | `/setores` | JWT+Roles | `setores:visualizar`, `setores:criar`, `setores:editar`, `setores:gerenciar`; `includeInactive=true` |
| `POST` | `/setores/:id/patrimonio-material` | JWT+Roles | `setores:editar`, `setores:gerenciar` |
| `PATCH` | `/setores/:id/patrimonio-material/:itemId` | JWT+Roles | idem |
| `DELETE` | `/setores/:id/patrimonio-material/:itemId` | JWT+Roles | idem |
| `POST` | `/setores/:id/patrimonio-imaterial` | JWT+Roles | idem |
| `PATCH` | `/setores/:id/patrimonio-imaterial/:itemId` | JWT+Roles | idem |
| `DELETE` | `/setores/:id/patrimonio-imaterial/:itemId` | JWT+Roles | idem |
| `GET` | `/setores/:id` | JWT+Roles | `setores:visualizar`… |
| `POST` | `/setores` | JWT+Roles | `setores:criar`, `setores:gerenciar` |
| `PATCH` | `/setores/:id/members` | JWT+Roles | `setores:editar`, `setores:gerenciar` |
| `PATCH` | `/setores/:id` | JWT+Roles | idem |
| `DELETE` | `/setores/:id` | JWT+Roles | idem |

### `categories`

Leitura: `compras:visualizar`, `compras:solicitar`, `compras:aprovar`, `estoque:visualizar`, `estoque:movimentar`, `sistema:administrar`.  
Escrita: `compras:aprovar`, `sistema:administrar`.

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/categories` | JWT+Roles | query opc. `tipo` |
| `GET` | `/categories/all` | JWT+Roles | idem |
| `GET` | `/categories/:id` | JWT+Roles | — |
| `POST` | `/categories` | JWT+Roles | escrita |
| `PATCH` | `/categories/:id` | JWT+Roles | escrita |
| `PATCH` | `/categories/:id/toggle-active` | JWT+Roles | escrita |
| `DELETE` | `/categories/:id` | JWT+Roles | escrita |

### `suppliers`

Leitura: `compras:visualizar`, `compras:solicitar`, `compras:aprovar`, `estoque:visualizar`, `estoque:movimentar`, `sistema:administrar`.  
Escrita: `compras:solicitar`, `compras:aprovar`, `sistema:administrar`.  
Gestão (toggle/delete): `compras:aprovar`, `sistema:administrar`.

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/suppliers/cnpj/:cnpj` | JWT+Roles | escrita |
| `GET` | `/suppliers/all` | JWT+Roles | leitura |
| `GET` | `/suppliers` | JWT+Roles | leitura |
| `GET` | `/suppliers/:id` | JWT+Roles | leitura |
| `POST` | `/suppliers` | JWT+Roles | escrita |
| `PATCH` | `/suppliers/:id` | JWT+Roles | escrita |
| `PATCH` | `/suppliers/:id/toggle-active` | JWT+Roles | gestão |
| `DELETE` | `/suppliers/:id` | JWT+Roles | gestão |

### `notifications`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/notifications` | JWT+Roles | `unread=true` opcional |
| `POST` | `/notifications/mark-all-read` | JWT+Roles | — |
| `DELETE` | `/notifications/clear` | JWT+Roles | — |
| `PATCH` | `/notifications/:id/read` | JWT+Roles | — |
| `POST` | `/notifications` | JWT+Roles | `notificacoes:enviar`, `projetos:editar`, `projetos:aprovar` |

### `push`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/push/vapid-public-key` | nenhum | Chave pública VAPID |
| `POST` | `/push/subscribe` | JWT | Registra subscription Web Push |
| `DELETE` | `/push/subscribe` | JWT | Remove subscription |

### `calendario/eventos`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/calendario/eventos` | JWT+Roles | `calendario:visualizar`, `calendario:ver_todos`, `calendario:eventos` |
| `POST` | `/calendario/eventos` | JWT+Roles | `calendario:eventos` |
| `PATCH` | `/calendario/eventos/:id` | JWT+Roles | idem |
| `DELETE` | `/calendario/eventos/:id` | JWT+Roles | idem |

### `requests` (requerimentos)

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `POST` | `/requests` | JWT+Roles | — |
| `GET` | `/requests/sent` | JWT+Roles | — |
| `GET` | `/requests/received` | JWT+Roles | — |
| `GET` | `/requests/:id` | JWT+Roles | — |
| `POST` | `/requests/:id/respond` | JWT+Roles | — |
| `DELETE` | `/requests/:id` | JWT+Roles | — |

### `occurrences` (ocorrências)

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `POST` | `/occurrences` | JWT+Roles | — |
| `GET` | `/occurrences/sent` | JWT+Roles | — |
| `GET` | `/occurrences/received` | JWT+Roles | — |

### `uploads`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `POST` | `/uploads` | JWT | multipart — arquivos em `/uploads/general/` |

### `uploads-protegido`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/uploads-protegido/:tipo/:filename` | JWT+Roles | `tipo`: `docs-rh`, `afastamentos`, `ponto` — acesso por dono ou permissão RH |

---

## Módulo RH (`/rh/...`)

### `rh` (analytics / folha)

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/indicadores` | JWT+Roles | `rh_dashboard:ver`; queries: `mes`, `usuarioId`, `dataInicio`, `dataFim` |
| `GET` | `/rh/folha/exportar` | JWT+Roles | `folha:exportar`; query `mes` — CSV |

### `rh/ponto`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `POST` | `/rh/ponto/bater` | JWT+Roles | `ponto:bater` — multipart `foto` (selfie obrigatória) |
| `POST` | `/rh/ponto/bater-batch` | JWT+Roles | `ponto:bater` — sync offline |
| `GET` | `/rh/ponto/hoje` | JWT+Roles | `ponto:bater`, `ponto:ver_proprios`, `ponto:ver_todos` |
| `GET` | `/rh/ponto/meus` | JWT+Roles | idem |
| `GET` | `/rh/ponto` | JWT+Roles | `ponto:ver_todos` — listagem geral |
| `POST` | `/rh/ponto/ajuste` | JWT+Roles | `ponto:ajustar` |
| `PATCH` | `/rh/ponto/:id` | JWT+Roles | `ponto:ajustar` |
| `DELETE` | `/rh/ponto/:id` | JWT+Roles | `ponto:ajustar` |
| `GET` | `/rh/ponto/exportar` | JWT+Roles | `ponto:exportar` |
| `GET` | `/rh/ponto/:id/comprovante` | JWT+Roles | HTML do comprovante |

### `rh/comprovante` (público)

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/comprovante/conferir/:comprovanteId` | nenhum | Conferência via QR |

### `rh/jornada`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/jornada/me` | JWT+Roles | `jornada:ver_propria`, `jornada:configurar` |
| `GET` | `/rh/jornada` | JWT+Roles | `jornada:configurar`, `ponto:exportar`, `banco_horas:ver_todos`, `banco_horas:fechar` |
| `PUT` | `/rh/jornada/bulk/controle-ponto` | JWT+Roles | `jornada:configurar` |
| `GET` | `/rh/jornada/:usuarioId` | JWT+Roles | próprio ou permissões de gestão |
| `PUT` | `/rh/jornada/:usuarioId` | JWT+Roles | `jornada:configurar` |

### `rh/espelho`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/espelho` | JWT+Roles | `espelho:ver_proprio`, `espelho:ver_todos`, `ponto:exportar`, …; queries: `mes`, `dataInicio`, `dataFim`, `usuarioId` |
| `GET` | `/rh/espelho/exportar` | JWT+Roles | `espelho:exportar` — CSV |

### `rh/ferias`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/ferias/me` | JWT+Roles | `ferias:solicitar`, `ferias:aprovar` |
| `POST` | `/rh/ferias` | JWT+Roles | `ferias:solicitar` |
| `GET` | `/rh/ferias` | JWT+Roles | `ferias:aprovar` |
| `GET` | `/rh/ferias/usuario/:usuarioId` | JWT+Roles | `ferias:aprovar` |
| `POST` | `/rh/ferias/:id/aprovar` | JWT+Roles | `ferias:aprovar` |
| `POST` | `/rh/ferias/:id/reprovar` | JWT+Roles | `ferias:aprovar` |

### `rh/feriados`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/feriados` | JWT+Roles | `jornada:configurar`, `banco_horas:*`, `espelho:*`; query `ano` |
| `POST` | `/rh/feriados` | JWT+Roles | `jornada:configurar` |
| `PATCH` | `/rh/feriados/:id` | JWT+Roles | idem |
| `DELETE` | `/rh/feriados/:id` | JWT+Roles | idem |

### `rh/afastamentos`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/afastamentos/me` | JWT+Roles | `afastamentos:registrar`, `afastamentos:ver_todos` |
| `GET` | `/rh/afastamentos` | JWT+Roles | `afastamentos:ver_todos`; queries `usuarioId`, `tipo` |
| `POST` | `/rh/afastamentos` | JWT+Roles | `afastamentos:registrar` — multipart `anexo` |
| `DELETE` | `/rh/afastamentos/:id` | JWT+Roles | `afastamentos:registrar` |

### `rh/solicitacoes` (solicitações de ponto)

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `POST` | `/rh/solicitacoes` | JWT+Roles | `solicitacoes_ponto:abrir` |
| `GET` | `/rh/solicitacoes/minhas` | JWT+Roles | idem |
| `GET` | `/rh/solicitacoes` | JWT+Roles | `solicitacoes_ponto:revisar` |
| `POST` | `/rh/solicitacoes/:id/aprovar` | JWT+Roles | idem |
| `POST` | `/rh/solicitacoes/:id/reprovar` | JWT+Roles | idem |
| `DELETE` | `/rh/solicitacoes/:id` | JWT+Roles | `solicitacoes_ponto:abrir` |

### `rh/documentos`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/documentos/me` | JWT+Roles | `documentos_rh:ver_proprios`, `documentos_rh:gerenciar` |
| `GET` | `/rh/documentos/a-vencer` | JWT+Roles | `documentos_rh:gerenciar` |
| `GET` | `/rh/documentos/usuario/:usuarioId` | JWT+Roles | idem |
| `POST` | `/rh/documentos` | JWT+Roles | idem — multipart |
| `DELETE` | `/rh/documentos/:id` | JWT+Roles | idem |

### `rh/empregadores`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/empregadores` | JWT+Roles | `rh:gerenciar_empregador`, `ponto:exportar_afd`, `ponto:ver_todos` |
| `GET` | `/rh/empregadores/principal` | JWT+Roles | idem |
| `POST` | `/rh/empregadores` | JWT+Roles | `rh:gerenciar_empregador` |
| `PATCH` | `/rh/empregadores/:id` | JWT+Roles | idem |
| `DELETE` | `/rh/empregadores/:id` | JWT+Roles | idem |

### `rh/afd`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/afd/exportar` | JWT+Roles | `ponto:exportar_afd` |

### `rh/banco-horas`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/banco-horas/me` | JWT+Roles | `banco_horas:ver_proprio`, `banco_horas:ver_todos` |
| `GET` | `/rh/banco-horas/me/solicitacoes-uso-extras` | JWT+Roles | idem |
| `POST` | `/rh/banco-horas/me/solicitar-uso-extras` | JWT+Roles | idem |
| `DELETE` | `/rh/banco-horas/me/solicitacoes-uso-extras/:solicitacaoId` | JWT+Roles | idem |
| `GET` | `/rh/banco-horas/solicitacoes-uso-extras` | JWT+Roles | `banco_horas:ver_todos` |
| `POST` | `/rh/banco-horas/solicitacoes-uso-extras/:id/aprovar` | JWT+Roles | `banco_horas:aprovar_uso_extras`, `banco_horas:fechar` |
| `POST` | `/rh/banco-horas/solicitacoes-uso-extras/:id/reprovar` | JWT+Roles | idem |
| `GET` | `/rh/banco-horas` | JWT+Roles | `banco_horas:ver_todos` |
| `POST` | `/rh/banco-horas/fechar-em-massa` | JWT+Roles | `banco_horas:fechar` |
| `PATCH` | `/rh/banco-horas/:usuarioId/politica-uso-extras` | JWT+Roles | idem |
| `GET` | `/rh/banco-horas/:usuarioId` | JWT+Roles | `banco_horas:ver_todos` |
| `POST` | `/rh/banco-horas/:usuarioId/fechar` | JWT+Roles | `banco_horas:fechar` |
| `POST` | `/rh/banco-horas/:usuarioId/reabrir-fechamento/desafio` | JWT+Roles | idem |
| `POST` | `/rh/banco-horas/:usuarioId/reabrir-fechamento` | JWT+Roles | idem |
| `GET` | `/rh/banco-horas/me/recibo` | JWT+Roles | `banco_horas:ver_proprio`, `banco_horas:ver_todos` |
| `POST` | `/rh/banco-horas/me/recibo/aceitar` | JWT+Roles | idem |
| `GET` | `/rh/banco-horas/:usuarioId/recibo` | JWT+Roles | `banco_horas:ver_todos` |
| `POST` | `/rh/banco-horas/:usuarioId/lancamento` | JWT+Roles | `banco_horas:fechar` |
| `DELETE` | `/rh/banco-horas/:usuarioId/lancamentos/:lancamentoId` | JWT+Roles | idem |

### `rh/desempenho`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/desempenho/ciclos` | JWT+Roles | `avaliacoes:gerenciar`, `avaliacoes:responder` |
| `POST` | `/rh/desempenho/ciclos` | JWT+Roles | `avaliacoes:gerenciar` |
| `PATCH` | `/rh/desempenho/ciclos/:id/status` | JWT+Roles | idem |
| `POST` | `/rh/desempenho/ciclos/:id/distribuir` | JWT+Roles | idem |
| `GET` | `/rh/desempenho/me` | JWT+Roles | `avaliacoes:responder`, `avaliacoes:gerenciar` |
| `POST` | `/rh/desempenho/avaliacoes/:id/responder` | JWT+Roles | `avaliacoes:responder` |
| `GET` | `/rh/desempenho/metas/me` | JWT+Roles | `avaliacoes:responder`, `avaliacoes:gerenciar` |
| `GET` | `/rh/desempenho/metas/usuario/:usuarioId` | JWT+Roles | `avaliacoes:gerenciar` |
| `POST` | `/rh/desempenho/metas/usuario/:usuarioId` | JWT+Roles | idem |
| `PATCH` | `/rh/desempenho/metas/:id` | JWT+Roles | idem |
| `DELETE` | `/rh/desempenho/metas/:id` | JWT+Roles | idem |

### `rh/treinamentos`

| Método | Caminho | Auth | Perm. / notas |
|--------|---------|------|----------------|
| `GET` | `/rh/treinamentos` | JWT+Roles | `treinamentos:gerenciar`, `treinamentos:participar` |
| `POST` | `/rh/treinamentos` | JWT+Roles | `treinamentos:gerenciar` |
| `GET` | `/rh/treinamentos/me` | JWT+Roles | `treinamentos:participar`, `treinamentos:gerenciar` |
| `GET` | `/rh/treinamentos/me/pendentes` | JWT+Roles | idem |
| `POST` | `/rh/treinamentos/:id/ingressar` | JWT+Roles | idem |
| `GET` | `/rh/treinamentos/:id/trilha` | JWT+Roles | idem |
| `GET` | `/rh/treinamentos/:id` | JWT+Roles | idem |
| `PATCH` | `/rh/treinamentos/:id` | JWT+Roles | `treinamentos:gerenciar` |
| `DELETE` | `/rh/treinamentos/:id` | JWT+Roles | idem |
| `GET` | `/rh/treinamentos/:id/itens` | JWT+Roles | `treinamentos:gerenciar` |
| `POST` | `/rh/treinamentos/:id/itens/video` | JWT+Roles | idem |
| `POST` | `/rh/treinamentos/:id/itens/questao` | JWT+Roles | idem |
| `PATCH` | `/rh/treinamentos/:id/itens/ordem` | JWT+Roles | idem |
| `PATCH` | `/rh/treinamentos/:id/itens/:itemId` | JWT+Roles | idem |
| `DELETE` | `/rh/treinamentos/:id/itens/:itemId` | JWT+Roles | idem |
| `POST` | `/rh/treinamentos/:id/itens/:itemId/concluir-video` | JWT+Roles | participar |
| `POST` | `/rh/treinamentos/:id/itens/:itemId/responder` | JWT+Roles | participar |
| `GET/POST/DELETE` | `/rh/treinamentos/:id/itens/:itemId/video` | JWT+Roles | gerenciar/participar |
| `GET/POST/DELETE` | `/rh/treinamentos/:id/video` | JWT+Roles | gerenciar/participar |
| `PATCH` | `/rh/treinamentos/matriculas/:id` | JWT+Roles | gerenciar/participar |
| `GET/POST` | `/rh/treinamentos/:id/matriculas` | JWT+Roles | gerenciar |

---

## Notas finais para integradores

1. **DTOs** em `backend/src/modules/**/dto` definem corpos e queries exatos.
2. **Prisma migrations** devem estar aplicadas (`DATABASE_URL`).
3. Usuário técnico de integração: permissões mínimas de leitura; credenciais fora do repositório.
4. Não há OpenAPI/Swagger gerado; este documento é o índice oficial.
5. Em **dev**, prefira `http://localhost:5173/api/...` (proxy) para respeitar CSP do frontend.

---

## Integração com Power BI (segura)

1. Usuário técnico com permissões de leitura.
2. `POST https://seu-dominio/api/auth/login` → `token`.
3. `Authorization: Bearer <token>` nos `GET`.
4. Credenciais no Power BI Gateway / cofre de segredos.

### Exemplo Power Query (M)

```powerquery
let
    BaseUrl = "https://seu-dominio.com/api",
    LoginBody = "{""email"":""usuario.bi@empresa.com"",""senha"":""SENHA_FORTE_AQUI""}",
    LoginResponse = Json.Document(
        Web.Contents(
            BaseUrl & "/auth/login",
            [
                Headers = [#"Content-Type"="application/json"],
                Content = Text.ToBinary(LoginBody)
            ]
        )
    ),
    Token = LoginResponse[token],
    ProjectsResponse = Json.Document(
        Web.Contents(
            BaseUrl & "/projects",
            [
                Headers = [Authorization = "Bearer " & Token]
            ]
        )
    ),
    ProjectsList = if Value.Is(ProjectsResponse, type list) then ProjectsResponse else {},
    ProjectsTable = Table.FromList(ProjectsList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expanded = Table.ExpandRecordColumn(
        ProjectsTable,
        "Column1",
        {"id", "nome", "status", "dataCriacao", "dataAtualizacao"},
        {"id", "nome", "status", "dataCriacao", "dataAtualizacao"}
    )
in
    Expanded
```

### Boas práticas de segurança para BI

- HTTPS em produção.
- Não versionar senhas.
- Permissões mínimas no usuário técnico.
- Somente endpoints de leitura no BI.
- Opcional: allowlist de IP no proxy para Power BI Gateway.
