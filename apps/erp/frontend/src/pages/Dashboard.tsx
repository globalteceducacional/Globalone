import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Projeto } from '../types';
import { toast, formatApiError } from '../utils/toast';
import { useAuthStore } from '../store/auth';
import {
  canUserOpenProjectDetails,
  cargoAllowsProjectsPage,
  userHasPermission,
  userHasProjectDeliveryReviewerPermission,
  PROJECTS_ANALISE_ROUTE,
} from '../utils/projectAccess';
import {
  countPendingReviewsFromEmAnalise,
  userCanAccessDeliveryReviewQueue,
} from '../utils/pendingReviewFromEmAnalise';
import type { ChecklistItem, ChecklistItemEntrega } from '../types';
import {
  aggregateChecklistEntregaForEtapas,
  getEtapaTimelineStatus,
  type EtapaEntregaCount,
  type EtapaTimelineStatus,
} from '../utils/etapaChecklistStatus';
import { KpiInfo } from '../components/KpiInfo';
import {
  formatParticipantesResumo,
  nomesParticipantesDaEtapaSemUsuario,
} from '../utils/participantesResumo';
import { DashboardUserKanban } from '../components/dashboard/DashboardUserKanban';
import { countPendingReviewForUserInProjects } from '../utils/dashboardReviewQueue';

const DASHBOARD_PATH = '/dashboard';

interface Etapa {
  id: number;
  nome?: string;
  descricao?: string | null;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA';
  dataFim?: string | null;
  dataInicio?: string | null;
  executorId?: number;
  responsavelId?: number | null;
  executor?: { id: number; nome: string } | null;
  integrantes?: Array<{ usuario?: { id: number; nome?: string }; usuarioId?: number }>;
  checklistJson?: ChecklistItem[] | null;
  checklistEntregas?: ChecklistItemEntrega[] | null;
  meuTrabalhoChecklistIndices?: number[] | null;
}

type DeadlineStatus = 'NONE' | 'SOON' | 'EXPIRED';

interface ProjectDetails extends Omit<Projeto, 'responsaveis'> {
  etapas?: Etapa[];
  responsaveis?: Array<{ usuario: { id: number; nome: string; email: string } }>;
  checklistItensTotal?: number;
  checklistItensConcluidos?: number;
}

// Resposta simplificada da rota /tasks/my (reutilizada para limitar projetos do usuário)
interface MyTasksResponse {
  projetos: Projeto[];
  etapasPendentes: any[];
}

interface SimpleUser {
  id: number;
  nome: string;
}

interface RankingEntry {
  posicao: number;
  id: number;
  nome: string;
  fotoUrl: string | null;
  cargo: string;
  pontos: number;
  totalEntregasAprovadas: number;
  totalEtapasComoParticipante: number;
}

function getIntegranteUserId(
  integrante: { usuario?: { id: number }; usuarioId?: number },
): number | null {
  return integrante?.usuario?.id ?? integrante?.usuarioId ?? null;
}

/** Etapa em que o usuário é participante (executor legado ou integrante). */
function etapaEnvolveUsuario(etapa: Etapa, uid: number): boolean {
  if (Number(etapa.executorId) === uid) return true;
  if (etapa.executor?.id === uid) return true;
  return etapa.integrantes?.some((i) => getIntegranteUserId(i) === uid) ?? false;
}

function getDashboardChecklistResumo(
  project: ProjectDetails,
  scopeUserId?: number,
): { total: number; concluidos: number } {
  const etapas = project.etapas ?? [];
  const hasChecklistData = etapas.some((e) => Array.isArray(e.checklistJson));

  const isSupervisorProjeto =
    scopeUserId != null && project.supervisor?.id === scopeUserId;
  const effectiveScope = isSupervisorProjeto ? undefined : scopeUserId;

  if (hasChecklistData) {
    const { total, aprovados } = aggregateChecklistEntregaForEtapas(
      etapas as EtapaEntregaCount[],
      effectiveScope,
    );
    return { total, concluidos: aprovados };
  }
  if (scopeUserId != null) {
    return { total: 0, concluidos: 0 };
  }
  const t = project.checklistItensTotal;
  if (t != null) return { total: t, concluidos: project.checklistItensConcluidos ?? 0 };
  return { total: 0, concluidos: 0 };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [projects, setProjects] = useState<ProjectDetails[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectDetails[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [loadingDetails, setLoadingDetails] = useState<Set<number>>(new Set());
  const [pontosUsuario, setPontosUsuario] = useState<number | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [showFullRanking, setShowFullRanking] = useState(false);
  const [showValorTotal, setShowValorTotal] = useState(false);
  const [kpiDetalhe, setKpiDetalhe] = useState<'vencendo' | 'atrasadas' | null>(null);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);
  const [checklistParaAvaliarCount, setChecklistParaAvaliarCount] = useState(0);
  const refreshDashboardProjects = useCallback(() => {
    setDashboardReloadKey((k) => k + 1);
  }, []);

  const isGm = useMemo(() => userHasPermission(user, 'dashboard:gerenciar'), [user]);

  const isSupervisor = useMemo(() => {
    return !userHasPermission(user, 'projetos:ver_todos') && !!user;
  }, [user]);

  const hasProjectsAccess = useMemo(() => cargoAllowsProjectsPage(user), [user]);
  const totalValorProjetos = useMemo(
    () => projects.reduce((acc, project) => acc + (project.valorTotal ?? 0), 0),
    [projects],
  );

  const getDeadlineStatus = (etapa: { dataFim?: string | null }): DeadlineStatus => {
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
  };

  // Carregar usuários para o filtro (apenas GM)
  useEffect(() => {
    async function loadUsers() {
      if (!isGm) return;
      try {
        const { data } = await api.get<SimpleUser[]>('/users/options');
        setUsers(data);
      } catch (err) {
        console.error('Erro ao carregar usuários:', err);
      }
    }
    loadUsers();
  }, [isGm]);

  // Carregar pontos: usuário normal → seus próprios; GM → pontos do usuário selecionado
  useEffect(() => {
    async function loadPontos() {
      if (isGm) {
        // GM sem seleção → sem card de pontos
        if (selectedUserId === 'all') {
          setPontosUsuario(null);
          return;
        }
        try {
          const { data } = await api.get<{ pontosTarefas?: number }>(`/users/${selectedUserId}`);
          setPontosUsuario(data.pontosTarefas ?? 0);
        } catch {
          setPontosUsuario(null);
        }
      } else {
        if (!user?.id) return;
        try {
          const { data } = await api.get<{ pontosTarefas?: number }>(`/users/${user.id}`);
          setPontosUsuario(data.pontosTarefas ?? 0);
        } catch {
          setPontosUsuario(user.pontosTarefas ?? 0);
        }
      }
    }
    loadPontos();
  }, [isGm, selectedUserId, user?.id]);

  useEffect(() => {
    api
      .get<RankingEntry[]>('/users/ranking')
      .then(({ data }) => setRanking(data))
      .catch(() => setRanking([]));
  }, []);

  const rankingExibicao = useMemo(() => {
    if (selectedUserId === 'all') return ranking;
    const uid = Number(selectedUserId);
    if (!Number.isFinite(uid) || uid <= 0) return ranking;
    return ranking.filter((r) => r.id === uid);
  }, [ranking, selectedUserId]);

  useEffect(() => {
    if (!isGm || selectedUserId === 'all') return;
    const uid = Number(selectedUserId);
    if (!Number.isFinite(uid) || uid <= 0) return;
    const found = ranking.some((r) => r.id === uid);
    setShowFullRanking(found);
  }, [isGm, selectedUserId, ranking]);

  const resolveFileUrl = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}${url}`;
  };

  // Carregar projetos
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        // GM: lista completa via /projects.
        // Para KPI de tarefas (itens + subtarefas por entrega), precisamos de etapas/checklist completos.
        // O payload resumido de /projects pode subcontar (ex.: só tarefa sem subtarefas), então enriquecemos com /projects/:id.
        if (hasProjectsAccess && !isSupervisor) {
          const { data } = await api.get<Projeto[]>('/projects');
          const baseProjects = data as ProjectDetails[];
          const detailedProjects = await Promise.all(
            baseProjects.map(async (project) => {
              try {
                const { data: detail } = await api.get<ProjectDetails>(`/projects/${project.id}`);
                return {
                  ...project,
                  supervisor: detail.supervisor ?? project.supervisor,
                  responsaveis: detail.responsaveis ?? project.responsaveis,
                  etapas: detail.etapas ?? project.etapas,
                } as ProjectDetails;
              } catch {
                return project;
              }
            }),
          );
          setAllProjects(detailedProjects);
          setProjects(detailedProjects);
        } else {
          // Usuários SEM acesso a "Projetos" veem apenas projetos em que estão inseridos
          const { data } = await api.get<MyTasksResponse>('/tasks/my');
          const userProjects = data.projetos ?? [];
          const etapasPendentes = (data.etapasPendentes ?? []) as any[];

          // Agrupar etapas pendentes por projeto
          const projectsWithEtapas: ProjectDetails[] = userProjects.map((project) => {
            const etapasForProject: Etapa[] = etapasPendentes
              .filter((etapa: any) => etapa.projeto?.id === project.id)
              .map((etapa: any) => ({
                id: etapa.id,
                nome: etapa.nome,
                descricao: etapa.descricao,
                status: etapa.status,
                dataFim: etapa.dataFim ?? null,
                dataInicio: etapa.dataInicio ?? null,
                executorId: etapa.executorId,
                executor: etapa.executor
                  ? { id: etapa.executor.id, nome: etapa.executor.nome }
                  : null,
                integrantes: (etapa.integrantes ?? []).map((i: any) => ({
                  usuario: { id: i.usuario.id, nome: i.usuario.nome },
                  usuarioId: i.usuarioId,
                })),
                responsavelId: etapa.responsavelId ?? null,
                checklistJson: etapa.checklistJson,
                checklistEntregas: etapa.checklistEntregas,
                meuTrabalhoChecklistIndices: etapa.meuTrabalhoChecklistIndices,
              }));

            return {
              ...project,
              etapas: etapasForProject,
            };
          });

          setAllProjects(projectsWithEtapas);
          setProjects(projectsWithEtapas);
        }
      } catch (err: any) {
        const errorMessage = formatApiError(err);
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hasProjectsAccess, isSupervisor, dashboardReloadKey]);

  // Filtrar projetos baseado no usuário selecionado (usa executorId: lista /projects não traz executor aninhado)
  useEffect(() => {
    async function filterProjects() {
      if (selectedUserId === 'all') {
        setProjects(allProjects);
        return;
      }

      const uid = Number(selectedUserId);

      const initiallyFiltered = allProjects.filter((project) => {
        if (project.supervisor?.id === uid) return true;
        if (project.responsaveis?.some((resp) => resp.usuario.id === uid)) return true;
        if (project.etapas?.some((e) => etapaEnvolveUsuario(e, uid))) return true;
        return false;
      });

      const idsInitial = new Set(initiallyFiltered.map((p) => p.id));
      const candidatesForFetch = allProjects.filter((p) => !idsInitial.has(p.id));

      let extraFromDetail: ProjectDetails[] = [];
      if (candidatesForFetch.length > 0) {
        try {
          const details = await Promise.all(
            candidatesForFetch.map(async (project) => {
              try {
                const { data } = await api.get<ProjectDetails>(`/projects/${project.id}`);
                return data;
              } catch (err) {
                console.error(`Erro ao carregar detalhes do projeto ${project.id}:`, err);
                return null;
              }
            }),
          );
          extraFromDetail = details
            .filter((p): p is ProjectDetails => p !== null)
            .filter((p) => p.etapas?.some((e) => etapaEnvolveUsuario(e, uid)) ?? false);
        } catch (err) {
          console.error('Erro ao filtrar projetos (detalhe):', err);
        }
      }

      const allFiltered: ProjectDetails[] = [...initiallyFiltered];
      const seen = new Set(initiallyFiltered.map((p) => p.id));
      for (const p of extraFromDetail) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          allFiltered.push(p);
        }
      }

      try {
        const enriched = await Promise.all(
          allFiltered.map(async (project) => {
            const temChecklistJson = project.etapas?.some((e) => Array.isArray(e.checklistJson));
            if (temChecklistJson) return project;
            try {
              const { data } = await api.get<ProjectDetails>(`/projects/${project.id}`);
              return data;
            } catch {
              return project;
            }
          }),
        );
        setProjects(enriched);
      } catch (err) {
        console.error('Erro ao enriquecer projetos filtrados:', err);
        setProjects(allFiltered);
      }
    }

    filterProjects();
  }, [selectedUserId, allProjects]);

  // Abre o projeto na grade e rola até a etapa quando a URL traz ?etapaId= (ex.: clique no KPI).
  useEffect(() => {
    if (loading) return;
    const raw = searchParams.get('etapaId');
    if (!raw) return;

    const clearEtapaParam = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('etapaId');
          return next;
        },
        { replace: true },
      );
    };

    const etapaId = Number(raw);
    if (!Number.isFinite(etapaId) || etapaId <= 0) {
      clearEtapaParam();
      return;
    }

    const host = projects.find((p) => (p.etapas ?? []).some((e) => e.id === etapaId));
    if (!host) {
      if (projects.length > 0) clearEtapaParam();
      return;
    }

    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.add(host.id);
      return next;
    });

    const timer = window.setTimeout(() => {
      const el =
        document.getElementById(`dashboard-etapa-${etapaId}`) ??
        document.getElementById(`dashboard-projeto-${host.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      clearEtapaParam();
    }, 380);

    return () => window.clearTimeout(timer);
  }, [loading, projects, searchParams.toString(), setSearchParams]);

  const checklistScopeUserId = isGm
    ? selectedUserId === 'all'
      ? undefined
      : Number(selectedUserId)
    : user?.id;

  const checklistResumoGlobal = useMemo(() => {
    return projects.reduce(
      (acc, p) => {
        const r = getDashboardChecklistResumo(p, checklistScopeUserId);
        return { total: acc.total + r.total, concluidos: acc.concluidos + r.concluidos };
      },
      { total: 0, concluidos: 0 },
    );
  }, [projects, checklistScopeUserId]);

  const reviewKpiScopeUserId = useMemo(() => {
    if (isGm && selectedUserId !== 'all') return Number(selectedUserId);
    return user?.id ?? null;
  }, [isGm, selectedUserId, user?.id]);

  useEffect(() => {
    if (reviewKpiScopeUserId == null) {
      setChecklistParaAvaliarCount(0);
      return;
    }

    if (isGm && selectedUserId !== 'all') {
      setChecklistParaAvaliarCount(
        countPendingReviewForUserInProjects(projects, reviewKpiScopeUserId),
      );
      return;
    }

    if (!userHasProjectDeliveryReviewerPermission(user)) {
      setChecklistParaAvaliarCount(0);
      return;
    }
    countPendingReviewsFromEmAnalise({
      viewerUserId: user?.id != null ? Number(user.id) : null,
      viewerIsAdmin: userHasPermission(user, 'sistema:administrar'),
    })
      .then((c) => setChecklistParaAvaliarCount(c.total))
      .catch(() => setChecklistParaAvaliarCount(0));
  }, [user, isGm, selectedUserId, projects, reviewKpiScopeUserId, dashboardReloadKey]);

  const showReviewKpi = useMemo(() => {
    if (isGm && selectedUserId !== 'all') return true;
    return !!(user && userCanAccessDeliveryReviewQueue(user));
  }, [isGm, selectedUserId, user]);

  const reviewKpiUserLabel = useMemo(() => {
    if (isGm && selectedUserId !== 'all') {
      return users.find((u) => u.id === selectedUserId)?.nome ?? 'usuário';
    }
    return null;
  }, [isGm, selectedUserId, users]);

  const reviewKpiClickable =
    !(isGm && selectedUserId !== 'all') && checklistParaAvaliarCount > 0;

  /** KPIs de etapas: com filtro de usuário, só etapas em que ele atua (visão do GM). */
  const etapasParaKpis = useMemo(() => {
    const flat = projects.flatMap((p) => (p.etapas ?? []) as Etapa[]);
    if (!isGm || selectedUserId === 'all') return flat;
    const uid = Number(selectedUserId);
    return flat.filter((e) => etapaEnvolveUsuario(e, uid));
  }, [projects, isGm, selectedUserId]);

  type EtapaComProjeto = Etapa & {
    projetoNome: string;
    projetoId: number;
    projetoSupervisor?: { id: number; nome?: string } | null;
  };

  const etapasVencendoDetalhe = useMemo<EtapaComProjeto[]>(() => {
    const result: EtapaComProjeto[] = [];
    for (const p of projects) {
      for (const e of (p.etapas ?? []) as Etapa[]) {
        if (!isGm && user?.id && !etapaEnvolveUsuario(e, user.id)) continue;
        if (isGm && selectedUserId !== 'all' && !etapaEnvolveUsuario(e, Number(selectedUserId))) continue;
        if (e.dataFim && getDeadlineStatus(e) === 'SOON' && getEtapaTimelineStatus(e) !== 'FINALIZADO') {
          result.push({
            ...e,
            projetoNome: p.nome,
            projetoId: p.id,
            projetoSupervisor: p.supervisor ?? null,
          });
        }
      }
    }
    return result.sort((a, b) => new Date(a.dataFim!).getTime() - new Date(b.dataFim!).getTime());
  }, [projects, isGm, selectedUserId, user?.id]);

  const etapasAtrasadasDetalhe = useMemo<EtapaComProjeto[]>(() => {
    const result: EtapaComProjeto[] = [];
    for (const p of projects) {
      for (const e of (p.etapas ?? []) as Etapa[]) {
        if (!isGm && user?.id && !etapaEnvolveUsuario(e, user.id)) continue;
        if (isGm && selectedUserId !== 'all' && !etapaEnvolveUsuario(e, Number(selectedUserId))) continue;
        if (getEtapaTimelineStatus(e) === 'VENCIDA') {
          result.push({
            ...e,
            projetoNome: p.nome,
            projetoId: p.id,
            projetoSupervisor: p.supervisor ?? null,
          });
        }
      }
    }
    return result.sort((a, b) => new Date(a.dataFim ?? 0).getTime() - new Date(b.dataFim ?? 0).getTime());
  }, [projects, isGm, selectedUserId, user?.id]);

  function formatDateBR(d: string | null | undefined): string {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR');
  }

  function diasRestantes(dataFim: string | null | undefined): string {
    if (!dataFim) return '';
    const hoje = new Date();
    const hojeD = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fim = new Date(dataFim);
    const fimD = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const diff = Math.floor((fimD.getTime() - hojeD.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} dia(s) atrás`;
    if (diff === 0) return 'hoje';
    return `em ${diff} dia(s)`;
  }

  async function toggleProject(projectId: number) {
    const isExpanded = expandedProjects.has(projectId);
    
    if (isExpanded) {
      // Colapsar
      setExpandedProjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    } else {
      const project = projects.find((p) => p.id === projectId);
      const canFetchDetails =
        project != null && user != null && canUserOpenProjectDetails(user, project);

      if (!canFetchDetails) {
        setExpandedProjects((prev) => {
          const newSet = new Set(prev);
          newSet.add(projectId);
          return newSet;
        });
        return;
      }

      // Expandir - buscar detalhes completos do projeto
      setLoadingDetails(prev => new Set(prev).add(projectId));
      
      try {
        const { data } = await api.get<ProjectDetails>(`/projects/${projectId}`);
        
        setProjects(prev => prev.map(p => 
          p.id === projectId 
            ? { ...p, etapas: data.etapas, responsaveis: data.responsaveis }
            : p
        ));
        
        setExpandedProjects(prev => new Set(prev).add(projectId));
      } catch (err: any) {
        const errorMessage = formatApiError(err);
        toast.error(errorMessage);
      } finally {
        setLoadingDetails(prev => {
          const newSet = new Set(prev);
          newSet.delete(projectId);
          return newSet;
        });
      }
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'EM_ANDAMENTO':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'FINALIZADO':
        return 'bg-green-500/20 text-green-300 border-green-500/50';
      default:
        return 'bg-white/10 text-white/70 border-white/30';
    }
  }

  function getEtapaStatusColor(status: EtapaTimelineStatus) {
    switch (status) {
      case 'NAO_INICIADO':
        return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
      case 'EM_ANDAMENTO':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
      case 'VENCIDA':
        return 'bg-red-500/20 text-red-300 border border-red-500/40';
      case 'FINALIZADO':
        return 'bg-green-500/20 text-green-300 border border-green-500/40';
      default:
        return 'bg-white/10 text-white/70 border border-white/20';
    }
  }

  function getEtapaStatusLabel(status: EtapaTimelineStatus) {
    const labels: Record<EtapaTimelineStatus, string> = {
      NAO_INICIADO: 'Não iniciado',
      EM_ANDAMENTO: 'Em andamento',
      VENCIDA: 'Atrasada',
      FINALIZADO: 'Finalizado',
    };
    return labels[status] || 'Em andamento';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/70">Carregando projetos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
        {error}
      </div>
    );
  }

  const ativos = projects.filter((p) => p.status === 'EM_ANDAMENTO').length;
  const finalizados = projects.filter((p) => {
    const es = p.etapas ?? [];
    if (es.length === 0) return p.status === 'FINALIZADO';
    return es.every((e) => getEtapaTimelineStatus(e) === 'FINALIZADO');
  }).length;

  const etapasComDataFim = etapasParaKpis.filter((etapa) => etapa?.dataFim);
  const etapasExpirando = etapasComDataFim.filter(
    (etapa) =>
      getDeadlineStatus(etapa) === 'SOON' && getEtapaTimelineStatus(etapa) !== 'FINALIZADO',
  ).length;
  const etapasVencidas = etapasParaKpis.filter(
    (etapa) => getEtapaTimelineStatus(etapa) === 'VENCIDA',
  ).length;

  return (
    <div className="mx-auto max-w-full min-w-0 space-y-5 sm:space-y-6 pb-2">
      {/* Filtro de usuário (apenas GM) */}
      {isGm && (
        <div className="bg-neutral/80 border border-white/10 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <label className="text-sm font-medium text-white/90 whitespace-nowrap shrink-0">
              Filtrar por Usuário:
            </label>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:flex-1 sm:max-w-md w-full min-w-0">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full sm:flex-1 sm:max-w-xs min-w-0 bg-neutral/60 border border-white/10 rounded-md px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  paddingRight: '2.5rem'
                }}
              >
                <option value="all" className="bg-neutral text-white">Todos os usuários</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-neutral text-white">
                    {u.nome}
                  </option>
                ))}
              </select>
              {selectedUserId !== 'all' && (
                <button
                  onClick={() => setSelectedUserId('all')}
                  className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm transition-colors shrink-0 w-full xs:w-auto"
                >
                  Limpar Filtro
                </button>
              )}
            </div>
          </div>
          {selectedUserId !== 'all' && (
            <p className="text-xs text-white/60 mt-2">
              Mostrando projetos onde <strong>{users.find((u) => u.id === selectedUserId)?.nome}</strong> é
              supervisor, responsável ou integrante do projeto, ou atua nas etapas. Indicadores de etapas
              (vencimento, atrasadas na timeline) e tarefas/subtarefas da etapa usam só as etapas em que essa pessoa participa.
            </p>
          )}
        </div>
      )}

      {isGm && selectedUserId !== 'all' && (
        <DashboardUserKanban
          projects={projects}
          scopeUserId={Number(selectedUserId)}
          userNome={users.find((u) => u.id === selectedUserId)?.nome ?? 'Usuário'}
          showReviewQueue
          onAfterReview={refreshDashboardProjects}
        />
      )}

      {!isGm &&
        user?.id &&
        projects.some((p) =>
          (p.etapas ?? []).some((e) => Array.isArray(e.checklistJson) && e.checklistJson.length > 0),
        ) && (
          <DashboardUserKanban
            projects={projects}
            scopeUserId={user.id}
            userNome={user.nome ?? 'Você'}
            showReviewQueue={userCanAccessDeliveryReviewQueue(user)}
            reviewPermissionUser={user}
            onAfterReview={refreshDashboardProjects}
          />
        )}

      {/* KPIs compactos; «Tarefas feitas» e «Valor Total» em cards largos abaixo */}
      <div
        className={`grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 ${
          (() => {
            if (pontosUsuario !== null && showReviewKpi) return 'xl:grid-cols-6';
            if (pontosUsuario !== null || showReviewKpi) return 'xl:grid-cols-5';
            return 'xl:grid-cols-4';
          })()
        }`}
      >
        <div className="rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-4 sm:p-5 md:p-6 hover:border-blue-500/50 transition-all text-blue-100 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <h3 className="text-xs sm:text-sm text-blue-300/80 font-medium leading-snug min-w-0 flex-1 [overflow-wrap:anywhere]">
                Projetos Ativos
              </h3>
              <div className="shrink-0 pt-0.5">
                <KpiInfo
                  className="text-blue-200/70"
                  text="Projetos com status Em andamento entre os projetos exibidos na grade (respeita o filtro por usuário, quando ativo)."
                />
              </div>
            </div>
            <div
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"
              aria-hidden
            >
              <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] 2xl:w-5 2xl:h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl sm:text-3xl 2xl:text-4xl font-bold text-blue-100 tabular-nums">{ativos}</p>
        </div>
        <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-600/5 p-4 sm:p-5 md:p-6 hover:border-green-500/50 transition-all text-green-100 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <h3 className="text-xs sm:text-sm text-green-300/80 font-medium leading-snug min-w-0 flex-1 [overflow-wrap:anywhere]">
                Projetos finalizados
              </h3>
              <div className="shrink-0 pt-0.5">
                <KpiInfo
                  className="text-green-200/70"
                  text="Conta quando todas as etapas do projeto estão Finalizadas na timeline (100% das unidades — tarefa ou subtarefa — concluídas: entrega aprovada ou marcado no cadastro). Se o projeto ainda não traz etapas na lista, usa o status Finalizado do cadastro."
                />
              </div>
            </div>
            <div
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-lg bg-green-500/20 flex items-center justify-center"
              aria-hidden
            >
              <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] 2xl:w-5 2xl:h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-2xl sm:text-3xl 2xl:text-4xl font-bold text-green-100 tabular-nums">{finalizados}</p>
        </div>
        <div
          onClick={() => etapasExpirando > 0 && setKpiDetalhe(kpiDetalhe === 'vencendo' ? null : 'vencendo')}
          className={`rounded-xl border p-4 sm:p-5 md:p-6 transition-all text-amber-100 min-w-0 ${
            etapasExpirando > 0 ? 'cursor-pointer' : ''
          } ${
            kpiDetalhe === 'vencendo'
              ? 'border-amber-400/80 bg-gradient-to-br from-amber-500/25 to-amber-700/15 ring-1 ring-amber-400/40'
              : 'border-amber-500/50 bg-gradient-to-br from-amber-500/15 to-amber-700/10 hover:border-amber-400/70'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <h3 className="text-xs sm:text-sm text-amber-200/90 font-medium leading-snug min-w-0 flex-1 [overflow-wrap:anywhere]">
                Etapas vencendo
              </h3>
              <div className="shrink-0 pt-0.5">
                <KpiInfo
                  className="text-amber-200/80"
                  text="Etapas com data fim nos próximos 7 dias que ainda não estão Finalizadas na timeline (concluídas por entrega ou cadastro). Com filtro de usuário, só etapas em que essa pessoa participa. Clique para ver detalhes."
                />
              </div>
            </div>
            <div
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-lg bg-amber-500/25 flex items-center justify-center"
              aria-hidden
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 2xl:w-[18px] 2xl:h-[18px] text-amber-200" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z"
                />
              </svg>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-2xl sm:text-3xl 2xl:text-[2rem] font-bold text-amber-100 tabular-nums">{etapasExpirando}</p>
            {etapasExpirando > 0 && (
              <span className="text-[10px] text-amber-200/60">clique p/ detalhes</span>
            )}
          </div>
        </div>
        <div
          onClick={() => etapasVencidas > 0 && setKpiDetalhe(kpiDetalhe === 'atrasadas' ? null : 'atrasadas')}
          className={`rounded-xl border p-4 sm:p-5 md:p-6 transition-all text-red-100 min-w-0 ${
            etapasVencidas > 0 ? 'cursor-pointer' : ''
          } ${
            kpiDetalhe === 'atrasadas'
              ? 'border-red-400/80 bg-gradient-to-br from-red-600/30 to-red-800/25 ring-1 ring-red-400/40'
              : 'border-red-500/60 bg-gradient-to-br from-red-600/20 to-red-800/20 hover:border-red-400/80'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <h3 className="text-xs sm:text-sm text-red-100 font-medium leading-snug min-w-0 flex-1 [overflow-wrap:anywhere]">
                Etapas atrasadas
              </h3>
              <div className="shrink-0 pt-0.5">
                <KpiInfo
                  className="text-red-200/80"
                  text="Etapas em que já passou a data fim e as tarefas da etapa ainda não estão 100% concluídas na timeline (entrega ou cadastro). Com filtro de usuário, só etapas em que essa pessoa participa. Clique para ver detalhes."
                />
              </div>
            </div>
            <div
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-lg bg-red-500/25 flex items-center justify-center"
              aria-hidden
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 2xl:w-[18px] 2xl:h-[18px] text-red-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 4.93a10 10 0 0114.14 0m0 0a10 10 0 010 14.14m0 0a10 10 0 01-14.14 0m0 0a10 10 0 010-14.14" />
              </svg>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-2xl sm:text-3xl 2xl:text-[2rem] font-bold text-red-100 tabular-nums">{etapasVencidas}</p>
            {etapasVencidas > 0 && (
              <span className="text-[10px] text-red-200/60">clique p/ detalhes</span>
            )}
          </div>
        </div>
        {showReviewKpi && (
          <div
            role={reviewKpiClickable ? 'button' : undefined}
            tabIndex={reviewKpiClickable ? 0 : undefined}
            onClick={() => reviewKpiClickable && navigate(PROJECTS_ANALISE_ROUTE)}
            onKeyDown={(e) => {
              if (reviewKpiClickable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                navigate(PROJECTS_ANALISE_ROUTE);
              }
            }}
            className={`rounded-xl border p-4 sm:p-5 md:p-6 transition-all text-fuchsia-100 min-w-0 ${
              reviewKpiClickable ? 'cursor-pointer' : ''
            } ${
              checklistParaAvaliarCount > 0
                ? 'border-fuchsia-400/70 bg-gradient-to-br from-fuchsia-600/25 to-fuchsia-900/20 hover:border-fuchsia-300/90 ring-1 ring-fuchsia-500/30'
                : 'border-fuchsia-500/35 bg-gradient-to-br from-fuchsia-600/10 to-fuchsia-900/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <h3 className="text-xs sm:text-sm text-fuchsia-100 font-medium leading-snug min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {reviewKpiUserLabel
                    ? `Tarefas a avaliar (${reviewKpiUserLabel})`
                    : 'Tarefas a avaliar'}
                </h3>
                <div className="shrink-0 pt-0.5">
                  <KpiInfo
                    className="text-fuchsia-200/80"
                    text={
                      reviewKpiUserLabel
                        ? `Entregas aguardando avaliação de ${reviewKpiUserLabel} nos projetos filtrados (supervisor, responsável do projeto ou da etapa).`
                        : 'Entregas de colaboradores aguardando sua avaliação. Abre Projetos na aba «Tarefas em análise» para aprovar ou recusar.'
                    }
                  />
                </div>
              </div>
              <div
                className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-lg bg-fuchsia-500/25 flex items-center justify-center"
                aria-hidden
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 2xl:w-[18px] 2xl:h-[18px] text-fuchsia-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-2xl sm:text-3xl 2xl:text-[2rem] font-bold text-fuchsia-50 tabular-nums">
                {checklistParaAvaliarCount}
              </p>
              {reviewKpiClickable && (
                <span className="text-[10px] text-fuchsia-200/70">clique p/ Projetos</span>
              )}
            </div>
          </div>
        )}
        {pontosUsuario !== null && (
          <div className="rounded-xl border border-violet-500/35 bg-gradient-to-br from-violet-500/10 to-violet-600/5 p-4 sm:p-5 md:p-6 hover:border-violet-500/55 transition-all text-violet-100 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <h3 className="text-xs sm:text-sm text-violet-200/90 font-medium leading-snug min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {isGm && selectedUserId !== 'all'
                    ? `Pontos (${users.find((u) => u.id === selectedUserId)?.nome ?? 'usuário'})`
                    : 'Meus pontos'}
                </h3>
                <div className="shrink-0 pt-0.5">
                  <KpiInfo
                    className="text-violet-200/70"
                    text="Soma dos pontos acumulados por tarefas de checklist aprovadas. Cada tarefa vale pelo menos 1 ponto; subtarefas dividem os pontos da tarefa-mãe entre si."
                  />
                </div>
              </div>
              <div
                className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-lg bg-violet-500/20 flex items-center justify-center"
                aria-hidden
              >
                <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] 2xl:w-5 2xl:h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl 2xl:text-[2rem] font-bold text-violet-100 tabular-nums">
              {pontosUsuario.toLocaleString('pt-BR')}
            </p>
          </div>
        )}
      </div>

      {/* Painel de detalhes — Etapas vencendo / atrasadas */}
      {kpiDetalhe && (
        <div
          className={`mt-3 sm:mt-4 rounded-xl border overflow-hidden transition-all ${
            kpiDetalhe === 'vencendo'
              ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-neutral/80'
              : 'border-red-500/40 bg-gradient-to-br from-red-950/40 to-neutral/80'
          }`}
        >
          <div className={`flex items-center justify-between px-4 sm:px-5 py-3 ${
            kpiDetalhe === 'vencendo' ? 'bg-amber-500/10' : 'bg-red-500/10'
          }`}>
            <h3 className={`text-sm font-semibold ${
              kpiDetalhe === 'vencendo' ? 'text-amber-200' : 'text-red-200'
            }`}>
              {kpiDetalhe === 'vencendo' ? 'Etapas vencendo (próximos 7 dias)' : 'Etapas atrasadas'}
              <span className="ml-2 text-xs font-normal opacity-70">
                ({(kpiDetalhe === 'vencendo' ? etapasVencendoDetalhe : etapasAtrasadasDetalhe).length} etapa(s))
              </span>
            </h3>
            <button
              onClick={() => setKpiDetalhe(null)}
              className="text-white/50 hover:text-white/80 transition-colors p-1"
              title="Fechar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {(() => {
            const lista = kpiDetalhe === 'vencendo' ? etapasVencendoDetalhe : etapasAtrasadasDetalhe;
            if (lista.length === 0) {
              return (
                <div className="px-4 sm:px-5 py-6 text-center">
                  <p className="text-white/50 text-sm">Nenhuma etapa encontrada.</p>
                </div>
              );
            }
            const grouped = lista.reduce<Record<string, { projetoId: number; projetoNome: string; etapas: typeof lista }>>((acc, e) => {
              const key = `${e.projetoId}`;
              if (!acc[key]) acc[key] = { projetoId: e.projetoId, projetoNome: e.projetoNome, etapas: [] };
              acc[key].etapas.push(e);
              return acc;
            }, {});
            return (
              <div className="divide-y divide-white/5">
                {Object.values(grouped).map((g) => (
                  <div key={g.projetoId} className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-sm font-medium text-white/90 truncate">{g.projetoNome}</span>
                      <span className="text-[10px] text-white/40 shrink-0">({g.etapas.length} etapa{g.etapas.length > 1 ? 's' : ''})</span>
                    </div>
                    <div className="space-y-1.5 ml-5">
                      {g.etapas.map((e) => {
                        const { resumo, tituloCompleto } = formatParticipantesResumo(
                          nomesParticipantesDaEtapaSemUsuario(e, e.projetoSupervisor?.id ?? null),
                        );
                        return (
                        <button
                          type="button"
                          key={e.id}
                          onClick={() => {
                            setKpiDetalhe(null);
                            navigate(`${DASHBOARD_PATH}?etapaId=${e.id}`);
                          }}
                          className={`flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:flex-row sm:items-center sm:gap-3 ${
                            kpiDetalhe === 'vencendo'
                              ? 'bg-amber-500/8 border border-amber-500/15'
                              : 'bg-red-500/8 border border-red-500/15'
                          }`}
                        >
                          <span className="font-medium text-white/85 min-w-0 shrink-0 sm:max-w-[min(100%,46%)] sm:truncate">
                            {e.nome || 'Etapa sem nome'}
                          </span>
                          <div className="flex min-w-0 flex-1 items-center gap-2 sm:justify-end">
                            {resumo ? (
                              <span
                                className="flex min-w-0 flex-1 items-center gap-1 text-white/50 sm:max-w-[min(100%,320px)] sm:justify-end"
                                title={tituloCompleto ? `Participantes: ${tituloCompleto}` : 'Participantes'}
                              >
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="min-w-0 truncate">{resumo}</span>
                              </span>
                            ) : null}
                            {e.dataFim && (
                              <span className={`shrink-0 whitespace-nowrap tabular-nums ${
                                kpiDetalhe === 'vencendo' ? 'text-amber-300/80' : 'text-red-300/80'
                              }`}>
                                {formatDateBR(e.dataFim)} ({diasRestantes(e.dataFim)})
                              </span>
                            )}
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <div className="mt-3 sm:mt-4 w-full min-w-0">
        <div className="rounded-xl border border-teal-500/35 bg-gradient-to-br from-teal-500/10 to-teal-600/5 p-4 sm:p-5 md:p-6 hover:border-teal-500/50 transition-all text-teal-100 overflow-visible">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3 min-w-0">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <h3 className="text-xs sm:text-sm text-teal-300/80 font-medium leading-snug shrink-0">Tarefas feitas</h3>
              <div className="shrink-0 pt-0.5">
                <KpiInfo
                  className="text-teal-200/70"
                  text="Soma das unidades (tarefas e subtarefas) concluídas — entrega aprovada ou marcado como feito no cadastro — versus o total visível. Com filtro de usuário do GM, usa a mesma regra de Meu Trabalho (integrantes, índices, supervisor vê o projeto inteiro)."
                />
              </div>
            </div>
            <div
              className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg bg-teal-500/20 flex items-center justify-center self-start sm:ml-auto"
              aria-hidden
            >
              <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] md:w-5 md:h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
          </div>
          <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
            <p className="font-bold text-teal-100 tabular-nums tracking-tight whitespace-nowrap text-xl sm:text-2xl md:text-3xl lg:text-4xl w-max min-w-full">
              {checklistResumoGlobal.total > 0
                ? `${checklistResumoGlobal.concluidos} / ${checklistResumoGlobal.total}`
                : '—'}
            </p>
          </div>
          <p className="text-xs text-teal-200/65 mt-1">concluídas (entrega ou cadastro) / total de unidades visíveis</p>
        </div>
      </div>

      {hasProjectsAccess && !isSupervisor && (
        <div className="mt-3 sm:mt-4 w-full min-w-0">
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4 sm:p-5 md:p-6 hover:border-amber-500/50 transition-all text-amber-100 overflow-visible">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3 min-w-0">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <h3 className="text-xs sm:text-sm text-amber-300/80 font-medium leading-snug shrink-0">
                  Valor Total
                </h3>
                <div className="shrink-0 pt-0.5">
                  <KpiInfo
                    className="text-amber-200/70"
                    text="Soma do valor total dos projetos listados no dashboard (respeita o filtro por usuário quando o GM restringe a visão)."
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowValorTotal((prev) => !prev)}
                className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-colors flex items-center justify-center self-start sm:ml-auto"
                title={showValorTotal ? 'Ocultar valor total' : 'Mostrar valor total'}
                aria-label={showValorTotal ? 'Ocultar valor total' : 'Mostrar valor total'}
              >
                {showValorTotal ? (
                  <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] md:w-5 md:h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.954 9.954 0 012.432-4.084m3.04-2.015A9.966 9.966 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.184 5.08M15 12a3 3 0 01-4.12 2.78M9.88 9.88A3 3 0 0115 12m-8.5 8.5l11-11" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] md:w-5 md:h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7s-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
              <p className="font-bold text-amber-100 tabular-nums tracking-tight whitespace-nowrap text-xl sm:text-2xl md:text-3xl lg:text-4xl w-max min-w-full">
                {showValorTotal
                  ? totalValorProjetos.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })
                  : 'R$ ••••••'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ranking de Pontos — GM: completo sem filtro; só o usuário filtrado com filtro ativo */}
      {isGm && ranking.length > 0 && (
        <div className="mt-3 sm:mt-4 bg-neutral/80 border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFullRanking((p) => !p)}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-white/5 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2.5 gap-1 min-w-0 text-left">
              <div className="flex items-center gap-2.5 shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                </svg>
                <h3 className="text-sm sm:text-base font-semibold text-white/90">
                  {selectedUserId === 'all' ? 'Ranking de Usuários' : 'Posição no ranking geral'}
                </h3>
              </div>
              {selectedUserId === 'all' ? (
                <span className="text-xs text-white/50 sm:ml-1">({ranking.length} usuários)</span>
              ) : rankingExibicao.length > 0 ? (
                <span className="text-xs text-violet-300/90 truncate">
                  {rankingExibicao[0].nome} — {rankingExibicao[0].posicao}º de {ranking.length}
                </span>
              ) : (
                <span className="text-xs text-amber-200/70">
                  Usuário não consta no ranking (somente ativos entram na lista)
                </span>
              )}
            </div>
            <span className="text-white/50 text-sm shrink-0">{showFullRanking ? '▲' : '▼'}</span>
          </button>

          {showFullRanking && rankingExibicao.length > 0 && (
            <div className="px-3 pb-4 sm:px-5">
              {/* Mobile: cartões empilhados (sem scroll horizontal) */}
              <ul className="md:hidden space-y-2.5">
                {rankingExibicao.map((r) => {
                  const rowHighlight =
                    r.posicao === 1
                      ? 'border-amber-500/35 bg-amber-500/10'
                      : r.posicao <= 3
                        ? 'border-white/15 bg-white/[0.04]'
                        : 'border-white/10 bg-white/[0.02]';
                  return (
                    <li
                      key={r.id}
                      className={`rounded-xl border p-3 ${rowHighlight}`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${
                            r.posicao <= 3 ? 'bg-white/10 text-white' : 'text-white/50'
                          }`}
                          title={`${r.posicao}º`}
                        >
                          {r.posicao <= 3 ? (r.posicao === 1 ? '🥇' : r.posicao === 2 ? '🥈' : '🥉') : r.posicao}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {r.fotoUrl ? (
                              <img
                                src={resolveFileUrl(r.fotoUrl)}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-full border border-white/10 object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/50">
                                {r.nome.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-white/90 [overflow-wrap:anywhere] leading-snug">{r.nome}</p>
                              <p className="text-xs text-white/45 [overflow-wrap:anywhere]">{r.cargo}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-md bg-white/5 px-1 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-white/45">Pontos</p>
                              <p className="text-sm font-bold tabular-nums text-violet-300">{r.pontos.toLocaleString('pt-BR')}</p>
                            </div>
                            <div className="rounded-md bg-white/5 px-1 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-white/45">Entregas</p>
                              <p className="text-sm font-semibold tabular-nums text-white/80">
                                {r.totalEntregasAprovadas.toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <div className="rounded-md bg-white/5 px-1 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-white/45">Etapas</p>
                              <p className="text-sm font-semibold tabular-nums text-white/80">
                                {r.totalEtapasComoParticipante.toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto [scrollbar-width:thin]">
                <table className="w-full min-w-0 text-sm table-fixed">
                  <thead>
                    <tr className="text-left text-white/50 border-b border-white/10">
                      <th className="py-2 pr-2 w-12 text-center">#</th>
                      <th className="py-2 pr-2 min-w-0">Usuário</th>
                      <th className="py-2 pr-2 w-[5.5rem] text-center">Pontos</th>
                      <th className="py-2 pr-2 w-[7rem] text-center">
                        <span className="hidden lg:inline">Entregas aprov.</span>
                        <span className="lg:hidden">Entregas</span>
                      </th>
                      <th className="py-2 w-[7rem] text-center">
                        <span className="hidden xl:inline">Etapas (partic.)</span>
                        <span className="xl:hidden">Etapas</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingExibicao.map((r) => {
                      const medalColors = ['text-amber-400', 'text-gray-300', 'text-amber-700'];
                      const medal = r.posicao <= 3 ? medalColors[r.posicao - 1] : '';
                      const rowHighlight =
                        r.posicao === 1
                          ? 'bg-amber-500/10'
                          : r.posicao <= 3
                            ? 'bg-white/[0.03]'
                            : '';
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-white/5 last:border-b-0 ${rowHighlight} hover:bg-white/5 transition-colors`}
                        >
                          <td className={`py-2.5 pr-2 text-center font-bold tabular-nums ${medal || 'text-white/40'}`}>
                            {r.posicao <= 3 ? (
                              <span title={`${r.posicao}º lugar`}>
                                {r.posicao === 1 ? '🥇' : r.posicao === 2 ? '🥈' : '🥉'}
                              </span>
                            ) : (
                              r.posicao
                            )}
                          </td>
                          <td className="py-2.5 pr-2 min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {r.fotoUrl ? (
                                <img
                                  src={resolveFileUrl(r.fotoUrl)}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/10"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs font-bold shrink-0">
                                  {r.nome.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-white/90 font-medium truncate">{r.nome}</p>
                                <p className="text-white/40 text-xs truncate">{r.cargo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pr-2 text-center">
                            <span className="font-bold text-violet-300 tabular-nums">
                              {r.pontos.toLocaleString('pt-BR')}
                            </span>
                          </td>
                          <td className="py-2.5 pr-2 text-center text-white/70 tabular-nums">
                            {r.totalEntregasAprovadas.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2.5 text-center text-white/70 tabular-nums">
                            {r.totalEtapasComoParticipante.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/45 sm:text-[11px] sm:text-white/35">
                {selectedUserId === 'all'
                  ? 'Desempate: 1) pontos acumulados · 2) entregas aprovadas · 3) etapas como participante · 4) ordem alfabética'
                  : 'A posição (#) é a do ranking geral de todos os usuários ativos, com os mesmos critérios de desempate.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Projetos: no máx. 2 colunas para cards mais largos; 3 colunas deixava etapas ilegíveis */}
      <div className="min-w-0">
        <h3 className="text-lg font-semibold mb-3 sm:text-xl sm:mb-4">Projetos</h3>
        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 md:gap-6 items-stretch">
          {projects.map((project) => {
            const isExpanded = expandedProjects.has(project.id);
            const isLoadingDetails = loadingDetails.has(project.id);
            const etapas = project.etapas || [];
            const etapasVisaoUsuario =
              isGm && selectedUserId !== 'all'
                ? etapas.filter((e) => etapaEnvolveUsuario(e, Number(selectedUserId)))
                : etapas;
            const responsaveis = project.responsaveis || [];
            const checklistResumo = getDashboardChecklistResumo(project, checklistScopeUserId);
            const supId = project.supervisor?.id;
            const responsaveisSemSupervisor = responsaveis.filter(
              (r) => r.usuario && (supId == null || Number(r.usuario.id) !== Number(supId)),
            );
            const tituloEquipeCompleto = [
              project.supervisor?.nome ? `Supervisor: ${project.supervisor.nome}` : null,
              ...responsaveisSemSupervisor.map((r) => r.usuario?.nome).filter(Boolean),
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={project.id}
                id={`dashboard-projeto-${project.id}`}
                className="bg-gradient-to-br from-neutral/90 to-neutral/70 border border-white/10 rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 min-w-0 flex flex-col"
              >
                {/* Cabeçalho do Card - Sempre visível */}
                <div className="p-3 min-w-0 sm:p-4">
                  <div className="mb-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                    <h4 className="text-base font-semibold text-white break-words [overflow-wrap:anywhere] sm:flex-1 sm:text-lg sm:pr-1">
                      {project.nome}
                    </h4>
                    <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (user && canUserOpenProjectDetails(user, project)) {
                            navigate(`/projects/${project.id}`);
                          } else {
                            navigate('/tasks');
                          }
                        }}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded border border-primary/30 bg-primary/20 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/30 sm:min-h-0 sm:flex-none sm:px-2 sm:py-1"
                        title="Ver detalhes completos"
                      >
                        Ver
                      </button>
                    </div>
                  </div>

                  {project.resumo && (
                    <p className="mb-3 line-clamp-4 text-sm text-white/60 sm:line-clamp-2 [overflow-wrap:anywhere]">
                      {project.resumo}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-1 rounded text-xs border ${getStatusColor(project.status)}`}>
                      {project.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Finalizado'}
                    </span>
                    {project.progress !== undefined && (
                      <span className="text-xs text-white/60">
                        {project.progress}% concluído
                      </span>
                    )}
                  </div>

                  {project.progress !== undefined && (
                    <div className="w-full bg-white/10 rounded-full h-2.5 mb-3 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          project.progress >= 100 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-400' 
                            : project.progress >= 50 
                              ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                              : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        }`}
                        style={{ width: `${project.progress}%` }}
                      />
              </div>
                  )}

                  {checklistResumo.total > 0 && (
                    <p className="text-xs text-teal-200/80 mb-2">
                      Tarefas (concluídas):{' '}
                      <span className="font-semibold text-teal-100 tabular-nums">
                        {checklistResumo.concluidos}/{checklistResumo.total}
                      </span>
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 text-xs text-white/60 min-w-0">
                    <span className="min-w-0 truncate" title={project.supervisor ? `Supervisor: ${project.supervisor.nome}` : undefined}>
                      {project.supervisor ? `Supervisor: ${project.supervisor.nome}` : 'Sem supervisor'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="flex items-center gap-1 text-xs text-white/70 hover:text-primary transition-colors"
                    >
                      {isLoadingDetails ? (
                        <span>Carregando...</span>
                      ) : (
                        <>
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          {isExpanded ? 'Recolher' : 'Expandir'}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Conteúdo Expandido com animação de abrir/fechar */}
                <div
                  className={`transition-[max-height,opacity] duration-300 ease-in-out border-t border-white/10 min-w-0 ${
                    isExpanded && !isLoadingDetails
                      ? 'max-h-[min(90vh,920px)] overflow-y-auto overflow-x-hidden opacity-100 px-4 pb-4 pt-4 [scrollbar-width:thin]'
                      : 'max-h-0 overflow-hidden opacity-0 px-4'
                  }`}
                >
                  {isExpanded && !isLoadingDetails && (
                    <div className="flex min-h-0 min-w-0 flex-col gap-4">
                      {/* Integrantes — limite de pills + "+N" para não estourar altura do card */}
                      {(project.supervisor || responsaveis.length > 0) && (
                        <div className="min-w-0 shrink-0">
                          <h5 className="text-sm font-semibold text-white/90 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-3-3h-4a3 3 0 00-3 3v2zM13 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Equipe
                          </h5>
                          <div
                            className="-mx-0.5 flex flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden px-0.5 pb-1.5 [scrollbar-width:thin]"
                            title={tituloEquipeCompleto || undefined}
                          >
                            {project.supervisor && (
                              <div className="flex max-w-[min(100%,14rem)] shrink-0 items-center gap-1.5 text-sm bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1">
                                <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                                <span className="truncate font-medium text-primary/90" title={project.supervisor.nome}>
                                  {project.supervisor.nome}
                                </span>
                                <span className="shrink-0 text-xs text-primary/60">(Sup.)</span>
                              </div>
                            )}
                            {responsaveisSemSupervisor.map((resp, idx) => (
                              <div
                                key={resp.usuario?.id ?? idx}
                                className="flex max-w-[min(100%,14rem)] shrink-0 items-center gap-1.5 text-sm bg-blue-500/10 border border-blue-500/30 rounded-full px-2.5 py-1"
                              >
                                <div className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                                <span className="truncate text-blue-300" title={resp.usuario!.nome}>
                                  {resp.usuario!.nome}
                                </span>
                              </div>
                            ))}
                            {!project.supervisor && responsaveis.length === 0 && (
                              <p className="text-xs text-white/50">Nenhum integrante cadastrado</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tarefas (Etapas) — altura natural; rolagem fica no painel expandido */}
                      <div className="min-w-0">
                        <h5 className="text-sm font-semibold text-white/90 mb-2 flex shrink-0 items-center gap-2">
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span className="min-w-0">
                            Tarefas ({etapasVisaoUsuario.length}
                            {etapasVisaoUsuario.length !== etapas.length ? ` de ${etapas.length}` : ''})
                          </span>
                        </h5>
                        {etapasVisaoUsuario.length > 0 ? (
                          <div className="min-w-0 space-y-2 pr-0.5">
                            {etapasVisaoUsuario.map((etapa) => {
                              const etapaTimelineStatus = getEtapaTimelineStatus(etapa);
                              // Cor de destaque lateral baseada no status
                              const borderLeftColor = 
                                etapaTimelineStatus === 'FINALIZADO' ? 'border-l-green-500' :
                                etapaTimelineStatus === 'EM_ANDAMENTO' ? 'border-l-blue-500' :
                                etapaTimelineStatus === 'VENCIDA' ? 'border-l-red-500' :
                                'border-l-yellow-500';
                              
                              return (
                                <div
                                  key={etapa.id}
                                  id={`dashboard-etapa-${etapa.id}`}
                                  className={`min-w-0 bg-white/5 border border-white/10 border-l-4 ${borderLeftColor} rounded-lg p-3 hover:bg-white/10 transition-all duration-200`}
                                >
                                  <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
                                    <h6 className="min-w-0 flex-1 break-words text-sm font-medium text-white/90 [overflow-wrap:anywhere]">
                                      {etapa.nome}
                                    </h6>
                                    <span className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${getEtapaStatusColor(etapaTimelineStatus)}`}>
                                      {getEtapaStatusLabel(etapaTimelineStatus)}
                                    </span>
                                  </div>

                                  {etapa.descricao && (
                                    <p className="mb-2 line-clamp-3 break-words text-xs text-white/60 [overflow-wrap:anywhere]">
                                      {etapa.descricao}
                                    </p>
                                  )}

                                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-white/50">
                                    {(() => {
                                      const nomes: string[] = [];
                                      if (etapa.executor?.nome) nomes.push(etapa.executor.nome);
                                      etapa.integrantes?.forEach((i: any) => {
                                        const n = i.usuario?.nome ?? i.nome;
                                        if (n && !nomes.includes(n)) nomes.push(n);
                                      });
                                      return nomes.length > 0 ? (
                                        <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded bg-white/5 px-2 py-0.5">
                                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                          </svg>
                                          <span className="truncate">
                                            {nomes.length} participante{nomes.length !== 1 ? 's' : ''}
                                          </span>
                                        </span>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : etapas.length > 0 ? (
                          <p className="text-xs text-white/50">
                            Nenhuma etapa deste projeto para o usuário selecionado no filtro (ele não é participante
                            nestas etapas).
                          </p>
                        ) : (
                          <p className="text-xs text-white/50">Nenhuma tarefa cadastrada</p>
                        )}
                      </div>

                      {/* Informações Adicionais — shrink-0 para não ser cortada pelo scroll do painel */}
                      <div className="shrink-0 border-t border-white/10 pt-3">
                        <div className="flex min-w-0 flex-col gap-3 text-xs">
                          <div className="w-full min-w-0 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                            <span className="text-blue-300/80 block mb-0.5">Total de Etapas</span>
                            <p className="text-blue-100 font-bold text-base tabular-nums">
                              {project._count?.etapas || etapas.length}
                            </p>
                          </div>
                          {checklistResumo.total > 0 && (
                            <div className="w-full min-w-0 bg-teal-500/10 border border-teal-500/20 rounded-lg p-3">
                              <span className="text-teal-300/80 block mb-0.5">Tarefas feitas</span>
                              <p className="text-teal-100 font-bold text-base tabular-nums">
                                {checklistResumo.concluidos}/{checklistResumo.total}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Loading state quando expandindo */}
                {isExpanded && isLoadingDetails && (
                  <div className="p-8 flex items-center justify-center">
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                      <p className="text-sm text-white/60">Carregando detalhes...</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {projects.length === 0 && (
          <div className="bg-neutral/80 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-white/60">Nenhum projeto cadastrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
