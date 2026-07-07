-- CreateTable
CREATE TABLE "EstoqueEntrada" (
    "id" SERIAL NOT NULL,
    "estoqueId" INTEGER NOT NULL,
    "compraId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "cotacoesJson" JSONB,
    "nfUrl" TEXT,
    "comprovantePagamentoUrl" TEXT,
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "dataEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstoqueEntrada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueEntrada_compraId_key" ON "EstoqueEntrada"("compraId");

-- CreateIndex
CREATE INDEX "EstoqueEntrada_estoqueId_idx" ON "EstoqueEntrada"("estoqueId");

-- AddForeignKey
ALTER TABLE "EstoqueEntrada" ADD CONSTRAINT "EstoqueEntrada_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueEntrada" ADD CONSTRAINT "EstoqueEntrada_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
