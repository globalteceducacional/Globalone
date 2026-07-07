-- CreateTable
CREATE TABLE "GalpaoOutroItemAvaria" (
    "id" SERIAL NOT NULL,
    "estoqueId" INTEGER NOT NULL,
    "galpaoProdutoId" INTEGER,
    "quantidade" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoPorId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalpaoOutroItemAvaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalpaoOutroItemAvaria_estoqueId_idx" ON "GalpaoOutroItemAvaria"("estoqueId");

-- CreateIndex
CREATE INDEX "GalpaoOutroItemAvaria_galpaoProdutoId_idx" ON "GalpaoOutroItemAvaria"("galpaoProdutoId");

-- AddForeignKey
ALTER TABLE "GalpaoOutroItemAvaria" ADD CONSTRAINT "GalpaoOutroItemAvaria_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoOutroItemAvaria" ADD CONSTRAINT "GalpaoOutroItemAvaria_galpaoProdutoId_fkey" FOREIGN KEY ("galpaoProdutoId") REFERENCES "GalpaoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoOutroItemAvaria" ADD CONSTRAINT "GalpaoOutroItemAvaria_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
