import type { ChecklistItem, ChecklistSubItem } from '../types';

export function newChecklistItemId(): string {
  return crypto.randomUUID();
}

export function newChecklistSubItemId(): string {
  return crypto.randomUUID();
}

export function createEmptyChecklistItem(): ChecklistItem {
  return {
    id: newChecklistItemId(),
    texto: '',
    concluido: false,
    descricao: '',
    pontos: 1,
    subitens: [],
  };
}

export function createEmptyChecklistSubItem(): ChecklistSubItem {
  return {
    id: newChecklistSubItemId(),
    texto: '',
    concluido: false,
    descricao: '',
  };
}

/** Normaliza item vindo da API — atribui id se ainda não existir (dados legados). */
export function normalizeChecklistItemFromApi(item: Record<string, unknown>): ChecklistItem {
  const rawSubs = Array.isArray(item.subitens) ? item.subitens : [];
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : newChecklistItemId(),
    texto: typeof item.texto === 'string' ? item.texto : '',
    concluido: Boolean(item.concluido),
    descricao: typeof item.descricao === 'string' ? item.descricao : '',
    pontos: typeof item.pontos === 'number' ? item.pontos : 1,
    ...(Array.isArray(item.integrantesIds) && item.integrantesIds.length > 0
      ? {
          integrantesIds: (item.integrantesIds as unknown[])
            .map((n) => Number(n))
            .filter((n) => n > 0),
        }
      : {}),
    subitens: rawSubs.map((sub) => {
      const s = sub as Record<string, unknown>;
      return {
        id: typeof s.id === 'string' && s.id.trim() ? s.id : newChecklistSubItemId(),
        texto: typeof s.texto === 'string' ? s.texto : '',
        concluido: Boolean(s.concluido),
        descricao: typeof s.descricao === 'string' ? s.descricao : '',
      };
    }),
  };
}

/** Prepara checklist para envio à API — preserva ids estáveis e subtarefas existentes. */
export function serializeChecklistItemForApi(item: ChecklistItem) {
  return {
    ...(item.id ? { id: item.id } : { id: newChecklistItemId() }),
    texto: item.texto.trim(),
    concluido: item.concluido || false,
    descricao: item.descricao?.trim() || '',
    pontos: item.pontos,
    ...(Array.isArray(item.integrantesIds) && item.integrantesIds.length > 0
      ? { integrantesIds: [...new Set(item.integrantesIds.map((id) => Number(id)).filter((id) => id > 0))] }
      : {}),
    subitens: (item.subitens || [])
      .filter(
        (sub) =>
          (sub.texto && sub.texto.trim().length > 0) ||
          (typeof sub.id === 'string' && sub.id.trim().length > 0),
      )
      .map((sub) => ({
        ...(sub.id ? { id: sub.id } : { id: newChecklistSubItemId() }),
        texto: sub.texto.trim(),
        concluido: sub.concluido || false,
        descricao: sub.descricao?.trim() || '',
      })),
  };
}
