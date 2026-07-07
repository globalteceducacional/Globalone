-- AlterTable: Remover foreign key primeiro
ALTER TABLE "Notificacao" DROP CONSTRAINT IF EXISTS "Notificacao_etapaId_fkey";

-- AlterTable: Remover coluna etapaId
ALTER TABLE "Notificacao" DROP COLUMN IF EXISTS "etapaId";
