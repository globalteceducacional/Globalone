-- AlterTable
ALTER TABLE "Etapa" ADD COLUMN     "sessaoId" INTEGER;

-- CreateTable
CREATE TABLE "Sessao" (
    "id" SERIAL NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sessao_projetoId_idx" ON "Sessao"("projetoId");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
