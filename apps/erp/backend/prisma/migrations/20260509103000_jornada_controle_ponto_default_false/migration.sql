-- Novos cadastros: sem ponto/BH até a primeira batida (ou até o RH marcar).
ALTER TABLE "JornadaTrabalho" ALTER COLUMN "controlePonto" SET DEFAULT false;

-- Quem nunca registrou ponto passa a ficar dispensado por padrão (alinhado ao novo default).
UPDATE "JornadaTrabalho" j
SET "controlePonto" = false
WHERE NOT EXISTS (
  SELECT 1 FROM "RegistroPonto" r WHERE r."usuarioId" = j."usuarioId"
);
