import type { DashboardKanbanProject, DashboardKanbanEtapa } from '../components/dashboard/DashboardUserKanban';
import type { Usuario } from '../types';
import {
  checklistUnitPendingReviewByOthers,
  listChecklistUnitsInEtapa,
  type ChecklistUnitRef,
  type EtapaEntregaCount,
} from './etapaChecklistStatus';
import {
  userCanReviewDeliveriesInEtapaContext,
  userIdCanReviewDeliveriesInEtapaContext,
} from './projectAccess';

type EtapaComEntregasGerais = DashboardKanbanEtapa & {
  entregas?: Array<{ id?: number; status?: string; executorId?: number | null }> | null;
};

function canReviewAtEtapa(
  viewerUserId: number,
  etapa: DashboardKanbanEtapa,
  projeto: DashboardKanbanProject,
  permissionUser?: Usuario | null,
): boolean {
  const useCargoPermissions =
    permissionUser != null && Number(permissionUser.id) === Number(viewerUserId);
  if (useCargoPermissions) {
    return userCanReviewDeliveriesInEtapaContext(permissionUser, etapa, projeto);
  }
  return userIdCanReviewDeliveriesInEtapaContext(viewerUserId, etapa, projeto);
}

function countEtapaEntregasPendingReviewByOthers(
  etapa: EtapaComEntregasGerais,
  viewerUserId: number,
): number {
  let n = 0;
  for (const en of etapa.entregas ?? []) {
    if (en.status !== 'EM_ANALISE') continue;
    if (en.executorId == null) continue;
    if (Number(en.executorId) === Number(viewerUserId)) continue;
    n += 1;
  }
  return n;
}

/** Conta unidades aguardando avaliação (checklist + entrega geral da etapa, quando disponível nos dados). */
export function countPendingReviewForUserInProjects(
  projects: DashboardKanbanProject[],
  viewerUserId: number,
  permissionUser?: Usuario | null,
): number {
  let total = 0;
  for (const p of projects) {
    for (const e of p.etapas ?? []) {
      if (!canReviewAtEtapa(viewerUserId, e, p, permissionUser)) continue;
      const allRefs = listChecklistUnitsInEtapa(e as EtapaEntregaCount);
      for (const ref of allRefs) {
        if (checklistUnitPendingReviewByOthers(e as EtapaEntregaCount, ref, viewerUserId)) {
          total += 1;
        }
      }
      total += countEtapaEntregasPendingReviewByOthers(e, viewerUserId);
    }
  }
  return total;
}

/** @deprecated Use {@link countPendingReviewForUserInProjects} */
export const countChecklistPendingReviewForUserInProjects = countPendingReviewForUserInProjects;

export function collectChecklistPendingReviewForUserInProjects(
  projects: DashboardKanbanProject[],
  viewerUserId: number,
  permissionUser?: Usuario | null,
): Array<{
  projetoId: number;
  projetoNome: string;
  etapaId: number;
  etapaNome: string;
  ref: ChecklistUnitRef;
}> {
  const out: Array<{
    projetoId: number;
    projetoNome: string;
    etapaId: number;
    etapaNome: string;
    ref: ChecklistUnitRef;
  }> = [];
  for (const p of projects) {
    for (const e of p.etapas ?? []) {
      if (!canReviewAtEtapa(viewerUserId, e, p, permissionUser)) continue;
      const allRefs = listChecklistUnitsInEtapa(e as EtapaEntregaCount);
      for (const ref of allRefs) {
        if (!checklistUnitPendingReviewByOthers(e as EtapaEntregaCount, ref, viewerUserId)) {
          continue;
        }
        out.push({
          projetoId: p.id,
          projetoNome: p.nome,
          etapaId: e.id,
          etapaNome: e.nome ?? `Etapa #${e.id}`,
          ref,
        });
      }
    }
  }
  return out;
}
