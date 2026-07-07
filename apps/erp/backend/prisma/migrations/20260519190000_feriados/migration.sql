-- Feriados (dias sem exigência de ponto para todos)
CREATE TABLE "Feriado" (
    "id" SERIAL NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "recorrenteAnual" BOOLEAN NOT NULL DEFAULT false,
    "criadoPorId" INTEGER,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feriado_dataInicio_idx" ON "Feriado"("dataInicio");

ALTER TABLE "Feriado" ADD CONSTRAINT "Feriado_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
