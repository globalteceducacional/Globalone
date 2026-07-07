# 🚀 Como Iniciar o Backend

Este guia explica passo a passo como configurar e iniciar o backend do ERP Globaltec.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **npm** (vem com Node.js) ou **yarn**
- **PostgreSQL** 15+ ([Download](https://www.postgresql.org/download/))
- **Git** (opcional, para clonar o repositório)

---

## 🔧 Passo 1: Instalar Dependências

Abra o terminal na pasta `backend/` e execute:

```bash
npm install
```

Isso instalará todas as dependências listadas no `package.json`:
- NestJS e módulos relacionados
- Prisma ORM
- Passport/JWT para autenticação
- Validação (class-validator)
- E outras dependências necessárias

**Tempo estimado**: 2-5 minutos (dependendo da conexão)

---

## ⚙️ Passo 2: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na pasta `backend/` (ou copie de `env.example` na raiz do projeto):

```env
# Configuração do Banco de Dados PostgreSQL
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_do_banco

# Porta do Backend
PORT=3000

# Segredo JWT (altere em produção!)
JWT_SECRET=super-segredo-alterar-em-producao
# Duração do token JWT (ex.: 8h, 24h, 7d, 30d)
JWT_EXPIRES_IN=7d

# Ambiente (development ou production)
NODE_ENV=development
```

### Exemplo de `DATABASE_URL`:
- **Usuário**: `erp`
- **Senha**: `senha123`
- **Host**: `localhost`
- **Porta**: `5432`
- **Banco**: `erpdb`

```env
DATABASE_URL=postgresql://erp:senha123@localhost:5432/erpdb
```

---

## 🗄️ Passo 3: Configurar o Banco de Dados

### Opção A: PostgreSQL Local

1. **Crie o banco de dados**:
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

### Opção B: Docker (apenas banco)

```bash
# Na raiz do projeto
docker-compose up db -d
```

Isso iniciará apenas o PostgreSQL em `localhost:5432`.

---

## 📦 Passo 4: Gerar Cliente Prisma

O Prisma precisa gerar o cliente TypeScript baseado no schema:

```bash
npm run prisma:generate
```

Isso cria/atualiza `node_modules/.prisma/client/` com tipos e métodos do banco.

---

## 🔄 Passo 5: Executar Migrações

Aplique as migrações do Prisma no banco:

```bash
npm run prisma:migrate
```

Ou, se preferir aplicar sem criar nova migração:

```bash
npm run prisma:deploy
```

**O que isso faz:**
- Cria todas as tabelas, enums, índices e foreign keys
- Registra as migrações na tabela `_prisma_migrations`

---

## 🌱 Passo 6: Popular Banco com Dados Iniciais (Opcional)

Execute o seed para criar dados de exemplo:

```bash
npm run prisma:seed
```

Isso criará:
- Cargos padrão (DIRETOR, SUPERVISOR, EXECUTOR, etc.)
- Usuários de exemplo
- Permissões básicas

**Credenciais padrão após seed:**
- Admin: `admin@globaltec.com` / `admin123`
- Supervisor: `supervisor@globaltec.com` / `senha123`
- Executor: `executor@globaltec.com` / `senha123`

---

## ▶️ Passo 7: Iniciar o Servidor

### Modo Desenvolvimento (com hot reload)

```bash
npm run start:dev
```

O servidor iniciará em `http://localhost:3000` (ou na porta configurada no `.env`).

**Características:**
- ✅ Reinicia automaticamente ao salvar arquivos
- ✅ Logs detalhados no console
- ✅ Stack traces completos em erros

### Modo Produção

```bash
# 1. Compilar TypeScript
npm run build

# 2. Iniciar servidor
npm run start:prod
```

Ou simplesmente:

```bash
npm run start
```

---

## ✅ Verificar se Está Funcionando

### Health Check

Abra no navegador ou use `curl`:

```bash
curl http://localhost:3000/health
```

Deve retornar:

```json
{
  "status": "ok",
  "timestamp": "2026-01-28T..."
}
```

### Testar Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@globaltec.com","senha":"admin123"}'
```

Deve retornar um token JWT e dados do usuário.

---

## 📝 Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run build` | Compila TypeScript para JavaScript |
| `npm run start` | Inicia servidor em produção |
| `npm run start:dev` | Inicia servidor em desenvolvimento (watch) |
| `npm run start:prod` | Inicia servidor em produção |
| `npm run lint` | Executa ESLint e corrige problemas |
| `npm run prisma:generate` | Gera cliente Prisma |
| `npm run prisma:migrate` | Cria/executa migrações |
| `npm run prisma:deploy` | Aplica migrações sem criar novas |
| `npm run prisma:seed` | Popula banco com dados iniciais |
| `npm run db:setup` | Setup completo (generate + migrate + seed) |

---

## 🔧 Troubleshooting

### Erro: "Cannot find module '@prisma/client'"

**Solução:**
```bash
npm run prisma:generate
```

---

### Erro: "PrismaClient is not configured"

**Solução:**
```bash
npm run prisma:generate
```

---

### Erro: "Database connection failed"

**Verifique:**
1. PostgreSQL está rodando?
   ```bash
   # Windows
   Get-Service postgresql*
   
   # Linux/Mac
   sudo systemctl status postgresql
   ```

2. `DATABASE_URL` está correto no `.env`?
   - Formato: `postgresql://usuario:senha@host:porta/banco`
   - Teste conexão: `psql -U erp -d erpdb`

3. Credenciais estão corretas?

---

### Erro: "Port 3000 already in use"

**Solução:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

Ou altere `PORT` no `.env` para outra porta (ex: `3001`).

---

### Erro: "Migration failed"

**Se for banco novo:**
```bash
# Resetar banco (CUIDADO: apaga todos os dados!)
npx prisma migrate reset

# Depois aplicar migrações
npm run prisma:migrate
```

**Se for banco existente:**
```bash
# Verificar status das migrações
npx prisma migrate status

# Aplicar migrações pendentes
npm run prisma:deploy
```

---

### Erro: "JWT_SECRET is not defined"

**Solução:**
Adicione `JWT_SECRET` no arquivo `.env`:
```env
JWT_SECRET=seu-segredo-aqui-altere-em-producao
```

### Logout diário / token expira rápido

Se o sistema estiver deslogando após algumas horas, ajuste no `.env`:

```env
JWT_EXPIRES_IN=7d
```

Valores aceitos seguem o formato do `jsonwebtoken`, por exemplo: `8h`, `24h`, `7d`, `30d`.

---

## 📚 Estrutura do Projeto

```
backend/
├── src/
│   ├── modules/          # Módulos de negócio
│   │   ├── auth/         # Autenticação
│   │   ├── users/        # Usuários
│   │   ├── projects/     # Projetos
│   │   ├── tasks/        # Tarefas/Etapas
│   │   └── ...
│   ├── common/           # Recursos compartilhados
│   ├── prisma/           # PrismaService
│   └── main.ts           # Entry point
├── prisma/
│   ├── schema.prisma     # Schema do banco
│   ├── migrations/       # Migrações SQL
│   └── seed.ts           # Seed do banco
├── .env                  # Variáveis de ambiente (criar)
├── package.json
└── tsconfig.json
```

---

## 🔗 Links Úteis

- **Documentação NestJS**: https://docs.nestjs.com/
- **Documentação Prisma**: https://www.prisma.io/docs/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

---

## 💡 Dicas

1. **Use `npm run start:dev`** durante desenvolvimento para hot reload
2. **Mantenha `.env` no `.gitignore`** (não commite credenciais)
3. **Use `npm run lint`** antes de commitar código
4. **Verifique logs** no console para debug
5. **Health check** (`/health`) é útil para monitoramento

---

**Pronto!** Seu backend deve estar rodando em `http://localhost:3000` 🎉
