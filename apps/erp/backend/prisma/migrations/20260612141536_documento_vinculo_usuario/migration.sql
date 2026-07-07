-- AlterTable
ALTER TABLE "DocumentoConvite" ADD COLUMN     "usuarioId" INTEGER;

-- AlterTable
ALTER TABLE "DocumentoGlobaltec" ADD COLUMN     "usuarioId" INTEGER;

-- CreateIndex
CREATE INDEX "DocumentoConvite_usuarioId_tipo_idx" ON "DocumentoConvite"("usuarioId", "tipo");

-- CreateIndex
CREATE INDEX "DocumentoGlobaltec_usuarioId_tipo_idx" ON "DocumentoGlobaltec"("usuarioId", "tipo");

-- AddForeignKey
ALTER TABLE "DocumentoGlobaltec" ADD CONSTRAINT "DocumentoGlobaltec_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoConvite" ADD CONSTRAINT "DocumentoConvite_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
