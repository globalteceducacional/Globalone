-- CreateEnum
CREATE TYPE "GalpaoLivroMovimentoTipo" AS ENUM ('ENTRADA', 'BAIXA');

-- AlterTable
ALTER TABLE "EstoqueAlocacao" ADD COLUMN     "galpaoProdutoId" INTEGER;

-- CreateTable
CREATE TABLE "GalpaoProduto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalpaoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalpaoProdutoLivroReserva" (
    "id" SERIAL NOT NULL,
    "galpaoProdutoId" INTEGER NOT NULL,
    "isbn" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "quantidade" INTEGER NOT NULL,
    "dataReserva" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalpaoProdutoLivroReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalpaoProdutoLivroMovimento" (
    "id" SERIAL NOT NULL,
    "galpaoProdutoId" INTEGER NOT NULL,
    "tipo" "GalpaoLivroMovimentoTipo" NOT NULL,
    "isbn" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "quantidade" INTEGER NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalpaoProdutoLivroMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalpaoProduto_nome_key" ON "GalpaoProduto"("nome");

-- CreateIndex
CREATE INDEX "GalpaoProdutoLivroReserva_galpaoProdutoId_idx" ON "GalpaoProdutoLivroReserva"("galpaoProdutoId");

-- CreateIndex
CREATE INDEX "GalpaoProdutoLivroReserva_categoriaId_idx" ON "GalpaoProdutoLivroReserva"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "GalpaoProdutoLivroReserva_galpaoProdutoId_isbn_categoriaId_key" ON "GalpaoProdutoLivroReserva"("galpaoProdutoId", "isbn", "categoriaId");

-- CreateIndex
CREATE INDEX "GalpaoProdutoLivroMovimento_galpaoProdutoId_idx" ON "GalpaoProdutoLivroMovimento"("galpaoProdutoId");

-- CreateIndex
CREATE INDEX "GalpaoProdutoLivroMovimento_categoriaId_idx" ON "GalpaoProdutoLivroMovimento"("categoriaId");

-- CreateIndex
CREATE INDEX "EstoqueAlocacao_galpaoProdutoId_idx" ON "EstoqueAlocacao"("galpaoProdutoId");

-- AddForeignKey
ALTER TABLE "EstoqueAlocacao" ADD CONSTRAINT "EstoqueAlocacao_galpaoProdutoId_fkey" FOREIGN KEY ("galpaoProdutoId") REFERENCES "GalpaoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoProdutoLivroReserva" ADD CONSTRAINT "GalpaoProdutoLivroReserva_galpaoProdutoId_fkey" FOREIGN KEY ("galpaoProdutoId") REFERENCES "GalpaoProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoProdutoLivroReserva" ADD CONSTRAINT "GalpaoProdutoLivroReserva_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoProdutoLivroMovimento" ADD CONSTRAINT "GalpaoProdutoLivroMovimento_galpaoProdutoId_fkey" FOREIGN KEY ("galpaoProdutoId") REFERENCES "GalpaoProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoProdutoLivroMovimento" ADD CONSTRAINT "GalpaoProdutoLivroMovimento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
