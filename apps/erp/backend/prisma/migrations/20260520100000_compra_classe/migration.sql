-- Classe do lançamento (estoque / despesa / assinatura), independente da categoria
CREATE TYPE "CompraClasse" AS ENUM ('ESTOQUE', 'DESPESA', 'ASSINATURA');

ALTER TABLE "Compra" ADD COLUMN "classe" "CompraClasse" NOT NULL DEFAULT 'ESTOQUE';

UPDATE "Compra" AS c
SET "classe" = 'ASSINATURA'
FROM "CategoriaCompra" AS cat
WHERE c."categoriaId" = cat.id AND cat."isAssinatura" = true;

UPDATE "Compra" AS c
SET "classe" = 'DESPESA'
FROM "CategoriaCompra" AS cat
WHERE c."categoriaId" = cat.id AND cat."isDespesa" = true AND c."classe" = 'ESTOQUE';
