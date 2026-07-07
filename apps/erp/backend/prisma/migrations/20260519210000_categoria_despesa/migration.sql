-- Categoria de despesa operacional (sem estoque e sem assinatura mensal)
ALTER TABLE "CategoriaCompra" ADD COLUMN "isDespesa" BOOLEAN NOT NULL DEFAULT false;
