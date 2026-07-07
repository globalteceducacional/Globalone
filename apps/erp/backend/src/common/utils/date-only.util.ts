import { BadRequestException } from '@nestjs/common';

/** Converte YYYY-MM-DD para Date UTC (compatível com `@db.Date` do Prisma/PostgreSQL). */
export function parseDateOnlyYmd(raw: string, field = 'data'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} deve estar no formato YYYY-MM-DD.`);
  }
  const [y, m, d] = raw.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formata Date de `@db.Date` como YYYY-MM-DD usando componentes UTC (evita −1 dia em UTC−3). */
export function formatDateOnlyYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dia civil local a partir de um `@db.Date` lido do banco. */
export function civilDateFromDb(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Mesmo mês/dia de `date` (@db.Date) em outro ano, no fuso local do servidor. */
export function civilDateInYear(date: Date, ano: number): Date {
  return new Date(ano, date.getUTCMonth(), date.getUTCDate());
}

export function endOfCivilDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Itera dias civis inclusivos entre duas datas locais. */
export function* iterarDiasCivis(inicio: Date, fim: Date): Generator<string> {
  const cur = new Date(inicio);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(fim);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    yield `${y}-${m}-${d}`;
    cur.setDate(cur.getDate() + 1);
  }
}
