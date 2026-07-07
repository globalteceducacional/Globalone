import { api } from '../services/api';
import type { Usuario } from '../types';
import {
  userHasAnyPermission,
  userHasProjectDeliveryReviewerPermission,
} from './projectAccess';
import type { AnaliseProjetoGrupo } from './analiseFilaEntregas';
import { buildAnaliseFilaFiltros, filterAndSortAnaliseFila } from './analiseFilaEntregas';

export type EmAnaliseProjetoGrupo = AnaliseProjetoGrupo;

export function userCanAccessDeliveryReviewQueue(user: Usuario | null): boolean {
  if (!user?.id) return false;
  if (userHasProjectDeliveryReviewerPermission(user)) return true;
  return userHasAnyPermission(
    user,
    'projetos:visualizar',
    'projetos:editar',
    'projetos:aprovar',
  );
}

/** Soma unidades aguardando avaliação (cada tarefa/subtarefa + entrega geral da etapa). */
export function sumPendingReviewsFromEmAnaliseGroups(
  groups: EmAnaliseProjetoGrupo[] | null | undefined,
): {
  checklistParaAvaliar: number;
  etapasEntregaAnalise: number;
  total: number;
} {
  let checklistParaAvaliar = 0;
  let etapasEntregaAnalise = 0;
  for (const grupo of groups ?? []) {
    for (const etapa of grupo.etapas ?? []) {
      checklistParaAvaliar += etapa.pendenciasChecklist?.length ?? 0;
      etapasEntregaAnalise += etapa.pendenciasEtapaEntrega?.length ?? 0;
    }
  }
  return {
    checklistParaAvaliar,
    etapasEntregaAnalise,
    total: checklistParaAvaliar + etapasEntregaAnalise,
  };
}

/** Unidades pendentes em um projeto da fila «Tarefas em análise». */
export function countPendenciasInProjetoGrupo(grupo: EmAnaliseProjetoGrupo): number {
  let total = 0;
  for (const etapa of grupo.etapas ?? []) {
    total += etapa.pendenciasChecklist?.length ?? 0;
    total += etapa.pendenciasEtapaEntrega?.length ?? 0;
  }
  return total;
}

/** Conta pendências de avaliação via API dedicada (escopo por permissões no backend). */
export async function countPendingReviewsFromEmAnalise(opts?: {
  viewerUserId?: number | null;
  viewerIsAdmin?: boolean;
}): Promise<{
  checklistParaAvaliar: number;
  etapasEntregaAnalise: number;
  total: number;
}> {
  const { data } = await api.get<EmAnaliseProjetoGrupo[]>('/projects/tasks-em-analise');
  if (opts) {
    const fila = filterAndSortAnaliseFila(
      data,
      buildAnaliseFilaFiltros({
        projetoId: 'all',
        busca: '',
        ordem: 'antigas',
        escopoExecutor: 'para_avaliar',
        viewerUserId: opts.viewerUserId ?? null,
        viewerIsAdmin: opts.viewerIsAdmin ?? false,
      }),
    );
    let checklistParaAvaliar = 0;
    let etapasEntregaAnalise = 0;
    for (const item of fila) {
      if (item.tipo === 'checklist') checklistParaAvaliar += 1;
      else etapasEntregaAnalise += 1;
    }
    return {
      checklistParaAvaliar,
      etapasEntregaAnalise,
      total: fila.length,
    };
  }
  return sumPendingReviewsFromEmAnaliseGroups(data);
}
