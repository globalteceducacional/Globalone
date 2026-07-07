/*
  Warnings:

  - You are about to drop the column `setorId` on the `Projeto` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Projeto" DROP CONSTRAINT "Projeto_setorId_fkey";

-- DropIndex
DROP INDEX "Projeto_setorId_idx";

-- AlterTable
ALTER TABLE "Projeto" DROP COLUMN "setorId";

-- CreateTable
CREATE TABLE "ProjetoResponsavelExcluido" (
    "projetoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "ProjetoResponsavelExcluido_pkey" PRIMARY KEY ("projetoId","usuarioId")
);

-- CreateTable
CREATE TABLE "_ProjetoSetores" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ProjetoSetores_AB_unique" ON "_ProjetoSetores"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjetoSetores_B_index" ON "_ProjetoSetores"("B");

-- AddForeignKey
ALTER TABLE "ProjetoResponsavelExcluido" ADD CONSTRAINT "ProjetoResponsavelExcluido_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjetoResponsavelExcluido" ADD CONSTRAINT "ProjetoResponsavelExcluido_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjetoSetores" ADD CONSTRAINT "_ProjetoSetores_A_fkey" FOREIGN KEY ("A") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjetoSetores" ADD CONSTRAINT "_ProjetoSetores_B_fkey" FOREIGN KEY ("B") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
