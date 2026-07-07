-- Geocerca individual: override por colaborador na jornada de trabalho.
-- Quando preenchidos, esses 3 campos sobrescrevem a geocerca do `Empregador`
-- principal para a batida de ponto desse usuário específico.

ALTER TABLE "JornadaTrabalho" ADD COLUMN "latitudeReferencia"  DOUBLE PRECISION;
ALTER TABLE "JornadaTrabalho" ADD COLUMN "longitudeReferencia" DOUBLE PRECISION;
ALTER TABLE "JornadaTrabalho" ADD COLUMN "raioMetros"          INTEGER;
