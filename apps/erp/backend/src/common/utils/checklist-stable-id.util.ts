import { randomUUID } from 'crypto';

export type ChecklistJsonRow = {
  id?: string;
  texto?: string;
  descricao?: string;
  subitens?: Array<{ id?: string; texto?: string; descricao?: string }>;
};

/** Normaliza texto/descrição para comparação ao remapear entregas. */
export function normalizeChecklistMatchText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

export function checklistRowMatchKey(row: ChecklistJsonRow | undefined): string {
  if (!row) return '';
  return `${normalizeChecklistMatchText(row.texto)}\0${normalizeChecklistMatchText(row.descricao)}`;
}

/** Garante `id` estável em cada tarefa e subtarefa (preserva ids existentes). */
export function ensureChecklistStableIds<T extends ChecklistJsonRow>(checklist: T[]): T[] {
  return checklist.map((item) => {
    const next = { ...item } as T & { id?: string };
    if (!next.id || typeof next.id !== 'string' || !next.id.trim()) {
      next.id = randomUUID();
    }
    if (Array.isArray(item.subitens)) {
      (next as ChecklistJsonRow).subitens = item.subitens.map((sub) => {
        const s = { ...sub };
        if (!s.id || typeof s.id !== 'string' || !s.id.trim()) {
          s.id = randomUUID();
        }
        return s;
      });
    }
    return next;
  });
}

/**
 * Mapa índice antigo → novo ao reordenar/adicionar/remover tarefas.
 * Prioridade: 1) id estável  2) texto+descrição normalizados  3) posição (só se tamanho igual).
 */
export function buildChecklistOldToNewMap(
  oldList: ChecklistJsonRow[],
  newList: ChecklistJsonRow[],
): Record<number, number> {
  const oldToNew: Record<number, number> = {};
  const usedNew = new Set<number>();

  for (let oldIdx = 0; oldIdx < oldList.length; oldIdx++) {
    const oldId = oldList[oldIdx]?.id;
    if (!oldId || typeof oldId !== 'string') continue;
    const newIdx = newList.findIndex((n, ni) => !usedNew.has(ni) && n.id === oldId);
    if (newIdx >= 0) {
      oldToNew[oldIdx] = newIdx;
      usedNew.add(newIdx);
    }
  }

  for (let oldIdx = 0; oldIdx < oldList.length; oldIdx++) {
    if (oldToNew[oldIdx] !== undefined) continue;
    const oldKey = checklistRowMatchKey(oldList[oldIdx]);
    if (!oldKey || oldKey === '\0') continue;
    const newIdx = newList.findIndex(
      (n, ni) => !usedNew.has(ni) && checklistRowMatchKey(n) === oldKey,
    );
    if (newIdx >= 0) {
      oldToNew[oldIdx] = newIdx;
      usedNew.add(newIdx);
    }
  }

  if (oldList.length === newList.length) {
    for (let oldIdx = 0; oldIdx < oldList.length; oldIdx++) {
      if (oldToNew[oldIdx] !== undefined) continue;
      if (!usedNew.has(oldIdx)) {
        oldToNew[oldIdx] = oldIdx;
        usedNew.add(oldIdx);
      }
    }
  }

  return oldToNew;
}

export function buildSubitemOldToNewMap(
  oldSubitens: Array<{ id?: string; texto?: string; descricao?: string }>,
  newSubitens: Array<{ id?: string; texto?: string; descricao?: string }>,
): Record<number, number> {
  const map: Record<number, number> = {};
  const usedNew = new Set<number>();

  for (let oldIdx = 0; oldIdx < oldSubitens.length; oldIdx++) {
    const oldId = oldSubitens[oldIdx]?.id;
    if (!oldId || typeof oldId !== 'string') continue;
    const newIdx = newSubitens.findIndex((n, ni) => !usedNew.has(ni) && n.id === oldId);
    if (newIdx >= 0) {
      map[oldIdx] = newIdx;
      usedNew.add(newIdx);
    }
  }

  for (let oldIdx = 0; oldIdx < oldSubitens.length; oldIdx++) {
    if (map[oldIdx] !== undefined) continue;
    const oldKey = checklistRowMatchKey(oldSubitens[oldIdx]);
    if (!oldKey || oldKey === '\0') continue;
    const newIdx = newSubitens.findIndex(
      (n, ni) => !usedNew.has(ni) && checklistRowMatchKey(n) === oldKey,
    );
    if (newIdx >= 0) {
      map[oldIdx] = newIdx;
      usedNew.add(newIdx);
    }
  }

  if (oldSubitens.length === newSubitens.length) {
    for (let oldIdx = 0; oldIdx < oldSubitens.length; oldIdx++) {
      if (map[oldIdx] !== undefined) continue;
      if (!usedNew.has(oldIdx)) {
        map[oldIdx] = oldIdx;
        usedNew.add(oldIdx);
      }
    }
  }

  return map;
}

/** Propaga ids do checklist anterior para o novo (match por id ou texto). Itens novos recebem uuid. */
export function reconcileChecklistIdsForPersist<T extends ChecklistJsonRow>(
  newList: T[],
  oldList: ChecklistJsonRow[],
  /** Evita gerar UUIDs diferentes entre reconcile e reindex na mesma requisição. */
  oldPrepared?: ChecklistJsonRow[],
): T[] {
  const oldWithIds = oldPrepared ?? ensureChecklistStableIds(oldList);
  const oldToNew = buildChecklistOldToNewMap(oldWithIds, newList);

  return newList.map((item, newIdx) => {
    const oldIdxEntry = Object.entries(oldToNew).find(([, ni]) => ni === newIdx);
    const oldIdx = oldIdxEntry ? Number(oldIdxEntry[0]) : undefined;
    const oldItem = oldIdx !== undefined ? oldWithIds[oldIdx] : undefined;

    // Prioriza id já persistido no banco; evita ids aleatórios gerados só no frontend.
    const itemId = oldItem?.id ?? (item.id && typeof item.id === 'string' && item.id.trim() ? item.id : randomUUID());

    let subitens = item.subitens;
    if (Array.isArray(item.subitens) && oldItem?.subitens) {
      const subMap = buildSubitemOldToNewMap(oldItem.subitens, item.subitens);
      subitens = item.subitens.map((sub, subNewIdx) => {
        const oldSubIdxEntry = Object.entries(subMap).find(([, ni]) => ni === subNewIdx);
        const oldSubIdx = oldSubIdxEntry ? Number(oldSubIdxEntry[0]) : undefined;
        const oldSub = oldSubIdx !== undefined ? oldItem.subitens![oldSubIdx] : undefined;
        const subId =
          oldSub?.id ??
          (sub.id && typeof sub.id === 'string' && sub.id.trim() ? sub.id : randomUUID());
        return { ...sub, id: subId };
      });
    } else if (Array.isArray(item.subitens)) {
      subitens = item.subitens.map((sub) => ({
        ...sub,
        id: sub.id && typeof sub.id === 'string' && sub.id.trim() ? sub.id : randomUUID(),
      }));
    }

    return { ...item, id: itemId, subitens } as T;
  });
}

/** Índice da tarefa no novo checklist, buscando pelo id estável. */
export function findChecklistIndexByItemId(newList: ChecklistJsonRow[], itemId: string | null | undefined): number {
  if (!itemId) return -1;
  return newList.findIndex((n) => n.id === itemId);
}

/** Índice da subtarefa no novo checklist, buscando pelo id estável. */
export function findSubitemIndexById(
  subitens: Array<{ id?: string }> | undefined,
  subitemId: string | null | undefined,
): number {
  if (!subitemId || !Array.isArray(subitens)) return -1;
  return subitens.findIndex((s) => s.id === subitemId);
}
