-- AlterTable
ALTER TABLE "EstoqueAlocacao" ADD COLUMN     "setorId" INTEGER;

-- CreateIndex
CREATE INDEX "EstoqueAlocacao_setorId_idx" ON "EstoqueAlocacao"("setorId");

-- AddForeignKey
ALTER TABLE "EstoqueAlocacao" ADD CONSTRAINT "EstoqueAlocacao_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
