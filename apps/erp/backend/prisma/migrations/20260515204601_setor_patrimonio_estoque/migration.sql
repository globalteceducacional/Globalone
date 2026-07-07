-- AlterTable
ALTER TABLE "SetorPatrimonioMaterial" ADD COLUMN     "estoqueId" INTEGER;

-- CreateIndex
CREATE INDEX "SetorPatrimonioMaterial_estoqueId_idx" ON "SetorPatrimonioMaterial"("estoqueId");

-- AddForeignKey
ALTER TABLE "SetorPatrimonioMaterial" ADD CONSTRAINT "SetorPatrimonioMaterial_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
