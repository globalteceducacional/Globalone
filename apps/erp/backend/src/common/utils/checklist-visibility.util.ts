/**
 * Visibilidade de linhas do checklist (Meu Trabalho / fila de análise).
 * Alinhado a `TasksService.meuTrabalhoChecklistIndicesForUser`.
 */

export type EtapaChecklistVisibilityInput = {
  executorId: number;
  responsavelId?: number | null;
  checklistJson?: unknown;
  integrantes?: Array<{ usuarioId: number; checklistItemIndices?: unknown }>;
};

function parseIntegranteChecklistIndices(raw: unknown, checklistLength: number): number[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;
  const nums = raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < checklistLength);
  return nums.length > 0 ? nums : null;
}

function normalizeVisibleIndices(visible: number[], checklistLength: number): number[] | null {
  if (checklistLength <= 0) return null;
  const full = Array.from({ length: checklistLength }, (_, idx) => idx);
  const same =
    visible.length === full.length && full.every((idx) => visible.includes(idx));
  if (same) return null;
  return visible.sort((a, b) => a - b);
}

/**
 * Índices de linhas do checklist visíveis ao usuário na etapa.
 * `null` = todas as linhas; `[]` = nenhuma.
 */
export function meuTrabalhoChecklistIndicesForUser(
  etapa: EtapaChecklistVisibilityInput,
  userId: number,
): number[] | null {
  if (etapa.executorId === userId) return null;
  if (etapa.responsavelId != null && Number(etapa.responsavelId) === userId) return null;

  const integranteRow = etapa.integrantes?.find((i) => i.usuarioId === userId);
  if (!integranteRow) return [];

  const list = etapa.checklistJson;
  if (!Array.isArray(list) || list.length === 0) return null;

  const fromDb = parseIntegranteChecklistIndices(
    integranteRow.checklistItemIndices,
    list.length,
  );
  if (fromDb) {
    return normalizeVisibleIndices(fromDb, list.length);
  }

  const visible: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i] as { integrantesIds?: unknown };
    const ids = row?.integrantesIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      visible.push(i);
      continue;
    }
    const allowed = new Set(ids.map((n) => Number(n)));
    if (allowed.has(userId)) visible.push(i);
  }

  return normalizeVisibleIndices(visible, list.length);
}

export function isChecklistIndexVisibleToUser(
  checklistIndex: number,
  etapa: EtapaChecklistVisibilityInput,
  userId: number,
): boolean {
  const indices = meuTrabalhoChecklistIndicesForUser(etapa, userId);
  if (indices === null) return true;
  if (indices.length === 0) return false;
  return indices.includes(checklistIndex);
}
