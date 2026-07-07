import { useEffect, useState, FormEvent, useRef, ChangeEvent, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { ChecklistItemEntrega, ChecklistItem, ChecklistSubItem, ProjetoArquivo } from '../types';
import { btn } from '../utils/buttonStyles';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { FileDropInput } from '../components/FileDropInput';
import { AttachmentList } from '../components/files/AttachmentList';
import { LinkifiedText } from '../components/common/LinkifiedText';
import { ReviewerCommentBox } from '../components/projects/ReviewerCommentBox';
import { FilePreviewTrigger } from '../components/files/FilePreviewTrigger';
import { urlsToViewerItems } from '../contexts/FileViewerContext';
import { toast, formatApiError } from '../utils/toast';
import { UPLOAD_LIMITS, validateDescricaoProjetoFileSize } from '../utils/uploadLimits';
import { AppSelect } from '../components/ui/AppSelect';
import {
  CalendarioEventoDatetimeFields,
  buildCalendarioEventoIsoRange,
  defaultCalendarioEventoDatetimes,
} from '../components/calendario/CalendarioEventoDatetimeFields';
import { formatEventPeriod } from '../utils/calendarioEventoDatetimes';
import {
  createEmptyChecklistItem,
  createEmptyChecklistSubItem,
  normalizeChecklistItemFromApi,
  serializeChecklistItemForApi,
} from '../utils/checklistStableId';
import { NumericInput } from '../components/ui/NumericInput';
import type { Cotacao, PagoPorEntry, PagoPorMetodoOption } from '../types/stock';
import { PurchaseRequestFields } from '../components/stock/PurchaseRequestFields';
import { PagoPorListEditor } from '../components/stock/PagoPorListEditor';
import { buildPurchasePayloadFromLine, createEmptyPurchaseLineItem } from '../utils/purchaseRequest';
import type { PurchaseLineItem } from '../types/stock';
import { pagoPorToApiPayload } from '../utils/pagoPor';
import {
  getStatusColor,
  getStatusLabel,
  getEntregaStatusColor,
  getEntregaStatusLabel,
  getCheckboxStyle,
  getChecklistItemStyle,
  getChecklistTextStyle,
  getChecklistItemStatusColor,
  getChecklistItemStatusLabel,
} from '../utils/statusStyles';
import { formatParticipantesResumo, nomesParticipantesDaEtapaSemUsuario } from '../utils/participantesResumo';
import {
  getChecklistUnitStatus,
  getChecklistUnitWorkflowStatus,
  type ChecklistUnitWorkflowStatus,
  canToggleChecklistCadastroForTopLevelRow,
  computeEtapaProgressRatio,
  countTopLevelChecklistRowsFeitas,
  countChecklistSubitemsConcluidas,
  isChecklistUnitConcluidaParaProgressoTimeline,
  isTopLevelChecklistRowFeita,
  isEtapaFullyConcludedForProjectProgress,
  findChecklistEntregaForUnit,
} from '../utils/etapaChecklistStatus';
import {
  userHasPermission,
  userHasAnyPermission,
  userHasProjectDeliveryReviewerPermission,
  userMayReviewDeliveryAsNonExecutor,
  userCanReviewDeliveriesInEtapaContext,
  TASKS_ROUTE,
} from '../utils/projectAccess';
import { ProjectEtapaEquipePanel } from '../components/projects/ProjectEtapaEquipePanel';
import { ProjetoEquipeMembrosField } from '../components/projects/ProjetoEquipeMembrosField';
import { EtapaEstoqueItemsField } from '../components/projects/EtapaEstoqueItemsField';
import {
  buildEquipeCompleta,
  buildProjetoResponsavelIdsPayload,
  mergeProjetoEquipeOnSetorChange,
  resumoPapeisEquipe,
} from '../utils/projetoEquipe';

function buildProjetoArquivosGallery(arquivos: ProjetoArquivo[]) {
  return urlsToViewerItems(
    arquivos.map((f) => f.url),
    (_url, i) => arquivos[i]?.originalName || arquivos[i]?.url || '',
  );
}

/** Pontos do item principal (padrão 1; ignora se inválido). */
function displayPontosTarefaChecklist(p: unknown): number {
  if (typeof p === 'number' && Number.isFinite(p) && p >= 1) {
    return Math.min(9999, Math.floor(p));
  }
  return 1;
}

/**
 * Pontos inteiros creditados ao aprovar a subtarefa (espelha o backend).
 * As primeiras `remainder` subtarefas recebem +1 para distribuir exatamente o total.
 */
function computeSubitemPts(itemPontos: unknown, totalSubitens: number, subitemIndex = 0): number {
  const pts = displayPontosTarefaChecklist(itemPontos);
  if (totalSubitens <= 0) return pts;
  const base = Math.floor(pts / totalSubitens);
  const remainder = pts - base * totalSubitens;
  return subitemIndex < remainder ? base + 1 : base;
}

/** Valor fracionário exato da subtarefa (para exibição). */
function computeSubitemPtsFraction(itemPontos: unknown, totalSubitens: number): string {
  const pts = displayPontosTarefaChecklist(itemPontos);
  if (totalSubitens <= 0) return String(pts);
  const exact = pts / totalSubitens;
  if (Number.isInteger(exact)) return String(exact);
  return exact.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '~';
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
  cargo: string | { nome: string };
}

interface Subetapa {
  id: number;
  nome: string;
  descricao?: string | null;
  status: string;
}

interface Sessao {
  id: number;
  projetoId: number;
  nome: string;
  ordem: number;
}

interface Etapa {
  id: number;
  ordem?: number;
  nome: string;
  descricao?: string | null;
  sessaoId?: number | null;
  aba?: string | null;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA';
  dataInicio?: string | null;
  dataFim?: string | null;
  valorInsumos?: number;
  checklistJson?: ChecklistItem[] | null;
  executor: Usuario;
  responsavel?: Usuario | null;
  setores?: { id: number; nome: string }[];
  sessao?: Sessao | null;
  integrantes?: Array<{ usuario: Usuario; checklistItemIndices?: number[] | null }>;
  subetapas: Subetapa[];
  entregas?: EtapaEntrega[];
  checklistEntregas?: ChecklistItemEntrega[];
}

/** Deep link (Kanban / notificações): prioriza entrega EM_ANALISE mais recente na unidade. */
function pickChecklistEntregaForDeepLink(
  etapa: Etapa,
  checklistIndex: number,
  subitemIndex: number | null,
): ChecklistItemEntrega | undefined {
  const entregas = etapa.checklistEntregas;
  if (!Array.isArray(entregas)) return undefined;
  const matches = entregas.filter((e) => {
    if (Number(e.checklistIndex) !== checklistIndex) return false;
    if (subitemIndex == null) return e.subitemIndex == null;
    return e.subitemIndex != null && Number(e.subitemIndex) === subitemIndex;
  });
  if (matches.length === 0) return undefined;
  const byDateDesc = (a: ChecklistItemEntrega, b: ChecklistItemEntrega) =>
    new Date(b.dataEnvio).getTime() - new Date(a.dataEnvio).getTime();
  const emAnalise = matches
    .filter((e) => String(e.status || '').toUpperCase() === 'EM_ANALISE')
    .sort(byDateDesc);
  return emAnalise[0] ?? [...matches].sort(byDateDesc)[0];
}

/** Uma entrada por unidade de checklist (linha sem subs = 1; com subs = uma por subtarefa). */
function workflowStatusesForEtapaChecklist(etapa: Etapa): ChecklistUnitWorkflowStatus[] {
  const list = etapa.checklistJson;
  if (!Array.isArray(list) || list.length === 0) return [];
  const out: ChecklistUnitWorkflowStatus[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const subs = item?.subitens;
    if (Array.isArray(subs) && subs.length > 0) {
      for (let s = 0; s < subs.length; s++) {
        out.push(getChecklistUnitWorkflowStatus(etapa, { checklistIndex: i, subitemIndex: s }));
      }
    } else {
      out.push(getChecklistUnitWorkflowStatus(etapa, { checklistIndex: i }));
    }
  }
  return out;
}

/** Quantas subtarefas deste item batem com o filtro de status (ex.: Em análise). */
function countChecklistSubitemsMatchingWorkflowFilter(
  etapa: Etapa,
  checklistIndex: number,
  filter: ChecklistUnitWorkflowStatus,
): number {
  const item = etapa.checklistJson?.[checklistIndex];
  const subs = item?.subitens;
  if (!Array.isArray(subs) || subs.length === 0) return 0;
  let n = 0;
  for (let s = 0; s < subs.length; s++) {
    if (getChecklistUnitWorkflowStatus(etapa, { checklistIndex, subitemIndex: s }) === filter) {
      n += 1;
    }
  }
  return n;
}

/** Índices das subtarefas com entrega aguardando avaliação. */
function listChecklistSubitemIndicesEmAnalise(etapa: Etapa, checklistIndex: number): number[] {
  const item = etapa.checklistJson?.[checklistIndex];
  const subs = item?.subitens;
  if (!Array.isArray(subs) || subs.length === 0) return [];
  const out: number[] = [];
  for (let s = 0; s < subs.length; s++) {
    if (getChecklistUnitStatus(etapa, { checklistIndex, subitemIndex: s }) === 'EM_ANALISE') {
      out.push(s);
    }
  }
  return out;
}

function getEntregaExecutorId(
  entrega: { executorId?: number | null; executor?: { id?: number } | null } | null | undefined,
): number | null {
  if (!entrega) return null;
  const id = entrega.executorId ?? entrega.executor?.id;
  return id != null ? Number(id) : null;
}

function etapaTemEntregaDoUsuario(etapa: Etapa, usuarioId: number): boolean {
  const alvo = Number(usuarioId);
  if (etapa.checklistEntregas?.some((e) => getEntregaExecutorId(e) === alvo)) return true;
  if (etapa.entregas?.some((e) => getEntregaExecutorId(e) === alvo)) return true;
  return false;
}

function checklistEntregaDoUsuario(
  etapa: Etapa,
  checklistIndex: number,
  usuarioId: number,
  subitemIndex?: number | null,
): boolean {
  const alvo = Number(usuarioId);
  return (etapa.checklistEntregas ?? []).some((e) => {
    if (Number(e.checklistIndex) !== checklistIndex) return false;
    if (subitemIndex == null) {
      if (e.subitemIndex != null) return false;
    } else if (Number(e.subitemIndex) !== subitemIndex) {
      return false;
    }
    return getEntregaExecutorId(e) === alvo;
  });
}

function checklistRowMatchesEntreguePorFilter(
  etapa: Etapa,
  checklistIndex: number,
  item: ChecklistItem,
  usuarioId: number,
): boolean {
  const subs = item.subitens;
  if (Array.isArray(subs) && subs.length > 0) {
    if (checklistEntregaDoUsuario(etapa, checklistIndex, usuarioId, null)) return true;
    for (let s = 0; s < subs.length; s++) {
      if (checklistEntregaDoUsuario(etapa, checklistIndex, usuarioId, s)) return true;
    }
    return false;
  }
  return checklistEntregaDoUsuario(etapa, checklistIndex, usuarioId, null);
}

interface EtapaEntrega {
  id: number;
  descricao: string;
  imagemUrl?: string | null;
  status: 'EM_ANALISE' | 'APROVADA' | 'RECUSADA';
  dataEnvio: string;
  comentario?: string | null;
  dataAvaliacao?: string | null;
  executorId?: number;
  executor: Usuario;
  avaliadoPor?: Usuario | null;
  foiEditada?: boolean;
  dataEdicao?: string | null;
  editadoPor?: Usuario | null;
}

interface Responsavel {
  id: number;
  usuario: Usuario;
}

interface Compra {
  id: number;
  item: string;
  quantidade: number;
  valorUnitario: number | null;
  status: string;
  nfUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  motivoRejeicao?: string | null;
  etapaId?: number | null;
  etapa?: { id: number; nome: string } | null;
}

interface ProjectDetails {
  id: number;
  nome: string;
  resumo?: string | null;
  objetivo?: string | null;
  descricaoLonga?: string | null;
  descricaoArquivos?: ProjetoArquivo[] | null;
  status: 'EM_ANDAMENTO' | 'FINALIZADO';
  valorTotal: number;
  valorInsumos: number;
  dataCriacao: string;
  supervisor?: Usuario | null;
  // Legado (1 setor)
  setorId?: number | null;
  setor?: { id: number; nome: string } | null;
  // Novo (múltiplos setores responsáveis)
  setores?: { id: number; nome: string }[];
  responsaveis: Responsavel[];
  responsaveisExcluidos?: { usuarioId: number }[];
  sessoes?: Sessao[];
  etapas: Etapa[];
  compras: Compra[];
}

interface ProjetoEventoCalendario {
  id: number;
  titulo: string;
  descricao?: string | null;
  dataInicio: string;
  dataFim: string;
  alvo: 'TODOS_USUARIOS' | 'SELECIONADOS';
  projetoId?: number | null;
  criador: { id: number; nome: string };
  participantes: Array<{ usuarioId: number; usuario?: { id: number; nome: string } }>;
}

type EtapaPrazoFiltro = 'all' | 'soon' | 'expired' | 'on_time' | 'without_deadline';

/** Filtro por workflow das tarefas do checklist (unidades = item ou cada subtarefa). */
type EtapaTarefaStatusFiltro = 'all' | ChecklistUnitWorkflowStatus | 'SEM_TAREFAS';

/** Filtro de visualização: mostrar etapas de todas as abas juntas — não é nome de aba persistido. */
const ABA_VISUALIZACAO_TODAS = '__view_all_abas__';

interface SimpleSetor {
  id: number;
  nome: string;
  membros?: Array<{
    usuario: { id: number };
  }>;
}

interface EditProjectForm {
  nome: string;
  resumo?: string;
  objetivo?: string;
  valorTotal?: number;
  supervisorId?: number;
  setorIds: number[];
  excludedAutoIds: number[];
  responsavelIds: number[];
  status?: 'EM_ANDAMENTO' | 'FINALIZADO';
}

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const podeEditarPontosChecklist = useMemo(() => userHasPermission(user, 'projetos:pontos'), [user]);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [metodosPago, setMetodosPago] = useState<PagoPorMetodoOption[]>([]);
  const [setores, setSetores] = useState<SimpleSetor[]>([]);
  const [projectEvents, setProjectEvents] = useState<ProjetoEventoCalendario[]>([]);
  const [loadingProjectEvents, setLoadingProjectEvents] = useState(false);
  const [showProjectEventModal, setShowProjectEventModal] = useState(false);
  const [projectEventSubmitting, setProjectEventSubmitting] = useState(false);
  const [projectEventForm, setProjectEventForm] = useState<{
    titulo: string;
    descricao: string;
    dataInicio: string;
    dataFim: string;
    horaInicio: string;
    horaFim: string;
    diaInteiro: boolean;
    alvo: 'TODOS_USUARIOS' | 'SELECIONADOS';
    usuarioIds: number[];
  }>({
    titulo: '',
    descricao: '',
    ...defaultCalendarioEventoDatetimes(),
    alvo: 'SELECIONADOS',
    usuarioIds: [],
  });
  const [showEtapaModal, setShowEtapaModal] = useState(false);
  const projectSetorIds = useMemo(
    () => (Array.isArray(project?.setores) ? project?.setores?.map((s) => s.id) ?? [] : []),
    [project?.setores],
  );
  const allowedEtapaSetores = useMemo(
    () => setores.filter((s) => projectSetorIds.includes(s.id)),
    [setores, projectSetorIds],
  );
  const [submitting, setSubmitting] = useState(false);
  const [editingEtapa, setEditingEtapa] = useState<Etapa | null>(null);
  const integrantesSelectRef = useRef<HTMLSelectElement>(null);
  const [projectDescricaoTexto, setProjectDescricaoTexto] = useState<string>('');
  const [projectDescricaoArquivos, setProjectDescricaoArquivos] = useState<ProjetoArquivo[]>([]);
  const [projectDescricaoSaving, setProjectDescricaoSaving] = useState(false);
  const [projectDescricaoError, setProjectDescricaoError] = useState<string | null>(null);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editProjectForm, setEditProjectForm] = useState<EditProjectForm>({
    nome: '',
    resumo: '',
    objetivo: '',
    valorTotal: undefined,
    supervisorId: undefined,
    setorIds: [],
    excludedAutoIds: [],
    responsavelIds: [],
    status: 'EM_ANDAMENTO',
  });
  const [editProjectSubmitting, setEditProjectSubmitting] = useState(false);
  const [editProjectError, setEditProjectError] = useState<string | null>(null);

  const computeAutoMemberIds = (selectedSetorIds: number[]) => {
    const ids = new Set<number>();
    for (const setorId of selectedSetorIds) {
      const setor = setores.find((s) => s.id === setorId);
      if (!setor?.membros) continue;
      for (const membro of setor.membros) {
        const usuarioId = membro.usuario?.id;
        if (typeof usuarioId === 'number') ids.add(usuarioId);
      }
    }
    return Array.from(ids);
  };

  const equipeCompleta = useMemo(() => {
    if (!project) return [];
    return buildEquipeCompleta(project, setores);
  }, [project, setores]);

  // Nota: a edição de entregas de checklist é feita na tela Meu Trabalho.
  // Este componente não possui o fluxo completo de envio/edição de objetivos,
  // portanto qualquer tentativa de editar a entrega a partir daqui é desabilitada.

  const canSeeAllProjects = useMemo(() => userHasPermission(user, 'projetos:ver_todos'), [user]);

  const isSupervisorProjeto = Boolean(
    user?.id != null &&
      project?.supervisor?.id != null &&
      Number(user.id) === Number(project.supervisor.id),
  );

  const hasDeliveryReviewerPermission = useMemo(
    () => userHasProjectDeliveryReviewerPermission(user),
    [user],
  );

  function canUserReviewDeliveriesOnEtapa(
    etapa?: { responsavelId?: number | null; responsavel?: { id?: number } | null },
  ): boolean {
    if (!project) return false;
    return userCanReviewDeliveriesInEtapaContext(user, etapa ?? {}, project);
  }

  function mayReviewThisDeliveryExecutor(executorId: number | null | undefined): boolean {
    return userMayReviewDeliveryAsNonExecutor(user, executorId);
  }

  function findChecklistEntregaRecord(
    etapa: Etapa,
    checklistIndex: number,
    subitemIndex: number | null,
  ): ChecklistItemEntrega | undefined {
    return findChecklistEntregaForUnit(etapa, checklistIndex, subitemIndex);
  }

  /** Abre a modal «Detalhes da Entrega» para revisar antes de aprovar/recusar (não chama API direto). */
  function openChecklistEntregaReviewModal(
    etapa: Etapa,
    checklistIndex: number,
    opts?: {
      subitemIndex?: number | null;
      decisionDraft?: 'APROVADO' | 'REPROVADO';
      queueNextSubIndices?: number[];
    },
  ) {
    const item = etapa.checklistJson?.[checklistIndex];
    const hasSubitens = Array.isArray(item?.subitens) && item!.subitens!.length > 0;
    let subIdx: number | null = opts?.subitemIndex ?? null;

    if (subIdx == null && hasSubitens) {
      const subs = listChecklistSubitemIndicesEmAnalise(etapa, checklistIndex);
      if (subs.length > 0) {
        subIdx = subs[0]!;
        if (opts?.queueNextSubIndices === undefined) {
          setChecklistReviewQueue(subs.slice(1).map((s) => ({
            etapaId: etapa.id,
            checklistIndex,
            subitemIndex: s,
          })));
        } else {
          setChecklistReviewQueue(
            opts.queueNextSubIndices.map((s) => ({
              etapaId: etapa.id,
              checklistIndex,
              subitemIndex: s,
            })),
          );
        }
      } else if (getChecklistUnitStatus(etapa, { checklistIndex }) === 'EM_ANALISE') {
        subIdx = null;
        setChecklistReviewQueue([]);
      }
    } else if (opts?.queueNextSubIndices) {
      setChecklistReviewQueue(
        opts.queueNextSubIndices.map((s) => ({
          etapaId: etapa.id,
          checklistIndex,
          subitemIndex: s,
        })),
      );
    } else {
      setChecklistReviewQueue([]);
    }

    const entrega = findChecklistEntregaRecord(etapa, checklistIndex, subIdx);
    if (!entrega || getChecklistUnitStatus(etapa, { checklistIndex, subitemIndex: subIdx ?? undefined }) !== 'EM_ANALISE') {
      toast.warning('Não há entrega em análise para avaliar nesta tarefa.');
      return;
    }

    setViewEntregaStatusDraft(opts?.decisionDraft ?? 'APROVADO');
    setModalReviewComment(entrega.comentario ?? '');
    setSelectedViewEntrega({ etapa, index: checklistIndex, entrega });
    setShowViewEntregaModal(true);
  }

  async function continueChecklistReviewQueueAfterSave(refreshedProject: ProjectDetails | null) {
    if (checklistReviewQueue.length === 0 || !refreshedProject) {
      setShowViewEntregaModal(false);
      setSelectedViewEntrega(null);
      setChecklistReviewQueue([]);
      return;
    }
    const [next, ...rest] = checklistReviewQueue;
    setChecklistReviewQueue(rest);
    const nextEtapa = refreshedProject.etapas.find((e) => e.id === next.etapaId);
    if (!nextEtapa) {
      setShowViewEntregaModal(false);
      setSelectedViewEntrega(null);
      return;
    }
    openChecklistEntregaReviewModal(nextEtapa, next.checklistIndex, {
      subitemIndex: next.subitemIndex,
      queueNextSubIndices: rest.map((r) => r.subitemIndex),
    });
  }

  const canEditProjectInfo = useMemo(() => userHasAnyPermission(user, 'projetos:editar', 'projetos:criar', 'sistema:administrar'), [user]);
  const canManageEtapas = canEditProjectInfo || isSupervisorProjeto;
  const canManageCalendarEvents = useMemo(
    () => userHasPermission(user, 'calendario:eventos') || userHasPermission(user, 'sistema:administrar'),
    [user],
  );
  const [reorderingEtapas, setReorderingEtapas] = useState(false);

  useEffect(() => {
    if (loading || !project) return;
    if (canSeeAllProjects) return;
    if (isSupervisorProjeto) return;
    navigate(TASKS_ROUTE, { replace: true });
  }, [loading, project, canSeeAllProjects, isSupervisorProjeto, navigate]);
  const [openEtapaMenuId, setOpenEtapaMenuId] = useState<number | null>(null);
  /** IDs das etapas expandidas (conteúdo visível). Inicializado com todas ao carregar o projeto. */
  const [expandedEtapas, setExpandedEtapas] = useState<Set<number>>(new Set());
  const [expandedDescricaoEtapas, setExpandedDescricaoEtapas] = useState<Set<number>>(new Set());
  /** Abas criadas no front ainda sem etapa — por sessão (`none` = sem sessão). */
  const [extraAbasPorSessao, setExtraAbasPorSessao] = useState<Record<string, string[]>>({});
  const [selectedAba, setSelectedAba] = useState<string>(ABA_VISUALIZACAO_TODAS);
  /** Sessão: 'all' = modo “ver todas as sessões juntas” (não é uma sessão). null = sem sessão. */
  const [selectedSessaoId, setSelectedSessaoId] = useState<number | null | 'all'>('all');
  const [etapaSearchFilter, setEtapaSearchFilter] = useState('');
  const [etapaStatusFilter, setEtapaStatusFilter] = useState<'all' | Etapa['status']>('all');
  const [etapaPrazoFilter, setEtapaPrazoFilter] = useState<EtapaPrazoFiltro>('all');
  const [etapaTarefaStatusFilter, setEtapaTarefaStatusFilter] = useState<EtapaTarefaStatusFiltro>('all');
  const [etapaResponsavelFilter, setEtapaResponsavelFilter] = useState<number | 'all'>('all');
  const [etapaEntreguePorFilter, setEtapaEntreguePorFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    if (project?.etapas?.length) {
      setExpandedEtapas(new Set(project.etapas.map((e) => e.id)));
    }
  }, [project?.id, project?.etapas?.length]);

  /**
   * Dashboard / Kanban / Meu Trabalho: `?etapaId=` com opcional `checklistIndex` e `subitemIndex`.
   * Com índices: após rolar até a etapa, abre o mesmo modal de «Detalhes da Entrega» de Projetos (avaliar / ver).
   */
  useEffect(() => {
    const raw = searchParams.get('etapaId');
    if (raw == null || raw === '') return;
    if (!project?.etapas?.length) return;
    const etapaId = Number(raw);
    if (!Number.isInteger(etapaId) || etapaId < 1) {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('etapaId');
          n.delete('checklistIndex');
          n.delete('subitemIndex');
          return n;
        },
        { replace: true },
      );
      return;
    }
    if (!project.etapas.some((x) => x.id === etapaId)) {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('etapaId');
          n.delete('checklistIndex');
          n.delete('subitemIndex');
          return n;
        },
        { replace: true },
      );
      return;
    }

    const rawChk = searchParams.get('checklistIndex');
    const wantsEntregaModal =
      rawChk != null &&
      rawChk !== '' &&
      Number.isInteger(Number(rawChk)) &&
      Number(rawChk) >= 0;
    const checklistIndexParsed = wantsEntregaModal ? Number(rawChk) : null;

    const rawSub = searchParams.get('subitemIndex');
    let subParsed: number | null = null;
    if (rawSub != null && rawSub !== '') {
      const n = Number(rawSub);
      if (Number.isInteger(n) && n >= 0) subParsed = n;
    }

    const etapa = project.etapas.find((e) => e.id === etapaId);
    if (!etapa) return;

    if (wantsEntregaModal && checklistIndexParsed != null) {
      const items = etapa.checklistJson;
      if (!Array.isArray(items) || checklistIndexParsed < 0 || checklistIndexParsed >= items.length) {
        setSearchParams(
          (p) => {
            const n = new URLSearchParams(p);
            n.delete('etapaId');
            n.delete('checklistIndex');
            n.delete('subitemIndex');
            return n;
          },
          { replace: true },
        );
        return;
      }
      if (subParsed != null) {
        const subLen = items[checklistIndexParsed]?.subitens?.length ?? 0;
        if (subLen <= 0 || subParsed >= subLen) {
          setSearchParams(
            (p) => {
              const n = new URLSearchParams(p);
              n.delete('etapaId');
              n.delete('checklistIndex');
              n.delete('subitemIndex');
              return n;
            },
            { replace: true },
          );
          return;
        }
      }
    }

    setEtapaSearchFilter('');
    setEtapaStatusFilter('all');
    setEtapaTarefaStatusFilter('all');
    setEtapaPrazoFilter('all');
    setEtapaResponsavelFilter('all');
    setEtapaEntreguePorFilter('all');
    setSelectedSessaoId('all');
    setSelectedAba(ABA_VISUALIZACAO_TODAS);
    setExpandedEtapas((prev) => {
      const next = new Set(prev);
      next.add(etapaId);
      return next;
    });

    const delayMs = wantsEntregaModal ? 320 : 220;
    const t = window.setTimeout(() => {
      document.getElementById(`etapa-${etapaId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (wantsEntregaModal && checklistIndexParsed != null) {
        const entrega = pickChecklistEntregaForDeepLink(etapa, checklistIndexParsed, subParsed);
        if (entrega) {
          setSelectedViewEntrega({ etapa, index: checklistIndexParsed, entrega });
          setShowViewEntregaModal(true);
        } else {
          toast.info('Não há entrega registrada nesta tarefa para abrir o painel.');
        }
      }

      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('etapaId');
          n.delete('checklistIndex');
          n.delete('subitemIndex');
          return n;
        },
        { replace: true },
      );
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [project?.id, project?.etapas?.length, searchParams.toString(), setSearchParams]);

  useEffect(() => {
    if (!project) return;
    setProjectDescricaoTexto(project.descricaoLonga ?? '');
    const arquivos = Array.isArray(project.descricaoArquivos) ? project.descricaoArquivos : [];
    setProjectDescricaoArquivos(arquivos);
  }, [project?.id]);

  function openEditProjectModal() {
    if (!project) return;
    const supervisorId = project.supervisor?.id;
    setEditProjectForm({
      nome: project.nome,
      resumo: project.resumo ?? '',
      objetivo: project.objetivo ?? '',
      valorTotal: project.valorTotal ?? undefined,
      supervisorId: supervisorId ?? undefined,
      setorIds: Array.isArray((project as any).setores)
        ? (project as any).setores.map((s: any) => s.id)
        : project.setor?.id
          ? [project.setor.id]
          : project.setorId
            ? [project.setorId]
            : [],
      responsavelIds: project.responsaveis
        ? project.responsaveis
            .filter((r) => !!r.usuario)
            .map((r) => r.usuario.id)
            .filter((id) => id !== supervisorId)
        : [],
      excludedAutoIds: Array.isArray((project as any).responsaveisExcluidos)
        ? (project as any).responsaveisExcluidos.map((x: any) => x.usuarioId)
        : [],
      status: project.status,
    });
    setEditProjectError(null);
    setShowEditProjectModal(true);
  }

  async function handleSubmitEditProject(event: FormEvent) {
    event.preventDefault();
    if (!project) return;

    try {
      setEditProjectSubmitting(true);
      setEditProjectError(null);

      const payload: any = {
        nome: editProjectForm.nome.trim(),
      };

      if (typeof editProjectForm.resumo === 'string') {
        payload.resumo = editProjectForm.resumo?.trim() ?? '';
      }
      if (typeof editProjectForm.objetivo === 'string') {
        payload.objetivo = editProjectForm.objetivo?.trim() ?? '';
      }
      if (typeof editProjectForm.valorTotal === 'number') {
        payload.valorTotal = editProjectForm.valorTotal;
      }
      if (typeof editProjectForm.supervisorId !== 'undefined') {
        payload.supervisorId = editProjectForm.supervisorId;
      }
      payload.setorIds = editProjectForm.setorIds;
      if (editProjectForm.status) {
        payload.status = editProjectForm.status;
      }

      payload.descricaoLonga = projectDescricaoTexto?.trim() || null;
      // descricaoArquivos agora é gerenciado separadamente pelos endpoints específicos

      // eslint-disable-next-line no-console
      console.log('[ProjectDetails] handleSubmitEditProject payload', {
        id: project.id,
      });

      await api.patch(`/projects/${project.id}`, payload);

      const responsavelIds = buildProjetoResponsavelIdsPayload(
        setores,
        editProjectForm.setorIds,
        editProjectForm.responsavelIds,
        editProjectForm.excludedAutoIds,
        editProjectForm.supervisorId,
      );
      await api.patch(`/projects/${project.id}/responsibles`, { responsavelIds });

      await refreshProject(false);
      toast.success('Projeto atualizado com sucesso!');
      setShowEditProjectModal(false);
    } catch (err: any) {
      const message = formatApiError(err);
      setEditProjectError(message);
      toast.error(message);
    } finally {
      setEditProjectSubmitting(false);
    }
  }

  // Projeto novo: uma sessão "Geral" → selecionar essa sessão por padrão (evita "Sem sessão" / "Todas")
  useEffect(() => {
    if (!project?.sessoes?.length || project.sessoes.length !== 1) return;
    const hasEtapaSemSessao = (project?.etapas ?? []).some((e) => e.sessaoId == null);
    if (!hasEtapaSemSessao) {
      setSelectedSessaoId(project.sessoes[0].id);
    }
  }, [project?.id, project?.sessoes, project?.etapas]);

  // Ao trocar de sessão, voltar ao modo “todas as abas” na lista filtrada
  useEffect(() => {
    setSelectedAba(ABA_VISUALIZACAO_TODAS);
  }, [selectedSessaoId]);

  // Etapas filtradas pela sessão selecionada (Sessão → Abas → Etapas)
  const etapasPorSessao = useMemo(() => {
    if (!project?.etapas) return [];
    if (selectedSessaoId === 'all') return project.etapas;
    return project.etapas.filter((etapa) => {
      if (selectedSessaoId === null) return etapa.sessaoId == null;
      return etapa.sessaoId === selectedSessaoId;
    });
  }, [project?.etapas, selectedSessaoId]);

  // Abas da sessão atual +, em «Todas», união das abas extras de todas as sessões
  const abas = useMemo(() => {
    const set = new Set<string>();
    etapasPorSessao.forEach((etapa) => {
      const nomeAba = (etapa.aba && etapa.aba.trim()) || 'Geral';
      set.add(nomeAba);
    });
    // Abas criadas no front ainda sem etapa: na sessão X só as de X; em «Todas» = todas as sessões
    if (selectedSessaoId === 'all') {
      for (const list of Object.values(extraAbasPorSessao)) {
        list.forEach((aba) => {
          if (aba && aba.trim().length > 0) set.add(aba.trim());
        });
      }
    } else {
      const sessaoKey = selectedSessaoId === null ? 'none' : String(selectedSessaoId);
      const extras = extraAbasPorSessao[sessaoKey] ?? [];
      extras.forEach((aba) => {
        if (aba && aba.trim().length > 0) set.add(aba.trim());
      });
    }
    const nomesOrdenados = Array.from(set)
      .filter((n) => n !== ABA_VISUALIZACAO_TODAS)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [ABA_VISUALIZACAO_TODAS, ...nomesOrdenados];
  }, [etapasPorSessao, extraAbasPorSessao, selectedSessaoId]);

  const etapasFiltradas = useMemo(() => {
    if (etapasPorSessao.length === 0) return [];
    if (selectedAba === ABA_VISUALIZACAO_TODAS) return etapasPorSessao;
    return etapasPorSessao.filter((etapa) => {
      const nomeAba = (etapa.aba && etapa.aba.trim()) || 'Geral';
      return nomeAba === selectedAba;
    });
  }, [etapasPorSessao, selectedAba]);

  const etapasOrdenadasProjeto = useMemo(() => {
    const base = Array.isArray(project?.etapas) ? [...project.etapas] : [];
    return base.sort((a, b) => {
      const ordemA = typeof a.ordem === 'number' ? a.ordem : Number.MAX_SAFE_INTEGER;
      const ordemB = typeof b.ordem === 'number' ? b.ordem : Number.MAX_SAFE_INTEGER;
      return ordemA - ordemB || a.id - b.id;
    });
  }, [project?.etapas]);

  const etapaNumeroMap = useMemo(() => {
    const map = new Map<number, number>();
    etapasOrdenadasProjeto.forEach((etapa, index) => {
      map.set(etapa.id, index + 1);
    });
    return map;
  }, [etapasOrdenadasProjeto]);

  const etapaPessoaProjetoOptions = useMemo(() => {
    const map = new Map<number, { nome: string; tags: Set<string> }>();
    const upsert = (id: number | null | undefined, nome: string | null | undefined, tag: string) => {
      if (!id) return;
      const existing = map.get(id);
      if (existing) {
        existing.tags.add(tag);
      } else {
        map.set(id, { nome: nome || `#${id}`, tags: new Set([tag]) });
      }
    };

    if (project?.supervisor?.id) {
      upsert(project.supervisor.id, project.supervisor.nome, 'Supervisor');
    }
    (project?.responsaveis ?? []).forEach((r) => {
      upsert(r.usuario?.id, r.usuario?.nome, 'Membro');
    });
    (project?.etapas ?? []).forEach((etapa) => {
      upsert(etapa.executor?.id, etapa.executor?.nome, 'Participante');
      (etapa.integrantes ?? []).forEach((i) => {
        upsert(i.usuario?.id, i.usuario?.nome, 'Participante');
      });
    });

    return Array.from(map.entries())
      .map(([id, data]) => ({
        id,
        nome: `${data.nome} (${Array.from(data.tags).join(' / ')})`,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [project]);

  const etapaEntreguePorOptions = useMemo(() => {
    const map = new Map<number, string>();
    const registrar = (id: number | null | undefined, nome: string | null | undefined) => {
      if (!id) return;
      if (!map.has(id)) map.set(id, nome || `#${id}`);
    };
    (project?.etapas ?? []).forEach((etapa) => {
      (etapa.checklistEntregas ?? []).forEach((e) => {
        registrar(getEntregaExecutorId(e), e.executor?.nome);
      });
      (etapa.entregas ?? []).forEach((e) => {
        registrar(getEntregaExecutorId(e), e.executor?.nome);
      });
    });
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [project?.etapas]);

  const getEtapaPrazoStatus = (etapa: Etapa): 'soon' | 'expired' | 'on_time' | 'without_deadline' => {
    if (!etapa.dataFim) return 'without_deadline';
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const fim = new Date(etapa.dataFim);
    const fimDateOnly = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const diffMs = fimDateOnly.getTime() - todayDateOnly.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 7) return 'soon';
    return 'on_time';
  };

  const normalizeSearch = (value: string | null | undefined) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const etapasExibidas = useMemo(() => {
    const search = normalizeSearch(etapaSearchFilter);
    return etapasFiltradas.filter((etapa) => {
      if (etapaStatusFilter !== 'all' && etapa.status !== etapaStatusFilter) return false;
      if (etapaTarefaStatusFilter !== 'all') {
        const unitStatuses = workflowStatusesForEtapaChecklist(etapa);
        if (etapaTarefaStatusFilter === 'SEM_TAREFAS') {
          if (unitStatuses.length > 0) return false;
        } else if (!unitStatuses.includes(etapaTarefaStatusFilter)) {
          return false;
        }
      }
      if (etapaPrazoFilter !== 'all' && getEtapaPrazoStatus(etapa) !== etapaPrazoFilter) return false;
      if (etapaResponsavelFilter !== 'all') {
        const executorId = etapa.executor?.id ?? null;
        const supervisorId = project?.supervisor?.id ?? null;
        const integranteIds = (etapa.integrantes ?? []).map((i) => i.usuario?.id).filter(Boolean);
        if (
          executorId !== etapaResponsavelFilter &&
          supervisorId !== etapaResponsavelFilter &&
          !integranteIds.some((id) => Number(id) === Number(etapaResponsavelFilter))
        ) {
          return false;
        }
      }
      if (
        etapaEntreguePorFilter !== 'all' &&
        !etapaTemEntregaDoUsuario(etapa, etapaEntreguePorFilter)
      ) {
        return false;
      }
      if (!search) return true;
      const haystack = [
        etapa.nome,
        etapa.descricao,
        etapa.executor?.nome,
        etapa.sessao?.nome,
        etapa.aba,
      ]
        .map(normalizeSearch)
        .join(' ');
      return haystack.includes(search);
    });
  }, [
    etapasFiltradas,
    etapaSearchFilter,
    etapaStatusFilter,
    etapaTarefaStatusFilter,
    etapaPrazoFilter,
    etapaResponsavelFilter,
    etapaEntreguePorFilter,
    project?.supervisor?.id,
  ]);

  function handleAddAba() {
    if (!project) return;
    if (selectedSessaoId === 'all') {
      toast.warning(
        'Selecione uma sessão em «Sessão |» (ou «Sem sessão») antes de criar uma aba.',
      );
      return;
    }
    setNovaAbaNome('');
    setShowAbaModal(true);
  }

  function handleOpenRenameAba() {
    if (!project || selectedAba === ABA_VISUALIZACAO_TODAS) return;
    setRenameAbaNome(selectedAba);
    setShowRenameAbaModal(true);
  }

  function handleOpenDeleteAba() {
    if (!project || selectedAba === ABA_VISUALIZACAO_TODAS) return;
    setShowDeleteAbaModal(true);
  }

  async function handleConfirmNovaAba(event: FormEvent) {
    event.preventDefault();
    if (!project) return;

    const trimmed = novaAbaNome.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.warning('Informe um nome de aba com pelo menos 2 caracteres.');
      return;
    }

    if (selectedSessaoId === 'all') {
      toast.warning(
        'Selecione uma sessão em «Sessão» (ou «Sem sessão») antes de criar a aba — assim ela fica vinculada à sessão correta.',
      );
      return;
    }

    const sessaoKey = selectedSessaoId === null ? 'none' : String(selectedSessaoId);

    // Verifica duplicidade considerando: (a) abas extras já criadas em qualquer sessão e
    // (b) abas que já existem em etapas reais — comparação case-insensitive.
    const trimmedLower = trimmed.toLowerCase();
    const abasExistentes = new Set<string>();
    for (const list of Object.values(extraAbasPorSessao)) {
      for (const a of list) abasExistentes.add(a.trim().toLowerCase());
    }
    for (const etapa of project.etapas ?? []) {
      const a = (etapa.aba || '').trim();
      if (a) abasExistentes.add(a.toLowerCase());
    }
    if (abasExistentes.has(trimmedLower) || trimmedLower === 'geral') {
      toast.warning('Já existe uma aba com este nome neste projeto. Escolha outro.');
      return;
    }

    setExtraAbasPorSessao((prev) => {
      const list = prev[sessaoKey] ?? [];
      const existing = new Set(list.map((a) => a.trim().toLowerCase()));
      if (existing.has(trimmedLower)) return prev;
      return { ...prev, [sessaoKey]: [...list, trimmed] };
    });

    setSelectedAba(trimmed);
    setShowAbaModal(false);
    toast.success('Aba criada com sucesso. Agora você pode adicionar etapas nela.');
  }

  /** Texto descritivo do escopo de sessão atualmente selecionado, para usar em modais. */
  function descreverEscopoSessaoAtual(): string {
    if (selectedSessaoId === 'all') return 'todas as sessões deste projeto';
    if (selectedSessaoId === null) return 'etapas sem sessão';
    const s = project?.sessoes?.find((x) => x.id === selectedSessaoId);
    return s ? `sessão "${s.nome}"` : `sessão #${selectedSessaoId}`;
  }

  async function handleCreateSessao(e: FormEvent) {
    e.preventDefault();
    if (!project) return;
    const nome = novaSessaoNome.trim();
    if (!nome || nome.length < 2) {
      toast.warning('Informe um nome de sessão com pelo menos 2 caracteres.');
      return;
    }
    setSessaoModalLoading(true);
    try {
      await api.post(`/projects/${project.id}/sessoes`, { nome, ordem: (project.sessoes?.length ?? 0) });
      setNovaSessaoNome('');
      setShowSessaoModal(false);
      await refreshProject(false);
      toast.success('Sessão criada.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setSessaoModalLoading(false);
    }
  }

  async function handleUpdateSessao(e: FormEvent) {
    e.preventDefault();
    if (!project || !editingSessao) return;
    const nome = editSessaoNome.trim();
    if (!nome || nome.length < 2) {
      toast.warning('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    setSessaoModalLoading(true);
    try {
      await api.patch(`/projects/${project.id}/sessoes/${editingSessao.id}`, { nome });
      setEditingSessao(null);
      setEditSessaoNome('');
      await refreshProject(false);
      toast.success('Sessão atualizada.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setSessaoModalLoading(false);
    }
  }

  async function handleDeleteSessao() {
    if (!project || !sessaoToDelete) return;
    const removidaId = sessaoToDelete.id;
    setSessaoModalLoading(true);
    try {
      await api.delete(`/projects/${project.id}/sessoes/${removidaId}`);
      setShowDeleteSessaoModal(false);
      setSessaoToDelete(null);
      // Resetar seleções dependentes da sessão removida para evitar estado inconsistente.
      if (selectedSessaoId === removidaId) {
        setSelectedSessaoId('all');
        setSelectedAba(ABA_VISUALIZACAO_TODAS);
      }
      // Limpar abas extras (apenas em memória) que pertenciam à sessão removida.
      setExtraAbasPorSessao((prev) => {
        if (!(String(removidaId) in prev)) return prev;
        const next = { ...prev };
        delete next[String(removidaId)];
        return next;
      });
      await refreshProject(false);
      toast.success('Sessão excluída.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setSessaoModalLoading(false);
    }
  }

  function toggleEtapa(etapaId: number) {
    setExpandedEtapas((prev) => {
      const next = new Set(prev);
      if (next.has(etapaId)) next.delete(etapaId);
      else next.add(etapaId);
      return next;
    });
  }

  const [etapaForm, setEtapaForm] = useState({
    nome: '',
    descricao: '',
    sessaoId: undefined as number | undefined,
    aba: '',
    setorIds: [] as number[],
    participantesIds: [] as number[],
    excludedAutoIntegranteIds: [] as number[],
    dataInicio: '',
    dataFim: '',
    valorInsumos: 0,
    checklist: [createEmptyChecklistItem()] as ChecklistItem[],
    status: 'PENDENTE' as string,
    estoqueItems: [] as Array<{ itemId: number; quantidade: number }>,
  });

  /** Busca por nome no seletor de integrantes do checklist (por índice do item). */
  const [checklistIntegrantesBusca, setChecklistIntegrantesBusca] = useState<Record<number, string>>({});

  const etapaAutoMemberIdsSet = useMemo(() => new Set(computeAutoMemberIds(etapaForm.setorIds)), [etapaForm.setorIds, setores]);
  const [availableStockItems, setAvailableStockItems] = useState<any[]>([]);
  const [loadingStockItems, setLoadingStockItems] = useState(false);
  const [showAbaModal, setShowAbaModal] = useState(false);
  const [novaAbaNome, setNovaAbaNome] = useState('');
  const [showRenameAbaModal, setShowRenameAbaModal] = useState(false);
  const [renameAbaNome, setRenameAbaNome] = useState('');
  const [showDeleteAbaModal, setShowDeleteAbaModal] = useState(false);
  const [abaModalLoading, setAbaModalLoading] = useState(false);
  const [showSessaoModal, setShowSessaoModal] = useState(false);
  const [novaSessaoNome, setNovaSessaoNome] = useState('');
  const [editingSessao, setEditingSessao] = useState<Sessao | null>(null);
  const [editSessaoNome, setEditSessaoNome] = useState('');
  const [showDeleteSessaoModal, setShowDeleteSessaoModal] = useState(false);
  const [sessaoToDelete, setSessaoToDelete] = useState<Sessao | null>(null);
  const [sessaoModalLoading, setSessaoModalLoading] = useState(false);
  const [showFullResumo, setShowFullResumo] = useState(false);
  const [showFullObjetivo, setShowFullObjetivo] = useState(false);
  const [showFullDescricao, setShowFullDescricao] = useState(false);
  const [etapasViewMode, setEtapasViewMode] = useState<'cronograma' | 'equipe' | 'eventos'>('cronograma');

  const setWorkspaceView = useCallback(
    (mode: 'cronograma' | 'equipe' | 'eventos') => {
      setEtapasViewMode(mode);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (mode === 'cronograma') next.delete('view');
          else next.set('view', mode);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'equipe') setEtapasViewMode('equipe');
    else if (view === 'eventos') setEtapasViewMode('eventos');
    else setEtapasViewMode('cronograma');
  }, [searchParams]);

  const getTruncatedText = (text: string, maxChars: number, expanded: boolean): string => {
    const trimmed = text.trim();
    if (expanded || trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars).trimEnd()}...`;
  };

  const resolveFileUrl = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }

    const base = api.defaults.baseURL || '';
    try {
      const baseUrl = new URL(base, window.location.origin);
      const origin = baseUrl.origin; // ex.: http://localhost:3000
      const path = url.startsWith('/') ? url : `/${url}`;
      return `${origin}${path}`;
    } catch {
      return url;
    }
  };

  const getFileExtension = (file: ProjetoArquivo): string => {
    const nameOrUrl = (file.originalName || file.url || '').toLowerCase();
    const match = nameOrUrl.match(/\.([a-z0-9]+)(?:\?|#|$)/);
    return match ? match[1] : '';
  };

  const getFileKind = (file: ProjetoArquivo): 'image' | 'pdf' | 'excel' | 'word' | 'ppt' | 'text' | 'other' => {
    const mime = (file.mimeType || '').toLowerCase();
    const ext = getFileExtension(file);

    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (
      mime.includes('excel') ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      ['xls', 'xlsx', 'xlsm', 'csv'].includes(ext)
    ) return 'excel';
    if (
      mime === 'application/msword' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ['doc', 'docx', 'rtf'].includes(ext)
    ) return 'word';
    if (
      mime === 'application/vnd.ms-powerpoint' ||
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      ['ppt', 'pptx'].includes(ext)
    ) return 'ppt';
    if (mime.startsWith('text/') || ['txt', 'md', 'log'].includes(ext)) return 'text';
    return 'other';
  };

  const getFileBadgeLabel = (file: ProjetoArquivo): string => {
    const ext = getFileExtension(file);
    if (!ext) return 'arquivo';
    return ext.toUpperCase();
  };

  const [updatingChecklist, setUpdatingChecklist] = useState<number | null>(null);
  
  // Estado para controlar expansão de detalhes dos itens do checklist
  const [expandedChecklistDetails, setExpandedChecklistDetails] = useState<Set<string>>(new Set());

  const toggleChecklistDetails = (key: string) => {
    setExpandedChecklistDetails((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Com filtro por status de tarefa, abre automaticamente itens que têm subtarefa correspondente
  // (evita ter de adivinhar qual "(3) ▼" esconde a tarefa "Em análise").
  useEffect(() => {
    if (etapaTarefaStatusFilter === 'all' || etapaTarefaStatusFilter === 'SEM_TAREFAS') return;
    const filter = etapaTarefaStatusFilter;
    const keysToAdd: string[] = [];
    for (const etapa of etapasExibidas) {
      const list = etapa.checklistJson;
      if (!Array.isArray(list)) continue;
      for (let index = 0; index < list.length; index++) {
        const subs = list[index]?.subitens;
        if (!Array.isArray(subs) || subs.length === 0) continue;
        for (let s = 0; s < subs.length; s++) {
          if (getChecklistUnitWorkflowStatus(etapa, { checklistIndex: index, subitemIndex: s }) === filter) {
            keysToAdd.push(`view-${etapa.id}-${index}`);
            break;
          }
        }
      }
    }
    if (keysToAdd.length === 0) return;
    setExpandedChecklistDetails((prev) => {
      const next = new Set(prev);
      for (const k of keysToAdd) next.add(k);
      return next;
    });
  }, [etapaTarefaStatusFilter, etapasExibidas]);

  // Com filtro «Entregue por», expande itens do checklist que têm entrega da pessoa.
  useEffect(() => {
    if (etapaEntreguePorFilter === 'all') return;
    const usuarioId = etapaEntreguePorFilter;
    const keysToAdd: string[] = [];
    for (const etapa of etapasExibidas) {
      const list = etapa.checklistJson;
      if (!Array.isArray(list)) continue;
      for (let index = 0; index < list.length; index++) {
        const item = list[index];
        if (!checklistRowMatchesEntreguePorFilter(etapa, index, item, usuarioId)) continue;
        keysToAdd.push(`view-${etapa.id}-${index}`);
      }
    }
    if (keysToAdd.length === 0) return;
    setExpandedChecklistDetails((prev) => {
      const next = new Set(prev);
      for (const k of keysToAdd) next.add(k);
      return next;
    });
  }, [etapaEntreguePorFilter, etapasExibidas]);

  const [showEntregaModal, setShowEntregaModal] = useState(false);
  const [selectedEntregaEtapa, setSelectedEntregaEtapa] = useState<Etapa | null>(null);
  const [entregaDescricao, setEntregaDescricao] = useState('');
  const [entregaImagem, setEntregaImagem] = useState<string | null>(null);
  const [entregaPreview, setEntregaPreview] = useState<string | null>(null);
  const [enviandoEntrega, setEnviandoEntrega] = useState(false);
  const [entregaError, setEntregaError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>({});
  const [showViewEntregaModal, setShowViewEntregaModal] = useState(false);
  const [selectedViewEntrega, setSelectedViewEntrega] = useState<{ etapa: Etapa; index: number; entrega: ChecklistItemEntrega } | null>(null);
  const [modalReviewComment, setModalReviewComment] = useState('');
  const [modalReviewLoading, setModalReviewLoading] = useState(false);
  /** Decisão ao salvar na modal de detalhes (só APROVADO/REPROVADO — backend). */
  const [viewEntregaStatusDraft, setViewEntregaStatusDraft] = useState<'APROVADO' | 'REPROVADO'>('APROVADO');
  /** Próximas subtarefas a abrir na modal após salvar a avaliação atual. */
  const [checklistReviewQueue, setChecklistReviewQueue] = useState<
    Array<{ etapaId: number; checklistIndex: number; subitemIndex: number }>
  >([]);

  useEffect(() => {
    if (!showViewEntregaModal || !selectedViewEntrega) return;
    const st = selectedViewEntrega.entrega.status;
    setViewEntregaStatusDraft(st === 'REPROVADO' ? 'REPROVADO' : 'APROVADO');
    setModalReviewComment(selectedViewEntrega.entrega.comentario ?? '');
  }, [showViewEntregaModal, selectedViewEntrega]);

  const [etapaEstoque, setEtapaEstoque] = useState<Record<number, any[]>>({});
  const [loadingEstoqueCompras, setLoadingEstoqueCompras] = useState<Record<number, boolean>>({});
  const [showCompraModal, setShowCompraModal] = useState(false);
  const [selectedEtapaForCompra, setSelectedEtapaForCompra] = useState<Etapa | null>(null);
  const [showDeleteEtapaModal, setShowDeleteEtapaModal] = useState(false);
  const [etapaToDelete, setEtapaToDelete] = useState<Etapa | null>(null);
  const [deletingEtapa, setDeletingEtapa] = useState(false);
  const [deletingCompraId, setDeletingCompraId] = useState<number | null>(null);
  const [compraForm, setCompraForm] = useState<{
    setorId: number | undefined;
    pagoPor: PagoPorEntry[];
  }>({
    setorId: undefined as number | undefined,
    pagoPor: [],
  });
  const [compraLineItems, setCompraLineItems] = useState<PurchaseLineItem[]>([
    createEmptyPurchaseLineItem(),
  ]);

  const statusOptions = [
    { value: 'PENDENTE', label: 'Pendente' },
    { value: 'EM_ANDAMENTO', label: 'Em Andamento' },
    { value: 'EM_ANALISE', label: 'Em Análise' },
    { value: 'APROVADA', label: 'Aprovado' },
    { value: 'REPROVADA', label: 'Recusada' },
  ];

  async function refreshProject(showSpinner = false): Promise<ProjectDetails | null> {
    if (!id) {
      setError('ID do projeto não fornecido');
      setLoading(false);
      return null;
    }

    if (showSpinner) {
      setLoading(true);
    }

    try {
      if (showSpinner) {
        setError(null);
      }
      const { data } = await api.get<ProjectDetails>(`/projects/${id}`);
      setProject(data);
      return data;
    } catch (err: any) {
      const message = err.response?.data?.message ?? 'Erro ao carregar projeto';
      setError(message);
      console.error('Erro ao atualizar projeto:', err);
      // Não lançar erro para não causar problemas em cascata
      // Se for erro crítico (401), o interceptor já trata
      if (showSpinner) {
        // Em modo spinner, apenas logar o erro
      }
      return null;
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }

  async function loadProjectEvents() {
    if (!id) return;
    setLoadingProjectEvents(true);
    try {
      const { data } = await api.get<ProjetoEventoCalendario[]>(`/calendario/eventos?projetoId=${id}`);
      setProjectEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar eventos do projeto:', err);
      setProjectEvents([]);
    } finally {
      setLoadingProjectEvents(false);
    }
  }

  function openCreateProjectEventModal() {
    setProjectEventForm({
      titulo: '',
      descricao: '',
      ...defaultCalendarioEventoDatetimes(),
      alvo: 'SELECIONADOS',
      usuarioIds: [],
    });
    setShowProjectEventModal(true);
  }

  function toggleProjectEventParticipant(usuarioId: number) {
    setProjectEventForm((prev) => {
      const selected = new Set(prev.usuarioIds);
      if (selected.has(usuarioId)) {
        selected.delete(usuarioId);
      } else {
        selected.add(usuarioId);
      }
      return { ...prev, usuarioIds: Array.from(selected) };
    });
  }

  async function handleCreateProjectEvent(event: FormEvent) {
    event.preventDefault();
    if (!id || !project) return;

    const titulo = projectEventForm.titulo.trim();
    if (!titulo) {
      toast.warning('Informe o nome do evento.');
      return;
    }
    if (
      projectEventForm.alvo === 'SELECIONADOS' &&
      projectEventForm.usuarioIds.length === 0
    ) {
      toast.warning('Selecione ao menos um integrante ou use todos os usuários.');
      return;
    }

    const range = buildCalendarioEventoIsoRange({
      dataInicio: projectEventForm.dataInicio,
      dataFim: projectEventForm.dataFim,
      horaInicio: projectEventForm.horaInicio,
      horaFim: projectEventForm.horaFim,
      diaInteiro: projectEventForm.diaInteiro,
    });
    if (range.error) {
      toast.warning(range.error);
      return;
    }

    setProjectEventSubmitting(true);
    try {
      await api.post('/calendario/eventos', {
        titulo,
        descricao: projectEventForm.descricao.trim() || undefined,
        dataInicio: range.dataInicio,
        dataFim: range.dataFim,
        alvo: projectEventForm.alvo,
        projetoId: Number(id),
        ...(projectEventForm.alvo === 'SELECIONADOS'
          ? { usuarioIds: projectEventForm.usuarioIds }
          : {}),
      });
      toast.success('Evento criado com sucesso.');
      setShowProjectEventModal(false);
      await loadProjectEvents();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setProjectEventSubmitting(false);
    }
  }

  async function handleDeleteCompra(compra: Compra) {
    if (!window.confirm(`Excluir o item "${compra.item}" do histórico de compras?`)) return;
    setDeletingCompraId(compra.id);
    setError(null);
    try {
      await api.delete(`/stock/purchases/${compra.id}`);
      toast.success('Item removido do histórico.');
      await refreshProject(false);
    } catch (err: any) {
      const msg = formatApiError(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingCompraId(null);
    }
  }

  async function loadEtapaEstoqueCompras(etapaId: number) {
    if (loadingEstoqueCompras[etapaId]) return;
    
    setLoadingEstoqueCompras((prev) => ({ ...prev, [etapaId]: true }));
    try {
      const alocacoesRes = await api.get(`/stock/alocacoes?etapaId=${etapaId}`);
      // Transformar alocações em formato de itens para exibição
      const estoqueItems = (alocacoesRes.data || []).map((aloc: any) => ({
        id: aloc.estoque.id,
        item: aloc.estoque.item,
        quantidade: aloc.quantidade, // Quantidade alocada
        valorUnitario: aloc.estoque.valorUnitario,
        descricao: aloc.estoque.descricao,
        imagemUrl: aloc.estoque.imagemUrl,
        alocacaoId: aloc.id,
      }));
      setEtapaEstoque((prev) => ({ ...prev, [etapaId]: estoqueItems }));
    } catch (err) {
      console.error('Erro ao carregar estoque da etapa:', err);
    } finally {
      setLoadingEstoqueCompras((prev) => ({ ...prev, [etapaId]: false }));
    }
  }

  async function loadAvailableStockItems(etapaId?: number) {
    if (!id) return;
    setLoadingStockItems(true);
    try {
      // Carregar itens de estoque do projeto ou sem etapa associada
      const { data } = await api.get(`/stock/items?projetoId=${id}`);
      
      // Se estiver editando uma etapa, buscar alocações atuais para ajustar quantidadeDisponivel
      let alocacoesAtuais: any[] = [];
      if (etapaId) {
        try {
          const { data: alocacoes } = await api.get(`/stock/alocacoes?etapaId=${etapaId}`);
          alocacoesAtuais = alocacoes || [];
        } catch (err) {
          console.error('Erro ao carregar alocações da etapa:', err);
        }
      }
      
      // Ajustar quantidadeDisponivel: se há alocação nesta etapa, adicionar de volta
      const itemsAjustados = (data || []).map((item: any) => {
        const alocacaoNestaEtapa = alocacoesAtuais.find((aloc: any) => aloc.estoqueId === item.id);
        if (alocacaoNestaEtapa) {
          // Adicionar de volta a quantidade já alocada nesta etapa ao disponível
          return {
            ...item,
            quantidadeDisponivel: (item.quantidadeDisponivel ?? item.quantidade) + alocacaoNestaEtapa.quantidade,
          };
        }
        return item;
      });
      
      setAvailableStockItems(itemsAjustados);
    } catch (err) {
      console.error('Erro ao carregar itens de estoque:', err);
      setAvailableStockItems([]);
    } finally {
      setLoadingStockItems(false);
    }
  }

  useEffect(() => {
    async function loadUsers() {
      try {
        const { data } = await api.get<Usuario[]>('/users/options');
        setUsers(data);
      } catch (err) {
        console.error('Erro ao carregar usuários:', err);
      }
    }

    async function loadSetores() {
      try {
        const { data } = await api.get<SimpleSetor[]>('/setores?includeInactive=true');
        setSetores(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Erro ao carregar setores:', err);
        setSetores([]);
      }
    }

    async function loadMetodosPago() {
      try {
        const { data } = await api.get<PagoPorMetodoOption[]>('/stock/pago-por-metodos');
        setMetodosPago(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Erro ao carregar métodos de pagamento:', err);
        setMetodosPago([]);
      }
    }

    refreshProject(true);
    loadUsers();
    loadSetores();
    loadMetodosPago();
    loadProjectEvents();
  }, [id]);

  // Projetos criados sem sessão (ex.: antes do backend criar "Geral"): criar sessão padrão ao abrir
  useEffect(() => {
    if (
      !project ||
      !id ||
      (project.sessoes?.length ?? 0) > 0 ||
      (project.etapas?.length ?? 0) > 0
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await api.post(`/projects/${id}/sessoes`, { nome: 'Geral', ordem: 0 });
        if (!cancelled) await refreshProject(false);
      } catch (e) {
        if (!cancelled) console.error('Erro ao criar sessão padrão:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, project?.id, project?.sessoes?.length, project?.etapas?.length]);

  useEffect(() => {
    if (project?.etapas) {
      project.etapas.forEach((etapa) => {
        loadEtapaEstoqueCompras(etapa.id);
      });
    }
  }, [project?.etapas]);

  async function handleCreateEtapa(event: FormEvent) {
    event.preventDefault();
    if (!id || !project) return;

    setError(null);
    setSubmitting(true);

    if (!etapaForm.participantesIds.length) {
      setError('É necessário selecionar pelo menos um participante para a etapa');
      setSubmitting(false);
      return;
    }

    const executorId = etapaForm.participantesIds[0];

    try {
      const payload: any = {
        projetoId: Number(id),
        nome: etapaForm.nome.trim(),
        executorId,
      };

      // Setores da etapa (pode ser vazio para remover todos)
      payload.setorIds = Array.isArray(etapaForm.setorIds) ? etapaForm.setorIds : [];

      const abaTrim = etapaForm.aba?.trim();
      if (abaTrim) {
        payload.aba = abaTrim;
      } else if (editingEtapa) {
        // Editar e limpar a aba: enviar string vazia para o backend converter em null.
        payload.aba = '';
      }
      if (etapaForm.sessaoId != null && etapaForm.sessaoId > 0) payload.sessaoId = etapaForm.sessaoId;
      if (editingEtapa && (etapaForm.sessaoId == null || etapaForm.sessaoId === 0)) payload.sessaoId = null;

      if (etapaForm.descricao && etapaForm.descricao.trim().length > 0) {
        payload.descricao = etapaForm.descricao.trim();
      }

      if (etapaForm.dataInicio) {
        payload.dataInicio = new Date(etapaForm.dataInicio).toISOString();
      }

      if (etapaForm.dataFim) {
        payload.dataFim = new Date(etapaForm.dataFim).toISOString();
      }

      if (etapaForm.valorInsumos && etapaForm.valorInsumos > 0) {
        payload.valorInsumos = Number(etapaForm.valorInsumos);
      }

      if (etapaForm.checklist && etapaForm.checklist.length > 0) {
        const checklistFiltrado = etapaForm.checklist
          .filter((item) => item.texto && item.texto.trim().length > 0)
          .map((item) =>
            serializeChecklistItemForApi({
              ...item,
              pontos: displayPontosTarefaChecklist(item.pontos),
            }),
          );
        
        if (checklistFiltrado.length > 0) {
          payload.checklist = checklistFiltrado;
        }
      }

      payload.integrantesIds = etapaForm.participantesIds;

      if (editingEtapa && etapaForm.status) {
        payload.status = etapaForm.status as string;
      }

      let etapaId: number;
      if (editingEtapa) {
        const updated = await api.patch(`/tasks/${editingEtapa.id}`, payload);
        etapaId = editingEtapa.id;
        
        // Se estiver editando, gerenciar alocações (remover, atualizar ou criar)
        try {
          // Buscar alocações atuais da etapa
          const { data: currentAlocacoes } = await api.get(`/stock/alocacoes?etapaId=${etapaId}`);
          
          // Criar mapas para facilitar a busca
          const currentAlocacoesMap = new Map(
            (currentAlocacoes || []).map((aloc: any) => [aloc.estoqueId, aloc])
          );
          const selectedItemsMap = new Map(
            etapaForm.estoqueItems.map((item) => [item.itemId, item])
          );
          
          // Remover alocações que não estão mais na lista
          const alocacoesToRemove = (currentAlocacoes || []).filter(
            (aloc: any) => !selectedItemsMap.has(aloc.estoqueId)
          );
          await Promise.all(
            alocacoesToRemove.map((aloc: any) =>
              api.delete(`/stock/alocacoes/${aloc.id}`)
            )
          );
          
          // Atualizar ou criar alocações para os itens selecionados
          for (const estoqueItem of etapaForm.estoqueItems) {
            const existingAloc = currentAlocacoesMap.get(estoqueItem.itemId) as { id: number; quantidade: number; estoqueId: number } | undefined;
            if (existingAloc) {
              // Atualizar alocação existente se a quantidade mudou
              if (existingAloc.quantidade !== estoqueItem.quantidade) {
                await api.patch(`/stock/alocacoes/${existingAloc.id}`, {
                  quantidade: estoqueItem.quantidade,
                });
              }
      } else {
              // Criar nova alocação
              await api.post('/stock/alocacoes', {
                estoqueId: estoqueItem.itemId,
                projetoId: Number(id),
                etapaId: etapaId,
                quantidade: estoqueItem.quantidade,
              });
            }
          }
        } catch (err: any) {
          console.error('Erro ao atualizar alocações de estoque:', err);
          setError(err.response?.data?.message ?? 'Erro ao atualizar alocações de estoque');
        }
      } else {
        const created = await api.post('/tasks', payload);
        etapaId = created.data.id;
        
        // Criar alocações para os itens de estoque selecionados (nova etapa)
        if (etapaForm.estoqueItems && etapaForm.estoqueItems.length > 0) {
          try {
            await Promise.all(
              etapaForm.estoqueItems.map((estoqueItem) =>
                api.post('/stock/alocacoes', {
                  estoqueId: estoqueItem.itemId,
                  projetoId: Number(id),
                  etapaId: etapaId,
                  quantidade: estoqueItem.quantidade,
                })
              )
            );
          } catch (err: any) {
            console.error('Erro ao criar alocações de estoque:', err);
            setError(err.response?.data?.message ?? 'Erro ao alocar itens de estoque');
          }
        }
      }

      setShowEtapaModal(false);
      setEditingEtapa(null);
      setEtapaForm({
        nome: '',
        descricao: '',
        sessaoId: undefined,
        aba: '',
        setorIds: [],
        participantesIds: [],
        excludedAutoIntegranteIds: [],
        dataInicio: '',
        dataFim: '',
        valorInsumos: 0,
        checklist: [createEmptyChecklistItem()],
        status: 'PENDENTE',
        estoqueItems: [],
      });
      setChecklistIntegrantesBusca({});

      // Recarregar o projeto
      await refreshProject();
      // Recarregar estoque/compras da etapa
      await loadEtapaEstoqueCompras(etapaId);
      toast.success(editingEtapa ? 'Etapa atualizada com sucesso!' : 'Etapa criada com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEtapa(etapa: Etapa) {
    setEtapaToDelete(etapa);
    setShowDeleteEtapaModal(true);
  }

  async function confirmDeleteEtapa() {
    if (!etapaToDelete) return;

    try {
      setDeletingEtapa(true);
      await api.delete(`/tasks/${etapaToDelete.id}`);
      toast.success('Etapa deletada com sucesso!');
      await refreshProject();
      setShowDeleteEtapaModal(false);
      setEtapaToDelete(null);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingEtapa(false);
    }
  }

  async function handleReorderEtapas(direction: 'up' | 'down', etapaId: number) {
    if (!project) return;
    const etapas = etapasOrdenadasProjeto;
    const currentIndex = etapas.findIndex((e) => e.id === etapaId);
    if (currentIndex < 0) return;
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= etapas.length) return;

    const newOrder = [...etapas];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    const etapaIds = newOrder.map((e) => e.id);

    try {
      setReorderingEtapas(true);
      setError(null);
      await api.patch(`/projects/${project.id}/etapas/reorder`, { etapaIds });
      toast.success('Ordem das etapas atualizada.');
      await refreshProject(false);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Falha ao reordenar etapas';
      setError(msg);
      toast.error(msg);
    } finally {
      setReorderingEtapas(false);
    }
  }

  async function handleEditEtapa(etapa: Etapa) {
    setEditingEtapa(etapa);
    
    // Formatar datas para datetime-local
    const formatDateForInput = (dateString: string | null | undefined) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    // Carregar alocações de estoque relacionadas à etapa
    let estoqueItems: Array<{ itemId: number; quantidade: number }> = [];
    try {
      const { data: alocacoes } = await api.get(`/stock/alocacoes?etapaId=${etapa.id}`);
      if (alocacoes && Array.isArray(alocacoes)) {
        estoqueItems = alocacoes.map((aloc: any) => ({
          itemId: aloc.estoqueId,
          quantidade: aloc.quantidade,
        }));
      }
    } catch (err) {
      console.error('Erro ao carregar alocações de estoque da etapa:', err);
    }
    
    // Carregar itens disponíveis ajustando para esta etapa (adiciona de volta as alocações desta etapa)
    await loadAvailableStockItems(etapa.id);

    const setorIds = etapa.setores?.map((s) => s.id) ?? [];
    const integrantesIds =
      etapa.integrantes
        ? etapa.integrantes.filter((i) => i.usuario?.id).map((i) => i.usuario.id)
        : [];

    const participantesIds = etapa.executor?.id
      ? Array.from(new Set([etapa.executor.id, ...integrantesIds]))
      : [...integrantesIds];

    const autoIntegrantesIds = computeAutoMemberIds(setorIds);
    const excludedAutoIntegranteIds = autoIntegrantesIds.filter((autoId) => !participantesIds.includes(autoId));

    setEtapaForm({
      nome: etapa.nome || '',
      descricao: etapa.descricao || '',
      sessaoId: etapa.sessaoId ?? undefined,
      aba: etapa.aba || '',
      setorIds,
      participantesIds,
      excludedAutoIntegranteIds,
      dataInicio: formatDateForInput(etapa.dataInicio),
      dataFim: formatDateForInput(etapa.dataFim),
      valorInsumos: etapa.valorInsumos || 0,
        checklist:
        etapa.checklistJson && Array.isArray(etapa.checklistJson) && etapa.checklistJson.length > 0
          ? etapa.checklistJson.map((item: any) => {
              const normalized = normalizeChecklistItemFromApi(item);
              return {
                ...normalized,
                pontos: displayPontosTarefaChecklist(item.pontos),
              };
            })
          : [createEmptyChecklistItem()],
      status: etapa.status || 'PENDENTE',
      estoqueItems,
    });
    setChecklistIntegrantesBusca({});

    setShowEtapaModal(true);
  }

  async function handleChecklistUpdate(etapaId: number, checklistIndex: number, concluido: boolean) {
    if (!project) return;

    const etapa = project.etapas.find((e) => e.id === etapaId);
    if (!etapa || !etapa.checklistJson) return;
    if (!canUserReviewDeliveriesOnEtapa(etapa)) {
      toast.warning(
        'Só quem pode aprovar entregas nesta etapa (supervisor do projeto, responsável da etapa ou permissão de avaliação) pode marcar tarefas no cadastro.',
      );
      return;
    }

    if (!canToggleChecklistCadastroForTopLevelRow(etapa, checklistIndex)) {
      toast.warning(
        'Não é possível alterar o cadastro enquanto houver entrega nesta tarefa (em análise, aprovada ou reprovada). Use o fluxo de entregas ou a aprovação.',
      );
      return;
    }

    const updatedChecklist = [...etapa.checklistJson];
    const prevItem = updatedChecklist[checklistIndex];
    const hasSubs = Array.isArray(prevItem.subitens) && prevItem.subitens.length > 0;
    const nextSubitens = hasSubs
      ? prevItem.subitens!.map((sub) => ({
          ...sub,
          concluido,
        }))
      : prevItem.subitens;
    updatedChecklist[checklistIndex] = {
      ...prevItem,
      concluido,
      subitens: nextSubitens,
    };

    try {
      setUpdatingChecklist(etapaId);
      await api.patch(`/tasks/${etapaId}/checklist`, {
        checklist: updatedChecklist.map((item) =>
          serializeChecklistItemForApi({
            ...item,
            pontos: displayPontosTarefaChecklist(item.pontos),
          }),
        ),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      
      await refreshProject();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message ?? 'Falha ao atualizar tarefas da etapa';
      
      // 401/403: sem permissão para marcar cadastro (API alinhada a quem aprova entregas)
      if (err.response?.status === 401 || err.response?.status === 403) {
        toast.warning(
          'Você não tem permissão para marcar tarefas no cadastro. É necessário poder aprovar entregas nesta etapa.',
        );
      } else if (err.response?.status === 400) {
        toast.warning(
          typeof errorMessage === 'string'
            ? errorMessage
            : 'Não foi possível atualizar o cadastro (verifique se já existe entrega nesta tarefa).',
        );
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setUpdatingChecklist(null);
    }
  }

  function resetEntregaModal() {
    setEntregaDescricao('');
    setEntregaImagem(null);
    setEntregaPreview(null);
    setEntregaError(null);
    setEnviandoEntrega(false);
  }

  function handleOpenEntregaModal(etapa: Etapa) {
    setSelectedEntregaEtapa(etapa);
    resetEntregaModal();
    setShowEntregaModal(true);
  }

  function handleCloseEntregaModal() {
    setShowEntregaModal(false);
    setSelectedEntregaEtapa(null);
    resetEntregaModal();
  }

  async function handleEntregaImagemChange(file?: File | null) {
    if (!file) {
      setEntregaImagem(null);
      setEntregaPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      setEntregaImagem(result);
      setEntregaPreview(result);
    };
    reader.onerror = () => {
      setEntregaError('Não foi possível ler a imagem. Tente novamente.');
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmitEntrega(event: FormEvent) {
    event.preventDefault();
    if (!selectedEntregaEtapa) return;

    setError(null);
    if (entregaDescricao.trim().length < 5) {
      setEntregaError('Descreva a entrega com pelo menos 5 caracteres.');
      return;
    }

    try {
      setEnviandoEntrega(true);
      setEntregaError(null);
      await api.post(`/tasks/${selectedEntregaEtapa.id}/deliver`, {
        descricao: entregaDescricao.trim(),
        imagem: entregaImagem ?? undefined,
      });
      handleCloseEntregaModal();
      await refreshProject();
    } catch (err: any) {
      setEntregaError(err.response?.data?.message ?? 'Falha ao enviar entrega.');
    } finally {
      setEnviandoEntrega(false);
    }
  }

  function handleReviewNoteChange(etapaId: number, value: string) {
    setReviewNotes((prev) => ({ ...prev, [String(etapaId)]: value }));
  }

  function canReviewChecklistSubitemAt(
    etapa: Etapa,
    checklistIndex: number,
    subIndex: number,
  ): boolean {
    const entregaSub = findChecklistEntregaForUnit(etapa, checklistIndex, subIndex);
    return (
      canUserReviewDeliveriesOnEtapa(etapa) &&
      mayReviewThisDeliveryExecutor(entregaSub?.executorId ?? entregaSub?.executor?.id) &&
      getChecklistUnitStatus(etapa, { checklistIndex, subitemIndex: subIndex }) === 'EM_ANALISE'
    );
  }

  function canReviewChecklistParentRow(etapa: Etapa, checklistIndex: number): boolean {
    if (!canUserReviewDeliveriesOnEtapa(etapa)) return false;
    const item = etapa.checklistJson?.[checklistIndex];
    const hasSubitens = Array.isArray(item?.subitens) && item!.subitens!.length > 0;
    const entregaPai = findChecklistEntregaForUnit(etapa, checklistIndex, null);
    if (
      hasSubitens &&
      getChecklistUnitStatus(etapa, { checklistIndex }) === 'EM_ANALISE' &&
      entregaPai &&
      mayReviewThisDeliveryExecutor(entregaPai.executorId ?? entregaPai.executor?.id)
    ) {
      return true;
    }
    if (hasSubitens) {
      const subs = listChecklistSubitemIndicesEmAnalise(etapa, checklistIndex);
      return subs.length > 0 && subs.every((s) => canReviewChecklistSubitemAt(etapa, checklistIndex, s));
    }
    return (
      mayReviewThisDeliveryExecutor(entregaPai?.executorId ?? entregaPai?.executor?.id) &&
      getChecklistUnitStatus(etapa, { checklistIndex }) === 'EM_ANALISE'
    );
  }

  async function handleApproveEtapa(etapaId: number) {
    setReviewLoading((prev) => ({ ...prev, [String(etapaId)]: true }));
    try {
      setError(null);
      await api.post(`/tasks/${etapaId}/approve`, {
        comentario: reviewNotes[String(etapaId)]?.trim() || undefined,
      });
      setReviewNotes((prev) => ({ ...prev, [String(etapaId)]: '' }));
      await refreshProject();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Falha ao aprovar a entrega');
    } finally {
      setReviewLoading((prev) => ({ ...prev, [String(etapaId)]: false }));
    }
  }

  async function handleRejectEtapa(etapaId: number) {
    setReviewLoading((prev) => ({ ...prev, [String(etapaId)]: true }));
    try {
      setError(null);
      await api.post(`/tasks/${etapaId}/reject`, {
        reason: reviewNotes[String(etapaId)]?.trim() || undefined,
      });
      setReviewNotes((prev) => ({ ...prev, [etapaId]: '' }));
      await refreshProject();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Falha ao recusar a entrega');
    } finally {
      setReviewLoading((prev) => ({ ...prev, [String(etapaId)]: false }));
    }
  }

  const filteredCompras = useMemo(() => {
    if (!project) return [];
    if (!selectedEtapaForCompra) return project.compras;
    return project.compras.filter((compra) => {
      const etapaId = compra.etapaId ?? compra.etapa?.id ?? null;
      return etapaId === selectedEtapaForCompra.id;
    });
  }, [project, selectedEtapaForCompra]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/70">Carregando detalhes do projeto...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/projects')}
          className="text-primary hover:text-primary/80 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Voltar para Projetos</span>
        </button>
        <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
          {error ?? 'Projeto não encontrado'}
        </div>
      </div>
    );
  }

  const totalEtapas = project.etapas.length;
  
  const etapasConcluidas = project.etapas.filter(isEtapaFullyConcludedForProjectProgress).length;
  const progresso =
    totalEtapas > 0
      ? Math.round(
          (project.etapas.reduce((sum, etapa) => sum + computeEtapaProgressRatio(etapa), 0) /
            totalEtapas) *
            100,
        )
      : 0;

  // Calcular valorInsumos como soma das etapas (garantia de que sempre está correto)
  const valorInsumosCalculado = project.etapas.reduce((sum, etapa) => {
    return sum + (etapa.valorInsumos || 0);
  }, 0);

  const projectStatusForDisplay = progresso === 0
    ? 'PENDENTE'
    : progresso === 100
      ? 'FINALIZADO'
      : project.status;

  const projectStatusLabel = getStatusLabel(projectStatusForDisplay);
  const projectStatusColor = getStatusColor(projectStatusForDisplay);

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      {/* Header: mobile = coluna; desktop = linha */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <button
          onClick={() => navigate('/projects')}
          className="text-primary hover:text-primary/80 transition-colors text-sm sm:text-base shrink-0 self-start"
        >
          ← Voltar
        </button>
        <div className="min-w-0 w-full sm:flex-1 sm:flex sm:items-start sm:justify-end gap-3">
          <div className="min-w-0 w-full sm:text-right">
            <h2 className="text-xl font-bold sm:text-2xl break-words [overflow-wrap:anywhere]">
              {project.nome}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 sm:justify-end">
              <span className={`inline-block px-2 py-1 rounded text-xs ${projectStatusColor}`}>
                {projectStatusLabel}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/wiki`)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 transition-colors"
                title="Ver documentação do projeto em formato wiki"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Ver Wiki
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Informações Gerais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        <div className="bg-neutral/80 border border-white/10 rounded-xl p-4 space-y-4 sm:p-6 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 border-b border-white/10 pb-2 min-w-0">
            <h3 className="text-lg font-semibold shrink-0">Informações Gerais</h3>
            {canEditProjectInfo && (
              <button
                type="button"
                onClick={openEditProjectModal}
                className={`${btn.primarySoft} text-xs px-3 py-1.5`}
              >
                Editar Projeto
              </button>
            )}
          </div>

          <div className="min-w-0">
            <label className="text-sm text-white/70">Resumo</label>
            <p className="mt-1 text-white/90 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {project.resumo && project.resumo.trim().length > 0 ? (
                <>
                  {getTruncatedText(project.resumo, 180, showFullResumo)}
                  {project.resumo.trim().length > 180 && (
                    <button
                      type="button"
                      onClick={() => setShowFullResumo((prev) => !prev)}
                      className="ml-1 text-primary text-xs hover:underline"
                    >
                      {showFullResumo ? 'ver menos' : 'ver mais'}
                    </button>
                  )}
                </>
              ) : (
                '—'
              )}
            </p>
          </div>

          <div className="min-w-0">
            <label className="text-sm text-white/70">Objetivo do projeto</label>
            <p className="mt-1 text-white/90 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {project.objetivo && project.objetivo.trim().length > 0 ? (
                <>
                  {getTruncatedText(project.objetivo, 220, showFullObjetivo)}
                  {project.objetivo.trim().length > 220 && (
                    <button
                      type="button"
                      onClick={() => setShowFullObjetivo((prev) => !prev)}
                      className="ml-1 text-primary text-xs hover:underline"
                    >
                      {showFullObjetivo ? 'ver menos' : 'ver mais'}
                    </button>
                  )}
                </>
              ) : (
                '—'
              )}
            </p>
          </div>

          <div>
            <label className="text-sm text-white/70 flex items-center justify-between">
              <span>Descrição do Projeto</span>
            </label>
            <p className="mt-1 text-white/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm min-w-0">
              {project.descricaoLonga && project.descricaoLonga.trim().length > 0 ? (
                <>
                  <LinkifiedText
                    text={getTruncatedText(project.descricaoLonga, 400, showFullDescricao)}
                  />
                  {project.descricaoLonga.trim().length > 400 && (
                    <button
                      type="button"
                      onClick={() => setShowFullDescricao((prev) => !prev)}
                      className="ml-1 text-primary text-xs hover:underline"
                    >
                      {showFullDescricao ? 'ver menos' : 'ver mais'}
                    </button>
                  )}
                </>
              ) : (
                '—'
              )}
            </p>
            {Array.isArray(project.descricaoArquivos) && project.descricaoArquivos.length > 0 && (() => {
              const arquivos = project.descricaoArquivos;
              const gallery = buildProjetoArquivosGallery(arquivos);
              return (
              <div className="mt-3 space-y-2">
                {arquivos.some((f) => getFileKind(f) === 'image') && (
                  <div>
                    <p className="text-xs text-white/60 mb-1">Imagens do projeto</p>
                    <div className="flex flex-wrap gap-2 min-w-0">
                      {arquivos
                        .filter((file) => getFileKind(file) === 'image')
                        .map((file, index) => {
                          const displayName = file.originalName || file.url;
                          const gi = arquivos.findIndex((f) => f.url === file.url);
                          return (
                            <FilePreviewTrigger
                              key={`${file.url}-${index}`}
                              src={file.url}
                              name={displayName}
                              variant="thumbnail"
                              gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                              className="w-[min(5rem,28vw)] h-[min(5rem,28vw)] shrink-0 rounded-md overflow-hidden border border-white/15 hover:border-primary/80 transition-colors bg-black/40 flex items-center justify-center"
                              title={displayName}
                            >
                              <img
                                src={resolveFileUrl(file.url)}
                                alt={displayName}
                                className="w-full h-full object-cover"
                              />
                            </FilePreviewTrigger>
                          );
                        })}
                    </div>
                  </div>
                )}

                {arquivos.some((f) => getFileKind(f) !== 'image') && (
                  <div>
                    <p className="text-xs text-white/60 mb-1">Arquivos e documentos</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto bg-black/10 rounded-md p-2">
                      {arquivos
                        .filter((file) => getFileKind(file) !== 'image')
                        .map((file, index) => {
                          const kind = getFileKind(file);
                          const downloadUrl = resolveFileUrl(file.url);
                          const displayName = file.originalName || file.url;
                          const badge = getFileBadgeLabel(file);
                          const gi = arquivos.findIndex((f) => f.url === file.url);
                          const icon =
                            kind === 'pdf'
                              ? '📄'
                              : kind === 'excel'
                                ? '📊'
                                : kind === 'word'
                                  ? '📝'
                                  : kind === 'ppt'
                                    ? '📽️'
                                    : kind === 'text'
                                      ? '📃'
                                      : '📎';
                          return (
                            <div
                              key={`${file.url}-${index}`}
                              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 text-xs text-white/80 min-w-0"
                            >
                              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-white/20 text-[10px] text-white/70 shrink-0 w-fit">
                                {badge}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="break-words [overflow-wrap:anywhere] sm:truncate">
                                  {icon}{' '}
                                  <span className="align-middle">{displayName}</span>
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 shrink-0">
                                <FilePreviewTrigger
                                  src={file.url}
                                  name={displayName}
                                  gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                                  className="inline-flex items-center px-2 py-0.5 rounded border border-white/25 text-[11px] text-white/80 hover:border-primary hover:text-primary transition-colors"
                                >
                                  Abrir
                                </FilePreviewTrigger>
                                <a
                                  href={downloadUrl}
                                  download
                                  className="inline-flex items-center px-2 py-0.5 rounded border border-white/15 text-[11px] text-white/80 hover:border-white/40 transition-colors"
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10 min-w-0">
            <div className="min-w-0">
              <label className="text-sm text-white/70">Valor Total</label>
              <p className="mt-1 text-base sm:text-lg font-semibold text-primary break-words">
                {project.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="min-w-0">
              <label className="text-sm text-white/70">Valor Insumos</label>
              <p className="mt-1 text-base sm:text-lg font-semibold break-words">
                {valorInsumosCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <label className="text-sm text-white/70">Data de Criação</label>
            <p className="mt-1">
              {new Date(project.dataCriacao).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        <div className="bg-neutral/80 border border-white/10 rounded-xl p-4 space-y-4 sm:p-6 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-2">
            <h3 className="text-lg font-semibold">Equipe</h3>
            {canEditProjectInfo && (
              <button type="button" onClick={openEditProjectModal} className={btn.primarySoft}>
                Gerenciar equipe
              </button>
            )}
          </div>

          {equipeCompleta.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum integrante cadastrado.</p>
          ) : (
            <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {equipeCompleta.map((membro) => (
                <li key={membro.id} className="min-w-0 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <p className="text-white/90 font-medium break-words [overflow-wrap:anywhere]">
                    {membro.nome}{' '}
                    <span className="text-white/50 font-normal text-sm">
                      ({membro.cargoLabel})
                      {membro.email ? ` — ${membro.email}` : ''}
                    </span>
                  </p>
                  <p className="text-xs text-white/45 mt-0.5">{resumoPapeisEquipe(membro.papeis)}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-white/50 pt-1">
            O supervisor é quem responde pela gestão do projeto. Use &quot;Gerenciar equipe&quot; para incluir ou remover
            integrantes.
          </p>
        </div>
      </div>

      {/* Progresso */}
      {totalEtapas > 0 && (
        <div className="bg-neutral/80 border border-white/10 rounded-xl p-4 sm:p-6 min-w-0">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-2 min-w-0">
            <h3 className="text-lg font-semibold shrink-0">Progresso do Projeto</h3>
            <span className="text-sm text-white/70 break-words">
              {etapasConcluidas} de {totalEtapas} etapas concluídas
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3">
            <div
              className="bg-primary h-3 rounded-full transition-all"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="text-sm text-white/70 mt-2">{progresso}% concluído</p>
        </div>
      )}

      {/* Etapas */}
      <div className="bg-neutral/80 border border-white/10 rounded-xl p-4 sm:p-6 min-w-0 overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-3 mb-2 min-w-0">
          <h3 className="text-lg font-semibold text-white shrink-0">
            {etapasViewMode === 'eventos'
              ? `Eventos / Viagens (${projectEvents.length})`
              : `Etapas (${project.etapas.length})`}
          </h3>
          <nav className="flex flex-wrap gap-2" aria-label="Modo de visualização do projeto">
            <button
              type="button"
              onClick={() => setWorkspaceView('cronograma')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                etapasViewMode === 'cronograma'
                  ? 'bg-primary text-white'
                  : 'bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              Cronograma
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView('equipe')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                etapasViewMode === 'equipe'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              Equipe por etapa
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView('eventos')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                etapasViewMode === 'eventos'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              Eventos / Viagens
            </button>
          </nav>
        </div>

        {etapasViewMode === 'equipe' ? (
          <ProjectEtapaEquipePanel
            etapas={project.etapas}
            sessoes={project.sessoes ?? []}
            users={users}
            supervisorId={project.supervisor?.id ?? null}
            canManage={canManageEtapas}
            onSaved={async () => {
              await refreshProject(false);
            }}
          />
        ) : etapasViewMode === 'eventos' ? (
          <div className="pt-2 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end mb-4">
              {canManageCalendarEvents && (
                <button type="button" onClick={openCreateProjectEventModal} className={btn.primary}>
                  + Novo evento
                </button>
              )}
            </div>

            {loadingProjectEvents ? (
              <p className="text-sm text-white/60">Carregando eventos...</p>
            ) : projectEvents.length === 0 ? (
              <p className="text-sm text-white/50">
                Nenhum evento vinculado ao projeto ainda. Crie viagens e expedições por aqui.
              </p>
            ) : (
              <div className="space-y-2">
                {projectEvents.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-white/90 break-words">{ev.titulo}</p>
                        <p className="text-xs text-white/60">
                          {formatEventPeriod(new Date(ev.dataInicio), new Date(ev.dataFim), ev.dataInicio, ev.dataFim)}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 shrink-0">
                        {ev.alvo === 'TODOS_USUARIOS' ? 'Todos os usuários' : 'Integrantes selecionados'}
                      </span>
                    </div>
                    {ev.descricao && (
                      <p className="mt-2 text-sm text-white/75 whitespace-pre-wrap">{ev.descricao}</p>
                    )}
                    <p className="mt-2 text-xs text-white/50">
                      Criado por: {ev.criador?.nome ?? '—'} | Participantes:{' '}
                      {ev.alvo === 'TODOS_USUARIOS' ? 'todos os usuários ativos' : ev.participantes.length}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div className="flex flex-col gap-3 min-w-0">
          {/* Linha de Sessões – identidade visual violeta (diferente das abas em azul) */}
          {(totalEtapas > 0 || canManageEtapas) && (project != null) && (() => {
            const hasEtapaSemSessao = (project?.etapas ?? []).some((e) => e.sessaoId == null);
            const sessaoGroupsCount = (hasEtapaSemSessao ? 1 : 0) + (project?.sessoes?.length ?? 0);
            return (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between py-3 px-3 sm:px-4 rounded-lg bg-slate-800/60 border border-violet-500/25 min-w-0">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 min-w-0 [scrollbar-width:thin]">
                <span className="text-sm font-semibold text-violet-200/90 shrink-0">Sessões</span>
                {sessaoGroupsCount > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSessaoId('all')}
                    title="Mostra etapas de todas as sessões na mesma lista. Não é uma sessão do projeto — é só o modo de visualização."
                    className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400/50 whitespace-nowrap ${
                      selectedSessaoId === 'all'
                        ? 'bg-violet-600/90 text-white border-2 border-dashed border-violet-300/80'
                        : 'bg-slate-700/80 text-white/80 border border-dashed border-violet-400/40 hover:bg-violet-900/40 hover:border-violet-500/60'
                    }`}
                  >
                    Todas as sessões
                  </button>
                )}
                {hasEtapaSemSessao && (
                  <button
                    type="button"
                    onClick={() => setSelectedSessaoId(null)}
                    title="Etapas sem sessão atribuída"
                    className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors border border-solid focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
                      selectedSessaoId === null
                        ? 'bg-violet-600 text-white border-violet-500'
                        : 'bg-slate-700/80 text-white/80 border-slate-600/80 hover:bg-violet-900/40 hover:border-violet-700/60'
                    }`}
                  >
                    Sem sessão
                  </button>
                )}
                {project?.sessoes?.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSessaoId(s.id)}
                    className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors border border-solid focus:outline-none focus:ring-2 focus:ring-violet-400/50 whitespace-nowrap ${
                      selectedSessaoId === s.id
                        ? 'bg-violet-600 text-white border-violet-500'
                        : 'bg-slate-700/80 text-white/80 border-slate-600/80 hover:bg-violet-900/40 hover:border-violet-700/60'
                    }`}
                    title={s.nome}
                  >
                    {s.nome}
                  </button>
                ))}
              </div>
              {sessaoGroupsCount > 1 && (
                <p className="text-[10px] text-white/45 px-1 leading-snug max-w-2xl">
                  «Todas as sessões» (tracejado) é só visualização combinada — não substitui uma sessão real do projeto.
                </p>
              )}
              {canManageEtapas && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setNovaSessaoNome('');
                      setShowSessaoModal(true);
                    }}
                    className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-700/80 text-white/80 border border-slate-600/80 hover:bg-slate-600/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
                  >
                    + Nova sessão
                  </button>
                  {typeof selectedSessaoId === 'number' && project?.sessoes?.some((s) => s.id === selectedSessaoId) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const sessao = project.sessoes!.find((s) => s.id === selectedSessaoId);
                          if (!sessao) return;
                          setEditingSessao(sessao);
                          setEditSessaoNome(sessao.nome);
                        }}
                        className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-700/80 text-white/80 border border-slate-600/80 hover:bg-slate-600/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        Renomear sessão
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sessao = project.sessoes!.find((s) => s.id === selectedSessaoId);
                          if (!sessao) return;
                          setSessaoToDelete(sessao);
                          setShowDeleteSessaoModal(true);
                        }}
                        className={btn.dangerSm}
                      >
                        Excluir sessão
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {/* Linha de Abas – identidade visual azul (primary), distinta das sessões em violeta */}
          {(totalEtapas > 0 || canManageEtapas) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between py-3 px-3 sm:px-4 rounded-lg bg-slate-800/60 border border-primary/25 min-w-0">
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[10px] text-white/45 px-1 leading-snug max-w-2xl">
                  «Todas as abas» (tracejado) junta as etapas de todas as abas na lista — não é uma aba cadastrada.
                </p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 min-w-0 [scrollbar-width:thin]">
                  <span className="text-sm font-semibold text-sky-200/90 shrink-0">Abas</span>
                  {abas.map((aba) => {
                    const isVerTodas = aba === ABA_VISUALIZACAO_TODAS;
                    return (
                  <button
                    key={aba}
                    type="button"
                    onClick={() => setSelectedAba(aba)}
                    className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 whitespace-nowrap ${
                      isVerTodas
                        ? selectedAba === aba
                          ? 'bg-primary/90 text-white border-2 border-dashed border-sky-200/80'
                          : 'bg-slate-700/80 text-white/80 border border-dashed border-sky-400/35 hover:bg-primary/15 hover:border-primary/45'
                        : selectedAba === aba
                          ? 'bg-primary text-white border border-primary'
                          : 'bg-slate-700/80 text-white/80 border border-slate-600/80 hover:bg-primary/20 hover:border-primary/40'
                    }`}
                    title={
                      isVerTodas
                        ? 'Mostra etapas de todas as abas juntas. Não é uma aba do projeto — só o modo de visualização.'
                        : aba
                    }
                  >
                    {isVerTodas ? 'Todas as abas' : aba}
                  </button>
                    );
                  })}
                </div>
              </div>
              {canManageEtapas && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAddAba}
                    disabled={selectedSessaoId === 'all'}
                    title={
                      selectedSessaoId === 'all'
                        ? 'Selecione uma sessão acima para criar a aba nela'
                        : 'Criar aba na sessão atual'
                    }
                    className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-700/80 text-white/80 border border-slate-600/80 hover:bg-slate-600/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    + Nova aba
                  </button>
                  {selectedAba !== ABA_VISUALIZACAO_TODAS && (
                    <>
                      <button
                        type="button"
                        onClick={handleOpenRenameAba}
                        className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold bg-slate-700/80 text-white/80 border border-slate-600/80 hover:bg-slate-600/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        Renomear aba
                      </button>
                      <button type="button" onClick={handleOpenDeleteAba} className={btn.dangerSm}>
                        Excluir aba
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {(totalEtapas > 0 || canManageEtapas) && (
            <div className="mt-3 rounded-lg bg-slate-800/60 border border-white/15 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-white/90">Filtros de etapas</span>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => {
                    setEtapaSearchFilter('');
                    setEtapaStatusFilter('all');
                    setEtapaTarefaStatusFilter('all');
                    setEtapaPrazoFilter('all');
                    setEtapaResponsavelFilter('all');
                    setEtapaEntreguePorFilter('all');
                  }}
                >
                  Limpar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <div>
                  <label className="block text-xs text-white/70 mb-1">Buscar etapa</label>
                  <input
                    value={etapaSearchFilter}
                    onChange={(e) => setEtapaSearchFilter(e.target.value)}
                    placeholder="Nome, descrição, sessão, aba..."
                    className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Status da etapa</label>
                  <AppSelect
                    value={etapaStatusFilter}
                    onChange={(value) => setEtapaStatusFilter(value as 'all' | Etapa['status'])}
                    options={[
                      { value: 'all', label: 'Todos' },
                      { value: 'PENDENTE', label: 'Pendente' },
                      { value: 'EM_ANDAMENTO', label: 'Em andamento' },
                      { value: 'EM_ANALISE', label: 'Em análise' },
                      { value: 'APROVADA', label: 'Aprovado' },
                      { value: 'REPROVADA', label: 'Reprovada' },
                    ]}
                    selectClassName="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Status das tarefas</label>
                  <AppSelect
                    value={etapaTarefaStatusFilter}
                    onChange={(value) => setEtapaTarefaStatusFilter(value as EtapaTarefaStatusFiltro)}
                    options={[
                      { value: 'all', label: 'Todos' },
                      { value: 'SEM_TAREFAS', label: 'Sem tarefas no checklist' },
                      { value: 'A_FAZER', label: getChecklistItemStatusLabel('A_FAZER') },
                      { value: 'FAZENDO', label: getChecklistItemStatusLabel('FAZENDO') },
                      { value: 'EM_ANALISE', label: getChecklistItemStatusLabel('EM_ANALISE') },
                      { value: 'APROVADO', label: getChecklistItemStatusLabel('APROVADO') },
                      { value: 'REPROVADO', label: getChecklistItemStatusLabel('REPROVADO') },
                      { value: 'MARCADO_CADASTRO', label: getChecklistItemStatusLabel('MARCADO_CADASTRO') },
                    ]}
                    selectClassName="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Prazo</label>
                  <AppSelect
                    value={etapaPrazoFilter}
                    onChange={(value) => setEtapaPrazoFilter(value as EtapaPrazoFiltro)}
                    options={[
                      { value: 'all', label: 'Todos' },
                      { value: 'soon', label: 'Vencendo em 7 dias' },
                      { value: 'expired', label: 'Atrasadas' },
                      { value: 'on_time', label: 'No prazo' },
                      { value: 'without_deadline', label: 'Sem data fim' },
                    ]}
                    selectClassName="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Pessoa no projeto</label>
                  <AppSelect
                    value={etapaResponsavelFilter}
                    onChange={(value) =>
                      setEtapaResponsavelFilter(value === 'all' || value === '' ? 'all' : Number(value))
                    }
                    options={[
                      { value: 'all', label: 'Todos' },
                      ...etapaPessoaProjetoOptions.map((p) => ({ value: p.id, label: p.nome })),
                    ]}
                    selectClassName="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Entregue por</label>
                  <AppSelect
                    value={etapaEntreguePorFilter}
                    onChange={(value) =>
                      setEtapaEntreguePorFilter(value === 'all' || value === '' ? 'all' : Number(value))
                    }
                    options={[
                      { value: 'all', label: 'Todos' },
                      ...etapaEntreguePorOptions.map((p) => ({ value: p.id, label: p.nome })),
                    ]}
                    selectClassName="w-full"
                  />
                  <p className="text-[11px] text-white/45 mt-1 leading-snug">
                    Mostra etapas e tarefas com entregas enviadas por essa pessoa.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Linha de Etapas (abaixo) */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Etapas ({etapasExibidas.length})</h3>
            {canManageEtapas && (
              <button
                type="button"
                onClick={async () => {
                  setEditingEtapa(null);
                  setEtapaForm({
                    nome: '',
                    descricao: '',
                    sessaoId:
                      selectedSessaoId !== 'all' &&
                      selectedSessaoId !== null &&
                      typeof selectedSessaoId === 'number'
                        ? selectedSessaoId
                        : (project?.sessoes?.length === 1 ? project.sessoes[0].id : undefined),
                    aba:
                      selectedAba !== ABA_VISUALIZACAO_TODAS
                        ? selectedAba
                        : (project?.sessoes?.length === 1 ? 'Geral' : ''),
                    setorIds:
                      Array.isArray(project?.setores) && project?.setores?.length === 1
                        ? [project?.setores?.[0]?.id]
                        : [],
                    participantesIds: [],
                    excludedAutoIntegranteIds: [],
                    dataInicio: '',
                    dataFim: '',
                    valorInsumos: 0,
                    checklist: [createEmptyChecklistItem()],
                    status: 'PENDENTE',
                    estoqueItems: [],
                  });
                  setChecklistIntegrantesBusca({});
                  await loadAvailableStockItems();
                  setShowEtapaModal(true);
                }}
                className={btn.primary}
              >
                + Adicionar Etapa
              </button>
            )}
          </div>

          {/* Cards de etapas */}
          <section className="space-y-4">
            {totalEtapas === 0 ? (
              <p className="text-white/50 text-center py-8">Nenhuma etapa cadastrada</p>
            ) : etapasExibidas.length === 0 ? (
              <p className="text-white/50 text-center py-8">Nenhuma etapa com os filtros selecionados.</p>
            ) : (
              <div className="space-y-4">
            {etapasExibidas.map((etapa, etapaIndex) => {
              const etapaNumero = etapaNumeroMap.get(etapa.id) ?? etapaIndex + 1;
              const etapaPosicaoGlobal = etapasOrdenadasProjeto.findIndex((e) => e.id === etapa.id);
              const latestEntrega = etapa.entregas && etapa.entregas.length > 0 ? etapa.entregas[0] : null;
              // Comparar convertendo ambos para número para evitar problemas de tipo
              const executorId = etapa.executor?.id;
              const isExecutor = user?.id && executorId && Number(user.id) === Number(executorId);
              
              const podeMarcarChecklist = canUserReviewDeliveriesOnEtapa(etapa);
              
              // Verificar se há itens do checklist marcados
              const checklistItems = etapa.checklistJson && Array.isArray(etapa.checklistJson) 
                ? etapa.checklistJson 
                : [];
              const { feitas: itensMarcados, total: totalItens } = countTopLevelChecklistRowsFeitas(etapa);
              const temItensMarcados = itensMarcados > 0;
              const awaitingReview = latestEntrega?.status === 'EM_ANALISE';
              const reviewValue = reviewNotes[String(etapa.id)] ?? '';
              const isReviewing = reviewLoading[String(etapa.id)] ?? false;

              const progressoChecklist =
                totalItens > 0 ? Math.round((itensMarcados / totalItens) * 100) : 0;

              return (
                <div
                  id={`etapa-${etapa.id}`}
                  key={etapa.id}
                  className="bg-slate-950/80 border border-white/10 rounded-xl p-4 sm:p-5 shadow-xl shadow-black/40"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 flex items-start gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleEtapa(etapa.id)}
                        onKeyDown={(e) => e.key === 'Enter' && toggleEtapa(etapa.id)}
                        aria-expanded={expandedEtapas.has(etapa.id)}
                        aria-label={expandedEtapas.has(etapa.id) ? 'Retrair etapa' : 'Expandir etapa'}
                        className="shrink-0 text-white/70 mt-0.5 inline-flex transition-transform duration-300 ease-out focus:outline-none"
                        style={{ transform: expandedEtapas.has(etapa.id) ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                      >
                        ▼
                      </button>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-white/90">
                              {etapaNumero}. {etapa.nome}
                        </h4>
                        {etapa.descricao && (
                          <p className="text-sm mt-1 text-white/70">
                            <LinkifiedText
                              text={getTruncatedText(
                                etapa.descricao,
                                220,
                                expandedDescricaoEtapas.has(etapa.id),
                              )}
                            />
                            {etapa.descricao.trim().length > 220 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDescricaoEtapas((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(etapa.id)) {
                                      next.delete(etapa.id);
                                    } else {
                                      next.add(etapa.id);
                                    }
                                    return next;
                                  })
                                }
                                className="ml-1 text-primary text-xs hover:underline"
                              >
                                {expandedDescricaoEtapas.has(etapa.id)
                                  ? 'ver menos'
                                  : 'ver mais'}
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                            etapa.status,
                          )}`}
                        >
                          {getStatusLabel(etapa.status)}
                        </span>
                        {canManageEtapas && (
                          <span className="flex items-center gap-1" title="Ordem da etapa">
                            <button
                              type="button"
                              onClick={() => handleReorderEtapas('up', etapa.id)}
                              disabled={reorderingEtapas || etapaPosicaoGlobal <= 0}
                              className="p-1.5 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/80"
                              aria-label="Subir etapa"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEtapas('down', etapa.id)}
                              disabled={reorderingEtapas || etapaPosicaoGlobal === -1 || etapaPosicaoGlobal >= etapasOrdenadasProjeto.length - 1}
                              className="p-1.5 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/80"
                              aria-label="Descer etapa"
                            >
                              ↓
                            </button>
                          </span>
                        )}
                        {canManageEtapas && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenEtapaMenuId((current) => (current === etapa.id ? null : etapa.id))
                              }
                              className="px-2 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"
                              aria-haspopup="menu"
                              aria-expanded={openEtapaMenuId === etapa.id}
                            >
                              ⋯
                            </button>
                            {openEtapaMenuId === etapa.id && (
                              <div
                                className="absolute right-0 mt-1 w-32 rounded-md bg-slate-900 border border-white/10 shadow-lg z-10"
                                role="menu"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleEditEtapa(etapa);
                                    setOpenEtapaMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10"
                                  role="menuitem"
                                >
                                  Editar
                                </button>
                                {canEditProjectInfo && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteEtapa(etapa);
                                      setOpenEtapaMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-danger/20"
                                    role="menuitem"
                                  >
                                    Excluir
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {isExecutor && etapa.status === 'EM_ANALISE' && (
                        <span className="text-xs text-amber-300/80">Aguardando avaliação do supervisor</span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: expandedEtapas.has(etapa.id) ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.35s ease-out',
                    }}
                    className="min-h-0"
                  >
                    <div className="overflow-hidden min-h-0">
                  <div className="mt-3 space-y-2 text-sm text-slate-200/80">
                    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                      <span className="font-medium">Supervisor:</span>{' '}
                      {project.supervisor?.nome ?? (
                        <span className="text-white/50">
                          Não definido no cadastro do projeto — defina em «Editar projeto» (Informações).
                        </span>
                      )}
                    </div>
                    {(() => {
                      const { resumo, tituloCompleto } = formatParticipantesResumo(
                        nomesParticipantesDaEtapaSemUsuario(etapa, project.supervisor?.id ?? null),
                      );
                      return resumo ? (
                        <div className="min-w-0" title={tituloCompleto ? `Participantes: ${tituloCompleto}` : undefined}>
                          <span className="font-medium">Participantes:</span>{' '}
                          <span className="break-words [overflow-wrap:anywhere]">{resumo}</span>
                        </div>
                      ) : (
                        <div className="text-white/50">
                          <span className="font-medium">Participantes:</span> nenhum cadastrado nesta etapa
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm text-slate-200/80">
                    {etapa.dataInicio && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Data Início:</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="text-xs">📅</span>
                          {new Date(etapa.dataInicio).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                    {etapa.dataFim && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Data Fim:</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="text-xs">📅</span>
                          {new Date(etapa.dataFim).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                    {etapa.valorInsumos && etapa.valorInsumos > 0 && (
                      <div>
                        <span className="font-medium">Valor Insumos:</span>{' '}
                        {etapa.valorInsumos.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </div>
                    )}
                  </div>

                  {latestEntrega && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-xs text-white/60 block">Última entrega</span>
                          <span className="text-sm text-white/80 block">
                            {new Date(latestEntrega.dataEnvio).toLocaleString('pt-BR')}
                          </span>
                          {latestEntrega.executor && (
                            <span className="mt-1 text-xs text-white/60 block">
                              Enviado por {latestEntrega.executor.nome}
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${getEntregaStatusColor(latestEntrega.status)}`}>
                          {getEntregaStatusLabel(latestEntrega.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-white/80 whitespace-pre-wrap">{latestEntrega.descricao}</p>
                      {latestEntrega.foiEditada && latestEntrega.editadoPor && latestEntrega.dataEdicao && (
                        <p className="mt-1 text-xs text-white/60">
                          Editado por {latestEntrega.editadoPor.nome}{' '}
                          em {new Date(latestEntrega.dataEdicao).toLocaleString('pt-BR')}
                        </p>
                      )}
                      {latestEntrega.imagemUrl && (
                        <div className="mt-3">
                          <FilePreviewTrigger
                            src={latestEntrega.imagemUrl}
                            name="Entrega da etapa"
                            variant="thumbnail"
                            className="max-h-64 rounded-md border border-white/10 overflow-hidden"
                          />
                        </div>
                      )}
                      {latestEntrega.comentario && (
                        <div className="mt-3 min-w-0 max-w-full">
                          <ReviewerCommentBox
                            text={latestEntrega.comentario}
                            variant="inline"
                          />
                        </div>
                      )}
                      {latestEntrega.avaliadoPor && (
                        <p className="mt-2 text-xs text-white/60">
                          Avaliado por {latestEntrega.avaliadoPor.nome}
                          {latestEntrega.dataAvaliacao
                            ? ` em ${new Date(latestEntrega.dataAvaliacao).toLocaleString('pt-BR')}`
                            : ''}
                        </p>
                      )}

                      {awaitingReview &&
                        canUserReviewDeliveriesOnEtapa(etapa) &&
                        mayReviewThisDeliveryExecutor(
                          latestEntrega.executorId ?? latestEntrega.executor?.id,
                        ) && (
                        <div className="mt-4 p-4 border border-white/20 rounded-lg bg-white/5 space-y-3">
                          <label className="text-sm font-medium text-white/80 block">
                            Avaliação da etapa
                          </label>
                          <textarea
                            value={reviewValue}
                            onChange={(e) => handleReviewNoteChange(etapa.id, e.target.value)}
                            rows={3}
                            placeholder="Adicione um comentário (opcional)"
                            className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => handleRejectEtapa(etapa.id)}
                              disabled={isReviewing}
                              className={btn.primary}
                            >
                              {isReviewing ? 'Processando...' : 'Recusar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveEtapa(etapa.id)}
                              disabled={isReviewing}
                              className={btn.primary}
                            >
                              {isReviewing ? 'Processando...' : 'Aprovar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {etapa.checklistJson && Array.isArray(etapa.checklistJson) && etapa.checklistJson.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-white/80 block font-medium">
                          Tarefas da etapa ({etapa.checklistJson.length})
                          {podeMarcarChecklist && (
                            <span className="text-white/50 text-xs ml-2">
                              (Cadastro: mesmo perfil que aprova entregas; confirmação ao marcar/desmarcar; indisponível se já houver entrega na tarefa)
                            </span>
                          )}
                        </label>
                      </div>
                      {totalItens > 0 && (
                        <div className="mb-3">
                          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-400 h-2 rounded-full transition-all"
                              style={{ width: `${progressoChecklist}%` }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-white/60 text-right">
                            {itensMarcados} de {totalItens} tarefa{totalItens !== 1 ? 's' : ''} feita
                            {itensMarcados !== 1 ? 's' : ''} (cadastro ou entrega aprovada) —{' '}
                            {progressoChecklist}%
                          </div>
                        </div>
                      )}

                      {/* Cabeçalho de colunas (desktop) */}
                      <div className="hidden md:grid md:grid-cols-[auto_1fr_7rem_7rem_8rem] md:items-center gap-2 text-[11px] uppercase tracking-wide text-white/70 bg-slate-900/80 border border-white/15 rounded-md px-3 py-2 mb-1">
                        <div className="w-6" />
                        <div className="pl-1">Tarefa</div>
                        <div className="text-center">Status</div>
                        <div className="text-center">Entregas</div>
                        <div className="text-right pr-1">Ações</div>
                      </div>

                      <div className="space-y-2">
                        {etapa.checklistJson.map((item: ChecklistItem, index: number) => {
                          if (
                            etapaEntreguePorFilter !== 'all' &&
                            !checklistRowMatchesEntreguePorFilter(
                              etapa,
                              index,
                              item,
                              etapaEntreguePorFilter,
                            )
                          ) {
                            return null;
                          }
                          // Entrega do item principal (subitemIndex null/undefined = entrega do item, não de subitem)
                          const entregaItem = findChecklistEntregaForUnit(etapa, index, null);
                          const statusItem = getChecklistUnitWorkflowStatus(etapa, { checklistIndex: index });
                          const itemLoading = reviewLoading[`${etapa.id}-${index}`] ?? false;
                          const detailsKey = `view-${etapa.id}-${index}`;
                          const isExpanded = expandedChecklistDetails.has(detailsKey);
                          const hasDetails = item.descricao && item.descricao.trim().length > 0;
                          const hasSubitens = item.subitens && item.subitens.length > 0;
                          const subsPendentesReview = hasSubitens
                            ? listChecklistSubitemIndicesEmAnalise(etapa, index)
                            : [];
                          const canApproveParentRow = canReviewChecklistParentRow(etapa, index);
                          const statusItemDisplay =
                            hasSubitens && subsPendentesReview.length > 0
                              ? ('EM_ANALISE' as ChecklistUnitWorkflowStatus)
                              : statusItem;
                          const subEntregasProg = hasSubitens
                            ? countChecklistSubitemsConcluidas(etapa, index)
                            : null;
                          const paiLinhaFeita = isTopLevelChecklistRowFeita(etapa, index);
                          const paiCheckboxMarcado = hasSubitens ? paiLinhaFeita : Boolean(item.concluido);
                          const subsEmAnalise = hasSubitens
                            ? countChecklistSubitemsMatchingWorkflowFilter(etapa, index, 'EM_ANALISE')
                            : 0;
                          const subsAguardandoAprovacao = subsEmAnalise > 0;
                          const itemNumberLabel = `${etapaNumero}.${index + 1}`;
                          const canToggleCadastroRow =
                            podeMarcarChecklist &&
                            canToggleChecklistCadastroForTopLevelRow(etapa, index);
                          const cadastroCheckboxBusy = updatingChecklist === etapa.id;
                          const cadastroCheckboxDisabled = cadastroCheckboxBusy || !canToggleCadastroRow;
                          const cadastroCheckboxTitle = !podeMarcarChecklist
                            ? 'Apenas quem pode aprovar entregas nesta etapa pode marcar no cadastro'
                            : !canToggleChecklistCadastroForTopLevelRow(etapa, index)
                              ? 'Já existe entrega (em análise, aprovada ou reprovada). Use o fluxo de entregas; o cadastro não pode ser alterado aqui.'
                              : paiCheckboxMarcado
                                ? 'Desmarcar no cadastro (confirmação ao clicar)'
                                : 'Marcar concluído no cadastro (confirmação ao clicar)';

                          const handleCadastroCheckboxClick = () => {
                            if (cadastroCheckboxBusy) return;
                            if (!podeMarcarChecklist) {
                              toast.warning(
                                'Só quem pode aprovar entregas nesta etapa pode marcar tarefas no cadastro.',
                              );
                              return;
                            }
                            if (!canToggleChecklistCadastroForTopLevelRow(etapa, index)) {
                              toast.warning(
                                'Já existe entrega registrada nesta tarefa (em análise, aprovada ou reprovada). Use o fluxo de entregas; o checkbox do cadastro fica indisponível.',
                              );
                              return;
                            }
                            const next = !paiCheckboxMarcado;
                            let msg = next
                              ? 'Marcar como concluído no cadastro? Isso pode contar no progresso do projeto quando não houver entrega em outro status.'
                              : 'Desmarcar no cadastro? A tarefa deixa de contar como concluída pelo cadastro.';
                            if (hasSubitens) {
                              msg +=
                                ' Todas as subtarefas desta linha serão marcadas ou desmarcadas junto com a tarefa pai.';
                            }
                            if (!window.confirm(msg)) return;
                            void handleChecklistUpdate(etapa.id, index, next);
                          };

                          return (
                            <div key={`${etapa.id}-checklist-${index}`} className="space-y-1">
                              {/* Item principal — desktop: grid alinhado ao cabeçalho */}
                              <div
                                className={`hidden md:grid md:grid-cols-[auto_1fr_7rem_7rem_8rem] md:items-center md:gap-2 md:p-3 md:rounded-lg md:transition-colors ${
                                  podeMarcarChecklist ? 'hover:bg-white/10' : ''
                                } ${getChecklistItemStyle(statusItemDisplay)} ${
                                  subsAguardandoAprovacao && !isExpanded
                                    ? 'ring-1 ring-amber-400/50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.15)]'
                                    : ''
                                }`}
                              >
                                <div
                                  role="button"
                                  aria-disabled={cadastroCheckboxDisabled}
                                  tabIndex={cadastroCheckboxDisabled ? -1 : 0}
                                  onKeyDown={(e) => {
                                    if (!cadastroCheckboxDisabled && (e.key === 'Enter' || e.key === ' ')) {
                                      e.preventDefault();
                                      handleCadastroCheckboxClick();
                                    }
                                  }}
                                  className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${
                                    cadastroCheckboxDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                                  } ${getCheckboxStyle(paiCheckboxMarcado, cadastroCheckboxDisabled)}`}
                                  onClick={handleCadastroCheckboxClick}
                                  title={cadastroCheckboxTitle}
                                >
                                  {paiCheckboxMarcado && (
                                    <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <div className="min-w-0 pl-1">
                                  <span className={`text-sm block truncate ${getChecklistTextStyle(paiCheckboxMarcado)}`}>
                                    {itemNumberLabel} {item.texto}
                                    {!hasSubitens && (
                                      <span className="text-white/45 font-normal whitespace-nowrap">
                                        {' '}
                                        · {displayPontosTarefaChecklist(item.pontos)}{' '}
                                        {displayPontosTarefaChecklist(item.pontos) === 1 ? 'pt' : 'pts'}
                                      </span>
                                    )}
                                    {hasSubitens && (
                                      <span className="text-white/40 font-normal whitespace-nowrap">
                                        {' '}
                                        · {item.subitens!.length} sub ({computeSubitemPtsFraction(item.pontos, item.subitens!.length)} pt/sub · soma = {displayPontosTarefaChecklist(item.pontos)})
                                      </span>
                                    )}
                                  </span>
                                  {subsAguardandoAprovacao ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isExpanded) toggleChecklistDetails(detailsKey);
                                      }}
                                      className={`mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${getChecklistItemStatusColor('EM_ANALISE')} hover:brightness-110 transition-all`}
                                      title={
                                        isExpanded
                                          ? `${subsEmAnalise} subtarefa(s) aguardando aprovação — veja na lista abaixo`
                                          : 'Clique para expandir e ver subtarefas em análise'
                                      }
                                    >
                                      {!isExpanded ? (
                                        <span
                                          className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-300 animate-pulse"
                                          aria-hidden
                                        />
                                      ) : null}
                                      <span className="truncate">
                                        {subsEmAnalise} sub · {getChecklistItemStatusLabel('EM_ANALISE')}
                                        {!isExpanded ? ' (expandir)' : ''}
                                      </span>
                                    </button>
                                  ) : null}
                                  {etapaTarefaStatusFilter !== 'all' &&
                                    etapaTarefaStatusFilter !== 'SEM_TAREFAS' &&
                                    etapaTarefaStatusFilter !== 'EM_ANALISE' &&
                                    hasSubitens &&
                                    (() => {
                                      const n = countChecklistSubitemsMatchingWorkflowFilter(
                                        etapa,
                                        index,
                                        etapaTarefaStatusFilter,
                                      );
                                      if (n <= 0) return null;
                                      return (
                                        <span className="mt-1 block text-[10px] leading-snug text-violet-200/95 [overflow-wrap:anywhere]">
                                          {n} subtarefa{n !== 1 ? 's' : ''} em «
                                          {getChecklistItemStatusLabel(etapaTarefaStatusFilter)}» na lista abaixo
                                        </span>
                                      );
                                    })()}
                                </div>
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <span
                                    className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${getChecklistItemStatusColor(statusItemDisplay)}`}
                                  >
                                    {getChecklistItemStatusLabel(statusItemDisplay)}
                                  </span>
                                  {subsAguardandoAprovacao && !isExpanded ? (
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap ${getChecklistItemStatusColor('EM_ANALISE')}`}
                                      title="Subtarefas aguardando aprovação (linha recolhida)"
                                    >
                                      {subsEmAnalise} sub
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-center text-xs text-white/70">
                                  {hasSubitens && subEntregasProg ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span
                                        className={`inline-block font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                                          subEntregasProg.feitas >= subEntregasProg.total
                                            ? 'text-emerald-300 bg-emerald-500/15'
                                            : 'text-white/85 bg-white/5'
                                        }`}
                                        title="Subtarefas concluídas (cadastro ou entrega aprovada)"
                                      >
                                        {subEntregasProg.feitas}/{subEntregasProg.total}
                                      </span>
                                      {entregaItem?.dataEnvio ? (
                                        <span
                                          className="text-[9px] text-white/50 whitespace-nowrap"
                                          title="Data da entrega da tarefa pai"
                                        >
                                          Pai:{' '}
                                          {new Date(entregaItem.dataEnvio).toLocaleDateString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                          })}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : entregaItem?.dataEnvio ? (
                                    new Date(entregaItem.dataEnvio).toLocaleDateString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                    })
                                  ) : (
                                    '—'
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  {(hasDetails || hasSubitens) && (
                                    <button
                                      type="button"
                                      onClick={() => toggleChecklistDetails(detailsKey)}
                                      className={`${btn.editSm} shrink-0`}
                                      title={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes e subitens'}
                                    >
                                      {hasSubitens ? `(${item.subitens!.length})` : ''} {isExpanded ? '▲' : '▼'}
                                    </button>
                                  )}
                                  {entregaItem && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedViewEntrega({ etapa, index, entrega: entregaItem });
                                        setShowViewEntregaModal(true);
                                      }}
                                      className={`${btn.primarySoft} shrink-0 whitespace-nowrap`}
                                      title={
                                        hasSubitens
                                          ? 'Ver detalhes da entrega da tarefa pai'
                                          : 'Ver detalhes da entrega'
                                      }
                                    >
                                      {hasSubitens ? 'Ver entrega (pai)' : 'Ver entrega'}
                                    </button>
                                  )}
                                  {canApproveParentRow && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openChecklistEntregaReviewModal(etapa, index);
                                      }}
                                      className={btn.primarySoft}
                                      title="Ver entrega e decidir aprovar ou recusar na modal"
                                    >
                                      {hasSubitens && subsPendentesReview.length > 0
                                        ? `Avaliar (${subsPendentesReview.length} sub)`
                                        : 'Avaliar entrega'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Item principal — mobile: layout em bloco */}
                              <div
                                className={`md:hidden flex flex-wrap items-center gap-2 p-3 rounded-lg transition-colors ${
                                  podeMarcarChecklist ? 'hover:bg-white/10' : ''
                                } ${getChecklistItemStyle(statusItemDisplay)} ${
                                  subsAguardandoAprovacao && !isExpanded
                                    ? 'ring-1 ring-amber-400/50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.15)]'
                                    : ''
                                }`}
                              >
                                <div
                                  role="button"
                                  aria-disabled={cadastroCheckboxDisabled}
                                  tabIndex={cadastroCheckboxDisabled ? -1 : 0}
                                  onKeyDown={(e) => {
                                    if (!cadastroCheckboxDisabled && (e.key === 'Enter' || e.key === ' ')) {
                                      e.preventDefault();
                                      handleCadastroCheckboxClick();
                                    }
                                  }}
                                  className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${
                                    cadastroCheckboxDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                                  } ${getCheckboxStyle(paiCheckboxMarcado, cadastroCheckboxDisabled)}`}
                                  onClick={handleCadastroCheckboxClick}
                                  title={cadastroCheckboxTitle}
                                >
                                  {paiCheckboxMarcado && (
                                    <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className={`text-sm block truncate ${getChecklistTextStyle(paiCheckboxMarcado)}`}>
                                    {itemNumberLabel} {item.texto}
                                    {!hasSubitens && (
                                      <span className="text-white/45 font-normal whitespace-nowrap">
                                        {' '}
                                        · {displayPontosTarefaChecklist(item.pontos)}{' '}
                                        {displayPontosTarefaChecklist(item.pontos) === 1 ? 'pt' : 'pts'}
                                      </span>
                                    )}
                                    {hasSubitens && (
                                      <span className="text-white/40 font-normal whitespace-nowrap">
                                        {' '}
                                        · {item.subitens!.length} sub ({computeSubitemPtsFraction(item.pontos, item.subitens!.length)} pt/sub · soma = {displayPontosTarefaChecklist(item.pontos)})
                                      </span>
                                    )}
                                  </span>
                                  {hasSubitens && subEntregasProg ? (
                                    <span className="mt-1 block text-[11px] text-white/60">
                                      Entregas:{' '}
                                      <span
                                        className={`font-semibold tabular-nums ${
                                          subEntregasProg.feitas >= subEntregasProg.total
                                            ? 'text-emerald-300'
                                            : 'text-white/90'
                                        }`}
                                      >
                                        {subEntregasProg.feitas}/{subEntregasProg.total}
                                      </span>
                                      {entregaItem?.dataEnvio ? (
                                        <span className="text-white/45">
                                          {' '}
                                          · Pai:{' '}
                                          {new Date(entregaItem.dataEnvio).toLocaleDateString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                          })}
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : null}
                                  {subsAguardandoAprovacao ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!isExpanded) toggleChecklistDetails(detailsKey);
                                      }}
                                      className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getChecklistItemStatusColor('EM_ANALISE')}`}
                                    >
                                      {!isExpanded ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" aria-hidden />
                                      ) : null}
                                      {subsEmAnalise} sub · {getChecklistItemStatusLabel('EM_ANALISE')}
                                      {!isExpanded ? ' — toque para expandir' : ''}
                                    </button>
                                  ) : null}
                                  {etapaTarefaStatusFilter !== 'all' &&
                                    etapaTarefaStatusFilter !== 'SEM_TAREFAS' &&
                                    etapaTarefaStatusFilter !== 'EM_ANALISE' &&
                                    hasSubitens &&
                                    (() => {
                                      const n = countChecklistSubitemsMatchingWorkflowFilter(
                                        etapa,
                                        index,
                                        etapaTarefaStatusFilter,
                                      );
                                      if (n <= 0) return null;
                                      return (
                                        <span className="mt-1 block text-[10px] leading-snug text-violet-200/95 [overflow-wrap:anywhere]">
                                          {n} subtarefa{n !== 1 ? 's' : ''} em «
                                          {getChecklistItemStatusLabel(etapaTarefaStatusFilter)}» na lista abaixo
                                        </span>
                                      );
                                    })()}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:flex-nowrap">
                                  <span
                                    className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${getChecklistItemStatusColor(statusItemDisplay)}`}
                                  >
                                    {getChecklistItemStatusLabel(statusItemDisplay)}
                                  </span>
                                  {subsAguardandoAprovacao && !isExpanded ? (
                                    <span
                                      className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold border ${getChecklistItemStatusColor('EM_ANALISE')}`}
                                    >
                                      {subsEmAnalise} sub p/ aprovar
                                    </span>
                                  ) : null}
                                  {(hasDetails || hasSubitens) && (
                                    <button
                                      type="button"
                                      onClick={() => toggleChecklistDetails(detailsKey)}
                                      className={`${btn.editSm} shrink-0`}
                                      title={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes e subitens'}
                                    >
                                      {hasSubitens ? `(${item.subitens!.length})` : ''} {isExpanded ? '▲' : '▼'}
                                    </button>
                                  )}
                                  {entregaItem && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedViewEntrega({ etapa, index, entrega: entregaItem });
                                        setShowViewEntregaModal(true);
                                      }}
                                      className={`${btn.primarySoft} shrink-0 whitespace-nowrap`}
                                      title={
                                        hasSubitens
                                          ? 'Ver detalhes da entrega da tarefa pai'
                                          : 'Ver detalhes da entrega'
                                      }
                                    >
                                      {hasSubitens ? 'Ver entrega (pai)' : 'Ver entrega'}
                                    </button>
                                  )}
                                </div>
                                {canApproveParentRow && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openChecklistEntregaReviewModal(etapa, index);
                                    }}
                                    className={`${btn.primarySoft} w-full`}
                                  >
                                    {hasSubitens && subsPendentesReview.length > 0
                                      ? `Avaliar (${subsPendentesReview.length} sub)`
                                      : 'Avaliar entrega'}
                                  </button>
                                )}
                              </div>
                              
                              {/* Detalhes expandidos (descrição + subitens) */}
                              {isExpanded && (
                                <div className="ml-4 pl-4 sm:ml-8 border-l-2 border-sky-500/30 space-y-2 py-2">
                                  {/* Descrição do item */}
                                  {hasDetails && (
                                    <div className="p-3 bg-sky-500/5 rounded-lg border border-sky-500/20">
                                      <p className="text-xs text-sky-300/70 mb-1 font-medium">Descrição:</p>
                                      <p className="text-sm text-white/80 whitespace-pre-wrap">{item.descricao}</p>
                                    </div>
                                  )}
                                  
                                  {/* Subitens: cada subitem tem sua própria entrega (data, status e ações) */}
                                {hasSubitens && (
                                    <div className="space-y-1">
                                      <p className="text-xs text-sky-300/70 font-medium mb-1">Subitens / Subcategorias (cada um com entrega independente):</p>
                                      <div className="grid grid-cols-[auto_1fr_4rem_auto_auto] gap-2 px-2 py-1 text-[10px] text-white/50 border-b border-white/10 mb-1">
                                        <span></span>
                                        <span>Subtarefa</span>
                                        <span className="text-center">Entrega</span>
                                        <span>Status</span>
                                        <span className="text-right">Ações</span>
                                      </div>
                                      {item.subitens!.map((subitem, subIndex) => {
                                        const subKey = `view-${etapa.id}-${index}-${subIndex}`;
                                        const subExpanded = expandedChecklistDetails.has(subKey);
                                        const subHasDetails = subitem.descricao && subitem.descricao.trim().length > 0;
                                        const subFeita = isChecklistUnitConcluidaParaProgressoTimeline(etapa, {
                                          checklistIndex: index,
                                          subitemIndex: subIndex,
                                        });
                                        // Buscar entrega do subitem (comparação robusta: índices podem vir como number ou string do JSON)
                                        const entregaSubitem = findChecklistEntregaForUnit(etapa, index, subIndex);
                                        if (
                                          etapaEntreguePorFilter !== 'all' &&
                                          !checklistEntregaDoUsuario(
                                            etapa,
                                            index,
                                            etapaEntreguePorFilter,
                                            subIndex,
                                          )
                                        ) {
                                          return null;
                                        }
                                        const baseStatusSubitem = getChecklistUnitStatus(etapa, {
                                          checklistIndex: index,
                                          subitemIndex: subIndex,
                                        });
                                        const statusSubitem = getChecklistUnitWorkflowStatus(etapa, {
                                          checklistIndex: index,
                                          subitemIndex: subIndex,
                                        });
                                        const canApproveSubitem =
                                          canUserReviewDeliveriesOnEtapa(etapa) &&
                                          mayReviewThisDeliveryExecutor(
                                            entregaSubitem?.executorId ?? entregaSubitem?.executor?.id,
                                          ) &&
                                          baseStatusSubitem === 'EM_ANALISE';
                                        const subLoading = reviewLoading[`sub-${etapa.id}-${index}-${subIndex}`] ?? false;
                                        const subItemNumberLabel = `${etapaNumero}.${index + 1}.${subIndex + 1}`;
                                        
                                        return (
                                          <div key={subIndex} className="space-y-1">
                                            <div
                                              className={`grid grid-cols-[auto_1fr_4rem_auto_auto] gap-2 items-center p-2 rounded-md transition-all ${
                                                subFeita
                                                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                                                  : 'bg-white/5 border border-white/10'
                                              }`}
                                            >
                                              <div
                                                className={`w-4 h-4 rounded border flex items-center justify-center ${
                                                  subFeita
                                                    ? 'bg-emerald-500/30 border-emerald-400/50'
                                                    : 'border-slate-400/40'
                                                }`}
                                                title={
                                                  subFeita
                                                    ? 'Concluída (cadastro ou entrega aprovada)'
                                                    : 'Pendente — conclua via entrega aprovada ou marque a tarefa pai no cadastro'
                                                }
                                              >
                                                {subFeita && (
                                                  <svg className="w-3 h-3 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                  </svg>
                                                )}
                                              </div>
                                              <span className={`text-xs min-w-0 truncate ${subFeita ? 'text-emerald-300/70 line-through' : 'text-white/80'}`}>
                                                {subItemNumberLabel} {subitem.texto}
                                                <span className="text-white/40 font-normal">
                                                  {' '}
                                                  · {computeSubitemPtsFraction(item.pontos, item.subitens!.length)} pt
                                                </span>
                                              </span>
                                              <span className="text-[10px] text-white/60 text-center">
                                                {entregaSubitem?.dataEnvio
                                                  ? new Date(entregaSubitem.dataEnvio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                  : '—'}
                                              </span>
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getChecklistItemStatusColor(statusSubitem)}`}
                                              >
                                                {getChecklistItemStatusLabel(statusSubitem)}
                                              </span>
                                              <div className="flex flex-wrap items-center justify-end gap-1">
                                              {entregaSubitem && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedViewEntrega({ etapa, index, entrega: entregaSubitem });
                                                    setShowViewEntregaModal(true);
                                                  }}
                                                  className={`${btn.primarySoft} shrink-0 whitespace-nowrap`}
                                                  title="Ver detalhes da entrega desta subtarefa"
                                                >
                                                  Ver entrega
                                                </button>
                                              )}
                                              {canApproveSubitem && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setChecklistReviewQueue([]);
                                                    openChecklistEntregaReviewModal(etapa, index, {
                                                      subitemIndex: subIndex,
                                                    });
                                                  }}
                                                  className={btn.primarySoft}
                                                  title="Ver entrega e decidir na modal"
                                                >
                                                  Avaliar
                                                </button>
                                              )}
                                              {canApproveSubitem && (
                                                <input
                                                  type="text"
                                                  value={reviewNotes[`sub-${etapa.id}-${index}-${subIndex}`] ?? ''}
                                                  onChange={(e) =>
                                                    setReviewNotes((prev) => ({
                                                      ...prev,
                                                      [`sub-${etapa.id}-${index}-${subIndex}`]: e.target.value,
                                                    }))
                                                  }
                                                  placeholder="Comentário (opcional)"
                                                  disabled={subLoading}
                                                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-w-0 max-w-[8rem]"
                                                />
                                              )}
                                              {subHasDetails && (
                                                <button
                                                  type="button"
                                                  onClick={() => toggleChecklistDetails(subKey)}
                                                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border border-slate-400/30 transition-colors"
                                                >
                                                  {subExpanded ? '▲' : '▼'}
                                                </button>
                                              )}
                                              </div>
                                            </div>
                                            {/* Descrição do subitem expandida */}
                                            {subExpanded && subHasDetails && (
                                              <div className="ml-6 p-3 bg-sky-500/5 rounded-lg border border-sky-500/20">
                                                <p className="text-xs text-sky-300/70 mb-1 font-medium">Descrição:</p>
                                                <p className="text-sm text-white/80 whitespace-pre-wrap">{subitem.descricao}</p>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {isExecutor && 
                       ['PENDENTE', 'EM_ANDAMENTO', 'REPROVADA'].includes(etapa.status) && 
                       !temItensMarcados && (
                        <div>
                        </div>
                      )}
                    </div>
                  )}

                  {etapa.subetapas.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <label className="text-xs text-white/70 mb-2 block">
                        Passos da etapa ({etapa.subetapas.length})
                      </label>
                      <div className="space-y-1">
                        {etapa.subetapas.map((sub) => (
                          <div key={sub.id} className="text-sm text-white/80 flex items-center justify-between">
                            <span>• {sub.nome}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(sub.status)}`}>
                              {getStatusLabel(sub.status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Estoque da Etapa */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <label className="text-xs text-white/70 block font-medium mb-2">
                      Estoque
                    </label>
                    
                    {loadingEstoqueCompras[etapa.id] ? (
                      <p className="text-xs text-white/50">Carregando...</p>
                    ) : (
                      <div className="space-y-2">
                        {etapaEstoque[etapa.id] && etapaEstoque[etapa.id].length > 0 ? (
                          <div>
                            <p className="text-xs text-white/60 mb-1">Estoque ({etapaEstoque[etapa.id].length}):</p>
                            <div className="space-y-1">
                              {etapaEstoque[etapa.id].map((item: any) => (
                                <div key={item.id} className="text-xs text-white/80 flex items-center justify-between bg-white/5 p-2 rounded">
                                  <span>{item.item} - Qtd Alocada: {item.quantidade}</span>
                                  <span className="text-primary">
                                    {item.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-white/50">Nenhum item de estoque relacionado</p>
                        )}
                      </div>
                    )}
                  </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </section>
        </div>
        )}
      </div>

      {/* Compras */}
      {/* Compras Relacionadas */}
      <div className="bg-neutral/80 border border-white/10 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-lg font-semibold border-b border-white/10 pb-2">
            Compras Relacionadas ({project.compras.length})
          </h3>
          {canManageEtapas && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {project.etapas.length > 1 && (
                <select
                  value={selectedEtapaForCompra?.id || ''}
                  onChange={(e) => {
                    const etapaId = Number(e.target.value);
                    const etapa = project.etapas.find((et) => et.id === etapaId);
                    setSelectedEtapaForCompra(etapa ?? null);
                    setCompraForm((prev) => ({
                      ...prev,
                      setorId: etapa?.setores?.[0]?.id,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/30 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2.5rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">
                    Selecione a etapa
                  </option>
                  {project.etapas.map((etapa) => (
                    <option key={etapa.id} value={etapa.id} className="bg-neutral text-white">
                      {etapa.nome}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  // Se houver apenas uma etapa, selecionar automaticamente
                  if (project.etapas.length === 1) {
                    setSelectedEtapaForCompra(project.etapas[0]);
                    setCompraForm({
                      setorId: project.etapas[0]?.setores?.[0]?.id,
                      pagoPor: [],
                    });
                    setCompraLineItems([createEmptyPurchaseLineItem()]);
                    setShowCompraModal(true);
                  } else if (selectedEtapaForCompra) {
                    // Se houver múltiplas etapas e uma já foi selecionada
                    setCompraForm({
                      setorId: selectedEtapaForCompra?.setores?.[0]?.id,
                      pagoPor: [],
                    });
                    setCompraLineItems([createEmptyPurchaseLineItem()]);
                    setShowCompraModal(true);
                  } else {
                    setError('Selecione uma etapa antes de solicitar a compra');
                  }
                }}
                disabled={project.etapas.length > 1 && !selectedEtapaForCompra}
                className={btn.primary}
              >
                + Solicitar Compra
              </button>
            </div>
          )}
        </div>

        {project.compras.length > 0 ? (
          <DataTable<Compra>
            data={filteredCompras}
            keyExtractor={(c) => c.id}
            emptyMessage="Nenhuma compra relacionada a este projeto"
            paginate
            initialPageSize={20}
            rowClassName={(c) => c.status === 'REPROVADO' ? 'bg-red-500/10' : ''}
            renderMobileCard={(c) => (
              <div className={`border rounded-xl p-4 space-y-3 ${c.status === 'REPROVADO' ? 'bg-red-500/10 border-red-500/30' : 'bg-neutral/60 border-white/10'}`}>
                {/* Cabeçalho: nome do item + status */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-white truncate flex-1">{c.item}</p>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${getStatusColor(c.status)}`}>
                    {getStatusLabel(c.status)}
                  </span>
                </div>
                {/* Motivo de rejeição */}
                {c.status === 'REPROVADO' && c.motivoRejeicao && (
                  <p className="text-xs text-red-300">Motivo: {c.motivoRejeicao}</p>
                )}
                {/* Grid: Qtd / Valor Unitário / Total */}
                <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-lg p-3">
                  <div className="text-center">
                    <p className="text-xs text-white/50 mb-0.5">Qtd</p>
                    <p className="text-sm font-bold text-white">{c.quantidade}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-white/50 mb-0.5">Unitário</p>
                    <p className="text-xs font-medium text-white/80">
                      {c.valorUnitario
                        ? c.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-white/50 mb-0.5">Total</p>
                    <p className="text-xs font-semibold text-white">
                      {c.valorUnitario
                        ? (c.quantidade * c.valorUnitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'Aguardando'}
                    </p>
                  </div>
                </div>
                {canManageEtapas && (
                  <div className="pt-1 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => handleDeleteCompra(c)}
                      disabled={deletingCompraId === c.id}
                      className={btn.dangerSm}
                    >
                      {deletingCompraId === c.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </div>
                )}
              </div>
            )}
            columns={[
              {
                key: 'item',
                label: 'Item',
                render: (c) => (
                  <div>
                    <div>{c.item}</div>
                    {c.status === 'REPROVADO' && c.motivoRejeicao && (
                      <div className="text-xs text-red-300 mt-1">Motivo: {c.motivoRejeicao}</div>
                    )}
                  </div>
                ),
              },
              {
                key: 'quantidade',
                label: 'Quantidade',
                render: (c) => <span>{c.quantidade}</span>,
              },
              {
                key: 'valorUnitario',
                label: 'Valor Unitário',
                render: (c) => (
                  <span>
                    {c.valorUnitario
                      ? c.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : 'Aguardando cotação'}
                  </span>
                ),
              },
              {
                key: 'total',
                label: 'Total',
                render: (c) => (
                  <span className="font-semibold">
                    {c.valorUnitario
                      ? (c.quantidade * c.valorUnitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : 'Aguardando cotação'}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (c) => (
                  <span className={`px-2 py-1 rounded text-xs ${getStatusColor(c.status)}`}>
                    {getStatusLabel(c.status)}
                  </span>
                ),
              },
              ...(canManageEtapas
                ? [
                    {
                      key: 'acoes' as const,
                      label: 'Ações' as const,
                      stopRowClick: true,
                      render: (c: Compra) => (
                        <div className="flex items-center gap-1.5 flex-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteCompra(c)}
                            disabled={deletingCompraId === c.id}
                            className={btn.dangerSm}
                          >
                            {deletingCompraId === c.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ] satisfies DataTableColumn<Compra>[]}
          />
        ) : (
          <p className="text-white/50 text-sm">Nenhuma compra relacionada a este projeto</p>
        )}
      </div>
      
      {/* Modal Enviar Entrega */}
      {showEntregaModal && selectedEntregaEtapa && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Enviar entrega</h2>
                <p className="text-sm text-white/60 mt-1">{selectedEntregaEtapa.nome}</p>
              </div>
              <button
                type="button"
                onClick={handleCloseEntregaModal}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitEntrega} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Descrição do trabalho realizado <span className="text-danger">*</span>
                </label>
                <textarea
                  value={entregaDescricao}
                  onChange={(e) => setEntregaDescricao(e.target.value)}
                  required
                  minLength={5}
                  rows={4}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-3 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Explique o que foi realizado nesta etapa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Imagem (opcional)
                </label>
                <FileDropInput
                  accept="image/*"
                  onFilesSelected={(files) => {
                    void handleEntregaImagemChange(files[0]);
                  }}
                  className="w-full text-sm text-white/80 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                  dropMessage="Solte a imagem aqui"
                />
                <p className="text-xs text-white/50 mt-1">
                  Anexe uma foto que comprove o andamento ou conclusão do trabalho.
                </p>
                {entregaPreview && (
                  <img
                    src={entregaPreview}
                    alt="Pré-visualização"
                    className="mt-3 rounded-md border border-white/20 max-h-48 object-cover"
                  />
                )}
              </div>

              {entregaError && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
                  {entregaError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={handleCloseEntregaModal}
                  className={btn.secondary}
                  disabled={enviandoEntrega}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={btn.primary}
                  disabled={enviandoEntrega}
                >
                  {enviandoEntrega ? 'Enviando...' : 'Enviar para revisão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visualizar Entrega */}
      {showViewEntregaModal && selectedViewEntrega && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full min-w-0 max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <div className="px-6 py-4 border-b border-white/20 flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <h2 className="text-xl font-semibold text-white">Detalhes da Entrega</h2>
                {checklistReviewQueue.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-200/90">
                    Após salvar, abrirá a próxima subtarefa pendente ({checklistReviewQueue.length} restante
                    {checklistReviewQueue.length !== 1 ? 's' : ''}).
                  </p>
                ) : null}
                {(() => {
                  const etapaNumero = etapaNumeroMap.get(selectedViewEntrega.etapa.id) ?? 1;
                  const checklistItem = selectedViewEntrega.etapa.checklistJson?.[selectedViewEntrega.index];
                  const subIdx = selectedViewEntrega.entrega.subitemIndex;
                  const isSubitem = subIdx != null && Number(subIdx) >= 0;
                  const subitemLabel = isSubitem && checklistItem?.subitens?.[Number(subIdx)]
                    ? `${etapaNumero}.${selectedViewEntrega.index + 1}.${Number(subIdx) + 1}. ${checklistItem.subitens[Number(subIdx)].texto}`
                    : null;
                  const mainLabel = checklistItem ? `${etapaNumero}.${selectedViewEntrega.index + 1}. ${checklistItem.texto}` : `Tarefa #${selectedViewEntrega.index + 1}`;
                  return (
                    <>
                      <p className="text-sm text-white/60 mt-1 break-words [overflow-wrap:anywhere]">
                        {selectedViewEntrega.etapa.nome} • {subitemLabel ?? mainLabel}
                      </p>
                      {subitemLabel && (
                        <p className="text-xs text-white/40 mt-1 break-words [overflow-wrap:anywhere]">
                          Subtarefa de: {checklistItem?.texto}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowViewEntregaModal(false);
                  setSelectedViewEntrega(null);
                  setChecklistReviewQueue([]);
                }}
                className="shrink-0 text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 min-w-0 overflow-x-hidden">
              {/* (() => {
                // Usuário pode editar se for executor ou integrante da etapa
                const executorId = selectedViewEntrega.etapa.executor.id;
                const integrantesIds =
                  selectedViewEntrega.etapa.integrantes?.map((i) => i.usuario.id).filter(Boolean) || [];
                const userId = user?.id ? Number(user.id) : null;
                const canEditFromModal =
                  !!userId &&
                  (userId === Number(executorId) ||
                    integrantesIds.some((id: number) => Number(id) === userId));

                return (
                  canEditFromModal && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setShowViewEntregaModal(false);
                          setSelectedChecklistEtapa(selectedViewEntrega.etapa);
                          setSelectedChecklistIndex(selectedViewEntrega.index);
                          setSelectedSubitemIndex(selectedViewEntrega.entrega.subitemIndex ?? null);
                          setObjetivoDescricao(selectedViewEntrega.entrega.descricao || '');
                          setObjetivoImagens([]);
                          setObjetivoDocumentos([]);
                          setObjetivoPreviews([]);
                          setObjetivoError(null);
                          setObjetivoLoading(false);
                          setShowChecklistModal(true);
                        }}
                        className={btn.primarySoft}
                      >
                        Editar entrega
                      </button>
                    </div>
                  )
                );
              })() */}
              <div className="min-w-0">
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Descrição
                </label>
                <div className="w-full min-w-0 max-w-full bg-white/10 border border-white/30 rounded-md px-4 py-3 text-white whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-h-[100px]">
                  {selectedViewEntrega.entrega.descricao || 'Não informada'}
                </div>
              </div>

              {(() => {
                const imagens =
                  selectedViewEntrega.entrega.imagensUrls &&
                  Array.isArray(selectedViewEntrega.entrega.imagensUrls) &&
                  selectedViewEntrega.entrega.imagensUrls.length > 0
                    ? selectedViewEntrega.entrega.imagensUrls
                    : selectedViewEntrega.entrega.imagemUrl
                      ? [selectedViewEntrega.entrega.imagemUrl]
                      : [];
                const documentos =
                  selectedViewEntrega.entrega.documentosUrls &&
                  Array.isArray(selectedViewEntrega.entrega.documentosUrls) &&
                  selectedViewEntrega.entrega.documentosUrls.length > 0
                    ? selectedViewEntrega.entrega.documentosUrls
                    : selectedViewEntrega.entrega.documentoUrl
                      ? [selectedViewEntrega.entrega.documentoUrl]
                      : [];
                const arquivos = [...imagens, ...documentos];
                if (arquivos.length === 0) return null;
                return (
                  <AttachmentList
                    raw={arquivos}
                    title={`Arquivos da entrega (${arquivos.length})`}
                    variant="grid"
                  />
                );
              })()}

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Enviado por</label>
                  <p className="text-sm text-white/90">
                    {selectedViewEntrega.entrega.executor?.nome ?? 'Usuário'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Data de envio</label>
                  <p className="text-sm text-white/90">
                    {new Date(selectedViewEntrega.entrega.dataEnvio).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Situação atual</label>
                  <span
                    className={`inline-block px-3 py-1.5 rounded-md text-xs font-semibold ${getChecklistItemStatusColor(
                      selectedViewEntrega.entrega.status || 'PENDENTE',
                    )}`}
                  >
                    {getChecklistItemStatusLabel(selectedViewEntrega.entrega.status || 'PENDENTE')}
                  </span>
                </div>
                {selectedViewEntrega.entrega.avaliadoPor && (
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Avaliado por</label>
                    <p className="text-sm text-white/90">
                      {selectedViewEntrega.entrega.avaliadoPor.nome}
                    </p>
                  </div>
                )}
              </div>

              {selectedViewEntrega.entrega.comentario && (
                <ReviewerCommentBox
                  text={selectedViewEntrega.entrega.comentario}
                  label="Comentário da avaliação"
                  variant="warning"
                />
              )}

              {/* Alterar decisão (em análise, aprovada ou reprovada) — quem pode aprovar entregas */}
              {(() => {
                const statusEntrega = (selectedViewEntrega.entrega.status as string) || 'PENDENTE';
                const podeAlterarDecisao =
                  (statusEntrega === 'EM_ANALISE' ||
                    statusEntrega === 'APROVADO' ||
                    statusEntrega === 'REPROVADO') &&
                  canUserReviewDeliveriesOnEtapa(selectedViewEntrega.etapa) &&
                  mayReviewThisDeliveryExecutor(
                    selectedViewEntrega.entrega.executorId ?? selectedViewEntrega.entrega.executor?.id,
                  );
                if (!podeAlterarDecisao) return null;
                const subIdx = selectedViewEntrega.entrega.subitemIndex;
                const query =
                  subIdx != null ? { params: { subitemIndex: Number(subIdx) } } : {};
                return (
                  <div className="pt-4 border-t border-white/20 space-y-3">
                    <p className="text-xs text-amber-200/90">
                      Você pode corrigir a decisão (aprovar ou reprovar) mesmo após a avaliação. Pontos e progresso são
                      ajustados no servidor.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-1">Nova decisão</label>
                      <AppSelect
                        value={viewEntregaStatusDraft}
                        onChange={(v) => setViewEntregaStatusDraft(v as 'APROVADO' | 'REPROVADO')}
                        options={[
                          { value: 'APROVADO', label: 'Aprovado' },
                          { value: 'REPROVADO', label: 'Reprovado' },
                        ]}
                        selectClassName="w-full"
                      />
                    </div>
                    <label className="block text-sm font-medium text-white/90">Comentário (opcional)</label>
                    <textarea
                      value={modalReviewComment}
                      onChange={(e) => setModalReviewComment(e.target.value)}
                      rows={4}
                      maxLength={4000}
                      placeholder="Comentário da avaliação"
                      disabled={modalReviewLoading}
                      className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-y min-h-[5rem]"
                    />
                    <p className="text-[11px] text-white/45 text-right tabular-nums">
                      {modalReviewComment.length}/4000
                    </p>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        disabled={modalReviewLoading}
                        onClick={async () => {
                          const current = statusEntrega;
                          const commentTrim = modalReviewComment.trim();
                          const origComment = (selectedViewEntrega.entrega.comentario || '').trim();
                          const statusIguais =
                            (current === 'APROVADO' || current === 'REPROVADO') &&
                            viewEntregaStatusDraft === current;
                          const comentarioIgual = commentTrim === origComment;
                          if (statusIguais && comentarioIgual) {
                            toast.info('Nada para alterar.');
                            return;
                          }
                          setModalReviewLoading(true);
                          try {
                            await api.patch(
                              `/tasks/${selectedViewEntrega.etapa.id}/checklist/${selectedViewEntrega.index}/review`,
                              {
                                status: viewEntregaStatusDraft,
                                comentario: commentTrim || undefined,
                              },
                              query,
                            );
                            const refreshed = await refreshProject(false);
                            toast.success('Avaliação atualizada.');
                            await continueChecklistReviewQueueAfterSave(refreshed);
                          } catch (err: any) {
                            toast.error(err.response?.data?.message ?? 'Falha ao atualizar a avaliação.');
                          } finally {
                            setModalReviewLoading(false);
                          }
                        }}
                        className={btn.primary}
                      >
                        {modalReviewLoading ? 'Salvando...' : 'Salvar avaliação'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewEntregaModal(false);
                    setSelectedViewEntrega(null);
                    setChecklistReviewQueue([]);
                  }}
                  className={btn.secondary}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Aba */}
      {showAbaModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Nova aba de etapas</h2>
              <button
                type="button"
                onClick={() => setShowAbaModal(false)}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmNovaAba} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Nome da nova aba
                </label>
                <input
                  type="text"
                  value={novaAbaNome}
                  onChange={(e) => setNovaAbaNome(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: Software, Hardware, Geral 2..."
                  maxLength={60}
                  autoFocus
                />
                <p className="text-xs text-white/60 mt-1">
                  Essa aba será usada para agrupar etapas do mesmo tipo neste projeto.
                </p>
                {selectedSessaoId !== 'all' && (
                  <p className="text-xs text-sky-200/90 mt-2 rounded-md bg-sky-500/10 border border-sky-500/25 px-3 py-2">
                    <span className="font-medium">Sessão alvo:</span>{' '}
                    {selectedSessaoId === null
                      ? 'Sem sessão'
                      : project.sessoes?.find((s) => s.id === selectedSessaoId)?.nome ??
                        `Sessão #${selectedSessaoId}`}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => setShowAbaModal(false)}
                  className={btn.secondary}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={selectedSessaoId === 'all'}
                  className={btn.primary}
                >
                  Continuar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Renomear Aba */}
      {showRenameAbaModal && selectedAba !== ABA_VISUALIZACAO_TODAS && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Renomear aba</h2>
              <button
                type="button"
                onClick={() => setShowRenameAbaModal(false)}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!project || selectedAba === ABA_VISUALIZACAO_TODAS) return;

                const from = selectedAba;
                const to = renameAbaNome.trim();
                if (!to || to.length < 2) {
                  toast.warning('Informe um novo nome de aba com pelo menos 2 caracteres.');
                  return;
                }

                try {
                  setAbaModalLoading(true);
                  setError(null);
                  // Escopo: quando uma sessão específica está selecionada, restringe a ela.
                  // 'all' (todas as sessões) ⇒ não envia sessaoId; null ⇒ etapas sem sessão; número ⇒ aquela sessão.
                  const renamePayload: { from: string; to: string; sessaoId?: number | null } = {
                    from,
                    to,
                  };
                  if (selectedSessaoId !== 'all') {
                    renamePayload.sessaoId = selectedSessaoId;
                  }
                  await api.patch(`/projects/${project.id}/abas/rename`, renamePayload);
                  // Atualizar seleção e limpar cache de abas extras
                  setSelectedAba(to);
                  setExtraAbasPorSessao((prev) => {
                    const next: Record<string, string[]> = {};
                    for (const [k, list] of Object.entries(prev)) {
                      const mapped = list
                        .map((a) => (a === from ? to : a))
                        .filter((a, i, arr) => arr.indexOf(a) === i);
                      if (mapped.length > 0) next[k] = mapped;
                    }
                    return next;
                  });
                  await refreshProject(false);
                  toast.success('Aba renomeada com sucesso.');
                  setShowRenameAbaModal(false);
                } catch (err: any) {
                  const msg = formatApiError(err);
                  setError(msg);
                  toast.error(msg);
                } finally {
                  setAbaModalLoading(false);
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Nome atual
                </label>
                <p className="text-sm text-white/80 bg-white/5 border border-white/20 rounded-md px-4 py-2.5">
                  {selectedAba}
                </p>
              </div>

              <div className="text-xs text-white/70 bg-white/5 border border-white/20 rounded-md px-3 py-2">
                Escopo: <span className="font-semibold text-white">{descreverEscopoSessaoAtual()}</span>.
                {selectedSessaoId === 'all' && (
                  <span className="block mt-1 text-amber-300">
                    A aba será renomeada em <strong>todas as sessões</strong> que tenham esse nome.
                    Para limitar a uma sessão, selecione-a no filtro «Sessão» antes.
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Novo nome da aba
                </label>
                <input
                  type="text"
                  value={renameAbaNome}
                  onChange={(e) => setRenameAbaNome(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: Software, Hardware, Geral 2..."
                  maxLength={60}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => setShowRenameAbaModal(false)}
                  className={btn.secondary}
                  disabled={abaModalLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={btn.primary}
                  disabled={abaModalLoading}
                >
                  {abaModalLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Excluir Aba */}
      {showDeleteAbaModal && selectedAba !== ABA_VISUALIZACAO_TODAS && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-danger/40 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-danger/40 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-danger">Excluir aba</h2>
              <button
                type="button"
                onClick={() => setShowDeleteAbaModal(false)}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/80">
                Tem certeza que deseja excluir a aba <span className="font-semibold">{selectedAba}</span>?
              </p>
              <div className="text-xs text-white/70 bg-white/5 border border-white/20 rounded-md px-3 py-2">
                Escopo: <span className="font-semibold text-white">{descreverEscopoSessaoAtual()}</span>.
                {selectedSessaoId === 'all' && (
                  <span className="block mt-1 text-amber-300">
                    A aba será removida de <strong>todas as sessões</strong> que tenham esse nome.
                    Para limitar a uma sessão, selecione-a no filtro «Sessão» antes.
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60">
                As etapas que usam essa aba não serão apagadas. Elas apenas voltarão para a categoria geral (sem aba específica).
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => setShowDeleteAbaModal(false)}
                  className={btn.secondary}
                  disabled={abaModalLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!project || selectedAba === ABA_VISUALIZACAO_TODAS) return;
                    try {
                      setAbaModalLoading(true);
                      setError(null);
                      const deletePayload: { name: string; sessaoId?: number | null } = {
                        name: selectedAba,
                      };
                      if (selectedSessaoId !== 'all') {
                        deletePayload.sessaoId = selectedSessaoId;
                      }
                      await api.patch(`/projects/${project.id}/abas/delete`, deletePayload);
                      setExtraAbasPorSessao((prev) => {
                        const next: Record<string, string[]> = {};
                        for (const [k, list] of Object.entries(prev)) {
                          const filtered = list.filter((a) => a !== selectedAba);
                          if (filtered.length > 0) next[k] = filtered;
                        }
                        return next;
                      });
                      setSelectedAba(ABA_VISUALIZACAO_TODAS);
                      await refreshProject(false);
                      toast.success('Aba excluída com sucesso.');
                      setShowDeleteAbaModal(false);
                    } catch (err: any) {
                      const msg = formatApiError(err);
                      setError(msg);
                      toast.error(msg);
                    } finally {
                      setAbaModalLoading(false);
                    }
                  }}
                  className={btn.danger}
                  disabled={abaModalLoading}
                >
                  {abaModalLoading ? 'Excluindo...' : 'Excluir aba'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Sessão */}
      {showSessaoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Nova sessão</h2>
              <button type="button" onClick={() => setShowSessaoModal(false)} className="text-white/50 hover:text-white text-2xl">✕</button>
            </div>
            <form onSubmit={handleCreateSessao} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Nome da sessão</label>
                <input
                  type="text"
                  value={novaSessaoNome}
                  onChange={(e) => setNovaSessaoNome(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ex: Módulo 1, Fase Inicial..."
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowSessaoModal(false)} className={btn.secondary}>Cancelar</button>
                <button type="submit" disabled={sessaoModalLoading || !novaSessaoNome.trim()} className={btn.primary}>
                  {sessaoModalLoading ? 'Criando...' : 'Criar sessão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Sessão */}
      {editingSessao && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Editar sessão</h2>
              <button type="button" onClick={() => { setEditingSessao(null); setEditSessaoNome(''); }} className="text-white/50 hover:text-white text-2xl">✕</button>
            </div>
            <form onSubmit={handleUpdateSessao} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Nome</label>
                <input
                  type="text"
                  value={editSessaoNome}
                  onChange={(e) => setEditSessaoNome(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Nome da sessão"
                  maxLength={120}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setEditingSessao(null); setEditSessaoNome(''); }} className={btn.secondary}>Cancelar</button>
                <button type="submit" disabled={sessaoModalLoading || !editSessaoNome.trim()} className={btn.primary}>
                  {sessaoModalLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Excluir Sessão */}
      {showDeleteSessaoModal && sessaoToDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-white mb-2">Excluir sessão</h2>
            <p className="text-white/80 mb-4">
              Tem certeza que deseja excluir a sessão <span className="font-semibold">{sessaoToDelete.nome}</span>?
              As etapas desta sessão ficarão sem sessão (podem ser reatribuídas depois).
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowDeleteSessaoModal(false); setSessaoToDelete(null); }} className={btn.secondary}>Cancelar</button>
              <button type="button" onClick={handleDeleteSessao} disabled={sessaoModalLoading} className={btn.danger}>
                {sessaoModalLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Etapa */}
      {showEtapaModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/20 px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">
                {editingEtapa ? 'Editar Etapa' : 'Adicionar Etapa'}
              </h2>
              <button
                onClick={() => {
                  setShowEtapaModal(false);
                  setError(null);
                  setEditingEtapa(null);
                  setEtapaForm({
                    nome: '',
                    descricao: '',
                    sessaoId: undefined,
                    aba: '',
                    setorIds: [],
                    participantesIds: [],
                    excludedAutoIntegranteIds: [],
                    dataInicio: '',
                    dataFim: '',
                    valorInsumos: 0,
                    checklist: [createEmptyChecklistItem()],
                    status: 'PENDENTE',
                    estoqueItems: [],
                  });
                  setChecklistIntegrantesBusca({});
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateEtapa} className="p-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Nome da Etapa *</label>
                <input
                  type="text"
                  required
                  value={etapaForm.nome}
                  onChange={(e) => setEtapaForm({ ...etapaForm, nome: e.target.value })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: Planejamento inicial"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Descrição</label>
                <textarea
                  value={etapaForm.descricao}
                  onChange={(e) => setEtapaForm({ ...etapaForm, descricao: e.target.value })}
                  rows={4}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Descreva o contexto e os detalhes desta etapa..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Sessão</label>
                <select
                  value={etapaForm.sessaoId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEtapaForm({ ...etapaForm, sessaoId: v === '' ? undefined : Number(v) });
                  }}
                  className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                >
                  <option value="">Nenhuma</option>
                  {project?.sessoes?.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
                <p className="text-xs text-white/50 mt-1">Hierarquia: Sessão → Aba → Etapa</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Aba / Categoria
                </label>
                <select
                  value={etapaForm.aba || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__nova__') {
                      handleAddAba();
                      return;
                    }
                    setEtapaForm({ ...etapaForm, aba: value });
                  }}
                  className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    paddingRight: '2.5rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">
                    {abas.filter((a) => a !== ABA_VISUALIZACAO_TODAS).length === 0
                      ? 'Nenhuma aba cadastrada ainda'
                      : 'Selecione uma aba...'}
                  </option>
                  {abas
                    .filter((a) => a !== ABA_VISUALIZACAO_TODAS)
                    .map((abaNome) => (
                      <option key={abaNome} value={abaNome} className="bg-neutral text-white">
                        {abaNome}
                      </option>
                    ))}
                  <option value="__nova__" className="bg-neutral text-primary">
                    + Criar nova aba...
                  </option>
                </select>
                <p className="text-xs text-white/50 mt-1">
                  As abas são usadas para organizar etapas do mesmo tipo. Você também pode criar uma nova aba pelo botão acima da lista de etapas.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Setores da Etapa</label>
                {allowedEtapaSetores.length === 0 ? (
                  <p className="text-xs text-white/50">Nenhum setor disponível para este projeto.</p>
                ) : (
                  <div className="space-y-2">
                    {allowedEtapaSetores.map((setor) => {
                      const checked = etapaForm.setorIds.includes(setor.id);
                      return (
                        <label key={setor.id} className="flex items-center gap-3 text-sm text-white/85">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setEtapaForm((prev) => {
                                const prevSetorIds = prev.setorIds;
                                const nextSetorIds = isChecked
                                  ? Array.from(new Set([...prevSetorIds, setor.id]))
                                  : prevSetorIds.filter((id) => id !== setor.id);
                                const prevAuto = computeAutoMemberIds(prevSetorIds);
                                const nextAuto = computeAutoMemberIds(nextSetorIds);

                                const manualIds = prev.participantesIds.filter((id) => !prevAuto.includes(id));

                                const autoAllowed = nextAuto.filter(
                                  (id) => !prev.excludedAutoIntegranteIds.includes(id),
                                );

                                const nextParticipantesIds = Array.from(new Set([...manualIds, ...autoAllowed]));

                                return { ...prev, setorIds: nextSetorIds, participantesIds: nextParticipantesIds };
                              });
                            }}
                            className="accent-primary"
                          />
                          <span className="whitespace-normal break-words">{setor.nome}</span>
                        </label>
                      );
                    })}
                    {etapaForm.setorIds.length === 0 && (
                      <p className="text-xs text-white/50">Nenhum setor selecionado</p>
                    )}
                  </div>
                )}
              </div>

              {editingEtapa && canEditProjectInfo && (
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Status da Etapa</label>
                  <select
                    value={etapaForm.status}
                    onChange={(e) => setEtapaForm({ ...etapaForm, status: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-neutral text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Participantes da etapa *</label>
                <select
                  ref={integrantesSelectRef}
                  value=""
                  onChange={(e) => {
                    const selectedUserId = Number(e.target.value);
                    if (selectedUserId && !etapaForm.participantesIds.includes(selectedUserId)) {
                      setEtapaForm((prev) => ({
                        ...prev,
                        participantesIds: [...prev.participantesIds, selectedUserId],
                        excludedAutoIntegranteIds: prev.excludedAutoIntegranteIds.filter((id) => id !== selectedUserId),
                      }));
                    }
                    if (integrantesSelectRef.current) {
                      integrantesSelectRef.current.value = '';
                    }
                  }}
                  className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="" className="bg-neutral text-white">Selecione um participante...</option>
                  {users
                    .filter((user) => {
                      if (!user) return false;
                      const isAutoMember = etapaAutoMemberIdsSet.has(user.id);
                      const isProjectIntegrante =
                        project?.responsaveis?.some((resp) => resp.usuario?.id === user.id) || false;
                      const isSupervisor = project?.supervisor?.id === user.id;
                      return (
                        (isAutoMember || isProjectIntegrante || isSupervisor) &&
                        !etapaForm.participantesIds.includes(user.id)
                      );
                    })
                    .map((user) => {
                      if (!user) return null;
                      const cargoNome = typeof user.cargo === 'string' 
                        ? user.cargo 
                        : (user.cargo?.nome || 'Sem cargo');
                      return (
                        <option key={user.id} value={user.id} className="bg-neutral text-white">
                          {user.nome} ({cargoNome})
                        </option>
                      );
                    })}
                </select>
                {etapaForm.participantesIds.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {etapaForm.participantesIds.map((participanteId) => {
                      const participante = users.find((u) => u && u.id === participanteId);
                      if (!participante) return null;
                      const cargoNome = typeof participante.cargo === 'string' 
                        ? participante.cargo 
                        : (participante.cargo?.nome || 'Sem cargo');
                      return (
                        <div
                          key={participanteId}
                          className="flex items-center justify-between bg-white/5 border border-white/10 rounded-md px-3 py-2"
                        >
                          <span className="text-sm text-white/90">
                            {participante.nome} ({cargoNome})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEtapaForm((prev) => {
                                const autoIdsNow = computeAutoMemberIds(prev.setorIds);
                                const isAutoMember = autoIdsNow.includes(participanteId);
                                const nextParticipantesIds = prev.participantesIds.filter((id) => id !== participanteId);
                                const nextExcludedAuto = isAutoMember
                                  ? Array.from(new Set([...prev.excludedAutoIntegranteIds, participanteId]))
                                  : prev.excludedAutoIntegranteIds;

                                return {
                                  ...prev,
                                  participantesIds: nextParticipantesIds,
                                  excludedAutoIntegranteIds: nextExcludedAuto,
                                  checklist: prev.checklist.map((row) => {
                                    const ids = row.integrantesIds?.filter((id) => id !== participanteId);
                                    if (!ids || ids.length === 0) {
                                      const copy = { ...row };
                                      delete copy.integrantesIds;
                                      return copy;
                                    }
                                    return { ...row, integrantesIds: ids };
                                  }),
                                };
                              });
                            }}
                            className="text-danger hover:text-danger/80 text-sm font-medium transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {etapaForm.participantesIds.length === 0 && (
                  <p className="text-xs text-white/50 mt-2">Nenhum participante adicionado ainda</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Data Início</label>
                  <input
                    type="datetime-local"
                    value={etapaForm.dataInicio}
                    onChange={(e) => setEtapaForm({ ...etapaForm, dataInicio: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Data Fim</label>
                  <input
                    type="datetime-local"
                    value={etapaForm.dataFim}
                    onChange={(e) => setEtapaForm({ ...etapaForm, dataFim: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Valor de Insumos (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={etapaForm.valorInsumos}
                  onChange={(e) => setEtapaForm({ ...etapaForm, valorInsumos: Number(e.target.value) })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Tarefas da etapa</label>
                <div className="space-y-4">
                  {etapaForm.checklist.map((item, index) => {
                    const formItemKey = `form-${index}`;
                    const isFormExpanded = expandedChecklistDetails.has(formItemKey);
                    
                    return (
                      <div key={`checklist-item-${index}`} className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-3">
                        {/* Linha principal: texto + botões */}
                        <div className="flex gap-2 flex-wrap items-end">
                          <input
                            type="text"
                            value={item.texto}
                            onChange={(e) => {
                              const newChecklist = [...etapaForm.checklist];
                              newChecklist[index] = { ...newChecklist[index], texto: e.target.value };
                              setEtapaForm({ ...etapaForm, checklist: newChecklist });
                            }}
                            className="flex-1 min-w-[12rem] bg-white/10 border border-white/30 rounded-md px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            placeholder={`Objeto ${index + 1}`}
                          />
                          {/* Pontos: só GM/DIRETOR editam; demais veem valor (novas tarefas = 1 no servidor). */}
                          {(item.subitens?.length ?? 0) === 0 ? (
                            <div className="flex flex-col gap-0.5 shrink-0 w-[4.75rem]">
                              <label className="text-[10px] text-white/50 whitespace-nowrap">Pontos</label>
                              {podeEditarPontosChecklist ? (
                                <NumericInput
                                  integer
                                  min={1}
                                  max={9999}
                                  value={displayPontosTarefaChecklist(item.pontos)}
                                  onValueChange={(v) => {
                                    const next = v == null || v < 1 ? 1 : Math.min(9999, Math.floor(v));
                                    const newChecklist = [...etapaForm.checklist];
                                    newChecklist[index] = { ...newChecklist[index], pontos: next };
                                    setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                  }}
                                  className="w-full bg-white/10 border border-white/30 rounded-md px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                />
                              ) : (
                                <div
                                  className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-2 text-sm text-white/90 tabular-nums text-center"
                                  title="Apenas GM pode alterar os pontos. Novas tarefas criadas por você valem 1 ponto."
                                >
                                  {displayPontosTarefaChecklist(item.pontos)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5 shrink-0 w-[5.5rem]">
                              <label className="text-[10px] text-white/50 whitespace-nowrap">Pts total</label>
                              {podeEditarPontosChecklist ? (
                                <NumericInput
                                  integer
                                  min={1}
                                  max={9999}
                                  value={displayPontosTarefaChecklist(item.pontos)}
                                  onValueChange={(v) => {
                                    const next = v == null || v < 1 ? 1 : Math.min(9999, Math.floor(v));
                                    const newChecklist = [...etapaForm.checklist];
                                    newChecklist[index] = { ...newChecklist[index], pontos: next };
                                    setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                  }}
                                  className="w-full bg-white/10 border border-white/30 rounded-md px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                  title={`${displayPontosTarefaChecklist(item.pontos)} pt ÷ ${item.subitens!.length} = ${computeSubitemPtsFraction(item.pontos, item.subitens!.length)} pt/sub · soma = ${displayPontosTarefaChecklist(item.pontos)}`}
                                />
                              ) : (
                                <div
                                  className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-2 text-sm text-white/90 tabular-nums text-center"
                                  title="Apenas GM pode alterar os pontos. Novas tarefas criadas por você valem 1 ponto."
                                >
                                  {displayPontosTarefaChecklist(item.pontos)}
                                </div>
                              )}
                              <span className="text-[9px] text-white/35 whitespace-nowrap text-center leading-relaxed">
                                ÷{item.subitens!.length} = {computeSubitemPtsFraction(item.pontos, item.subitens!.length)} pt/sub
                                <br />
                                soma = {displayPontosTarefaChecklist(item.pontos)}
                              </span>
                            </div>
                          )}
                          {etapaForm.checklist.length > 1 && (
                            <span className="flex items-center gap-0.5" title="Ordem do item">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => {
                                  const newChecklist = [...etapaForm.checklist];
                                  [newChecklist[index - 1], newChecklist[index]] = [newChecklist[index], newChecklist[index - 1]];
                                  setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                }}
                                className="p-1.5 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/80"
                                aria-label="Subir item"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={index === etapaForm.checklist.length - 1}
                                onClick={() => {
                                  const newChecklist = [...etapaForm.checklist];
                                  [newChecklist[index], newChecklist[index + 1]] = [newChecklist[index + 1], newChecklist[index]];
                                  setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                }}
                                className="p-1.5 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/80"
                                aria-label="Descer item"
                              >
                                ↓
                              </button>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleChecklistDetails(formItemKey)}
                            className="px-3 py-2 rounded-md bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border border-slate-400/30 transition-colors text-sm"
                            title={isFormExpanded ? 'Ocultar detalhes' : 'Expandir detalhes'}
                          >
                            {isFormExpanded ? '▲' : '▼'}
                          </button>
                          {etapaForm.checklist.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newChecklist = etapaForm.checklist.filter((_, i) => i !== index);
                                setChecklistIntegrantesBusca({});
                                setEtapaForm({ ...etapaForm, checklist: newChecklist });
                              }}
                              className={btn.dangerSm}
                            >
                              Remover
                            </button>
                          )}
                        </div>
                        
                        {/* Detalhes expandidos: descrição + subitens */}
                        {isFormExpanded && (
                          <div className="space-y-3 pl-2 border-l-2 border-white/10">
                            {/* Campo de descrição */}
                            <div>
                              <label className="block text-xs text-white/60 mb-1">Descrição / Detalhes (opcional)</label>
                              <textarea
                                value={item.descricao || ''}
                                onChange={(e) => {
                                  const newChecklist = [...etapaForm.checklist];
                                  newChecklist[index] = { ...newChecklist[index], descricao: e.target.value };
                                  setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                }}
                                rows={2}
                                className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="Descreva detalhes adicionais sobre este item..."
                              />
                            </div>

                            <div className="space-y-2 pt-1 border-t border-white/10">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs text-white/60 font-medium">
                                  Integrantes nesta tarefa (Meu trabalho)
                                </span>
                                <div className="flex gap-2 text-[11px]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEtapaForm((prev) => {
                                        const newChecklist = [...prev.checklist];
                                        const row = { ...newChecklist[index] };
                                        delete row.integrantesIds;
                                        newChecklist[index] = row;
                                        return { ...prev, checklist: newChecklist };
                                      });
                                    }}
                                    className="text-white/50 hover:text-white/80 underline underline-offset-2"
                                  >
                                    Limpar (todos veem)
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-white/45">
                                Se ninguém estiver marcado, <span className="text-white/65">todos</span> os integrantes
                                da etapa veem este item. Se marcar alguém, <span className="text-white/65">só</span> as
                                pessoas selecionadas veem em Meu trabalho.
                              </p>
                              {etapaForm.participantesIds.length === 0 ? (
                                <p className="text-xs text-amber-200/85 bg-amber-500/10 border border-amber-400/25 rounded-md px-2 py-1.5">
                                  Adicione participantes à etapa (acima) para poder restringir esta tarefa por pessoa.
                                </p>
                              ) : (
                                <>
                                  <input
                                    type="search"
                                    value={checklistIntegrantesBusca[index] ?? ''}
                                    onChange={(e) =>
                                      setChecklistIntegrantesBusca((prev) => ({
                                        ...prev,
                                        [index]: e.target.value,
                                      }))
                                    }
                                    placeholder="Buscar integrante por nome..."
                                    className="w-full rounded-md border border-white/15 bg-neutral/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    autoComplete="off"
                                  />
                                  {(() => {
                                    const qRaw = (checklistIntegrantesBusca[index] ?? '').trim().toLowerCase();
                                    const integrantesRows = etapaForm.participantesIds.map((uid) => {
                                      const u = users.find((x) => x && x.id === uid);
                                      if (u) return u;
                                      return {
                                        id: uid,
                                        nome: `Usuário #${uid}`,
                                        email: '',
                                        cargo: '—',
                                      } as Usuario;
                                    });
                                    const filtrados = integrantesRows.filter((u) => {
                                      if (!qRaw) return true;
                                      return u.nome.toLowerCase().includes(qRaw);
                                    });
                                    return (
                                      <>
                                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-white/45">
                                          <span>
                                            {qRaw
                                              ? `${filtrados.length} de ${integrantesRows.length} na busca`
                                              : `${integrantesRows.length} integrante(s) — role a lista para ver todos`}
                                          </span>
                                        </div>
                                        <div className="max-h-[min(22rem,55vh)] overflow-y-auto overflow-x-hidden rounded-md border border-white/10 bg-neutral/40 divide-y divide-white/10 scroll-py-1">
                                          {filtrados.length === 0 ? (
                                            <p className="px-3 py-4 text-sm text-white/45 text-center">
                                              Nenhum integrante encontrado para esta busca.
                                            </p>
                                          ) : (
                                            filtrados.map((u) => {
                                              const selected = item.integrantesIds?.includes(u.id) ?? false;
                                              return (
                                                <label
                                                  key={u.id}
                                                  className="flex min-h-[2.25rem] items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    className="rounded border-white/30 bg-neutral/80 text-primary focus:ring-primary shrink-0"
                                                    checked={selected}
                                                    onChange={() => {
                                                      setEtapaForm((prev) => {
                                                        const newChecklist = [...prev.checklist];
                                                        const row = { ...newChecklist[index] };
                                                        const cur = new Set(row.integrantesIds ?? []);
                                                        if (cur.has(u.id)) cur.delete(u.id);
                                                        else cur.add(u.id);
                                                        const arr = [...cur].sort((a, b) => a - b);
                                                        if (arr.length === 0) {
                                                          delete row.integrantesIds;
                                                        } else {
                                                          row.integrantesIds = arr;
                                                        }
                                                        newChecklist[index] = row;
                                                        return { ...prev, checklist: newChecklist };
                                                      });
                                                    }}
                                                  />
                                                  <span className="text-sm text-white/90 truncate">{u.nome}</span>
                                                </label>
                                              );
                                            })
                                          )}
                                        </div>
                                      </>
                                    );
                                  })()}
                                  <p className="text-xs text-white/50">
                                    {(item.integrantesIds?.length ?? 0) === 0
                                      ? 'Todos os integrantes veem este item'
                                      : `${item.integrantesIds!.length} integrante(s) selecionado(s)`}
                                  </p>
                                </>
                              )}
                            </div>
                            
                            {/* Subitens */}
                            <div>
                              <label className="block text-xs text-white/60 mb-2">Subitens / Subcategorias</label>
                              <div className="space-y-2">
                                {(item.subitens || []).map((subitem, subIndex) => {
                                  const subFormKey = `form-${index}-${subIndex}`;
                                  const isSubExpanded = expandedChecklistDetails.has(subFormKey);
                                  
                                  return (
                                    <div key={`subitem-${index}-${subIndex}`} className="bg-white/5 border border-white/10 rounded-md p-2 space-y-2">
                                      <div className="flex gap-2 items-center flex-wrap">
                                        <span className="text-white/40 text-xs shrink-0">↳</span>
                                        <input
                                          type="text"
                                          value={subitem.texto}
                                          onChange={(e) => {
                                            const newChecklist = [...etapaForm.checklist];
                                            const newSubitens = [...(newChecklist[index].subitens || [])];
                                            newSubitens[subIndex] = { ...newSubitens[subIndex], texto: e.target.value };
                                            newChecklist[index] = { ...newChecklist[index], subitens: newSubitens };
                                            setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                          }}
                                          className="flex-1 min-w-[10rem] bg-white/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
                                          placeholder={`Subtarefa ${subIndex + 1}`}
                                        />
                                        {/* Pontos exibidos (somente leitura — derivado do item pai) */}
                                        <span
                                          className="shrink-0 min-w-[3.5rem] text-center text-[11px] text-white/50 bg-white/5 border border-white/10 rounded px-2 py-1.5"
                                          title={`${displayPontosTarefaChecklist(item.pontos)} ÷ ${item.subitens?.length ?? 1} = ${computeSubitemPtsFraction(item.pontos, item.subitens?.length ?? 1)} pt`}
                                        >
                                          {computeSubitemPtsFraction(item.pontos, item.subitens?.length ?? 1)} pt
                                        </span>
                                        {(item.subitens?.length ?? 0) > 1 && (
                                          <span className="flex items-center gap-0.5">
                                            <button
                                              type="button"
                                              disabled={subIndex === 0}
                                              onClick={() => {
                                                const newChecklist = [...etapaForm.checklist];
                                                const newSubitens = [...(newChecklist[index].subitens || [])];
                                                [newSubitens[subIndex - 1], newSubitens[subIndex]] = [newSubitens[subIndex], newSubitens[subIndex - 1]];
                                                newChecklist[index] = { ...newChecklist[index], subitens: newSubitens };
                                                setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                              }}
                                              className="p-1 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white/80 text-xs"
                                              aria-label="Subir subtarefa"
                                            >↑</button>
                                            <button
                                              type="button"
                                              disabled={subIndex === (item.subitens?.length ?? 0) - 1}
                                              onClick={() => {
                                                const newChecklist = [...etapaForm.checklist];
                                                const newSubitens = [...(newChecklist[index].subitens || [])];
                                                [newSubitens[subIndex], newSubitens[subIndex + 1]] = [newSubitens[subIndex + 1], newSubitens[subIndex]];
                                                newChecklist[index] = { ...newChecklist[index], subitens: newSubitens };
                                                setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                              }}
                                              className="p-1 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white/80 text-xs"
                                              aria-label="Descer subtarefa"
                                            >↓</button>
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => toggleChecklistDetails(subFormKey)}
                                          className="px-2 py-1 rounded text-xs bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border border-slate-400/30 transition-colors"
                                        >
                                          {isSubExpanded ? '▲' : '▼'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newChecklist = [...etapaForm.checklist];
                                            const newSubitens = (newChecklist[index].subitens || []).filter((_, i) => i !== subIndex);
                                            newChecklist[index] = { ...newChecklist[index], subitens: newSubitens };
                                            setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                          }}
                                          className="px-2 py-1 rounded text-xs bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30 transition-colors"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      {/* Descrição do subitem */}
                                      {isSubExpanded && (
                                        <div className="ml-4">
                                          <textarea
                                            value={subitem.descricao || ''}
                                            onChange={(e) => {
                                              const newChecklist = [...etapaForm.checklist];
                                              const newSubitens = [...(newChecklist[index].subitens || [])];
                                              newSubitens[subIndex] = { ...newSubitens[subIndex], descricao: e.target.value };
                                              newChecklist[index] = { ...newChecklist[index], subitens: newSubitens };
                                              setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                            }}
                                            rows={2}
                                            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
                                            placeholder="Descrição da subtarefa (opcional)..."
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newChecklist = [...etapaForm.checklist];
                                    const currentSubitens = newChecklist[index].subitens || [];
                                    newChecklist[index] = {
                                      ...newChecklist[index],
                                      subitens: [...currentSubitens, createEmptyChecklistSubItem()],
                                    };
                                    setEtapaForm({ ...etapaForm, checklist: newChecklist });
                                  }}
                                  className="w-full py-1.5 rounded text-xs bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 border-dashed transition-colors"
                                >
                                  + Adicionar subtarefa
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setEtapaForm({
                        ...etapaForm,
                        checklist: [...etapaForm.checklist, createEmptyChecklistItem()],
                      });
                    }}
                    className={`${btn.secondary} w-full`}
                  >
                    + Adicionar Item
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Itens do Estoque</label>
                <EtapaEstoqueItemsField
                  key={editingEtapa ? `estoque-${editingEtapa.id}` : 'estoque-nova'}
                  items={availableStockItems}
                  loading={loadingStockItems}
                  value={etapaForm.estoqueItems}
                  onChange={(estoqueItems) => setEtapaForm((prev) => ({ ...prev, estoqueItems }))}
                  onError={(msg) => {
                    if (msg) setError(msg);
                  }}
                />
              </div>

              {error && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end space-x-4 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowEtapaModal(false);
                    setError(null);
                    setEditingEtapa(null);
                    setEtapaForm({
                      nome: '',
                      descricao: '',
                      sessaoId: undefined,
                      aba: '',
                      setorIds: [],
                      participantesIds: [],
                      excludedAutoIntegranteIds: [],
                      dataInicio: '',
                      dataFim: '',
                      valorInsumos: 0,
                      checklist: [createEmptyChecklistItem()],
                      status: 'PENDENTE',
                      estoqueItems: [],
                    });
                    setChecklistIntegrantesBusca({});
                  }}
                  className={btn.secondaryLg}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={btn.primaryLg}
                >
                  {submitting ? (editingEtapa ? 'Salvando...' : 'Criando...') : editingEtapa ? 'Salvar Alterações' : 'Criar Etapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar Compra a partir de Etapa */}
      {showCompraModal && selectedEtapaForCompra && project && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/20 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Solicitar Compra</h2>
                <p className="text-sm text-white/60 mt-1">Etapa: {selectedEtapaForCompra.nome}</p>
              </div>
              <button
                onClick={() => {
                  setShowCompraModal(false);
                  setSelectedEtapaForCompra(null);
                  setError(null);
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSubmitting(true);
                setError(null);
                try {
                  const validLines = compraLineItems.filter(
                    (line) =>
                      line.item.trim().length >= 2 &&
                      line.quantidade != null &&
                      Number(line.quantidade) > 0,
                  );
                  if (validLines.length === 0) {
                    setError('Adicione pelo menos um item com nome e quantidade válidos.');
                    setSubmitting(false);
                    return;
                  }
                  const shared = {
                    projetoId: project.id,
                    etapaId: selectedEtapaForCompra.id,
                    setorId: compraForm.setorId ?? validLines[0]?.setorId,
                    pagoPor: compraForm.pagoPor,
                  };
                  let created = 0;
                  for (const line of validLines) {
                    const body = buildPurchasePayloadFromLine(line, shared);
                    if (!body) continue;
                    await api.post('/stock/purchases', body);
                    created += 1;
                  }
                  if (created === 0) {
                    setError('Nenhum item pôde ser registrado.');
                    setSubmitting(false);
                    return;
                  }
                  toast.success(
                    created === 1
                      ? 'Compra solicitada com sucesso!'
                      : `${created} itens solicitados na mesma compra!`,
                  );
                  setShowCompraModal(false);
                  setSelectedEtapaForCompra(null);
                  setCompraForm({
                    setorId: selectedEtapaForCompra.setores?.[0]?.id,
                    pagoPor: [],
                  });
                  setCompraLineItems([createEmptyPurchaseLineItem()]);
                  await loadEtapaEstoqueCompras(selectedEtapaForCompra.id);
                  await refreshProject();
                } catch (err: any) {
                  const message = err.response?.data?.message ?? 'Erro ao criar compra';
                  setError(typeof message === 'string' ? message : JSON.stringify(message));
                } finally {
                  setSubmitting(false);
                }
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-4">
                {compraLineItems.map((line, lineIdx) => (
                  <div key={lineIdx} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <PurchaseRequestFields
                      value={
                        lineIdx === 0
                          ? { ...line, setorId: compraForm.setorId ?? line.setorId }
                          : line
                      }
                      onChange={(next) => {
                        setCompraLineItems((prev) =>
                          prev.map((row, i) => (i === lineIdx ? next : row)),
                        );
                        if (lineIdx === 0 && next.setorId !== undefined) {
                          setCompraForm((prev) => ({ ...prev, setorId: next.setorId }));
                        }
                      }}
                      setores={selectedEtapaForCompra.setores ?? []}
                      showSetor={lineIdx === 0 && (selectedEtapaForCompra.setores ?? []).length > 0}
                      showQuoteSelector
                      showObservacao
                      quoteOptionalText="(opcional - se não houver, será criado como pedido de compra)"
                      lineIndex={lineIdx + 1}
                      lineCount={compraLineItems.length}
                      onAddLineItem={
                        lineIdx === compraLineItems.length - 1
                          ? () => setCompraLineItems((prev) => [...prev, createEmptyPurchaseLineItem()])
                          : undefined
                      }
                      onRemoveLineItem={
                        compraLineItems.length > 1
                          ? () => setCompraLineItems((prev) => prev.filter((_, i) => i !== lineIdx))
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>

              <PagoPorListEditor
                value={compraForm.pagoPor}
                onChange={(pagoPor) => setCompraForm((prev) => ({ ...prev, pagoPor }))}
                users={users.map((u) => ({ id: u.id, nome: u.nome }))}
                metodos={metodosPago}
                onRefreshMetodos={async () => {
                  try {
                    const { data } = await api.get<PagoPorMetodoOption[]>('/stock/pago-por-metodos');
                    setMetodosPago(Array.isArray(data) ? data : []);
                  } catch {
                    /* ignore */
                  }
                }}
                disabled={submitting}
              />

              {error && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowCompraModal(false);
                    setSelectedEtapaForCompra(null);
                    setError(null);
                  }}
                  className={btn.secondary}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={btn.primary}
                >
                  {submitting ? 'Criando...' : 'Criar Compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de criação de evento do projeto */}
      {showProjectEventModal && project && canManageCalendarEvents && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/10 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Novo evento / viagem</h3>
              <button
                type="button"
                onClick={() => setShowProjectEventModal(false)}
                className="text-white/50 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProjectEvent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Título <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={projectEventForm.titulo}
                  onChange={(e) =>
                    setProjectEventForm((prev) => ({ ...prev, titulo: e.target.value }))
                  }
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={200}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Descrição</label>
                <textarea
                  value={projectEventForm.descricao}
                  onChange={(e) =>
                    setProjectEventForm((prev) => ({ ...prev, descricao: e.target.value }))
                  }
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={2000}
                />
              </div>

              <CalendarioEventoDatetimeFields
                value={{
                  dataInicio: projectEventForm.dataInicio,
                  dataFim: projectEventForm.dataFim,
                  horaInicio: projectEventForm.horaInicio,
                  horaFim: projectEventForm.horaFim,
                  diaInteiro: projectEventForm.diaInteiro,
                }}
                onChange={(next) => setProjectEventForm((prev) => ({ ...prev, ...next }))}
                labelClass="block text-sm text-white/70 mb-1"
                inputClass="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <div>
                <label className="block text-sm text-white/70 mb-1">Público-alvo</label>
                <select
                  value={projectEventForm.alvo}
                  onChange={(e) =>
                    setProjectEventForm((prev) => ({
                      ...prev,
                      alvo: e.target.value as 'TODOS_USUARIOS' | 'SELECIONADOS',
                      usuarioIds:
                        e.target.value === 'TODOS_USUARIOS' ? [] : prev.usuarioIds,
                    }))
                  }
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="SELECIONADOS" className="bg-neutral text-white">
                    Integrantes selecionados
                  </option>
                  <option value="TODOS_USUARIOS" className="bg-neutral text-white">
                    Todos os usuários ativos
                  </option>
                </select>
              </div>

              {projectEventForm.alvo === 'SELECIONADOS' && (
                <div>
                  <label className="block text-sm text-white/70 mb-2">
                    Integrantes que receberão notificação
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-white/10 rounded-md p-2 space-y-1">
                    {users.length === 0 ? (
                      <p className="text-xs text-white/45">Nenhum usuário disponível.</p>
                    ) : (
                      users.map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 text-sm text-white/85 cursor-pointer py-1"
                        >
                          <input
                            type="checkbox"
                            checked={projectEventForm.usuarioIds.includes(u.id)}
                            onChange={() => toggleProjectEventParticipant(u.id)}
                            className="accent-primary"
                          />
                          {u.nome}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowProjectEventModal(false)}
                  className={btn.secondaryLg}
                  disabled={projectEventSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={projectEventSubmitting}>
                  {projectEventSubmitting ? 'Salvando...' : 'Criar evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Deleção de Etapa */}
      {showDeleteEtapaModal && etapaToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-white mb-4">Confirmar Exclusão</h2>
            <p className="text-white/80 mb-6">
              Tem certeza que deseja deletar a etapa <strong>"{etapaToDelete.nome}"</strong>?
              <br />
              <span className="text-sm text-white/60">Esta ação não pode ser desfeita.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteEtapaModal(false);
                  setEtapaToDelete(null);
                }}
                className={btn.secondary}
                disabled={deletingEtapa}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEtapa}
                disabled={deletingEtapa}
                className={btn.danger}
              >
                {deletingEtapa ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Projeto */}
      {showEditProjectModal && project && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/10 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                Editar Projeto
              </h3>
              <button
                onClick={() => {
                  setShowEditProjectModal(false);
                  setEditProjectError(null);
                }}
                className="text-white/50 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitEditProject} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Nome do Projeto <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={editProjectForm.nome}
                  onChange={(e) =>
                    setEditProjectForm((prev) => ({ ...prev, nome: e.target.value }))
                  }
                  className="w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 border-white/10 focus:ring-primary"
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Resumo</label>
                <textarea
                  value={editProjectForm.resumo}
                  onChange={(e) =>
                    setEditProjectForm((prev) => ({ ...prev, resumo: e.target.value }))
                  }
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Objetivo do projeto</label>
                <textarea
                  value={editProjectForm.objetivo}
                  onChange={(e) =>
                    setEditProjectForm((prev) => ({ ...prev, objetivo: e.target.value }))
                  }
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Descrição detalhada do projeto
                </label>
                <textarea
                  value={projectDescricaoTexto}
                  onChange={(e) => setProjectDescricaoTexto(e.target.value)}
                  placeholder="Descreva o projeto, contexto, escopo, observações gerais..."
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-white/60 mb-1">
                      Arquivos e imagens do projeto
                    </label>
                    <FileDropInput
                      multiple
                      onFilesSelected={async (files) => {
                        if (!files.length) return;
                        for (const f of files) {
                          const erro = validateDescricaoProjetoFileSize(f);
                          if (erro) {
                            setProjectDescricaoError(erro);
                            toast.error(erro);
                            return;
                          }
                        }
                        try {
                          setProjectDescricaoSaving(true);
                          setProjectDescricaoError(null);
                          const formData = new FormData();
                          files.forEach((file) => formData.append('files', file));
                          const { data } = await api.post<ProjetoArquivo[]>(
                            `/projects/${project.id}/descricao-files`,
                            formData,
                            { headers: { 'Content-Type': 'multipart/form-data' } },
                          );
                          if (Array.isArray(data)) {
                            setProjectDescricaoArquivos(data);
                          }
                        } catch (err: any) {
                          const message = formatApiError(err);
                          setProjectDescricaoError(message);
                          toast.error(message);
                        } finally {
                          setProjectDescricaoSaving(false);
                        }
                      }}
                      className="mt-1 block w-full text-sm text-white/80 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/80 file:text-white hover:file:bg-primary transition-colors cursor-pointer"
                      dropMessage="Solte arquivos do projeto aqui"
                    />
                    <p className="text-xs text-white/45 mt-1">
                      Limite de {UPLOAD_LIMITS.descricaoProjeto.maxMb} MB por arquivo.
                    </p>
                  </div>
                  {projectDescricaoArquivos.length > 0 && (() => {
                    const gallery = buildProjetoArquivosGallery(projectDescricaoArquivos);
                    return (
                    <div className="mt-1 space-y-2 max-h-40 overflow-y-auto bg-black/10 rounded-md p-2">
                      {projectDescricaoArquivos.map((file, index) => {
                        const isImage = file.mimeType?.startsWith('image/');
                        const displayName = file.originalName || file.url;
                        const gi = projectDescricaoArquivos.findIndex((f) => f.url === file.url);
                        return (
                          <div
                            key={`${file.url}-${index}`}
                            className="flex items-center gap-3 text-xs text-white/80"
                          >
                            {isImage && (
                              <FilePreviewTrigger
                                src={file.url}
                                name={displayName}
                                variant="thumbnail"
                                gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                                className="shrink-0 w-12 h-12 rounded-md overflow-hidden border border-white/10 hover:border-primary/80 transition-colors"
                                title="Visualizar imagem"
                              >
                                <img
                                  src={resolveFileUrl(file.url)}
                                  alt={displayName}
                                  className="w-full h-full object-cover"
                                />
                              </FilePreviewTrigger>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="truncate">
                                {!isImage && '📎 '}{displayName}
                              </p>
                              <div className="mt-1 flex items-center gap-2">
                                <FilePreviewTrigger
                                  src={file.url}
                                  name={displayName}
                                  gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                                  className="inline-flex items-center px-2 py-0.5 rounded border border-white/20 text-[11px] hover:border-primary hover:text-primary transition-colors"
                                >
                                  Abrir
                                </FilePreviewTrigger>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const { data } = await api.delete<ProjetoArquivo[]>(
                                        `/projects/${project.id}/descricao-files`,
                                        { data: { url: file.url } },
                                      );
                                      if (Array.isArray(data)) {
                                        setProjectDescricaoArquivos(data);
                                      }
                                    } catch (err: any) {
                                      const message = formatApiError(err);
                                      setProjectDescricaoError(message);
                                      toast.error(message);
                                    }
                                  }}
                                  className="inline-flex items-center px-2 py-0.5 rounded border border-danger/60 text-[11px] text-danger hover:bg-danger/10 transition-colors"
                                >
                                  Remover
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}

                  {projectDescricaoError && (
                    <p className="text-xs text-danger mt-1">{projectDescricaoError}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Valor Total (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={
                    typeof editProjectForm.valorTotal === 'number'
                      ? editProjectForm.valorTotal
                      : ''
                  }
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : undefined;
                    setEditProjectForm((prev) => ({ ...prev, valorTotal: value }));
                  }}
                  className="w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 border-white/10 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Status</label>
                <select
                  value={editProjectForm.status}
                  onChange={(e) =>
                    setEditProjectForm((prev) => ({
                      ...prev,
                      status: e.target.value as 'EM_ANDAMENTO' | 'FINALIZADO',
                    }))
                  }
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="EM_ANDAMENTO">Em Andamento</option>
                  <option value="FINALIZADO">Aprovado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Setores</label>
                {setores.length === 0 ? (
                  <p className="text-xs text-white/50">Carregando setores...</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {setores.map((setor) => {
                      const checked = editProjectForm.setorIds.includes(setor.id);
                      return (
                        <label key={setor.id} className="flex items-center gap-3 text-sm text-white/85">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setEditProjectForm((prev) => {
                                const nextSetorIds = isChecked
                                  ? Array.from(new Set([...prev.setorIds, setor.id]))
                                  : prev.setorIds.filter((sid) => sid !== setor.id);
                                return {
                                  ...prev,
                                  ...mergeProjetoEquipeOnSetorChange(
                                    prev.setorIds,
                                    nextSetorIds,
                                    prev.responsavelIds,
                                    prev.excludedAutoIds,
                                    setores,
                                  ),
                                };
                              });
                            }}
                            className="h-4 w-4 rounded border-white/40 bg-neutral/60 text-primary focus:ring-primary"
                          />
                          <span className="whitespace-normal break-words">{setor.nome}</span>
                        </label>
                      );
                    })}
                    {editProjectForm.setorIds.length === 0 && (
                      <p className="text-xs text-white/50">Nenhum setor selecionado</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Supervisor *</label>
                <p className="text-xs text-white/50 mb-2">Responsável pela gestão do projeto.</p>
                <select
                  required
                  value={editProjectForm.supervisorId ?? ''}
                  onChange={(e) => {
                    const newSupervisorId = e.target.value ? Number(e.target.value) : undefined;
                    setEditProjectForm((prev) => ({
                      ...prev,
                      supervisorId: newSupervisorId,
                    }));
                  }}
                  className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    paddingRight: '2.5rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">
                    Selecione um supervisor...
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id} className="bg-neutral text-white">
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>

              <ProjetoEquipeMembrosField
                users={users}
                setores={setores}
                disabled={editProjectSubmitting}
                value={{
                  setorIds: editProjectForm.setorIds,
                  responsavelIds: editProjectForm.responsavelIds,
                  excludedAutoIds: editProjectForm.excludedAutoIds,
                  supervisorId: editProjectForm.supervisorId,
                }}
                onChange={(next) =>
                  setEditProjectForm((prev) => ({
                    ...prev,
                    setorIds: next.setorIds,
                    responsavelIds: next.responsavelIds,
                    excludedAutoIds: next.excludedAutoIds,
                  }))
                }
              />

              {editProjectError && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
                  {editProjectError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditProjectModal(false);
                    setEditProjectError(null);
                  }}
                  className={btn.secondaryLg}
                  disabled={editProjectSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={btn.primaryLg}
                  disabled={editProjectSubmitting}
                >
                  {editProjectSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
