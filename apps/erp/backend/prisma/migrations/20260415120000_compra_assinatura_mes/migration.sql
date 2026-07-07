-- CreateTable
CREATE TABLE "CompraAssinaturaMes" (
    "id" SERIAL NOT NULL,
    "compraId" INTEGER NOT NULL,
    "mesReferencia" VARCHAR(7) NOT NULL,
    "nfUrl" TEXT,
    "comprovantePagamentoUrl" TEXT,
    "confirmadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoPorId" INTEGER,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompraAssinaturaMes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompraAssinaturaMes_compraId_mesReferencia_key" ON "CompraAssinaturaMes"("compraId", "mesReferencia");

-- CreateIndex
CREATE INDEX "CompraAssinaturaMes_mesReferencia_idx" ON "CompraAssinaturaMes"("mesReferencia");

-- AddForeignKey
ALTER TABLE "CompraAssinaturaMes" ADD CONSTRAINT "CompraAssinaturaMes_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraAssinaturaMes" ADD CONSTRAINT "CompraAssinaturaMes_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
