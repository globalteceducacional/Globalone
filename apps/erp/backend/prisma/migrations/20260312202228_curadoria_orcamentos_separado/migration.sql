-- CreateEnum
CREATE TYPE "CuradoriaDescontoAplicadoEm" AS ENUM ('ITEM', 'TOTAL');

-- CreateTable
CREATE TABLE "CuradoriaOrcamento" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "observacao" TEXT,
    "descontoAplicadoEm" "CuradoriaDescontoAplicadoEm" NOT NULL DEFAULT 'ITEM',
    "descontoTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projetoId" INTEGER,
    "criadoPorId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuradoriaOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuradoriaItem" (
    "id" SERIAL NOT NULL,
    "orcamentoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "valor" DOUBLE PRECISION NOT NULL,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorLiquido" DOUBLE PRECISION NOT NULL,
    "autor" TEXT,
    "editora" TEXT,
    "anoPublicacao" TEXT,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuradoriaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CuradoriaOrcamento_projetoId_idx" ON "CuradoriaOrcamento"("projetoId");

-- CreateIndex
CREATE INDEX "CuradoriaOrcamento_criadoPorId_idx" ON "CuradoriaOrcamento"("criadoPorId");

-- CreateIndex
CREATE INDEX "CuradoriaItem_orcamentoId_idx" ON "CuradoriaItem"("orcamentoId");

-- CreateIndex
CREATE INDEX "CuradoriaItem_categoriaId_idx" ON "CuradoriaItem"("categoriaId");

-- AddForeignKey
ALTER TABLE "CuradoriaOrcamento" ADD CONSTRAINT "CuradoriaOrcamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuradoriaOrcamento" ADD CONSTRAINT "CuradoriaOrcamento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuradoriaItem" ADD CONSTRAINT "CuradoriaItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "CuradoriaOrcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuradoriaItem" ADD CONSTRAINT "CuradoriaItem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
