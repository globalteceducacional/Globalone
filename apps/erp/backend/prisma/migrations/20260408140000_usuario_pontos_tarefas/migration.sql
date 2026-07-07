-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "pontosTarefas" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ChecklistItemEntrega" ADD COLUMN "pontosAtribuidos" INTEGER;

-- Entregas já aprovadas: 1 ponto por tarefa (comportamento legado)
UPDATE "ChecklistItemEntrega"
SET "pontosAtribuidos" = 1
WHERE "status" = 'APROVADO' AND "pontosAtribuidos" IS NULL;

-- Recalcular totais por executor a partir das entregas aprovadas
UPDATE "Usuario" u
SET "pontosTarefas" = COALESCE(
  (
    SELECT SUM(c."pontosAtribuidos")
    FROM "ChecklistItemEntrega" c
    WHERE c."executorId" = u."id"
      AND c."status" = 'APROVADO'
      AND c."pontosAtribuidos" IS NOT NULL
  ),
  0
);
