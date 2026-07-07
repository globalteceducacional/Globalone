-- AlterTable
ALTER TABLE "GalpaoLivroAvaria" ADD COLUMN     "fornecedorId" INTEGER,
ADD COLUMN     "projetoId" INTEGER;

-- CreateIndex
CREATE INDEX "GalpaoLivroAvaria_fornecedorId_idx" ON "GalpaoLivroAvaria"("fornecedorId");

-- CreateIndex
CREATE INDEX "GalpaoLivroAvaria_projetoId_idx" ON "GalpaoLivroAvaria"("projetoId");

-- AddForeignKey
ALTER TABLE "GalpaoLivroAvaria" ADD CONSTRAINT "GalpaoLivroAvaria_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoLivroAvaria" ADD CONSTRAINT "GalpaoLivroAvaria_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
