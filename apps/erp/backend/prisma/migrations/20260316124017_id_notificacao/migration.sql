-- AlterTable
ALTER TABLE "Notificacao" ADD COLUMN     "etapaId" INTEGER;

-- CreateIndex
CREATE INDEX "Notificacao_etapaId_idx" ON "Notificacao"("etapaId");

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
