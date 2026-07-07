-- CreateEnum
CREATE TYPE "CategoriaCompraTipo" AS ENUM ('ITEM', 'LIVRO');

-- DropIndex
DROP INDEX "CategoriaCompra_nome_key";

-- AlterTable
ALTER TABLE "CategoriaCompra" ADD COLUMN     "tipo" "CategoriaCompraTipo" NOT NULL DEFAULT 'ITEM';

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaCompra_nome_tipo_key" ON "CategoriaCompra"("nome", "tipo");
