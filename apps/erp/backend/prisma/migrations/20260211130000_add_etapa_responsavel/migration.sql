-- AlterTable: Responsável da etapa (quem pode aprovar/reprovar itens; não precisa ter acesso ao projeto na aba Projetos)
ALTER TABLE "Etapa" ADD COLUMN IF NOT EXISTS "responsavelId" INTEGER;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_responsavelId_fkey" 
  FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
