-- AlterTable: Garantir que dois projetos não possam ter o mesmo nome
CREATE UNIQUE INDEX "Projeto_nome_key" ON "Projeto"("nome");
