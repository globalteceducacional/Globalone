-- CreateEnum
CREATE TYPE "TipoBatida" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "OrigemPonto" AS ENUM ('NORMAL', 'AJUSTE_RH');

-- CreateTable
CREATE TABLE "RegistroPonto" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoBatida" NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precisaoGps" DOUBLE PRECISION,
    "fotoUrl" TEXT,
    "ip" TEXT,
    "origem" "OrigemPonto" NOT NULL DEFAULT 'NORMAL',
    "observacao" TEXT,
    "ajustadoPorId" INTEGER,
    "justificativa" TEXT,
    "ajustadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroPonto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroPonto_usuarioId_dataHora_idx" ON "RegistroPonto"("usuarioId", "dataHora");

-- CreateIndex
CREATE INDEX "RegistroPonto_ajustadoPorId_idx" ON "RegistroPonto"("ajustadoPorId");

-- AddForeignKey
ALTER TABLE "RegistroPonto"
ADD CONSTRAINT "RegistroPonto_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroPonto"
ADD CONSTRAINT "RegistroPonto_ajustadoPorId_fkey"
FOREIGN KEY ("ajustadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
