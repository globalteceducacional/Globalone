-- AlterTable
ALTER TABLE "CategoriaCompra"
ADD COLUMN "entraNoEstoque" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "permiteAlocacao" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isAssinatura" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recorrenciaMensal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Compra"
ADD COLUMN "assinaturaConfirmadaMes" VARCHAR(7);
