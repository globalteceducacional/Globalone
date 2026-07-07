/*
  Warnings:

  - A unique constraint covering the columns `[galpaoProdutoId,isbn,categoriaId,fornecedorId]` on the table `GalpaoProdutoLivroReserva` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "GalpaoProdutoLivroReserva_galpaoProdutoId_isbn_categoriaId_key";

-- AlterTable
ALTER TABLE "GalpaoProdutoLivroReserva" ADD COLUMN     "fornecedorId" INTEGER;

-- CreateIndex
CREATE INDEX "GalpaoProdutoLivroReserva_fornecedorId_idx" ON "GalpaoProdutoLivroReserva"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "GalpaoProdutoLivroReserva_galpaoProdutoId_isbn_categoriaId__key" ON "GalpaoProdutoLivroReserva"("galpaoProdutoId", "isbn", "categoriaId", "fornecedorId");

-- AddForeignKey
ALTER TABLE "GalpaoProdutoLivroReserva" ADD CONSTRAINT "GalpaoProdutoLivroReserva_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
