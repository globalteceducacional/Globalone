import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Valida se a competência (YYYY-MM) do colaborador NÃO está fechada.
 * Caso esteja, bloqueia a escrita com 403 (lock retroativo).
 *
 * Uso típico: `bater`, `criarAjuste`, `editar`, `lancarManual`,
 * aprovação de ajuste/uso de extras, registro/aprovação de afastamento/férias.
 */
export function competenciaDe(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function competenciaDeLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function assertCompetenciaAberta(
  prisma: PrismaClient,
  usuarioId: number,
  competencia: string,
): Promise<void> {
  const fechamento = await prisma.bancoHorasFechamento.findUnique({
    where: { usuarioId_competencia: { usuarioId, competencia } },
    select: { id: true, competencia: true },
  });
  if (fechamento) {
    throw new ForbiddenException(
      `Competência ${competencia} já está fechada para este colaborador. Reabra o fechamento (com a palavra-chave) para registrar alterações retroativas.`,
    );
  }
}

/** Versão que aceita Date e calcula a competência local. */
export async function assertCompetenciaAbertaPorData(
  prisma: PrismaClient,
  usuarioId: number,
  data: Date,
): Promise<void> {
  return assertCompetenciaAberta(prisma, usuarioId, competenciaDeLocal(data));
}
