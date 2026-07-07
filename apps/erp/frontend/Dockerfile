# Etapa de build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Variáveis de ambiente para o build
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

# Fazer build
RUN npm run build

# Verificar se o build foi bem-sucedido
RUN test -d dist || (echo "❌ ERRO: dist não encontrado após build!" && exit 1)

# Etapa final (produção)
FROM nginx:1.27-alpine

# Copiar arquivos compilados
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuração customizada do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expor porta
EXPOSE 80

# Health check (usa /health que sempre retorna 200)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Comando padrão do nginx
CMD ["nginx", "-g", "daemon off;"]
