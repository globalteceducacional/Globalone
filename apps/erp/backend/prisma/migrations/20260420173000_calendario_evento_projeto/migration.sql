-- Vincula eventos de calendário a projetos (opcional).
ALTER TABLE "CalendarioEvento"
ADD COLUMN "projetoId" INTEGER;

CREATE INDEX "CalendarioEvento_projetoId_idx" ON "CalendarioEvento"("projetoId");

ALTER TABLE "CalendarioEvento"
ADD CONSTRAINT "CalendarioEvento_projetoId_fkey"
FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
