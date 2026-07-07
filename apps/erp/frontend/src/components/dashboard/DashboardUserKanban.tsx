import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import type { ChecklistItem, Usuario } from '../../types';
import {
  canUserOpenProjectDetails,
  TASKS_ROUTE,
  userCanReviewDeliveriesInEtapaContext,
  userIdCanReviewDeliveriesInEtapaContext,
} from '../../utils/projectAccess';
import {
  checklistUnitPendingReviewByOthers,
  getChecklistUnitStatus,
  getEtapaTimelineStatus,
  listChecklistUnitRefsForDashboardKanban,
  listChecklistUnitsInEtapa,
  type ChecklistUnitRef,
  type EtapaEntregaCount,
  type EtapaTimelineStatus,
} from '../../utils/etapaChecklistStatus';
import {
  ReviewEntregaPopup,
  type ReviewEntregaPopupTarget,
} from '../projects/ReviewEntregaPopup';

type DeadlineBucket = 'NONE' | 'SOON' | 'EXPIRED';

type KanbanColumnId =
  | 'para_avaliar'
  | 'concluidas'
  | 'analise'
  | 'reprovadas'
  | 'atrasadas'
  | 'avencer'
  | 'andamento';

export interface DashboardKanbanProject {
  id: number;
  nome: string;
  supervisor?: { id?: number } | null;
  responsaveis?: Array<{ usuario: { id: number } }> | null;
  etapas?: DashboardKanbanEtapa[];
}

export interface DashboardKanbanEtapa {
  id: number;
  nome?: string;
  dataFim?: string | null;
  dataInicio?: string | null;
  executorId?: number;
  responsavelId?: number | null;
  integrantes?: Array<{ usuario?: { id: number }; usuarioId?: number }>;
  checklistJson?: ChecklistItem[] | null;
  checklistEntregas?: unknown[] | null;
  meuTrabalhoChecklistIndices?: number[] | null;
}

function deadlineForEtapa(etapa: { dataFim?: string | null }): DeadlineBucket {
  if (!etapa.dataFim) return 'NONE';
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fim = new Date(etapa.dataFim);
  const fimDateOnly = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  const diffMs = fimDateOnly.getTime() - todayDateOnly.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'EXPIRED';
  if (diffDays <= 7) return 'SOON';
  return 'NONE';
}

function unitTitulo(etapa: DashboardKanbanEtapa, ref: ChecklistUnitRef): string {
  const list = etapa.checklistJson;
  if (!Array.isArray(list)) return 'Tarefa';
  const item = list[ref.checklistIndex];
  if (!item) return 'Tarefa';
  if (ref.subitemIndex != null && ref.subitemIndex !== undefined) {
    const sub = item.subitens?.[ref.subitemIndex];
    if (sub?.texto) return `${item.texto}: ${sub.texto}`;
  }
  return item.texto || 'Tarefa';
}

interface KanbanTaskCard {
  id: string;
  titulo: string;
  projetoId: number;
  projetoNome: string;
  etapaId: number;
  etapaNome: string;
  checklistIndex: number;
  subitemIndex: number | null;
  dataFim?: string | null;
}

function classifyUnit(
  etapa: DashboardKanbanEtapa,
  ref: ChecklistUnitRef,
  timeline: EtapaTimelineStatus,
  scopeUserId: number,
): Exclude<KanbanColumnId, 'para_avaliar'> {
  const st = getChecklistUnitStatus(etapa as EtapaEntregaCount, ref, scopeUserId);

  if (st === 'EM_ANALISE') return 'analise';
  if (st === 'REPROVADO') return 'reprovadas';
  if (st === 'APROVADO') return 'concluidas';

  if (timeline === 'VENCIDA') return 'atrasadas';
  const dl = deadlineForEtapa(etapa);
  if (dl === 'SOON' && timeline !== 'FINALIZADO') return 'avencer';
  return 'andamento';
}

function colunaParaAvaliar(userNome: string, isOwnView: boolean) {
  return {
    id: 'para_avaliar' as const,
    titulo: isOwnView ? 'Sua avaliação' : `Avaliação — ${userNome}`,
    descricao: isOwnView
      ? 'Entregas de checklist de outros aguardando sua decisão'
      : `Entregas aguardando avaliação de ${userNome}`,
    bar: 'bg-fuchsia-500',
    head: 'from-fuchsia-900/45 to-fuchsia-950/25 border-fuchsia-600/45',
  };
}

const COLUNAS_PESSOAIS: Array<{
  id: Exclude<KanbanColumnId, 'para_avaliar'>;
  titulo: string;
  descricao: string;
  bar: string;
  head: string;
}> = [
  {
    id: 'concluidas',
    titulo: 'Concluídas',
    descricao: 'Suas entregas aprovadas',
    bar: 'bg-emerald-500',
    head: 'from-emerald-900/40 to-emerald-950/20 border-emerald-700/40',
  },
  {
    id: 'analise',
    titulo: 'Suas em análise',
    descricao: 'Suas entregas aguardando decisão de quem avalia',
    bar: 'bg-violet-500',
    head: 'from-violet-900/40 to-violet-950/20 border-violet-700/40',
  },
  {
    id: 'reprovadas',
    titulo: 'Reprovadas',
    descricao: 'Última entrega reprovada (suas)',
    bar: 'bg-orange-500',
    head: 'from-orange-900/40 to-orange-950/20 border-orange-700/40',
  },
  {
    id: 'atrasadas',
    titulo: 'Atrasadas',
    descricao: 'Etapa fora do prazo na timeline',
    bar: 'bg-rose-500',
    head: 'from-rose-900/40 to-rose-950/20 border-rose-700/40',
  },
  {
    id: 'avencer',
    titulo: 'A vencer',
    descricao: 'Prazo da etapa em até 7 dias',
    bar: 'bg-amber-500',
    head: 'from-amber-900/40 to-amber-950/20 border-amber-700/40',
  },
  {
    id: 'andamento',
    titulo: 'Em andamento',
    descricao: 'Demais tarefas em aberto (visão pessoal)',
    bar: 'bg-sky-500',
    head: 'from-sky-900/40 to-sky-950/20 border-sky-700/40',
  },
];

export function DashboardUserKanban({
  projects,
  scopeUserId,
  userNome,
  showReviewQueue = false,
  reviewPermissionUser,
  onAfterReview,
}: {
  projects: DashboardKanbanProject[];
  scopeUserId: number;
  userNome: string;
  /** Exibe coluna de fila de avaliação para {@link scopeUserId}. */
  showReviewQueue?: boolean;
  /**
   * Usuário com permissões de cargo (trabalhos:avaliar, ver_todos, etc.).
   * Só aplica permissões globais quando `id` === {@link scopeUserId} (visão própria).
   */
  reviewPermissionUser?: Usuario | null;
  /** Recarrega dados do dashboard após aprovar/reprovar no pop-up. */
  onAfterReview?: () => void;
}) {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const isOwnView = authUser != null && Number(authUser.id) === Number(scopeUserId);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReviewEntregaPopupTarget | null>(null);

  const closeReview = () => {
    setReviewOpen(false);
    setReviewTarget(null);
  };

  const colunasComItens = useMemo(() => {
    const showReview = showReviewQueue;
    const useCargoPermissions =
      reviewPermissionUser != null &&
      Number(reviewPermissionUser.id) === Number(scopeUserId);

    const buckets: Record<KanbanColumnId, KanbanTaskCard[]> = {
      para_avaliar: [],
      concluidas: [],
      analise: [],
      reprovadas: [],
      atrasadas: [],
      avencer: [],
      andamento: [],
    };

    for (const p of projects) {
      for (const e of p.etapas ?? []) {
        const et = e as DashboardKanbanEtapa;
        const timeline = getEtapaTimelineStatus(et as EtapaEntregaCount);
        const refs = listChecklistUnitRefsForDashboardKanban(et as EtapaEntregaCount, scopeUserId, p);
        for (const ref of refs) {
          const col = classifyUnit(et, ref, timeline, scopeUserId);
          const id = `${p.id}-${et.id}-${ref.checklistIndex}-${ref.subitemIndex ?? 'x'}`;
          buckets[col].push({
            id,
            titulo: unitTitulo(et, ref),
            projetoId: p.id,
            projetoNome: p.nome,
            etapaId: et.id,
            etapaNome: et.nome ?? `Etapa #${et.id}`,
            checklistIndex: ref.checklistIndex,
            subitemIndex: ref.subitemIndex ?? null,
            dataFim: et.dataFim,
          });
        }

        if (showReview) {
          const pode = useCargoPermissions
            ? userCanReviewDeliveriesInEtapaContext(reviewPermissionUser!, et, p)
            : userIdCanReviewDeliveriesInEtapaContext(scopeUserId, et, p);
          if (!pode) continue;
          const allRefs = listChecklistUnitsInEtapa(et as EtapaEntregaCount);
          for (const ref of allRefs) {
            if (!checklistUnitPendingReviewByOthers(et as EtapaEntregaCount, ref, scopeUserId)) {
              continue;
            }
            const id = `rev-${p.id}-${et.id}-${ref.checklistIndex}-${ref.subitemIndex ?? 'x'}`;
            buckets.para_avaliar.push({
              id,
              titulo: unitTitulo(et, ref),
              projetoId: p.id,
              projetoNome: p.nome,
              etapaId: et.id,
              etapaNome: et.nome ?? `Etapa #${et.id}`,
              checklistIndex: ref.checklistIndex,
              subitemIndex: ref.subitemIndex ?? null,
              dataFim: et.dataFim,
            });
          }
        }
      }
    }

    const defs = showReview
      ? [colunaParaAvaliar(userNome, isOwnView), ...COLUNAS_PESSOAIS]
      : COLUNAS_PESSOAIS;
    return defs.map((c) => ({
      ...c,
      itens: buckets[c.id],
    }));
  }, [
    projects,
    scopeUserId,
    showReviewQueue,
    reviewPermissionUser,
    userNome,
    isOwnView,
  ]);

  const totalCartoes = colunasComItens.reduce((n, c) => n + c.itens.length, 0);

  return (
    <section className="rounded-xl border border-white/10 bg-neutral/50 p-4 sm:p-5">
      <ReviewEntregaPopup
        open={reviewOpen}
        target={reviewTarget}
        onClose={closeReview}
        onReviewed={() => {
          onAfterReview?.();
        }}
      />
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white/95">Quadro de tarefas</h2>
          <p className="mt-1 text-xs text-white/55 leading-relaxed max-w-3xl">
            Visão de <strong className="text-white/80">{userNome}</strong> nos projetos filtrados
            (tarefas atribuídas no checklist).
            {showReviewQueue && (
              <>
                {' '}
                A coluna de avaliação lista entregas de <strong className="text-white/80">outros</strong>{' '}
                aguardando {isOwnView ? 'sua' : `a avaliação de ${userNome}`}
                {isOwnView ? ' — clique para abrir aqui' : ''}.
              </>
            )}
          </p>
        </div>
        <p className="text-xs text-white/45 tabular-nums shrink-0">
          {totalCartoes.toLocaleString('pt-BR')} cartões
        </p>
      </div>

      {totalCartoes === 0 ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-white/50">
          Nenhuma tarefa de checklist encontrada para este usuário nos projetos exibidos (etapas sem
          checklist ou sem participação aparecem vazias).
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {colunasComItens.map((col) => (
            <div
              key={col.id}
              className="flex w-[min(100%,280px)] shrink-0 flex-col rounded-lg border border-white/10 bg-black/25"
            >
              <div
                className={`rounded-t-lg border-b border-white/10 bg-gradient-to-br px-3 py-2.5 ${col.head}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.bar}`} aria-hidden />
                  <h3 className="text-sm font-semibold text-white/90">{col.titulo}</h3>
                  <span className="ml-auto rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white/70">
                    {col.itens.length}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-white/45">{col.descricao}</p>
              </div>
              <ul className="max-h-[min(55vh,420px)] flex-1 space-y-2 overflow-y-auto p-2">
                {col.itens.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (col.id === 'para_avaliar') {
                          if (isOwnView) {
                            setReviewTarget({
                              mode: 'checklist',
                              projetoId: t.projetoId,
                              etapaId: t.etapaId,
                              checklistIndex: t.checklistIndex,
                              subitemIndex: t.subitemIndex,
                            });
                            setReviewOpen(true);
                            return;
                          }
                          const qs = new URLSearchParams();
                          qs.set('etapaId', String(t.etapaId));
                          qs.set('checklistIndex', String(t.checklistIndex));
                          if (t.subitemIndex != null) {
                            qs.set('subitemIndex', String(t.subitemIndex));
                          }
                          const projeto = projects.find((p) => p.id === t.projetoId);
                          if (authUser && projeto && canUserOpenProjectDetails(authUser, projeto)) {
                            navigate(`/projects/${t.projetoId}?${qs.toString()}`);
                          } else {
                            navigate(`${TASKS_ROUTE}?${qs.toString()}`);
                          }
                          return;
                        }
                        const qs = new URLSearchParams();
                        qs.set('etapaId', String(t.etapaId));
                        qs.set('checklistIndex', String(t.checklistIndex));
                        if (t.subitemIndex != null) {
                          qs.set('subitemIndex', String(t.subitemIndex));
                        }
                        const projeto = projects.find((p) => p.id === t.projetoId);
                        if (authUser && projeto && canUserOpenProjectDetails(authUser, projeto)) {
                          navigate(`/projects/${t.projetoId}?${qs.toString()}`);
                        } else {
                          navigate(`${TASKS_ROUTE}?${qs.toString()}`);
                        }
                      }}
                      className="w-full rounded-lg border border-white/10 bg-neutral/80 p-2.5 text-left text-xs transition hover:border-sky-500/40 hover:bg-neutral focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
                    >
                      <p className="font-medium leading-snug text-white/90 [overflow-wrap:anywhere]">
                        {t.titulo}
                      </p>
                      <p className="mt-1.5 text-[10px] leading-snug text-sky-200/80 [overflow-wrap:anywhere]">
                        {t.projetoNome}
                      </p>
                      <p className="mt-0.5 text-[10px] text-white/45 [overflow-wrap:anywhere]">
                        {t.etapaNome}
                        {t.dataFim && (
                          <span className="text-white/35">
                            {' '}
                            · fim {new Date(t.dataFim).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
