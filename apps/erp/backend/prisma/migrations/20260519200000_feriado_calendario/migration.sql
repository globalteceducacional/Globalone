-- Vincula eventos do calendário aos feriados de RH
ALTER TABLE "CalendarioEvento" ADD COLUMN "feriadoId" INTEGER;

CREATE INDEX "CalendarioEvento_feriadoId_idx" ON "CalendarioEvento"("feriadoId");

ALTER TABLE "CalendarioEvento" ADD CONSTRAINT "CalendarioEvento_feriadoId_fkey" FOREIGN KEY ("feriadoId") REFERENCES "Feriado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
