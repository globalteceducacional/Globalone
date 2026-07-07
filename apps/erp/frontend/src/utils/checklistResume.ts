import type { ChecklistItem } from '../types';

/** Item principal considerado concluído só se ele e todos os subitens estiverem marcados. */
export function isChecklistItemFullyDone(item: ChecklistItem): boolean {
  const subs = item.subitens;
  const subOk = !subs?.length || subs.every((s) => s.concluido === true);
  return item.concluido === true && subOk;
}

export type EtapaChecklistSlice = {
  executorId: number;
  responsavelId?: number | null;
  checklistJson?: ChecklistItem[] | null;
  /** null = todos os itens visíveis (executor/responsável ou lista completa para integrante). */
  meuTrabalhoChecklistIndices?: number[] | null;
  integrantes?: Array<{ usuario?: { id: number }; usuarioId?: number }>;
};

function isIntegranteEtapa(etapa: EtapaChecklistSlice, userId: number): boolean {
  const list = etapa.integrantes ?? [];
  return list.some((i) => Number(i.usuario?.id ?? i.usuarioId) === userId);
}

/**
 * Índices de itens do checklist visíveis para o usuário (mesma regra do backend meuTrabalhoChecklistIndices).
 * userId undefined = conta todos os itens (ex.: resumo global do GM).
 */
export function visibleChecklistIndices(etapa: EtapaChecklistSlice, userId?: number): number[] | null {
  const raw = etapa.checklistJson;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (userId == null) return null;

  if (Number(etapa.executorId) === userId) return null;
  if (etapa.responsavelId != null && Number(etapa.responsavelId) === userId) return null;

  if (!isIntegranteEtapa(etapa, userId)) return [];

  const visible: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as ChecklistItem & { integrantesIds?: unknown };
    const ids = row.integrantesIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      visible.push(i);
      continue;
    }
    const allowed = new Set(ids.map((n) => Number(n)));
    if (allowed.has(userId)) visible.push(i);
  }
  const full = raw.map((_, idx) => idx);
  const same =
    visible.length === full.length && full.every((idx) => visible.includes(idx));
  if (same) return null;
  return visible.sort((a, b) => a - b);
}

export function countChecklistForEtapa(etapa: EtapaChecklistSlice, userId?: number): {
  total: number;
  concluidos: number;
} {
  const list = etapa.checklistJson;
  if (!Array.isArray(list) || list.length === 0) return { total: 0, concluidos: 0 };

  if (userId != null) {
    const isExec = Number(etapa.executorId) === userId;
    const isResp = etapa.responsavelId != null && Number(etapa.responsavelId) === userId;
    const isInt = isIntegranteEtapa(etapa, userId);
    if (!isExec && !isResp && !isInt) {
      return { total: 0, concluidos: 0 };
    }
  }

  const apiIdx = etapa.meuTrabalhoChecklistIndices;
  let useSet: Set<number> | null = null;
  if (Array.isArray(apiIdx)) {
    useSet = new Set(
      apiIdx.filter((i) => Number.isInteger(i) && i >= 0 && i < list.length),
    );
  } else if (apiIdx === undefined) {
    const derived = visibleChecklistIndices(etapa, userId);
    useSet = derived != null ? new Set(derived) : null;
  }
  // apiIdx === null (API): executor/responsável ou integrante vendo lista completa — conta todos os itens

  let total = 0;
  let concluidos = 0;
  for (let i = 0; i < list.length; i++) {
    if (useSet && !useSet.has(i)) continue;
    total += 1;
    if (isChecklistItemFullyDone(list[i])) concluidos += 1;
  }
  return { total, concluidos };
}

export function aggregateChecklistForEtapas(
  etapas: EtapaChecklistSlice[],
  userId?: number,
): { total: number; concluidos: number } {
  return etapas.reduce(
    (acc, e) => {
      const c = countChecklistForEtapa(e, userId);
      return { total: acc.total + c.total, concluidos: acc.concluidos + c.concluidos };
    },
    { total: 0, concluidos: 0 },
  );
}
