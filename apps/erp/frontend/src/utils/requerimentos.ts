export const SETOR_COMPRAS_LABEL = 'Setor de Compras';

export type RequerimentoLeitura = 'Lida' | 'Não lida' | '—';

/** Leitura pelo destinatário (abrir o detalhe marca como lida). Compras: setor inteiro. */
export function requerimentoLeituraLabel(r: {
  tipo?: string;
  destinatarioId?: number | null;
  dataLeituraDestinatario?: string | null;
}): RequerimentoLeitura {
  const aplicaLeitura = r.tipo === 'COMPRA' || r.destinatarioId != null;
  if (!aplicaLeitura) return '—';
  return r.dataLeituraDestinatario ? 'Lida' : 'Não lida';
}

export function requerimentoDestinatarioLabel(r: {
  tipo?: string;
  destinatario?: { nome: string } | null;
}): string {
  if (r.tipo === 'COMPRA') return SETOR_COMPRAS_LABEL;
  return r.destinatario?.nome ?? '—';
}

export function normalizeRequerimentoSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
