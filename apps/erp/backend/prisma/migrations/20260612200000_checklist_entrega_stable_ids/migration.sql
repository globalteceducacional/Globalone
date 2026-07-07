-- Vincula entregas de checklist a ids estáveis das tarefas/subtarefas (checklistJson).
ALTER TABLE "ChecklistItemEntrega" ADD COLUMN IF NOT EXISTS "checklistItemId" TEXT;
ALTER TABLE "ChecklistItemEntrega" ADD COLUMN IF NOT EXISTS "subitemId" TEXT;

CREATE INDEX IF NOT EXISTS "ChecklistItemEntrega_checklistItemId_idx" ON "ChecklistItemEntrega"("checklistItemId");
