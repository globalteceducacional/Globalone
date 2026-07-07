-- AlterTable Usuario: política manual de uso de horas extras
ALTER TABLE "Usuario" ADD COLUMN "bancoHorasExtrasUsoPermitido" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Usuario" ADD COLUMN "bancoHorasExtrasUsoLimiteMinutos" INTEGER;

-- CreateTable
CREATE TABLE "BancoHorasUsoExtrasSolicitacao" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "minutosSolicitados" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "observacao" TEXT,
    "status" "SolicitacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "revisorId" INTEGER,
    "comentarioRevisor" TEXT,
    "dataDecisao" TIMESTAMP(3),
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lancamentoId" INTEGER,

    CONSTRAINT "BancoHorasUsoExtrasSolicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BancoHorasUsoExtrasSolicitacao_lancamentoId_key" ON "BancoHorasUsoExtrasSolicitacao"("lancamentoId");

CREATE INDEX "BancoHorasUsoExtrasSolicitacao_usuarioId_status_idx" ON "BancoHorasUsoExtrasSolicitacao"("usuarioId", "status");

CREATE INDEX "BancoHorasUsoExtrasSolicitacao_status_dataCriacao_idx" ON "BancoHorasUsoExtrasSolicitacao"("status", "dataCriacao");

-- AddForeignKey
ALTER TABLE "BancoHorasUsoExtrasSolicitacao" ADD CONSTRAINT "BancoHorasUsoExtrasSolicitacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BancoHorasUsoExtrasSolicitacao" ADD CONSTRAINT "BancoHorasUsoExtrasSolicitacao_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BancoHorasUsoExtrasSolicitacao" ADD CONSTRAINT "BancoHorasUsoExtrasSolicitacao_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "BancoHorasLancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
