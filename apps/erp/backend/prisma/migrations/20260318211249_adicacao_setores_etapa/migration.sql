-- CreateTable
CREATE TABLE "_EtapaSetores" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_EtapaSetores_AB_unique" ON "_EtapaSetores"("A", "B");

-- CreateIndex
CREATE INDEX "_EtapaSetores_B_index" ON "_EtapaSetores"("B");

-- AddForeignKey
ALTER TABLE "_EtapaSetores" ADD CONSTRAINT "_EtapaSetores_A_fkey" FOREIGN KEY ("A") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EtapaSetores" ADD CONSTRAINT "_EtapaSetores_B_fkey" FOREIGN KEY ("B") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
