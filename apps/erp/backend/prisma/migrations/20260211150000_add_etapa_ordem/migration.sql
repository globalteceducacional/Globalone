-- AlterTable: adicionar coluna ordem em Etapa para permitir reordenação
ALTER TABLE "Etapa" ADD COLUMN IF NOT EXISTS "ordem" INTEGER NOT NULL DEFAULT 0;

-- Atualizar etapas existentes: definir ordem = id para manter ordem atual
UPDATE "Etapa" SET "ordem" = "id" WHERE "ordem" = 0;
