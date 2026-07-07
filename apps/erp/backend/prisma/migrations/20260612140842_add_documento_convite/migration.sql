-- CreateTable
CREATE TABLE "DocumentoConvite" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usadoEm" TIMESTAMP(3),
    "documentoId" INTEGER,

    CONSTRAINT "DocumentoConvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoConvite_token_key" ON "DocumentoConvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoConvite_documentoId_key" ON "DocumentoConvite"("documentoId");

-- AddForeignKey
ALTER TABLE "DocumentoConvite" ADD CONSTRAINT "DocumentoConvite_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoConvite" ADD CONSTRAINT "DocumentoConvite_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoGlobaltec"("id") ON DELETE SET NULL ON UPDATE CASCADE;
