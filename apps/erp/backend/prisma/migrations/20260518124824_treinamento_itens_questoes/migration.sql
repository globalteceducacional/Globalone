-- CreateEnum
CREATE TYPE "TreinamentoItemTipo" AS ENUM ('VIDEO', 'QUESTAO');

-- CreateTable
CREATE TABLE "TreinamentoItem" (
    "id" SERIAL NOT NULL,
    "treinamentoId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" "TreinamentoItemTipo" NOT NULL,
    "titulo" TEXT,
    "videoUrl" TEXT,
    "videoNome" TEXT,
    "videoTamanhoBytes" INTEGER,
    "videoMimeType" TEXT,
    "questaoJson" JSONB,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreinamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreinamentoItemProgresso" (
    "id" SERIAL NOT NULL,
    "matriculaId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "respostaIndice" INTEGER,
    "respostaCorreta" BOOLEAN,
    "dataConclusao" TIMESTAMP(3),

    CONSTRAINT "TreinamentoItemProgresso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreinamentoItem_treinamentoId_idx" ON "TreinamentoItem"("treinamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "TreinamentoItem_treinamentoId_ordem_key" ON "TreinamentoItem"("treinamentoId", "ordem");

-- CreateIndex
CREATE INDEX "TreinamentoItemProgresso_matriculaId_idx" ON "TreinamentoItemProgresso"("matriculaId");

-- CreateIndex
CREATE UNIQUE INDEX "TreinamentoItemProgresso_matriculaId_itemId_key" ON "TreinamentoItemProgresso"("matriculaId", "itemId");

-- AddForeignKey
ALTER TABLE "TreinamentoItem" ADD CONSTRAINT "TreinamentoItem_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "Treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreinamentoItemProgresso" ADD CONSTRAINT "TreinamentoItemProgresso_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "TreinamentoMatricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreinamentoItemProgresso" ADD CONSTRAINT "TreinamentoItemProgresso_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TreinamentoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
