-- Eventos extras do calendário + vínculo em notificações

CREATE TYPE "CalendarioEventoAlvo" AS ENUM ('TODOS_USUARIOS', 'SELECIONADOS');

CREATE TABLE "CalendarioEvento" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "alvo" "CalendarioEventoAlvo" NOT NULL DEFAULT 'SELECIONADOS',
    "criadorId" INTEGER NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarioEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarioEventoParticipante" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "CalendarioEventoParticipante_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notificacao" ADD COLUMN "calendarioEventoId" INTEGER;

CREATE INDEX "Notificacao_calendarioEventoId_idx" ON "Notificacao"("calendarioEventoId");

ALTER TABLE "CalendarioEvento" ADD CONSTRAINT "CalendarioEvento_criadorId_fkey" FOREIGN KEY ("criadorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CalendarioEvento_criadorId_idx" ON "CalendarioEvento"("criadorId");

CREATE INDEX "CalendarioEvento_dataInicio_idx" ON "CalendarioEvento"("dataInicio");

ALTER TABLE "CalendarioEventoParticipante" ADD CONSTRAINT "CalendarioEventoParticipante_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "CalendarioEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarioEventoParticipante" ADD CONSTRAINT "CalendarioEventoParticipante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CalendarioEventoParticipante_eventoId_usuarioId_key" ON "CalendarioEventoParticipante"("eventoId", "usuarioId");

CREATE INDEX "CalendarioEventoParticipante_usuarioId_idx" ON "CalendarioEventoParticipante"("usuarioId");

ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_calendarioEventoId_fkey" FOREIGN KEY ("calendarioEventoId") REFERENCES "CalendarioEvento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES ('calendario', 'eventos', 'Criar e gerenciar eventos de calendário (datas, participantes e notificações)')
ON CONFLICT ("modulo", "acao") DO NOTHING;

INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'sistema' AND parent."acao" = 'administrar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'calendario' AND p."acao" = 'eventos'
ON CONFLICT DO NOTHING;
