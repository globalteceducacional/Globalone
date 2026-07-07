-- Compliance Portaria 671/2021 (REP-P), lock retroativo, recibo, auditoria.

-- Usuario.cpf
ALTER TABLE "Usuario" ADD COLUMN "cpf" TEXT;
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");

-- RegistroPonto: NSR + cadeia de hash + comprovanteId
ALTER TABLE "RegistroPonto" ADD COLUMN "nsr" INTEGER;
ALTER TABLE "RegistroPonto" ADD COLUMN "hashAnterior" TEXT;
ALTER TABLE "RegistroPonto" ADD COLUMN "hashAtual" TEXT;
ALTER TABLE "RegistroPonto" ADD COLUMN "comprovanteId" TEXT;
CREATE UNIQUE INDEX "RegistroPonto_nsr_key" ON "RegistroPonto"("nsr");
CREATE UNIQUE INDEX "RegistroPonto_comprovanteId_key" ON "RegistroPonto"("comprovanteId");
CREATE INDEX "RegistroPonto_nsr_idx" ON "RegistroPonto"("nsr");

-- Sequence dedicada para gerar NSR de forma atômica.
CREATE SEQUENCE IF NOT EXISTS "RegistroPonto_nsr_seq" START WITH 1 INCREMENT BY 1;
-- Backfill: atribui NSR aos registros existentes em ordem cronológica para preservar ordem histórica.
DO $$
DECLARE
    rec RECORD;
    counter INTEGER := 0;
BEGIN
    FOR rec IN SELECT id FROM "RegistroPonto" WHERE "nsr" IS NULL ORDER BY "criadoEm" ASC, id ASC LOOP
        counter := counter + 1;
        UPDATE "RegistroPonto" SET "nsr" = counter WHERE id = rec.id;
    END LOOP;
    PERFORM setval('"RegistroPonto_nsr_seq"', GREATEST(counter, 1));
END $$;

-- Empregador
CREATE TABLE "Empregador" (
    "id" SERIAL NOT NULL,
    "tipoIdentificador" INTEGER NOT NULL DEFAULT 1,
    "identificador" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cei" TEXT,
    "endereco" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT true,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Empregador_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Empregador_identificador_key" ON "Empregador"("identificador");

-- BancoHorasFechamento: campos de NSR/recibo/aceite
ALTER TABLE "BancoHorasFechamento" ADD COLUMN "nsrInicial" INTEGER;
ALTER TABLE "BancoHorasFechamento" ADD COLUMN "nsrFinal" INTEGER;
ALTER TABLE "BancoHorasFechamento" ADD COLUMN "reciboHash" TEXT;
ALTER TABLE "BancoHorasFechamento" ADD COLUMN "reciboPdfUrl" TEXT;
ALTER TABLE "BancoHorasFechamento" ADD COLUMN "aceiteEm" TIMESTAMP(3);
ALTER TABLE "BancoHorasFechamento" ADD COLUMN "aceiteIp" TEXT;

-- BancoHorasFechamentoLog (audit trail)
CREATE TABLE "BancoHorasFechamentoLog" (
    "id" SERIAL NOT NULL,
    "fechamentoId" INTEGER NOT NULL,
    "evento" TEXT NOT NULL,
    "executorId" INTEGER,
    "motivo" TEXT,
    "snapshot" JSONB,
    "ip" TEXT,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BancoHorasFechamentoLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BancoHorasFechamentoLog_fechamentoId_dataCriacao_idx"
    ON "BancoHorasFechamentoLog"("fechamentoId", "dataCriacao");
ALTER TABLE "BancoHorasFechamentoLog"
    ADD CONSTRAINT "BancoHorasFechamentoLog_fechamentoId_fkey"
    FOREIGN KEY ("fechamentoId") REFERENCES "BancoHorasFechamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BancoHorasFechamentoLog"
    ADD CONSTRAINT "BancoHorasFechamentoLog_executorId_fkey"
    FOREIGN KEY ("executorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BancoHorasReaberturaDesafio (substitui Map em memória)
CREATE TABLE "BancoHorasReaberturaDesafio" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "usuarioAlvoId" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "hashPalavra" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "motivo" TEXT,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BancoHorasReaberturaDesafio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BancoHorasReaberturaDesafio_adminId_usuarioAlvoId_competencia_usadoEm_idx"
    ON "BancoHorasReaberturaDesafio"("adminId", "usuarioAlvoId", "competencia", "usadoEm");
ALTER TABLE "BancoHorasReaberturaDesafio"
    ADD CONSTRAINT "BancoHorasReaberturaDesafio_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BancoHorasReaberturaDesafio"
    ADD CONSTRAINT "BancoHorasReaberturaDesafio_usuarioAlvoId_fkey"
    FOREIGN KEY ("usuarioAlvoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissões novas (Permission(modulo, acao, descricao))
INSERT INTO "Permission" ("modulo", "acao", "descricao") VALUES
    ('ponto', 'exportar_afd', 'Exportar Arquivo Fonte de Dados (Portaria MTE 671/2021).'),
    ('banco_horas', 'aprovar_uso_extras', 'Aprovar/reprovar solicitação de uso de horas extras.'),
    ('rh', 'gerenciar_empregador', 'Gerenciar dados do empregador (CNPJ/CEI) usado em AFD/comprovantes.')
ON CONFLICT ("modulo", "acao") DO NOTHING;
