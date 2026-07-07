import type { ChecklistItem, ChecklistItemEntrega } from '../types';
import { visibleChecklistIndices, type EtapaChecklistSlice } from './checklistResume';

export type EtapaTimelineStatus =
  | 'NAO_INICIADO'
  | 'EM_ANDAMENTO'
  | 'VENCIDA'
  | 'FINALIZADO';

export type ChecklistUnitStatus = 'PENDENTE' | 'EM_ANALISE' | 'APROVADO' | 'REPROVADO';

/** Status de exibição do item: sem envio → A fazer (etapa não iniciada) ou Fazendo (etapa já iniciada). */
export type ChecklistUnitWorkflowStatus =
  | 'A_FAZER'
  | 'FAZENDO'
  | 'EM_ANALISE'
  | 'REPROVADO'
  | 'APROVADO'
  /** Marcado como concluído no cadastro (checkbox), sem entrega ainda */
  | 'MARCADO_CADASTRO';

type EtapaLike = {
  dataInicio?: string | null;
  dataFim?: string | null;
  checklistJson?: ChecklistItem[] | null;
  checklistEntregas?: ChecklistItemEntrega[] | null;
};

export type ChecklistUnitRef = {
  checklistIndex: number;
  subitemIndex?: number | null;
};

/** Etapa com checklist + escopo de usuário (mesmas regras de `countChecklistForEtapa`). */
export type EtapaEntregaCount = EtapaLike & EtapaChecklistSlice;

function userParticipatesEtapa(etapa: EtapaChecklistSlice, userId: number): boolean {
  const isExec = Number(etapa.executorId) === userId;
  const isResp = etapa.responsavelId != null && Number(etapa.responsavelId) === userId;
  if (isExec || isResp) return true;
  const list = etapa.integrantes ?? [];
  return list.some((i) => Number(i.usuario?.id ?? i.usuarioId) === userId);
}

/** Índices de linha do checklist visíveis (inclui `meuTrabalhoChecklistIndices` da API). */
function checklistIndexFilterSet(etapa: EtapaEntregaCount, userId?: number): Set<number> | null {
  const list = etapa.checklistJson;
  if (!Array.isArray(list) || list.length === 0) return null;

  if (userId != null && !userParticipatesEtapa(etapa, userId)) {
    return new Set<number>();
  }

  // Visão global (ex.: Dashboard GM com "Todos os usuários"): não aplicar recorte de Meu Trabalho
  // da API — senão o total fica menor que a soma das unidades reais das etapas (o KPI ficaria
  // inconsistente em relação ao filtro por usuário).
  if (userId == null) {
    return null;
  }

  const apiIdx = etapa.meuTrabalhoChecklistIndices;
  if (Array.isArray(apiIdx)) {
    return new Set(apiIdx.filter((i) => Number.isInteger(i) && i >= 0 && i < list.length));
  }
  if (apiIdx === undefined) {
    const derived = visibleChecklistIndices(etapa, userId);
    return derived != null ? new Set(derived) : null;
  }
  return null;
}

function getChecklistRefsVisibleToUser(etapa: EtapaEntregaCount, userId?: number): ChecklistUnitRef[] {
  const allRefs = listChecklistUnitsInEtapa(etapa);
  if (userId != null && !userParticipatesEtapa(etapa, userId)) return [];
  const set = checklistIndexFilterSet(etapa, userId);
  if (set === null) return allRefs;
  if (set.size === 0) return [];
  return allRefs.filter((r) => set.has(r.checklistIndex));
}

/** Unidades (tarefa/subtarefa) visíveis para o escopo do usuário — mesma regra de `countChecklistEntregaForEtapa`. */
export function listChecklistUnitRefsVisibleToUser(
  etapa: EtapaEntregaCount,
  userId?: number,
): ChecklistUnitRef[] {
  return getChecklistRefsVisibleToUser(etapa, userId);
}

/**
 * Unidades (itens + subitens) concluídas no sentido da timeline: aprovação por entrega **ou**
 * marcado como feito no cadastro (quando não há entrega em análise/reprovação).
 * O campo `aprovados` no retorno mantém o nome por compatibilidade; é “concluídas”.
 */
export function countChecklistEntregaForEtapa(etapa: EtapaEntregaCount, userId?: number) {
  const refs = getChecklistRefsVisibleToUser(etapa, userId);
  let aprovados = 0;
  for (const ref of refs) {
    if (isChecklistUnitConcluidaParaProgressoTimeline(etapa, ref, userId)) aprovados += 1;
  }
  return { total: refs.length, aprovados };
}

export function aggregateChecklistEntregaForEtapas(etapas: EtapaEntregaCount[], userId?: number) {
  return etapas.reduce(
    (acc, e) => {
      const c = countChecklistEntregaForEtapa(e, userId);
      return { total: acc.total + c.total, aprovados: acc.aprovados + c.aprovados };
    },
    { total: 0, aprovados: 0 },
  );
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function matchesEntregaKey(
  e: ChecklistItemEntrega,
  checklistIndex: number,
  subitemIndex?: number | null,
  etapa?: EtapaLike,
) {
  const wantSub = subitemIndex ?? null;
  const entregaSub = e.subitemIndex ?? null;

  const item = etapa?.checklistJson?.[checklistIndex];
  const itemId = typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : null;

  if (itemId) {
    if (e.checklistItemId) {
      if (e.checklistItemId !== itemId) return false;
      if (wantSub == null) return entregaSub == null;
      const subId =
        item?.subitens?.[wantSub] && typeof item.subitens[wantSub].id === 'string'
          ? item.subitens[wantSub].id!.trim()
          : null;
      if (subId && e.subitemId) return e.subitemId === subId;
      return entregaSub != null && entregaSub === wantSub;
    }
  }

  return e.checklistIndex === checklistIndex && entregaSub === wantSub;
}

/** Última entrega da unidade (tarefa ou subtarefa), priorizando vínculo por id estável. */
export function findChecklistEntregaForUnit(
  etapa: EtapaLike,
  checklistIndex: number,
  subitemIndex?: number | null,
): ChecklistItemEntrega | undefined {
  const entregas = etapa.checklistEntregas ?? [];
  const matched = entregas.filter((e) => matchesEntregaKey(e, checklistIndex, subitemIndex, etapa));
  if (matched.length === 0) return undefined;
  return matched.sort((a, b) => {
    const ta = new Date(a.dataEnvio || 0).getTime();
    const tb = new Date(b.dataEnvio || 0).getTime();
    return tb - ta;
  })[0];
}

function latestEntregaForUnit(
  entregas: ChecklistItemEntrega[],
  checklistIndex: number,
  subitemIndex?: number | null,
  userId?: number,
  etapa?: EtapaLike,
): ChecklistItemEntrega | null {
  const list = entregas.filter((e) => {
    if (!matchesEntregaKey(e, checklistIndex, subitemIndex, etapa)) return false;
    if (userId == null) return true;
    return Number(e.executorId) === Number(userId);
  });
  if (list.length === 0) return null;
  return list.sort((a, b) => {
    const ta = new Date(a.dataEnvio || 0).getTime();
    const tb = new Date(b.dataEnvio || 0).getTime();
    return tb - ta;
  })[0];
}

export function getChecklistUnitStatus(
  etapa: EtapaLike,
  ref: ChecklistUnitRef,
  userId?: number,
): ChecklistUnitStatus {
  const entregas = Array.isArray(etapa.checklistEntregas) ? etapa.checklistEntregas : [];
  const entrega = latestEntregaForUnit(entregas, ref.checklistIndex, ref.subitemIndex, userId, etapa);
  if (!entrega) {
    return 'PENDENTE';
  }
  if (entrega.status === 'APROVADO') return 'APROVADO';
  if (entrega.status === 'REPROVADO') return 'REPROVADO';
  if (entrega.status === 'EM_ANALISE') return 'EM_ANALISE';
  return 'PENDENTE';
}

/**
 * Unidade “concluída” no mesmo sentido da timeline da etapa (`getEtapaTimelineStatus`):
 * entrega **APROVADA**, ou (sem análise/reprovação) marcada como feita no **cadastro**.
 */
export function isChecklistUnitConcluidaParaProgressoTimeline(
  etapa: EtapaLike,
  ref: ChecklistUnitRef,
  userId?: number,
): boolean {
  const st = getChecklistUnitStatus(etapa, ref, userId);
  if (st === 'APROVADO') return true;
  if (st === 'EM_ANALISE' || st === 'REPROVADO') return false;
  return isChecklistUnitMarkedCadastro(etapa, ref);
}

/**
 * Permite marcar/desmarcar concluído só no cadastro quando não há entrega registrada na unidade
 * (evita conflito com em análise / aprovado / reprovado).
 */
export function canToggleChecklistCadastroForTopLevelRow(etapa: EtapaLike, checklistIndex: number): boolean {
  const list = etapa.checklistJson;
  if (!Array.isArray(list)) return false;
  const item = list[checklistIndex];
  if (!item) return false;
  const subs = item.subitens;
  if (Array.isArray(subs) && subs.length > 0) {
    if (getChecklistUnitStatus(etapa, { checklistIndex }) !== 'PENDENTE') return false;
    return subs.every(
      (_, s) => getChecklistUnitStatus(etapa, { checklistIndex, subitemIndex: s }) === 'PENDENTE',
    );
  }
  return getChecklistUnitStatus(etapa, { checklistIndex }) === 'PENDENTE';
}

/** Item ou subitem marcado como concluído no JSON do checklist (cadastro). */
export function isChecklistUnitMarkedCadastro(etapa: EtapaLike, ref: ChecklistUnitRef): boolean {
  const list = etapa.checklistJson;
  if (!Array.isArray(list)) return false;
  const item = list[ref.checklistIndex];
  if (!item) return false;
  if (ref.subitemIndex != null && ref.subitemIndex !== undefined) {
    const sub = item.subitens?.[ref.subitemIndex];
    return sub?.concluido === true;
  }
  return item.concluido === true;
}

/** Todas as unidades (item + subtarefas) definidas no checklistJson da etapa. */
export function listChecklistUnitsInEtapa(etapa: EtapaLike): ChecklistUnitRef[] {
  const checklist = Array.isArray(etapa.checklistJson) ? etapa.checklistJson : [];
  const refs: ChecklistUnitRef[] = [];
  checklist.forEach((item, i) => {
    refs.push({ checklistIndex: i });
    if (Array.isArray(item.subitens) && item.subitens.length > 0) {
      item.subitens.forEach((_, subIdx) => refs.push({ checklistIndex: i, subitemIndex: subIdx }));
    }
  });
  return refs;
}

type ProjectLikeForKanbanRefs = {
  supervisor?: { id?: number } | null;
  responsaveis?: Array<{ usuario: { id: number } }> | null;
};

/**
 * Refs de checklist para o quadro do dashboard: supervisor/responsável do projeto vê todas as
 * unidades da etapa; demais perfis seguem a mesma regra de Meu Trabalho.
 */
export function listChecklistUnitRefsForDashboardKanban(
  etapa: EtapaEntregaCount,
  scopeUserId: number,
  project?: ProjectLikeForKanbanRefs | null,
): ChecklistUnitRef[] {
  const uid = scopeUserId;
  const isProjSupervisor =
    project?.supervisor?.id != null && Number(project.supervisor.id) === uid;
  const isProjResp = project?.responsaveis?.some((r) => Number(r.usuario.id) === uid) ?? false;
  if (isProjSupervisor || isProjResp) {
    return listChecklistUnitsInEtapa(etapa);
  }
  return listChecklistUnitRefsVisibleToUser(etapa, uid);
}

/** Última entrega de checklist na unidade (qualquer executor), por dataEnvio. */
export function getLatestChecklistEntregaForUnit(
  etapa: EtapaLike,
  ref: ChecklistUnitRef,
): ChecklistItemEntrega | null {
  const entregas = Array.isArray(etapa.checklistEntregas) ? etapa.checklistEntregas : [];
  const list = entregas.filter((e) => matchesEntregaKey(e, ref.checklistIndex, ref.subitemIndex));
  if (list.length === 0) return null;
  return list.sort((a, b) => {
    const ta = new Date(a.dataEnvio || 0).getTime();
    const tb = new Date(b.dataEnvio || 0).getTime();
    return tb - ta;
  })[0];
}

/** Há envio EM_ANALISE de outro usuário nesta unidade (fila do avaliador). */
export function checklistUnitPendingReviewByOthers(
  etapa: EtapaLike,
  ref: ChecklistUnitRef,
  viewerUserId: number,
): boolean {
  const last = getLatestChecklistEntregaForUnit(etapa, ref);
  if (!last || last.status !== 'EM_ANALISE') return false;
  if (last.executorId == null) return false;
  return Number(last.executorId) !== Number(viewerUserId);
}

export function getChecklistCountsByStatus(etapa: EtapaLike) {
  const refs = listChecklistUnitsInEtapa(etapa);
  const out = { total: refs.length, pendente: 0, emAnalise: 0, aprovado: 0, reprovado: 0 };
  refs.forEach((ref) => {
    const st = getChecklistUnitStatus(etapa, ref);
    if (st === 'PENDENTE') out.pendente += 1;
    else if (st === 'EM_ANALISE') out.emAnalise += 1;
    else if (st === 'APROVADO') out.aprovado += 1;
    else if (st === 'REPROVADO') out.reprovado += 1;
  });
  return out;
}

export function getEtapaTimelineStatus(etapa: EtapaLike): EtapaTimelineStatus {
  const refs = listChecklistUnitsInEtapa(etapa);
  if (refs.length > 0) {
    const allDone = refs.every((ref) =>
      isChecklistUnitConcluidaParaProgressoTimeline(etapa, ref),
    );
    if (allDone) return 'FINALIZADO';
  }

  const today = startOfDay(new Date());
  if (etapa.dataFim) {
    const fim = startOfDay(new Date(etapa.dataFim));
    if (today > fim) return 'VENCIDA';
  }

  if (etapa.dataInicio) {
    const inicio = startOfDay(new Date(etapa.dataInicio));
    if (today < inicio) return 'NAO_INICIADO';
  }

  return 'EM_ANDAMENTO';
}

/**
 * Status do item/subitem para UI: com envio, usa a última entrega; sem envio, se estiver marcado
 * no cadastro → MARCADO_CADASTRO; senão A fazer / Fazendo conforme a etapa.
 */
export function getChecklistUnitWorkflowStatus(
  etapa: EtapaLike,
  ref: ChecklistUnitRef,
): ChecklistUnitWorkflowStatus {
  const st = getChecklistUnitStatus(etapa, ref);
  if (st !== 'PENDENTE') return st;
  if (isChecklistUnitMarkedCadastro(etapa, ref)) return 'MARCADO_CADASTRO';
  return getEtapaTimelineStatus(etapa) === 'NAO_INICIADO' ? 'A_FAZER' : 'FAZENDO';
}

type EtapaComStatus = EtapaLike & { status?: string };

/** Pai + todos os subitens marcados no cadastro. */
export function checklistItemRowFullyDoneInCadastro(item: ChecklistItem): boolean {
  const subsOk =
    !item.subitens?.length || item.subitens.every((sub) => sub.concluido === true);
  return item.concluido === true && subsOk;
}

/**
 * Linha principal do checklist “feita” para a barra de progresso:
 * - Sem subtarefas: cadastro completo OU última entrega do item **aprovada** (EM_ANALISE não conta).
 * - Com subtarefas: **cada** subtarefa ok no cadastro OU com última entrega **aprovada** naquela posição.
 */
export function isTopLevelChecklistRowFeita(etapa: EtapaLike, checklistIndex: number): boolean {
  const list = etapa.checklistJson;
  if (!Array.isArray(list)) return false;
  const item = list[checklistIndex];
  if (!item) return false;

  const subs = item.subitens;
  if (Array.isArray(subs) && subs.length > 0) {
    return subs.every((_, subIdx) => {
      const ref: ChecklistUnitRef = { checklistIndex, subitemIndex: subIdx };
      if (isChecklistUnitMarkedCadastro(etapa, ref)) return true;
      return getChecklistUnitStatus(etapa, ref) === 'APROVADO';
    });
  }

  if (checklistItemRowFullyDoneInCadastro(item)) return true;
  return getChecklistUnitStatus(etapa, { checklistIndex }) === 'APROVADO';
}

export function countTopLevelChecklistRowsFeitas(etapa: EtapaLike): { feitas: number; total: number } {
  const list = etapa.checklistJson;
  if (!Array.isArray(list) || list.length === 0) return { feitas: 0, total: 0 };
  let feitas = 0;
  for (let i = 0; i < list.length; i++) {
    if (isTopLevelChecklistRowFeita(etapa, i)) feitas++;
  }
  return { feitas, total: list.length };
}

/** Subtarefas concluídas de uma linha (cadastro ou entrega aprovada por subitem). */
export function countChecklistSubitemsConcluidas(
  etapa: EtapaLike,
  checklistIndex: number,
): { feitas: number; total: number } {
  const list = etapa.checklistJson;
  if (!Array.isArray(list)) return { feitas: 0, total: 0 };
  const item = list[checklistIndex];
  const subs = item?.subitens;
  if (!Array.isArray(subs) || subs.length === 0) return { feitas: 0, total: 0 };
  let feitas = 0;
  for (let subIdx = 0; subIdx < subs.length; subIdx++) {
    const ref: ChecklistUnitRef = { checklistIndex, subitemIndex: subIdx };
    if (isChecklistUnitMarkedCadastro(etapa, ref)) {
      feitas += 1;
      continue;
    }
    if (getChecklistUnitStatus(etapa, ref) === 'APROVADO') feitas += 1;
  }
  return { feitas, total: subs.length };
}

/** Fração 0..1 de avanço da etapa (lista de projetos / barra geral). EM_ANALISE não adiciona fração. */
export function computeEtapaProgressRatio(etapa: EtapaComStatus): number {
  if (etapa.status === 'APROVADA') return 1;
  const { feitas, total } = countTopLevelChecklistRowsFeitas(etapa);
  if (total > 0) return feitas / total;
  return 0;
}

/** Etapa conta como “concluída” no texto X de Y (não confundir com em análise). */
export function isEtapaFullyConcludedForProjectProgress(etapa: EtapaComStatus): boolean {
  if (etapa.status === 'APROVADA') return true;
  if (Array.isArray(etapa.checklistJson) && etapa.checklistJson.length > 0) {
    return getEtapaTimelineStatus(etapa) === 'FINALIZADO';
  }
  return false;
}
