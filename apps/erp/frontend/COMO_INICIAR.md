# 🚀 Como Iniciar o Frontend

Este guia explica passo a passo como configurar e iniciar o frontend do ERP Globaltec.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **npm** (vem com Node.js) ou **yarn**
- **Git** (opcional, para clonar o repositório)
- **Backend rodando** (veja `backend/COMO_INICIAR.md`)

---

## 🔧 Passo 1: Instalar Dependências

Abra o terminal na pasta `frontend/` e execute:

```bash
npm install
```

Isso instalará todas as dependências listadas no `package.json`:
- React 18.3.1
- Vite 5.4.10 (build tool)
- React Router DOM (roteamento)
- Zustand (gerenciamento de estado)
- Axios (cliente HTTP)
- Tailwind CSS (estilização)
- xlsx/xlsx-js-style (exportação Excel)
- jsPDF (exportação PDF)
- E outras dependências

**Tempo estimado**: 2-5 minutos (dependendo da conexão)

---

## ⚙️ Passo 2: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na pasta `frontend/`:

```env
# URL da API Backend
VITE_API_URL=http://localhost:3000
```

**Importante:**
- O prefixo `VITE_` é obrigatório para variáveis expostas ao código do Vite
- Se o backend estiver em outra porta, ajuste conforme necessário
- Para produção, use a URL completa do servidor (ex: `https://api.seudominio.com`)

### Exemplos de `VITE_API_URL`:

**Desenvolvimento local:**
```env
VITE_API_URL=http://localhost:3000
```

**Docker (produção):**
```env
VITE_API_URL=http://localhost:3001
```

**Servidor remoto:**
```env
VITE_API_URL=https://api.erpglobaltec.com.br
```

---

## ▶️ Passo 3: Iniciar o Servidor de Desenvolvimento

Execute:

```bash
npm run dev
```

O servidor iniciará em `http://localhost:5173` (porta padrão do Vite).

**Características:**
- ✅ Hot Module Replacement (HMR) - atualiza sem recarregar página
- ✅ Fast Refresh - mantém estado do React ao editar
- ✅ Logs no console do navegador e terminal
- ✅ Source maps para debug

**Saída esperada:**
```
  VITE v5.4.10  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

---

## 🌐 Passo 4: Acessar a Aplicação

Abra o navegador em:

```
http://localhost:5173
```

Você verá a página de **Login**.

**Credenciais padrão** (após seed do backend):
- Email: `admin@globaltec.com`
- Senha: `admin123`

---

## 📝 Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento (Vite) |
| `npm run build` | Compila para produção (gera pasta `dist/`) |
| `npm run preview` | Preview da build de produção localmente |

---

## 🏗️ Build para Produção

Para gerar os arquivos otimizados para produção:

```bash
npm run build
```

Isso criará a pasta `dist/` com:
- HTML, CSS e JS minificados
- Assets otimizados
- Source maps (opcional)

### Preview da Build

Para testar a build localmente antes de deployar:

```bash
npm run preview
```

Isso iniciará um servidor local servindo os arquivos de `dist/`.

---

## 🔧 Troubleshooting

### Erro: "Cannot find module"

**Solução:**
```bash
# Limpar node_modules e reinstalar
rm -rf node_modules package-lock.json
npm install
```

**Windows PowerShell:**
```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

---

### Erro: "VITE_API_URL is not defined"

**Solução:**
1. Verifique se o arquivo `.env` existe na pasta `frontend/`
2. Verifique se a variável começa com `VITE_`
3. Reinicie o servidor (`npm run dev`)

**Importante:** Variáveis de ambiente são carregadas apenas na inicialização do Vite.

---

### Erro: "Network Error" ou "CORS"

**Causa:** Backend não está rodando ou CORS não está configurado.

**Solução:**
1. Verifique se o backend está rodando em `http://localhost:3000`
2. Verifique `VITE_API_URL` no `.env`
3. Verifique se o backend permite CORS (deve estar configurado no `main.ts`)

---

### Erro: "Port 5173 already in use"

**Solução:**
```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5173 | xargs kill -9
```

Ou use outra porta:
```bash
npm run dev -- --port 3001
```

---

### Erro: "Failed to resolve import"

**Causa:** Import path incorreto ou arquivo não existe.

**Solução:**
1. Verifique o caminho do import (case-sensitive)
2. Verifique se o arquivo existe
3. Verifique `tsconfig.json` para paths configurados

---

### Erro: "401 Unauthorized" no login

**Causa:** Token JWT inválido ou expirado.

**Solução:**
1. Faça logout e login novamente
2. Verifique se o backend está gerando tokens corretamente
3. Verifique `JWT_SECRET` no backend

---

### Erro: "Cannot read property of undefined"

**Causa:** Estado não inicializado ou dados não carregados.

**Solução:**
1. Verifique se o backend está retornando dados corretos
2. Adicione verificações de null/undefined no código
3. Verifique console do navegador para mais detalhes

---

## 📚 Estrutura do Projeto

```
frontend/
├── src/
│   ├── pages/            # Páginas/rotas da aplicação
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Projects.tsx
│   │   └── ...
│   ├── components/      # Componentes reutilizáveis
│   │   ├── layout/      # Layout (Sidebar, Header)
│   │   └── stock/       # Componentes de estoque
│   ├── hooks/           # Custom hooks
│   │   ├── useStockData.ts
│   │   └── usePurchaseFilters.ts
│   ├── services/        # Serviços de API
│   │   └── api.ts       # Cliente Axios configurado
│   ├── store/           # Estado global (Zustand)
│   │   └── auth.ts      # Store de autenticação
│   ├── types/           # Tipos TypeScript
│   │   ├── types.ts
│   │   └── stock.ts
│   ├── utils/           # Funções utilitárias
│   │   ├── toast.ts
│   │   ├── validation.ts
│   │   └── ...
│   ├── constants/       # Constantes
│   │   └── stock.ts
│   ├── App.tsx          # Componente raiz (rotas)
│   └── main.tsx         # Entry point
├── public/              # Arquivos estáticos
├── .env                 # Variáveis de ambiente (criar)
├── vite.config.ts       # Configuração do Vite
├── tailwind.config.cjs  # Configuração do Tailwind
└── package.json
```

---

## 🔗 Comunicação com o Backend

O frontend se comunica com o backend através do cliente Axios em `src/services/api.ts`:

**Configuração:**
- Base URL: `VITE_API_URL` (do `.env`)
- Interceptor de request: adiciona token JWT automaticamente
- Interceptor de response: faz logout em 401 (não autenticado)

**Exemplo de uso:**
```typescript
import { api } from '../services/api';

// GET
const { data } = await api.get('/projects');

// POST
await api.post('/projects', { nome: 'Novo Projeto' });

// Com tratamento de erro
try {
  await api.post('/projects', payload);
  toast.success('Projeto criado!');
} catch (err: any) {
  const errorMessage = formatApiError(err);
  toast.error(errorMessage);
}
```

---

## 🎨 Estilização

O projeto usa **Tailwind CSS** para estilização.

**Classes comuns:**
- `bg-neutral` - Fundo escuro padrão
- `text-white/70` - Texto branco com opacidade
- `border border-white/10` - Borda sutil
- `rounded-xl` - Bordas arredondadas
- `px-4 py-2` - Padding
- `hover:bg-white/10` - Hover effect

**Cores customizadas** (definidas no `tailwind.config.cjs`):
- `primary` - Cor primária do sistema
- `danger` - Cor de erro/perigo
- `success` - Cor de sucesso
- `warning` - Cor de aviso

---

## 🔐 Autenticação

O frontend gerencia autenticação via **Zustand** (`src/store/auth.ts`):

**Estado persistido em `localStorage`:**
- `token` - JWT token
- `user` - Dados do usuário

**Uso:**
```typescript
import { useAuthStore } from '../store/auth';

// Obter usuário atual
const user = useAuthStore((state) => state.user);

// Fazer logout
const logout = useAuthStore((state) => state.logout);
logout();
```

---

## 📦 Build e Deploy

### Build para Produção

```bash
npm run build
```

Isso gera a pasta `dist/` com arquivos otimizados.

### Deploy

Os arquivos em `dist/` podem ser servidos por:
- **Nginx** (recomendado)
- **Apache**
- **Vercel/Netlify** (deploy automático)
- Qualquer servidor web estático

**Configuração Nginx exemplo:**
```nginx
server {
    listen 80;
    server_name erpglobaltec.com.br;
    root /caminho/para/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 💡 Dicas

1. **Use `npm run dev`** durante desenvolvimento para hot reload
2. **Mantenha `.env` no `.gitignore`** (não commite URLs de produção)
3. **Verifique console do navegador** (F12) para erros e warnings
4. **Use React DevTools** para debug de componentes
5. **Network tab** (F12) mostra todas as requisições ao backend
6. **LocalStorage** (F12 > Application) mostra token e dados do usuário

---

## 🔗 Links Úteis

- **Documentação React**: https://react.dev/
- **Documentação Vite**: https://vitejs.dev/
- **Documentação Tailwind**: https://tailwindcss.com/
- **Documentação Zustand**: https://zustand-demo.pmnd.rs/
- **Documentação Axios**: https://axios-http.com/

---

## ✅ Checklist de Inicialização

- [ ] Node.js 20+ instalado
- [ ] `npm install` executado com sucesso
- [ ] Arquivo `.env` criado com `VITE_API_URL`
- [ ] Backend está rodando e acessível
- [ ] `npm run dev` iniciado sem erros
- [ ] Aplicação abre em `http://localhost:5173`
- [ ] Login funciona com credenciais válidas

---

**Pronto!** Seu frontend deve estar rodando em `http://localhost:5173` 🎉
