import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/**
 * Utilitários para o NSR (Número Sequencial de Registro) e cadeia de hash
 * exigida pela Portaria MTE 671/2021 — REP-P.
 *
 * Cada batida grava:
 *   `nsr`           — sequencial gerado por `RegistroPonto_nsr_seq` no Postgres.
 *   `hashAnterior`  — `hashAtual` do registro com NSR imediatamente menor.
 *   `hashAtual`     — SHA-256(nsr|usuarioId|tipo|dataHoraISO|origem|hashAnterior).
 *
 * Garantias:
 *  - A sequência (`nextval`) é atômica no Postgres, mesmo sob alta concorrência.
 *  - Como o `hashAnterior` é o hash do registro com NSR menor, qualquer alteração
 *    posterior em qualquer marcação anterior quebra a cadeia (e fica detectável).
 *  - O `comprovanteId` é um identificador opaco (random) usado pelo QR-code.
 */

export interface BatidaParaHash {
  nsr: number;
  usuarioId: number;
  tipo: string;
  dataHora: Date;
  origem: string;
  hashAnterior: string | null;
}

export function calcularHashAtual(b: BatidaParaHash): string {
  const payload = [
    b.nsr,
    b.usuarioId,
    b.tipo,
    b.dataHora.toISOString(),
    b.origem,
    b.hashAnterior ?? '',
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function gerarComprovanteId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Reserva o próximo NSR (Postgres-only). Roda dentro da transação do Prisma.
 * Falha cedo em outros bancos para forçar configuração explícita.
 */
export async function reservarProximoNsr(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const result = await tx.$queryRawUnsafe<Array<{ nextval: bigint | number }>>(
    'SELECT nextval(\'"RegistroPonto_nsr_seq"\') as nextval',
  );
  const value = result[0]?.nextval;
  if (value === undefined || value === null) {
    throw new Error('Não foi possível obter próximo NSR (sequence ausente).');
  }
  return typeof value === 'bigint' ? Number(value) : value;
}

/** Busca o último hash da cadeia (registro com maior NSR). */
export async function obterUltimoHashCadeia(
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const ultimo = await tx.registroPonto.findFirst({
    where: { nsr: { not: null } },
    orderBy: { nsr: 'desc' },
    select: { hashAtual: true },
  });
  return ultimo?.hashAtual ?? null;
}
