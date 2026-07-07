import type { PagoPorEntry } from '../types/stock';

export function createEmptyPagoPorEntry(): PagoPorEntry {
  return { tipo: 'metodo', metodoId: 0, descricao: '' };
}

/** Converte resposta da API (JSON) para o estado do formulário. */
export function normalizePagoPorFromApi(raw: unknown): PagoPorEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: PagoPorEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (o.tipo === 'usuario' && typeof o.usuarioId === 'number') {
      const nome = typeof o.nome === 'string' ? o.nome : '';
      out.push({ tipo: 'usuario', usuarioId: o.usuarioId, nome });
    } else if (o.tipo === 'pessoa' && typeof o.nome === 'string') {
      out.push({ tipo: 'pessoa', nome: o.nome });
    } else if (o.tipo === 'metodo') {
      const descricao = typeof o.descricao === 'string' ? o.descricao : '';
      const metodoId = typeof o.metodoId === 'number' && o.metodoId > 0 ? o.metodoId : 0;
      out.push({ tipo: 'metodo', metodoId, descricao });
    }
  }
  return out;
}

/** Monta o corpo esperado pelo backend (CreatePurchaseDto / UpdatePurchaseDto). */
export function pagoPorToApiPayload(
  entries: PagoPorEntry[],
): { tipo: 'usuario' | 'pessoa' | 'metodo'; usuarioId?: number; texto?: string; metodoId?: number }[] {
  const out: {
    tipo: 'usuario' | 'pessoa' | 'metodo';
    usuarioId?: number;
    texto?: string;
    metodoId?: number;
  }[] = [];
  for (const e of entries) {
    if (e.tipo === 'usuario' && e.usuarioId) {
      out.push({ tipo: 'usuario', usuarioId: e.usuarioId });
    } else if (e.tipo === 'pessoa' && e.nome?.trim()) {
      out.push({ tipo: 'pessoa', texto: e.nome.trim() });
    } else if (e.tipo === 'metodo') {
      if (e.metodoId > 0) {
        out.push({ tipo: 'metodo', metodoId: e.metodoId });
      } else if (e.descricao?.trim()) {
        out.push({ tipo: 'metodo', texto: e.descricao.trim() });
      }
    }
  }
  return out;
}

export function formatPagoPorLine(e: PagoPorEntry): string {
  if (e.tipo === 'usuario') return e.nome?.trim() || `Usuário #${e.usuarioId}`;
  if (e.tipo === 'pessoa') return e.nome?.trim() || '';
  return e.descricao?.trim() || '';
}

export function formatPagoPorSummary(entries: PagoPorEntry[] | null | undefined): string {
  if (!entries?.length) return '';
  return entries.map(formatPagoPorLine).filter(Boolean).join(' · ');
}

/** Compra inclui o método (por id em pagoPorJson ou legado só com descrição igual ao nome). */
export function purchaseMatchesMetodoPago(
  pagoPorJson: unknown,
  metodoId: number,
  metodoNome?: string,
): boolean {
  if (!pagoPorJson || !Array.isArray(pagoPorJson)) return false;
  const nomeNorm = metodoNome?.trim().toLowerCase();
  for (const x of pagoPorJson) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (o.tipo !== 'metodo') continue;
    const mid = typeof o.metodoId === 'number' ? o.metodoId : 0;
    if (mid > 0) {
      if (mid === metodoId) return true;
      continue;
    }
    if (nomeNorm && typeof o.descricao === 'string' && o.descricao.trim().toLowerCase() === nomeNorm) {
      return true;
    }
  }
  return false;
}
