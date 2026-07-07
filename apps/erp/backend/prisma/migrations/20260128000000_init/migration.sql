-- CreateEnum
CREATE TYPE "ProjetoStatus" AS ENUM ('EM_ANDAMENTO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "EtapaStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'EM_ANALISE', 'APROVADA', 'REPROVADA');

-- CreateEnum
CREATE TYPE "EtapaEntregaStatus" AS ENUM ('EM_ANALISE', 'APROVADA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDENTE', 'EM_ANALISE', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "CargoNivel" AS ENUM ('NIVEL_0', 'NIVEL_1', 'NIVEL_2', 'NIVEL_3', 'NIVEL_4');

-- CreateEnum
CREATE TYPE "SubetapaStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "CompraStatus" AS ENUM ('SOLICITADO', 'REPROVADO', 'PENDENTE', 'COMPRADO_ACAMINHO', 'ENTREGUE');

-- CreateEnum
CREATE TYPE "StatusEntrega" AS ENUM ('NAO_ENTREGUE', 'PARCIAL', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstoqueStatus" AS ENUM ('DISPONIVEL', 'ALOCADO', 'RESERVADO');

-- CreateEnum
CREATE TYPE "NotificacaoTipo" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "RequerimentoTipo" AS ENUM ('SOLICITACAO', 'APROVACAO', 'INFORMACAO', 'RECLAMACAO', 'SUGESTAO', 'COMPRA', 'OUTRO');

-- CreateTable
CREATE TABLE "Cargo" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "nivelAcesso" "CargoNivel" NOT NULL DEFAULT 'NIVEL_0',
    "herdaPermissoes" BOOLEAN NOT NULL DEFAULT true,
    "paginasPermitidas" JSONB,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "formacao" TEXT,
    "funcao" TEXT,
    "cargoId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "senha" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "dataCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projeto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "resumo" TEXT,
    "objetivo" TEXT,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorInsumos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ProjetoStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFinalizacao" TIMESTAMP(3),
    "planilhaJson" JSONB,
    "supervisorId" INTEGER,

    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjetoResponsavel" (
    "projetoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "ProjetoResponsavel_pkey" PRIMARY KEY ("projetoId","usuarioId")
);

-- CreateTable
CREATE TABLE "EtapaIntegrante" (
    "etapaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "EtapaIntegrante_pkey" PRIMARY KEY ("etapaId","usuarioId")
);

-- CreateTable
CREATE TABLE "Etapa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "EtapaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "valorInsumos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iniciada" BOOLEAN NOT NULL DEFAULT false,
    "checklistJson" JSONB,
    "projetoId" INTEGER NOT NULL,
    "executorId" INTEGER NOT NULL,

    CONSTRAINT "Etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapaEntrega" (
    "id" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "imagemUrl" TEXT,
    "status" "EtapaEntregaStatus" NOT NULL DEFAULT 'EM_ANALISE',
    "dataEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comentario" TEXT,
    "etapaId" INTEGER NOT NULL,
    "executorId" INTEGER NOT NULL,
    "avaliadoPorId" INTEGER,
    "dataAvaliacao" TIMESTAMP(3),

    CONSTRAINT "EtapaEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItemEntrega" (
    "id" SERIAL NOT NULL,
    "etapaId" INTEGER NOT NULL,
    "checklistIndex" INTEGER NOT NULL,
    "subitemIndex" INTEGER,
    "descricao" TEXT NOT NULL,
    "imagemUrl" TEXT,
    "documentoUrl" TEXT,
    "imagensUrls" JSONB,
    "documentosUrls" JSONB,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comentario" TEXT,
    "executorId" INTEGER NOT NULL,
    "avaliadoPorId" INTEGER,
    "dataAvaliacao" TIMESTAMP(3),

    CONSTRAINT "ChecklistItemEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "modulo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoPermission" (
    "cargoId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "CargoPermission_pkey" PRIMARY KEY ("cargoId","permissionId")
);

-- CreateTable
CREATE TABLE "Subetapa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "SubetapaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "etapaId" INTEGER NOT NULL,

    CONSTRAINT "Subetapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" SERIAL NOT NULL,
    "item" TEXT NOT NULL,
    "descricao" TEXT,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DOUBLE PRECISION,
    "imagemUrl" TEXT,
    "cotacoesJson" JSONB,
    "status" "CompraStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataConfirmacao" TIMESTAMP(3),
    "dataCompra" TIMESTAMP(3),
    "nfUrl" TEXT,
    "comprovantePagamentoUrl" TEXT,
    "projetoId" INTEGER,
    "etapaId" INTEGER,
    "solicitadoPorId" INTEGER,
    "motivoRejeicao" TEXT,
    "categoriaId" INTEGER,
    "formaPagamento" TEXT,
    "statusEntrega" "StatusEntrega",
    "previsaoEntrega" TIMESTAMP(3),
    "dataEntrega" TIMESTAMP(3),
    "enderecoEntrega" TEXT,
    "recebidoPor" TEXT,
    "observacao" TEXT,

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estoque" (
    "id" SERIAL NOT NULL,
    "item" TEXT NOT NULL,
    "descricao" TEXT,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "imagemUrl" TEXT,
    "cotacoesJson" JSONB,
    "status" "EstoqueStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "projetoId" INTEGER,
    "etapaId" INTEGER,
    "categoriaId" INTEGER,

    CONSTRAINT "Estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueAlocacao" (
    "id" SERIAL NOT NULL,
    "estoqueId" INTEGER NOT NULL,
    "projetoId" INTEGER,
    "etapaId" INTEGER,
    "usuarioId" INTEGER,
    "quantidade" INTEGER NOT NULL,
    "dataAlocacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstoqueAlocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ocorrencia" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "anexo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,
    "destinatarioId" INTEGER,

    CONSTRAINT "Ocorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requerimento" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" "RequerimentoTipo" NOT NULL DEFAULT 'OUTRO',
    "anexo" TEXT,
    "anexoResposta" TEXT,
    "resposta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataResposta" TIMESTAMP(3),
    "usuarioId" INTEGER NOT NULL,
    "destinatarioId" INTEGER,
    "etapaId" INTEGER,

    CONSTRAINT "Requerimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" "NotificacaoTipo" NOT NULL DEFAULT 'INFO',
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,
    "requerimentoId" INTEGER,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" SERIAL NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "endereco" TEXT,
    "contato" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaCompra" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_nome_key" ON "Cargo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "ChecklistItemEntrega_etapaId_idx" ON "ChecklistItemEntrega"("etapaId");

-- CreateIndex
CREATE INDEX "ChecklistItemEntrega_executorId_idx" ON "ChecklistItemEntrega"("executorId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItemEntrega_etapaId_checklistIndex_subitemIndex_key" ON "ChecklistItemEntrega"("etapaId", "checklistIndex", "subitemIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_modulo_acao_key" ON "Permission"("modulo", "acao");

-- CreateIndex
CREATE INDEX "EstoqueAlocacao_estoqueId_idx" ON "EstoqueAlocacao"("estoqueId");

-- CreateIndex
CREATE INDEX "EstoqueAlocacao_projetoId_idx" ON "EstoqueAlocacao"("projetoId");

-- CreateIndex
CREATE INDEX "EstoqueAlocacao_etapaId_idx" ON "EstoqueAlocacao"("etapaId");

-- CreateIndex
CREATE INDEX "EstoqueAlocacao_usuarioId_idx" ON "EstoqueAlocacao"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cnpj_key" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaCompra_nome_key" ON "CategoriaCompra"("nome");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjetoResponsavel" ADD CONSTRAINT "ProjetoResponsavel_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjetoResponsavel" ADD CONSTRAINT "ProjetoResponsavel_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaIntegrante" ADD CONSTRAINT "EtapaIntegrante_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaIntegrante" ADD CONSTRAINT "EtapaIntegrante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaEntrega" ADD CONSTRAINT "EtapaEntrega_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaEntrega" ADD CONSTRAINT "EtapaEntrega_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaEntrega" ADD CONSTRAINT "EtapaEntrega_avaliadoPorId_fkey" FOREIGN KEY ("avaliadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemEntrega" ADD CONSTRAINT "ChecklistItemEntrega_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemEntrega" ADD CONSTRAINT "ChecklistItemEntrega_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemEntrega" ADD CONSTRAINT "ChecklistItemEntrega_avaliadoPorId_fkey" FOREIGN KEY ("avaliadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPermission" ADD CONSTRAINT "CargoPermission_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPermission" ADD CONSTRAINT "CargoPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subetapa" ADD CONSTRAINT "Subetapa_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueAlocacao" ADD CONSTRAINT "EstoqueAlocacao_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueAlocacao" ADD CONSTRAINT "EstoqueAlocacao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueAlocacao" ADD CONSTRAINT "EstoqueAlocacao_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueAlocacao" ADD CONSTRAINT "EstoqueAlocacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ocorrencia" ADD CONSTRAINT "Ocorrencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ocorrencia" ADD CONSTRAINT "Ocorrencia_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requerimento" ADD CONSTRAINT "Requerimento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requerimento" ADD CONSTRAINT "Requerimento_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requerimento" ADD CONSTRAINT "Requerimento_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_requerimentoId_fkey" FOREIGN KEY ("requerimentoId") REFERENCES "Requerimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

