-- AlterTable: Remover colunas nivelAcesso e herdaPermissoes do Cargo
ALTER TABLE "Cargo" DROP COLUMN IF EXISTS "nivelAcesso";
ALTER TABLE "Cargo" DROP COLUMN IF EXISTS "herdaPermissoes";

-- DropEnum: Remover enum CargoNivel (não mais utilizado)
DROP TYPE IF EXISTS "CargoNivel";
