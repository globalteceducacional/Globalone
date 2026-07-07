-- CreateTable
CREATE TABLE "DocumentoPatenteAplicacao" (
    "id" SERIAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "nomeExibicao" TEXT NOT NULL,
    "descricao" TEXT,
    "numeroReferencia" TEXT,
    "nomeArquivo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'upload',
    "documentoGlobaltecId" INTEGER,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoPatenteAplicacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoPatenteAplicacao_documentoGlobaltecId_key" ON "DocumentoPatenteAplicacao"("documentoGlobaltecId");

-- CreateIndex
CREATE INDEX "DocumentoPatenteAplicacao_categoria_idx" ON "DocumentoPatenteAplicacao"("categoria");

-- CreateIndex
CREATE INDEX "DocumentoPatenteAplicacao_origem_idx" ON "DocumentoPatenteAplicacao"("origem");

-- AddForeignKey
ALTER TABLE "DocumentoPatenteAplicacao" ADD CONSTRAINT "DocumentoPatenteAplicacao_documentoGlobaltecId_fkey" FOREIGN KEY ("documentoGlobaltecId") REFERENCES "DocumentoGlobaltec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoPatenteAplicacao" ADD CONSTRAINT "DocumentoPatenteAplicacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
