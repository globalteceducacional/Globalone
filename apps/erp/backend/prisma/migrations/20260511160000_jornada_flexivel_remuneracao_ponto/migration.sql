-- CreateEnum
CREATE TYPE "RemuneracaoPontoTipo" AS ENUM ('NENHUMA', 'VALOR_HORA', 'MENSAL_META_HORAS');

-- AlterTable
ALTER TABLE "JornadaTrabalho" ADD COLUMN "horarioFlexivel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JornadaTrabalho" ADD COLUMN "remuneracaoPontoTipo" "RemuneracaoPontoTipo" NOT NULL DEFAULT 'NENHUMA';
ALTER TABLE "JornadaTrabalho" ADD COLUMN "valorHora" DECIMAL(12,4);
ALTER TABLE "JornadaTrabalho" ADD COLUMN "valorMensal" DECIMAL(14,2);
ALTER TABLE "JornadaTrabalho" ADD COLUMN "metaHorasMensalMin" INTEGER;
