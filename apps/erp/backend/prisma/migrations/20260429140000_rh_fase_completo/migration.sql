-- CreateEnum
CREATE TYPE "SolicitacaoStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "BancoHorasOrigem" AS ENUM ('PONTO', 'AJUSTE', 'COMPENSACAO', 'FECHAMENTO');

-- CreateEnum
CREATE TYPE "AfastamentoTipo" AS ENUM ('ATESTADO', 'LICENCA', 'FALTA_ABONADA', 'HOME_OFFICE', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentoColaboradorTipo" AS ENUM ('CONTRATO', 'ASO', 'RG', 'CPF', 'COMPROVANTE_RESIDENCIA', 'CERTIFICADO', 'CARTEIRA_TRABALHO', 'OUTRO');

-- CreateEnum
CREATE TYPE "CicloAvaliacaoStatus" AS ENUM ('PLANEJAMENTO', 'ABERTO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "AvaliacaoStatus" AS ENUM ('PENDENTE', 'RESPONDIDA', 'REVISADA');

-- CreateEnum
CREATE TYPE "MatriculaTreinamentoStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO');

-- CreateTable JornadaTrabalho
CREATE TABLE "JornadaTrabalho" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "cargaDiariaMin" INTEGER NOT NULL DEFAULT 480,
    "cargaSemanalMin" INTEGER NOT NULL DEFAULT 2400,
    "inicioPadrao" TEXT NOT NULL DEFAULT '08:00',
    "fimPadrao" TEXT NOT NULL DEFAULT '17:00',
    "tolerAtrasoMin" INTEGER NOT NULL DEFAULT 10,
    "diasUteis" JSONB NOT NULL DEFAULT '{"0":false,"1":true,"2":true,"3":true,"4":true,"5":true,"6":false}',
    "observacao" TEXT,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JornadaTrabalho_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JornadaTrabalho_usuarioId_key" ON "JornadaTrabalho"("usuarioId");

ALTER TABLE "JornadaTrabalho"
ADD CONSTRAINT "JornadaTrabalho_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable SolicitacaoAjustePonto
CREATE TABLE "SolicitacaoAjustePonto" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoBatida" NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "anexoUrl" TEXT,
    "status" "SolicitacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "revisorId" INTEGER,
    "comentarioRevisor" TEXT,
    "dataDecisao" TIMESTAMP(3),
    "registroPontoId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitacaoAjustePonto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SolicitacaoAjustePonto_usuarioId_status_idx" ON "SolicitacaoAjustePonto"("usuarioId", "status");
CREATE INDEX "SolicitacaoAjustePonto_revisorId_idx" ON "SolicitacaoAjustePonto"("revisorId");

ALTER TABLE "SolicitacaoAjustePonto"
ADD CONSTRAINT "SolicitacaoAjustePonto_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SolicitacaoAjustePonto"
ADD CONSTRAINT "SolicitacaoAjustePonto_revisorId_fkey"
FOREIGN KEY ("revisorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable BancoHorasLancamento
CREATE TABLE "BancoHorasLancamento" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "minutosCredito" INTEGER NOT NULL DEFAULT 0,
    "minutosDebito" INTEGER NOT NULL DEFAULT 0,
    "origem" "BancoHorasOrigem" NOT NULL DEFAULT 'PONTO',
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BancoHorasLancamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BancoHorasLancamento_usuarioId_competencia_idx" ON "BancoHorasLancamento"("usuarioId", "competencia");

ALTER TABLE "BancoHorasLancamento"
ADD CONSTRAINT "BancoHorasLancamento_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable BancoHorasFechamento
CREATE TABLE "BancoHorasFechamento" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "saldoAnteriorMin" INTEGER NOT NULL DEFAULT 0,
    "creditoMin" INTEGER NOT NULL DEFAULT 0,
    "debitoMin" INTEGER NOT NULL DEFAULT 0,
    "saldoFinalMin" INTEGER NOT NULL DEFAULT 0,
    "fechadoPorId" INTEGER,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BancoHorasFechamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BancoHorasFechamento_usuarioId_competencia_key" ON "BancoHorasFechamento"("usuarioId", "competencia");

ALTER TABLE "BancoHorasFechamento"
ADD CONSTRAINT "BancoHorasFechamento_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BancoHorasFechamento"
ADD CONSTRAINT "BancoHorasFechamento_fechadoPorId_fkey"
FOREIGN KEY ("fechadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable PeriodoAquisitivo
CREATE TABLE "PeriodoAquisitivo" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "diasDireito" INTEGER NOT NULL DEFAULT 30,
    "diasUsados" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodoAquisitivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PeriodoAquisitivo_usuarioId_inicio_key" ON "PeriodoAquisitivo"("usuarioId", "inicio");
CREATE INDEX "PeriodoAquisitivo_usuarioId_idx" ON "PeriodoAquisitivo"("usuarioId");

ALTER TABLE "PeriodoAquisitivo"
ADD CONSTRAINT "PeriodoAquisitivo_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable FeriasSolicitacao
CREATE TABLE "FeriasSolicitacao" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "periodoAquisitivoId" INTEGER,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "diasSolicitados" INTEGER NOT NULL,
    "observacao" TEXT,
    "status" "SolicitacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "revisorId" INTEGER,
    "comentarioRevisor" TEXT,
    "dataDecisao" TIMESTAMP(3),
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeriasSolicitacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeriasSolicitacao_usuarioId_status_idx" ON "FeriasSolicitacao"("usuarioId", "status");

ALTER TABLE "FeriasSolicitacao"
ADD CONSTRAINT "FeriasSolicitacao_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeriasSolicitacao"
ADD CONSTRAINT "FeriasSolicitacao_periodoAquisitivoId_fkey"
FOREIGN KEY ("periodoAquisitivoId") REFERENCES "PeriodoAquisitivo"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeriasSolicitacao"
ADD CONSTRAINT "FeriasSolicitacao_revisorId_fkey"
FOREIGN KEY ("revisorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Afastamento
CREATE TABLE "Afastamento" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "AfastamentoTipo" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "anexoUrl" TEXT,
    "registradoPorId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Afastamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Afastamento_usuarioId_dataInicio_idx" ON "Afastamento"("usuarioId", "dataInicio");

ALTER TABLE "Afastamento"
ADD CONSTRAINT "Afastamento_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Afastamento"
ADD CONSTRAINT "Afastamento_registradoPorId_fkey"
FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable DocumentoColaborador
CREATE TABLE "DocumentoColaborador" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "DocumentoColaboradorTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "arquivoUrl" TEXT NOT NULL,
    "dataValidade" TIMESTAMP(3),
    "observacao" TEXT,
    "uploadPorId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoColaborador_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentoColaborador_usuarioId_tipo_idx" ON "DocumentoColaborador"("usuarioId", "tipo");

ALTER TABLE "DocumentoColaborador"
ADD CONSTRAINT "DocumentoColaborador_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentoColaborador"
ADD CONSTRAINT "DocumentoColaborador_uploadPorId_fkey"
FOREIGN KEY ("uploadPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable CicloAvaliacao
CREATE TABLE "CicloAvaliacao" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "status" "CicloAvaliacaoStatus" NOT NULL DEFAULT 'PLANEJAMENTO',
    "roteiroJson" JSONB,
    "criadorId" INTEGER NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CicloAvaliacao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CicloAvaliacao"
ADD CONSTRAINT "CicloAvaliacao_criadorId_fkey"
FOREIGN KEY ("criadorId") REFERENCES "Usuario"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable AvaliacaoDesempenho
CREATE TABLE "AvaliacaoDesempenho" (
    "id" SERIAL NOT NULL,
    "cicloId" INTEGER NOT NULL,
    "avaliadoId" INTEGER NOT NULL,
    "avaliadorId" INTEGER NOT NULL,
    "status" "AvaliacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "respostasJson" JSONB,
    "notaFinal" DOUBLE PRECISION,
    "comentario" TEXT,
    "dataResposta" TIMESTAMP(3),
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvaliacaoDesempenho_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvaliacaoDesempenho_cicloId_avaliadoId_avaliadorId_key" ON "AvaliacaoDesempenho"("cicloId", "avaliadoId", "avaliadorId");
CREATE INDEX "AvaliacaoDesempenho_avaliadoId_idx" ON "AvaliacaoDesempenho"("avaliadoId");
CREATE INDEX "AvaliacaoDesempenho_avaliadorId_idx" ON "AvaliacaoDesempenho"("avaliadorId");

ALTER TABLE "AvaliacaoDesempenho"
ADD CONSTRAINT "AvaliacaoDesempenho_cicloId_fkey"
FOREIGN KEY ("cicloId") REFERENCES "CicloAvaliacao"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvaliacaoDesempenho"
ADD CONSTRAINT "AvaliacaoDesempenho_avaliadoId_fkey"
FOREIGN KEY ("avaliadoId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvaliacaoDesempenho"
ADD CONSTRAINT "AvaliacaoDesempenho_avaliadorId_fkey"
FOREIGN KEY ("avaliadorId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable MetaIndividual
CREATE TABLE "MetaIndividual" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "prazo" TIMESTAMP(3),
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaIndividual_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaIndividual_usuarioId_status_idx" ON "MetaIndividual"("usuarioId", "status");

ALTER TABLE "MetaIndividual"
ADD CONSTRAINT "MetaIndividual_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Treinamento
CREATE TABLE "Treinamento" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "cargaHoraria" INTEGER NOT NULL DEFAULT 0,
    "anexosJson" JSONB,
    "criadorId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Treinamento_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Treinamento"
ADD CONSTRAINT "Treinamento_criadorId_fkey"
FOREIGN KEY ("criadorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable TreinamentoMatricula
CREATE TABLE "TreinamentoMatricula" (
    "id" SERIAL NOT NULL,
    "treinamentoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "status" "MatriculaTreinamentoStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataConclusao" TIMESTAMP(3),
    "certificadoUrl" TEXT,
    "notaAvaliacao" DOUBLE PRECISION,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreinamentoMatricula_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreinamentoMatricula_treinamentoId_usuarioId_key" ON "TreinamentoMatricula"("treinamentoId", "usuarioId");
CREATE INDEX "TreinamentoMatricula_usuarioId_status_idx" ON "TreinamentoMatricula"("usuarioId", "status");

ALTER TABLE "TreinamentoMatricula"
ADD CONSTRAINT "TreinamentoMatricula_treinamentoId_fkey"
FOREIGN KEY ("treinamentoId") REFERENCES "Treinamento"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TreinamentoMatricula"
ADD CONSTRAINT "TreinamentoMatricula_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable CargoTreinamento
CREATE TABLE "CargoTreinamento" (
    "cargoId" INTEGER NOT NULL,
    "treinamentoId" INTEGER NOT NULL,

    CONSTRAINT "CargoTreinamento_pkey" PRIMARY KEY ("cargoId","treinamentoId")
);

ALTER TABLE "CargoTreinamento"
ADD CONSTRAINT "CargoTreinamento_cargoId_fkey"
FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CargoTreinamento"
ADD CONSTRAINT "CargoTreinamento_treinamentoId_fkey"
FOREIGN KEY ("treinamentoId") REFERENCES "Treinamento"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
