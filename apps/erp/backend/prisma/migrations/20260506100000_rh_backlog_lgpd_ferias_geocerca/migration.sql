-- Backlog: férias CLT, geocerca por unidade.

-- Empregador: geocerca
ALTER TABLE "Empregador" ADD COLUMN "latitudeReferencia" DOUBLE PRECISION;
ALTER TABLE "Empregador" ADD COLUMN "longitudeReferencia" DOUBLE PRECISION;
ALTER TABLE "Empregador" ADD COLUMN "raioMetros" INTEGER;

-- Férias CLT
ALTER TABLE "FeriasSolicitacao" ADD COLUMN "abonoPecuniario" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeriasSolicitacao" ADD COLUMN "tercoConstitucional" DECIMAL(12,2);
ALTER TABLE "FeriasSolicitacao" ADD COLUMN "dataPagamento" TIMESTAMP(3);
