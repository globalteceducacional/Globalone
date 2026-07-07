-- AlterTable
ALTER TABLE "EtapaEntrega" ADD COLUMN     "dataEdicao" TIMESTAMP(3),
ADD COLUMN     "editadoPorId" INTEGER,
ADD COLUMN     "foiEditada" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "EtapaEntrega" ADD CONSTRAINT "EtapaEntrega_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
