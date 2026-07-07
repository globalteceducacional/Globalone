-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "setorId" INTEGER;

-- AlterTable
ALTER TABLE "CuradoriaOrcamento" ADD COLUMN     "setorId" INTEGER;

-- AlterTable
ALTER TABLE "Projeto" ADD COLUMN     "setorId" INTEGER;

-- CreateTable
CREATE TABLE "Setor" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetorUsuario" (
    "setorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "SetorUsuario_pkey" PRIMARY KEY ("setorId","usuarioId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setor_nome_key" ON "Setor"("nome");

-- CreateIndex
CREATE INDEX "SetorUsuario_usuarioId_idx" ON "SetorUsuario"("usuarioId");

-- CreateIndex
CREATE INDEX "Compra_setorId_idx" ON "Compra"("setorId");

-- CreateIndex
CREATE INDEX "CuradoriaOrcamento_setorId_idx" ON "CuradoriaOrcamento"("setorId");

-- CreateIndex
CREATE INDEX "Projeto_setorId_idx" ON "Projeto"("setorId");

-- AddForeignKey
ALTER TABLE "SetorUsuario" ADD CONSTRAINT "SetorUsuario_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetorUsuario" ADD CONSTRAINT "SetorUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuradoriaOrcamento" ADD CONSTRAINT "CuradoriaOrcamento_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
