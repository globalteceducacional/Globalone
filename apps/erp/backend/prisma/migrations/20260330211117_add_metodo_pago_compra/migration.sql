-- CreateTable
CREATE TABLE "MetodoPagoCompra" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetodoPagoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetodoPagoCompra_nome_key" ON "MetodoPagoCompra"("nome");
