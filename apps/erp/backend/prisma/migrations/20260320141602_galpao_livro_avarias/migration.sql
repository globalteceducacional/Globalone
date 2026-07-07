-- CreateTable
CREATE TABLE "GalpaoLivroAvaria" (
    "id" SERIAL NOT NULL,
    "galpaoProdutoId" INTEGER,
    "isbn" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "quantidade" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoPorId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalpaoLivroAvaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalpaoLivroAvaria_galpaoProdutoId_idx" ON "GalpaoLivroAvaria"("galpaoProdutoId");

-- CreateIndex
CREATE INDEX "GalpaoLivroAvaria_isbn_idx" ON "GalpaoLivroAvaria"("isbn");

-- CreateIndex
CREATE INDEX "GalpaoLivroAvaria_categoriaId_idx" ON "GalpaoLivroAvaria"("categoriaId");

-- AddForeignKey
ALTER TABLE "GalpaoLivroAvaria" ADD CONSTRAINT "GalpaoLivroAvaria_galpaoProdutoId_fkey" FOREIGN KEY ("galpaoProdutoId") REFERENCES "GalpaoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoLivroAvaria" ADD CONSTRAINT "GalpaoLivroAvaria_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalpaoLivroAvaria" ADD CONSTRAINT "GalpaoLivroAvaria_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
