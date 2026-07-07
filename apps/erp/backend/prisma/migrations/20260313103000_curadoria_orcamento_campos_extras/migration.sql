-- AlterTable
ALTER TABLE "CuradoriaOrcamento"
ADD COLUMN     "arquivoOrcamentoUrl" TEXT,
ADD COLUMN     "comprovantePagamentoUrl" TEXT,
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "fornecedorId" INTEGER,
ADD COLUMN     "nfUrl" TEXT,
ADD COLUMN     "status" "CompraStatus" NOT NULL DEFAULT 'PENDENTE';

-- CreateIndex
CREATE INDEX "CuradoriaOrcamento_fornecedorId_idx" ON "CuradoriaOrcamento"("fornecedorId");

-- AddForeignKey
ALTER TABLE "CuradoriaOrcamento" ADD CONSTRAINT "CuradoriaOrcamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
