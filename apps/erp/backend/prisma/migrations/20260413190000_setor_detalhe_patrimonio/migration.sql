-- CreateEnum
CREATE TYPE "SetorPatrimonioMaterialCategoria" AS ENUM ('INSUMO', 'EQUIPAMENTO', 'FERRAMENTA');

-- CreateEnum
CREATE TYPE "SetorPatrimonioImaterialTipo" AS ENUM ('LICENCA', 'SOFTWARE', 'CONTEUDO_IMATERIAL');

-- AlterTable
ALTER TABLE "Setor" ADD COLUMN "chefeId" INTEGER;

-- CreateIndex
CREATE INDEX "Setor_chefeId_idx" ON "Setor"("chefeId");

-- AddForeignKey
ALTER TABLE "Setor" ADD CONSTRAINT "Setor_chefeId_fkey" FOREIGN KEY ("chefeId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SetorPatrimonioMaterial" (
    "id" SERIAL NOT NULL,
    "setorId" INTEGER NOT NULL,
    "categoria" "SetorPatrimonioMaterialCategoria" NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" INTEGER,
    "unidade" TEXT,
    "especificacao" TEXT,
    "localizacao" TEXT,
    "usuarioAtribuidoId" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetorPatrimonioMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetorPatrimonioImaterial" (
    "id" SERIAL NOT NULL,
    "setorId" INTEGER NOT NULL,
    "tipo" "SetorPatrimonioImaterialTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "fornecedor" TEXT,
    "dataValidade" TIMESTAMP(3),
    "observacoes" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetorPatrimonioImaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SetorPatrimonioMaterial_setorId_idx" ON "SetorPatrimonioMaterial"("setorId");

-- CreateIndex
CREATE INDEX "SetorPatrimonioMaterial_usuarioAtribuidoId_idx" ON "SetorPatrimonioMaterial"("usuarioAtribuidoId");

-- CreateIndex
CREATE INDEX "SetorPatrimonioImaterial_setorId_idx" ON "SetorPatrimonioImaterial"("setorId");

-- AddForeignKey
ALTER TABLE "SetorPatrimonioMaterial" ADD CONSTRAINT "SetorPatrimonioMaterial_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetorPatrimonioMaterial" ADD CONSTRAINT "SetorPatrimonioMaterial_usuarioAtribuidoId_fkey" FOREIGN KEY ("usuarioAtribuidoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetorPatrimonioImaterial" ADD CONSTRAINT "SetorPatrimonioImaterial_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
