-- AlterTable
ALTER TABLE "DocumentoPatenteAplicacao" ADD COLUMN     "pastaId" INTEGER;

-- CreateTable
CREATE TABLE "PatenteDocumentoPasta" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatenteDocumentoPasta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatenteDocumentoPasta_nome_idx" ON "PatenteDocumentoPasta"("nome");

-- CreateIndex
CREATE INDEX "DocumentoPatenteAplicacao_pastaId_idx" ON "DocumentoPatenteAplicacao"("pastaId");

-- AddForeignKey
ALTER TABLE "PatenteDocumentoPasta" ADD CONSTRAINT "PatenteDocumentoPasta_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoPatenteAplicacao" ADD CONSTRAINT "DocumentoPatenteAplicacao_pastaId_fkey" FOREIGN KEY ("pastaId") REFERENCES "PatenteDocumentoPasta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
