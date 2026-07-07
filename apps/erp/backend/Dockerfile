# Etapa de build
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependências do sistema para Prisma
RUN apt-get update && apt-get install -y openssl libssl-dev && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./

# Instalar dependências
RUN npm ci

# Copiar schema do Prisma e gerar o client
COPY prisma ./prisma
RUN npx prisma generate

# Copiar código fonte e arquivos de configuração
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Fazer build
RUN npm run build

# Verificar se o build foi bem-sucedido
RUN test -f dist/src/main.js || (echo "❌ ERRO: main.js não encontrado após build!" && ls -laR dist/ && exit 1)

# Etapa final (produção)
FROM node:20-slim

WORKDIR /app

# Instalar dependências do sistema necessárias
RUN apt-get update && apt-get install -y openssl wget ca-certificates && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./

# Instalar apenas dependências de produção
RUN npm ci --omit=dev

# Instalar Prisma CLI globalmente para migrations
RUN npm install -g prisma@5.22.0

# Copiar schema do Prisma
COPY prisma ./prisma

# Gerar Prisma Client
RUN prisma generate

# Copiar código compilado do builder
COPY --from=builder /app/dist ./dist

# Verificar se os arquivos foram copiados corretamente
RUN test -f dist/src/main.js || (echo "❌ main.js não encontrado!" && exit 1)

# Criar usuário não-root para segurança
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expor porta (produção/Docker: 3001; dev local: 3000)
EXPOSE 3001

# Health check endpoint (porta 3001 quando rodando com docker-compose)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Comando para iniciar
CMD ["node", "dist/src/main.js"]
