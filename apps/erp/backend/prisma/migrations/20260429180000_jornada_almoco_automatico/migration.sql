-- Almoço automático na jornada (desconto no espelho entre almocoInicio e almocoFim).
ALTER TABLE "JornadaTrabalho" ADD COLUMN "almocoAutomatico" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "JornadaTrabalho" ADD COLUMN "almocoInicio" TEXT NOT NULL DEFAULT '12:00';
ALTER TABLE "JornadaTrabalho" ADD COLUMN "almocoFim" TEXT NOT NULL DEFAULT '13:00';
