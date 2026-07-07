import { api } from '../services/api';
import type { Usuario } from '../types';
import { getPaginasPermitidas, TASKS_ROUTE, userHasPermission } from './projectAccess';
import { getEtapaTimelineStatus, type EtapaEntregaCount } from './etapaChecklistStatus';
import {
  countPendingReviewsFromEmAnalise,
  userCanAccessDeliveryReviewQueue,
} from './pendingReviewFromEmAnalise';

export type PendingWorkSummary = {
  /** Total exibido em «Tarefas a avaliar» (checklist + entrega geral da etapa). */
  tarefasParaAvaliar: number;
  checklistParaAvaliar: number;
  etapasEntregaAnalise: number;
  tarefasAFazer: number;
  etapasAtrasadas: number;
  requerimentosNaoLidos: number;
};

function usuarioEhParticipanteEtapa(
  etapa: { executorId?: number; integrantes?: Array<{ usuario?: { id: number } }> },
  uid: number,
): boolean {
  if (Number(etapa.executorId) === uid) return true;
  return etapa.integrantes?.some((i) => Number(i.usuario?.id) === uid) ?? false;
}

export function pendingWorkSummaryTotal(s: PendingWorkSummary): number {
  return (
    s.tarefasParaAvaliar +
    s.tarefasAFazer +
    s.etapasAtrasadas +
    s.requerimentosNaoLidos
  );
}

/**
 * Agrega pendências para aviso ao entrar no sistema (Meu Trabalho + requerimentos).
 * Depende das mesmas rotas usadas nas telas principais.
 */
export async function fetchPendingWorkSummary(user: Usuario | null): Promise<PendingWorkSummary | null> {
  if (!user?.id) return null;
  const pages = new Set(getPaginasPermitidas(user));
  const uid = Number(user.id);
  const out: PendingWorkSummary = {
    tarefasParaAvaliar: 0,
    checklistParaAvaliar: 0,
    etapasEntregaAnalise: 0,
    tarefasAFazer: 0,
    etapasAtrasadas: 0,
    requerimentosNaoLidos: 0,
  };

  if (pages.has(TASKS_ROUTE) || pages.has('/tasks')) {
    try {
      const { data } = await api.get<{ etapasPendentes: any[]; projetos: any[] }>('/tasks/my');
      const etapas = data.etapasPendentes ?? [];

      if (userCanAccessDeliveryReviewQueue(user)) {
        try {
          const reviewCounts = await countPendingReviewsFromEmAnalise({
            viewerUserId: user?.id != null ? Number(user.id) : null,
            viewerIsAdmin: userHasPermission(user, 'sistema:administrar'),
          });
          out.tarefasParaAvaliar = reviewCounts.total;
          out.checklistParaAvaliar = reviewCounts.checklistParaAvaliar;
          out.etapasEntregaAnalise = reviewCounts.etapasEntregaAnalise;
        } catch {
          /* fila de avaliação opcional */
        }
      }

      for (const etapa of etapas) {
        if (usuarioEhParticipanteEtapa(etapa, uid)) {
          const tl = getEtapaTimelineStatus(etapa as EtapaEntregaCount);
          if (tl === 'VENCIDA') out.etapasAtrasadas += 1;
          if (tl === 'NAO_INICIADO' || tl === 'EM_ANDAMENTO') out.tarefasAFazer += 1;
        }
      }
    } catch {
      /* evita bloquear layout se a API falhar */
    }
  }

  if (pages.has('/communications')) {
    try {
      const { data } = await api.get<
        Array<{ destinatarioId?: number | null; dataLeituraDestinatario?: string | null }>
      >('/requests/received');
      out.requerimentosNaoLidos = (data ?? []).filter(
        (r) => r.destinatarioId != null && Number(r.destinatarioId) === uid && !r.dataLeituraDestinatario,
      ).length;
    } catch {
      /* silencioso */
    }
  }

  return out;
}
