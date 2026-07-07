-- CreateTable
CREATE TABLE "DocumentoGlobaltec" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "nomeExibicao" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoGlobaltec_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DocumentoGlobaltec" ADD CONSTRAINT "DocumentoGlobaltec_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
