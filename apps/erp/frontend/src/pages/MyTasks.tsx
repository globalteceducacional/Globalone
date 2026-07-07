import { useEffect, useState, useMemo, FormEvent, ChangeEvent } from 'react';
import { btn } from '../utils/buttonStyles';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { ChecklistItemEntrega, ChecklistItem } from '../types';
import { toast, formatApiError } from '../utils/toast';
import { UPLOAD_LIMITS, validateTarefaFileSize } from '../utils/uploadLimits';
import {
  canUserOpenProjectDetails,
  cargoAllowsProjectsPage,
  PROJECTS_ANALISE_ROUTE,
  TASKS_ROUTE,
  userHasPermission,
  userHasProjectDeliveryReviewerPermission,
} from '../utils/projectAccess';
import { countPendingReviewsFromEmAnalise } from '../utils/pendingReviewFromEmAnalise';
import { FilePreviewTrigger } from '../components/files/FilePreviewTrigger';
import { AttachmentList } from '../components/files/AttachmentList';
import { LinkifiedText } from '../components/common/LinkifiedText';
import { ReviewerCommentBox } from '../components/projects/ReviewerCommentBox';
import { urlsToViewerItems, useFileViewer } from '../contexts/FileViewerContext';
import { FileDropInput } from '../components/FileDropInput';
import { KpiInfo } from '../components/KpiInfo';
import { AppModal } from '../components/ui/AppModal';
import { AppSelect } from '../components/ui/AppSelect';
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
import {
  aggregateChecklistEntregaForEtapas,
  getChecklistUnitStatus,
  getChecklistUnitWorkflowStatus,
  getEtapaTimelineStatus,
  type EtapaEntregaCount,
  type EtapaTimelineStatus,
  findChecklistEntregaForUnit,
} from '../utils/etapaChecklistStatus';
import {
  formatParticipantesResumo,
  nomesParticipantesDaEtapaSemUsuario,
} from '../utils/participantesResumo';

interface Projeto {
  id: number;
  nome: string;
  resumo?: string | null;
  objetivo?: string | null;
  descricaoLonga?: string | null;
  descricaoArquivos?: { originalName: string; url: string; mimeType?: string; size?: number }[] | null;
  status: string;
  supervisor?: { id?: number; nome: string } | null;
  responsaveis?: Array<{ usuario: Usuario }>;
  progress?: number;
}

type ProjetoArquivoResumo = {
  originalName: string;
  url: string;
  mimeType?: string;
  size?: number;
};

// ChecklistItem importado de ../types

interface Usuario {
  id: number;
  nome: string;
  email: string;
}

interface Sessao {
  id: number;
  nome: string;
  ordem: number;
}

interface Etapa {
  id: number;
  nome: string;
  /** Índice 0-based usado ao ordenar dentro do projeto (fallback se `numeroNoProjeto` não vier). */
  ordem?: number;
  /** Índice 1-based da etapa no projeto (ordem global), alinhado à tela de detalhes do projeto */
  numeroNoProjeto?: number;
  descricao?: string | null;
  sessaoId?: number | null;
  aba?: string | null;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA';
  dataInicio?: string | null;
  dataFim?: string | null;
  checklistJson?: ChecklistItem[] | null;
  executorId: number;
  executor?: { id?: number; nome: string; cargo: string } | null;
  responsavelId?: number | null;
  sessao?: Sessao | null;
  integrantes?: Array<{ usuario: Usuario; checklistItemIndices?: number[] | null }>;
  /** null = ver checklist completo; número[] = só esses índices (integrante com atribuição). */
  meuTrabalhoChecklistIndices?: number[] | null;
  projeto: Projeto;
  subetapas: any[];
  entregas?: EtapaEntrega[];
  checklistEntregas?: ChecklistItemEntrega[];
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
  executor?: { id?: number; nome: string } | null;
  avaliadoPor?: { nome: string } | null;
  foiEditada?: boolean;
  dataEdicao?: string | null;
  editadoPor?: { nome: string } | null;
}

interface MyTasksResponse {
  projetos: Projeto[];
  etapasPendentes: Etapa[];
}

type DeadlineStatus = 'NONE' | 'SOON' | 'EXPIRED';
type EtapaStatusFilter = 'all' | EtapaTimelineStatus;
type EtapaPapelFilter = 'all' | 'supervisor' | 'participante' | 'coordenador';
type EtapaPrazoFilter = 'all' | 'soon' | 'expired' | 'on_time' | 'without_deadline';
/** Filtro por status das entregas de checklist (não altera o filtro de status da etapa). */
type ChecklistEntregaFilter = 'all' | 'EM_ANALISE' | 'APROVADO' | 'REPROVADO';

/** Como ordenar as etapas listadas dentro de cada projeto em Meu Trabalho. */
type EtapaOrdemFilter = 'numerica' | 'data_inicio' | 'data_fim';

function sortEtapasMyWork(etapas: Etapa[], mode: EtapaOrdemFilter): Etapa[] {
  const rows = [...etapas];
  const numeroOuOrdem = (e: Etapa): number => {
    if (typeof e.numeroNoProjeto === 'number' && Number.isFinite(e.numeroNoProjeto)) {
      return e.numeroNoProjeto;
    }
    const o = (e as { ordem?: number }).ordem;
    if (typeof o === 'number' && Number.isFinite(o)) return o;
    return Number.MAX_SAFE_INTEGER;
  };

  if (mode === 'numerica') {
    rows.sort((a, b) => numeroOuOrdem(a) - numeroOuOrdem(b) || a.id - b.id);
  } else if (mode === 'data_inicio') {
    rows.sort((a, b) => {
      const ta = a.dataInicio ? new Date(a.dataInicio).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.dataInicio ? new Date(b.dataInicio).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb || numeroOuOrdem(a) - numeroOuOrdem(b) || a.id - b.id;
    });
  } else {
    rows.sort((a, b) => {
      const ta = a.dataFim ? new Date(a.dataFim).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.dataFim ? new Date(b.dataFim).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb || numeroOuOrdem(a) - numeroOuOrdem(b) || a.id - b.id;
    });
  }
  return rows;
}

/** Mesmo valor que em `ProjectDetails.tsx`: modo «ver todas as abas», distinto de qualquer nome de aba real. */
const ABA_VISUALIZACAO_TODAS = '__view_all_abas__';

function resolveProjetoCompleto(projetoRef: Projeto, projetos: Projeto[]): Projeto {
  const full = projetos.find((p) => p.id === projetoRef.id);
  return full ? { ...projetoRef, ...full } : projetoRef;
}

/** Etapas em que o colaborador executa, integra ou é responsável direto pela etapa. */
function usuarioParticipaEtapaMyWork(
  etapa: Pick<Etapa, 'executorId' | 'responsavelId' | 'integrantes'>,
  uid: number,
): boolean {
  if (Number(etapa.executorId) === uid) return true;
  const integrantesIds = etapa.integrantes?.map((i) => i.usuario?.id).filter(Boolean) ?? [];
  if (integrantesIds.some((id) => Number(id) === uid)) return true;
  if (etapa.responsavelId != null && Number(etapa.responsavelId) === uid) return true;
  return false;
}

/** Unidades concluídas (entrega aprovada ou marcado no cadastro) só nas tarefas visíveis ao usuário. */
function getMyTasksChecklistEntregaResumo(
  etapas: EtapaEntregaCount[],
  _projeto: Projeto,
  scopeUserId?: number,
): { total: number; concluidos: number } {
  const hasChecklistData = etapas.some((e) => Array.isArray(e.checklistJson));
  const uid = scopeUserId ?? undefined;

  if (hasChecklistData) {
    const { total, aprovados } = aggregateChecklistEntregaForEtapas(etapas, uid);
    return { total, concluidos: aprovados };
  }
  return { total: 0, concluidos: 0 };
}

export default function MyTasks() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { openViewer } = useFileViewer();
  const [data, setData] = useState<MyTasksResponse>({ projetos: [], etapasPendentes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pontosUsuario, setPontosUsuario] = useState<number | null>(null);
  const [kpiDetalhe, setKpiDetalhe] = useState<'vencendo' | 'atrasadas' | null>(null);
  const [reviewQueueCounts, setReviewQueueCounts] = useState({
    tarefasParaAvaliar: 0,
    etapaEntrega: 0,
  });
  const [showEntregaModal, setShowEntregaModal] = useState(false);
  const [selectedEtapa, setSelectedEtapa] = useState<Etapa | null>(null);
  const [editingEntrega, setEditingEntrega] = useState<EtapaEntrega | null>(null);
  const [entregaDescricao, setEntregaDescricao] = useState('');
  const [entregaImagem, setEntregaImagem] = useState<string | null>(null);
  const [entregaPreview, setEntregaPreview] = useState<string | null>(null);
  const [entregaLoading, setEntregaLoading] = useState(false);
  const [entregaError, setEntregaError] = useState<string | null>(null);

  // Envio por objetivo (checklist)
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedChecklistEtapa, setSelectedChecklistEtapa] = useState<Etapa | null>(null);
  const [selectedChecklistIndex, setSelectedChecklistIndex] = useState<number | null>(null);
  const [selectedSubitemIndex, setSelectedSubitemIndex] = useState<number | null>(null);
  const [objetivoDescricao, setObjetivoDescricao] = useState('');
  const [objetivoImagens, setObjetivoImagens] = useState<string[]>([]);
  const [objetivoDocumentos, setObjetivoDocumentos] = useState<string[]>([]);
  const [objetivoPreviews, setObjetivoPreviews] = useState<{ url: string; name: string; type: 'image' | 'document' }[]>([]);
  const [objetivoLoading, setObjetivoLoading] = useState(false);
  const [objetivoError, setObjetivoError] = useState<string | null>(null);
  const [showViewEntregaModal, setShowViewEntregaModal] = useState(false);
  const [selectedViewEntrega, setSelectedViewEntrega] = useState<{ etapa: Etapa; index: number; entrega: ChecklistItemEntrega } | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  // abas selecionadas por projeto + sessão (chave: `${projetoId}-${sessaoKey}`)
  const [selectedAbasByProject, setSelectedAbasByProject] = useState<Record<string, string>>({});
  const [selectedSessoesByProject, setSelectedSessoesByProject] = useState<
    Record<number, number | null | 'all'>
  >({});
  const [expandedResumoProjects, setExpandedResumoProjects] = useState<Set<number>>(new Set());
  const [expandedObjetivoProjects, setExpandedObjetivoProjects] = useState<Set<number>>(
    new Set(),
  );
  const [expandedDescricaoProjects, setExpandedDescricaoProjects] = useState<Set<number>>(
    new Set(),
  );
  const [expandedDescricaoEtapas, setExpandedDescricaoEtapas] = useState<Set<number>>(
    new Set(),
  );
  const [etapaStatusFilter, setEtapaStatusFilter] = useState<EtapaStatusFilter>('all');
  const [etapaPapelFilter, setEtapaPapelFilter] = useState<EtapaPapelFilter>('all');
  const [etapaPrazoFilter, setEtapaPrazoFilter] = useState<EtapaPrazoFilter>('all');
  const [etapaSearchFilter, setEtapaSearchFilter] = useState('');
  const [checklistEntregaFilter, setChecklistEntregaFilter] =
    useState<ChecklistEntregaFilter>('all');
  const [etapaOrdemFilter, setEtapaOrdemFilter] = useState<EtapaOrdemFilter>('numerica');

  const resolveFileUrl = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}${url}`;
  };

  const getProjectFileKind = (file: ProjetoArquivoResumo): 'image' | 'other' => {
    const mime = String(file.mimeType || '').toLowerCase();
    const source = `${file.originalName || ''} ${file.url || ''}`.toLowerCase();
    const ext = source.split('.').pop() || '';
    if (mime.startsWith('image/')) return 'image';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) return 'image';
    return 'other';
  };

  const getTruncatedText = (text: string, maxChars: number, expanded: boolean): string => {
    const trimmed = text.trim();
    if (expanded || trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars).trimEnd()}...`;
  };

  // Estado para controlar expansão de detalhes dos itens do checklist
  // Chave: "etapaId-itemIndex" ou "etapaId-itemIndex-subIndex" para subitens
  const [expandedChecklistDetails, setExpandedChecklistDetails] = useState<Set<string>>(new Set());
  const [searchParams] = useSearchParams();

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

  const hasProjectsAccess = useMemo(() => cargoAllowsProjectsPage(user), [user]);

  const isSupervisorUser = useMemo(() => !userHasPermission(user, 'projetos:ver_todos') && !!user, [user]);

  const getDeadlineStatus = (etapa: Etapa): DeadlineStatus => {
    // Etapa concluída não deve aparecer como "atrasada".
    if (etapa.status === 'APROVADA' || getEtapaTimelineStatus(etapa) === 'FINALIZADO') {
      return 'NONE';
    }
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

  /** `silent`: não ativa o loading de tela cheia (evita “piscar” como se a página reiniciasse após enviar entrega). */
  async function fetchTasks(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    try {
      if (!silent) setLoading(true);
      const { data: responseData } = await api.get<MyTasksResponse>('/tasks/my');
      setData(responseData);
      if (userHasProjectDeliveryReviewerPermission(user)) {
        try {
          const counts = await countPendingReviewsFromEmAnalise({
            viewerUserId: user?.id != null ? Number(user.id) : null,
            viewerIsAdmin: userHasPermission(user, 'sistema:administrar'),
          });
          setReviewQueueCounts({
            tarefasParaAvaliar: counts.total,
            etapaEntrega: counts.etapasEntregaAnalise,
          });
        } catch {
          setReviewQueueCounts({ tarefasParaAvaliar: 0, etapaEntrega: 0 });
        }
      } else {
        setReviewQueueCounts({ tarefasParaAvaliar: 0, etapaEntrega: 0 });
      }
      if (silent) setError(null);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      if (silent) {
        toast.error(errorMessage);
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    api
      .get<{ pontosTarefas?: number }>(`/users/${user.id}`)
      .then(({ data: u }) => setPontosUsuario(u.pontosTarefas ?? 0))
      .catch(() => setPontosUsuario(user.pontosTarefas ?? 0));
  }, [user?.id]);

  useEffect(() => {
    if (!data) return;
    const etapaIdParam = searchParams.get('etapaId');
    if (!etapaIdParam) return;
    const etapaId = Number(etapaIdParam);
    if (!etapaId || Number.isNaN(etapaId)) return;

    const etapasPendentesLocal = Array.isArray(data.etapasPendentes) ? data.etapasPendentes : [];
    const projetosLocal = Array.isArray(data.projetos) ? data.projetos : [];

    const etapasPorProjetoLocal = etapasPendentesLocal.reduce((acc, etapa) => {
      const projetoId = etapa.projeto.id;
      if (!acc[projetoId]) {
        acc[projetoId] = {
          projeto: etapa.projeto,
          etapas: [],
        };
      }
      acc[projetoId].etapas.push(etapa);
      return acc;
    }, {} as Record<number, { projeto: Projeto; etapas: Etapa[] }>);

    const projetosComEtapasLocal = [...projetosLocal.map((projeto) => {
      const etapasDoProjeto = etapasPorProjetoLocal[projeto.id]?.etapas || [];
      return {
        projeto,
        etapas: etapasDoProjeto,
        temEtapasPendentes: etapasDoProjeto.length > 0,
      };
    })];

    Object.values(etapasPorProjetoLocal).forEach(({ projeto, etapas }) => {
      if (!projetosComEtapasLocal.find((p) => p.projeto.id === projeto.id)) {
        projetosComEtapasLocal.push({
          projeto,
          etapas,
          temEtapasPendentes: true,
        });
      }
    });

    const entry = projetosComEtapasLocal.find(({ etapas }) =>
      etapas.some((et) => et.id === etapaId),
    );
    if (!entry) return;

    const projetoId = entry.projeto.id;

    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.add(projetoId);
      return next;
    });

    setTimeout(() => {
      const el = document.getElementById(`mytasks-etapa-${etapaId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
  }, [searchParams, data]);

  const checklistResumoFiltrado = useMemo(() => {
    const etapasPendentes = Array.isArray(data.etapasPendentes) ? data.etapasPendentes : [];
    const projetos = Array.isArray(data.projetos) ? data.projetos : [];
    const etapasPendentesFiltradas = etapasPendentes.filter((etapa) =>
      matchesGlobalEtapaFilters(etapa, etapa.projeto),
    );
    const byProjeto = new Map<number, Etapa[]>();
    for (const e of etapasPendentesFiltradas) {
      const pid = e.projeto.id;
      const arr = byProjeto.get(pid) ?? [];
      arr.push(e);
      byProjeto.set(pid, arr);
    }
    let total = 0;
    let concluidos = 0;
    for (const etapasGrupo of byProjeto.values()) {
      const projeto = resolveProjetoCompleto(etapasGrupo[0].projeto, projetos);
      const r = getMyTasksChecklistEntregaResumo(
        etapasGrupo as EtapaEntregaCount[],
        projeto,
        user?.id,
      );
      total += r.total;
      concluidos += r.concluidos;
    }
    return { total, concluidos };
  }, [
    data.etapasPendentes,
    data.projetos,
    user,
    etapaStatusFilter,
    etapaPapelFilter,
    etapaPrazoFilter,
    etapaSearchFilter,
    checklistEntregaFilter,
  ]);

  function resetEntregaForm() {
    setEntregaDescricao('');
    setEntregaImagem(null);
    setEntregaPreview(null);
    setEntregaError(null);
    setEntregaLoading(false);
  }

  function resetChecklistForm() {
    setObjetivoDescricao('');
    setObjetivoImagens([]);
    setObjetivoDocumentos([]);
    setObjetivoPreviews([]);
    setObjetivoError(null);
    setObjetivoLoading(false);
  }

  function handleOpenChecklistModal(etapa: Etapa, index: number, subitemIndex?: number) {
    setSelectedChecklistEtapa(etapa);
    setSelectedChecklistIndex(index);
    setSelectedSubitemIndex(subitemIndex ?? null);
    resetChecklistForm();
    setShowChecklistModal(true);
  }

  function handleCloseChecklistModal() {
    setShowChecklistModal(false);
    setSelectedChecklistEtapa(null);
    setSelectedChecklistIndex(null);
    setSelectedSubitemIndex(null);
    resetChecklistForm();
  }

  function handleOpenEntregaModal(etapa: Etapa, entrega?: EtapaEntrega) {
    setSelectedEtapa(etapa);
    if (entrega) {
      setEditingEntrega(entrega);
      setEntregaDescricao(entrega.descricao);
      setEntregaImagem(entrega.imagemUrl || null);
      setEntregaPreview(entrega.imagemUrl || null);
    } else {
    resetEntregaForm();
      setEditingEntrega(null);
    }
    setShowEntregaModal(true);
  }

  function handleCloseEntregaModal() {
    setShowEntregaModal(false);
    setSelectedEtapa(null);
    resetEntregaForm();
    setEditingEntrega(null);
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
      setEntregaError('Falha ao carregar a imagem. Tente novamente.');
    };
    reader.readAsDataURL(file);
  }

  async function handleObjetivoImagensChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      setObjetivoImagens([]);
      setObjetivoPreviews(prev => prev.filter(p => p.type !== 'image'));
      return;
    }

    const newImages: string[] = [];
    const newPreviews: { url: string; name: string; type: 'image' | 'document' }[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setObjetivoError(`O arquivo "${file.name}" não é uma imagem válida.`);
        continue;
      }

      const reader = new FileReader();
      await new Promise<void>((resolve, reject) => {
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : null;
          if (result) {
            newImages.push(result);
            newPreviews.push({ url: result, name: file.name, type: 'image' });
          }
          resolve();
        };
        reader.onerror = () => {
          setObjetivoError(`Falha ao carregar a imagem "${file.name}".`);
          reject();
        };
        reader.readAsDataURL(file);
      });
    }

    setObjetivoImagens(prev => [...prev, ...newImages]);
    setObjetivoPreviews(prev => [...prev.filter(p => p.type !== 'image'), ...newPreviews]);
  }

  async function handleObjetivoFilesChange(files: File[]) {
    if (files.length === 0) {
      setObjetivoImagens([]);
      setObjetivoDocumentos([]);
      setObjetivoPreviews([]);
      return;
    }

    const validFiles = files.filter((file) => {
      const erro = validateTarefaFileSize(file);
      if (erro) {
        setObjetivoError(erro);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      return;
    }

    try {
      setObjetivoLoading(true);
      setObjetivoError(null);

      const formData = new FormData();
      validFiles.forEach((file) => formData.append('files', file));

      const { data } = await api.post<
        { originalName: string; url: string; mimeType: string; size: number }[]
      >('/tasks/uploads', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const newImages: string[] = [];
      const newDocuments: string[] = [];
      const newPreviews: { url: string; name: string; type: 'image' | 'document' }[] = [];

      (data || []).forEach((file, index) => {
        const isImage = file.mimeType?.startsWith('image/');
        if (isImage) {
          newImages.push(file.url);
          newPreviews.push({
            url: file.url,
            name: file.originalName || `imagem-${index + 1}`,
            type: 'image',
          });
        } else {
          newDocuments.push(file.url);
          newPreviews.push({
            url: file.url,
            name: file.originalName || `arquivo-${index + 1}`,
            type: 'document',
          });
        }
      });

      setObjetivoImagens((prev) => [...prev, ...newImages]);
      setObjetivoDocumentos((prev) => [...prev, ...newDocuments]);
      setObjetivoPreviews((prev) => [...prev, ...newPreviews]);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setObjetivoError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setObjetivoLoading(false);
    }
  }

  function removeObjetivoPreview(index: number) {
    const preview = objetivoPreviews[index];
    if (!preview) return;

    if (preview.type === 'image') {
      const imageIndex = objetivoPreviews.slice(0, index).filter(p => p.type === 'image').length;
      setObjetivoImagens(prev => prev.filter((_, i) => i !== imageIndex));
    } else {
      const docIndex = objetivoPreviews.slice(0, index).filter(p => p.type === 'document').length;
      setObjetivoDocumentos(prev => prev.filter((_, i) => i !== docIndex));
    }
    setObjetivoPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitChecklistEntrega(e: FormEvent) {
    e.preventDefault();
    if (!selectedChecklistEtapa || selectedChecklistIndex === null) return;

    if (objetivoDescricao.trim().length < 5) {
      setObjetivoError('Descreva a entrega com pelo menos 5 caracteres.');
      return;
    }

    try {
      setObjetivoLoading(true);
      setObjetivoError(null);
      const url = `/tasks/${selectedChecklistEtapa.id}/checklist/${selectedChecklistIndex}/submit${
        selectedSubitemIndex !== null ? `?subitemIndex=${selectedSubitemIndex}` : ''
      }`;
      await api.post(url, {
        descricao: objetivoDescricao.trim(),
        imagens: objetivoImagens,
        documentos: objetivoDocumentos,
      });
      handleCloseChecklistModal();
      await fetchTasks({ silent: true });
      toast.success('Entrega enviada com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setObjetivoError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setObjetivoLoading(false);
    }
  }

  async function handleSubmitEntrega(event: FormEvent) {
    event.preventDefault();
    if (!selectedEtapa) return;

    if (entregaDescricao.trim().length < 5) {
      setEntregaError('Descreva a entrega com pelo menos 5 caracteres.');
      return;
    }

    try {
      setEntregaLoading(true);
      setEntregaError(null);
      
      if (editingEntrega) {
        // Atualizar entrega existente
        await api.patch(`/tasks/${selectedEtapa.id}/deliver/${editingEntrega.id}`, {
          descricao: entregaDescricao.trim(),
          imagem: entregaImagem ?? undefined,
        });
      } else {
        // Criar nova entrega
      await api.post(`/tasks/${selectedEtapa.id}/deliver`, {
        descricao: entregaDescricao.trim(),
        imagem: entregaImagem ?? undefined,
      });
      }
      
      handleCloseEntregaModal();
      await fetchTasks({ silent: true });
      toast.success(editingEntrega ? 'Entrega atualizada com sucesso!' : 'Entrega enviada com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setEntregaError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setEntregaLoading(false);
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-white/70">Carregando tarefas...</p>
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

  // Garantir que etapasPendentes e projetos sejam arrays
  const etapasPendentes = Array.isArray(data.etapasPendentes) ? data.etapasPendentes : [];
  const projetos = Array.isArray(data.projetos) ? data.projetos : [];
  const uidAtual = user?.id != null ? Number(user.id) : null;
  const etapasPendentesFiltradas = etapasPendentes.filter((etapa) => {
    if (uidAtual != null && !usuarioParticipaEtapaMyWork(etapa, uidAtual)) return false;
    return matchesGlobalEtapaFilters(etapa, etapa.projeto);
  });

  const tarefasParaAvaliarCount = reviewQueueCounts.tarefasParaAvaliar;

  // Agrupar etapas por projeto
  const etapasPorProjeto = etapasPendentes.reduce((acc, etapa) => {
    const projetoId = etapa.projeto.id;
    if (!acc[projetoId]) {
      acc[projetoId] = {
        projeto: etapa.projeto,
        etapas: [],
      };
    }
    acc[projetoId].etapas.push(etapa);
    return acc;
  }, {} as Record<number, { projeto: Projeto; etapas: Etapa[] }>);

  // Criar um mapa de projetos com suas etapas para exibição unificada
  const projetosComEtapas = projetos.map(projeto => {
    const etapasDoProjeto = etapasPorProjeto[projeto.id]?.etapas || [];
    return {
      projeto,
      etapas: etapasDoProjeto,
      temEtapasPendentes: etapasDoProjeto.length > 0,
    };
  });

  // Adicionar projetos que têm etapas mas não estão na lista de projetos
  Object.values(etapasPorProjeto).forEach(({ projeto, etapas }) => {
    if (!projetosComEtapas.find(p => p.projeto.id === projeto.id)) {
      projetosComEtapas.push({
        projeto,
        etapas,
        temEtapasPendentes: true,
      });
    }
  });

  const etapasComDataFim = etapasPendentesFiltradas.filter((etapa) => etapa.dataFim);
  const etapasExpirando = etapasComDataFim.filter(
    (etapa) => getDeadlineStatus(etapa) === 'SOON',
  ).length;
  const etapasAtrasadasCount = etapasPendentesFiltradas.filter(
    (e) => getEtapaTimelineStatus(e) === 'VENCIDA',
  ).length;

  const etapasVencendoDetalhe = etapasPendentesFiltradas
    .filter((e) => e.dataFim && getDeadlineStatus(e) === 'SOON')
    .sort((a, b) => new Date(a.dataFim!).getTime() - new Date(b.dataFim!).getTime());

  const etapasAtrasadasDetalhe = etapasPendentesFiltradas
    .filter((e) => getEtapaTimelineStatus(e) === 'VENCIDA')
    .sort((a, b) => new Date(a.dataFim ?? 0).getTime() - new Date(b.dataFim ?? 0).getTime());

  function formatDateBR(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR');
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

  const toggleProject = (projetoId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projetoId)) {
        newSet.delete(projetoId);
      } else {
        newSet.add(projetoId);
      }
      return newSet;
    });
  };

  // Calcular estatísticas por projeto
  const getProjetoStats = (_projeto: Projeto, etapas: Etapa[]) => {
    const pendentes = etapas.filter((e) => getEtapaTimelineStatus(e) === 'NAO_INICIADO').length;
    const emAndamento = etapas.filter((e) => getEtapaTimelineStatus(e) === 'EM_ANDAMENTO').length;
    const vencidas = etapas.filter((e) => getEtapaTimelineStatus(e) === 'VENCIDA').length;
    const finalizados = etapas.filter((e) => getEtapaTimelineStatus(e) === 'FINALIZADO').length;
    const total = etapas.length;

    return { pendentes, emAndamento, vencidas, finalizados, total };
  };

  const getProjetoChecklistResumo = (etapas: Etapa[], projetoRef: Projeto) =>
    getMyTasksChecklistEntregaResumo(etapas as EtapaEntregaCount[], projetoRef, user?.id);

  const hasGlobalEtapaFilters =
    etapaStatusFilter !== 'all' ||
    etapaPapelFilter !== 'all' ||
    etapaPrazoFilter !== 'all' ||
    etapaSearchFilter.trim().length > 0 ||
    checklistEntregaFilter !== 'all';

  function normalizeText(value: string | null | undefined) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function matchesGlobalEtapaFilters(etapa: Etapa, projetoRef: Projeto) {
    const etapaTimelineStatus = getEtapaTimelineStatus(etapa);
    if (etapaStatusFilter !== 'all' && etapaTimelineStatus !== etapaStatusFilter) return false;

    if (checklistEntregaFilter !== 'all') {
      const entregas = etapa.checklistEntregas ?? [];
      const ok = entregas.some((ce) => ce.status === checklistEntregaFilter);
      if (!ok) return false;
    }

    if (etapaPapelFilter !== 'all') {
      const currentUserId = user?.id != null ? Number(user.id) : null;
      const isSupervisor = currentUserId != null && projetoRef.supervisor?.id != null && Number(projetoRef.supervisor.id) === currentUserId;
      const isExecutor = currentUserId != null && etapa.executorId != null && Number(etapa.executorId) === currentUserId;
      const integranteIds = etapa.integrantes?.map((i) => i.usuario?.id).filter(Boolean) ?? [];
      const isIntegrante = currentUserId != null && integranteIds.some((id) => Number(id) === currentUserId);
      const isParticipante = isExecutor || isIntegrante;
      const isCoordenadorPapel =
        currentUserId != null &&
        (isSupervisor ||
          (projetoRef.responsaveis?.some((r) => Number(r.usuario.id) === currentUserId) ?? false) ||
          (etapa.responsavelId != null && Number(etapa.responsavelId) === currentUserId));

      if (etapaPapelFilter === 'supervisor' && !isSupervisor) return false;
      if (etapaPapelFilter === 'participante' && !isParticipante) return false;
      if (etapaPapelFilter === 'coordenador' && !isCoordenadorPapel) return false;
    }

    if (etapaPrazoFilter !== 'all') {
      const deadlineStatus = getDeadlineStatus(etapa);
      if (etapaPrazoFilter === 'soon' && deadlineStatus !== 'SOON') return false;
      if (etapaPrazoFilter === 'expired' && deadlineStatus !== 'EXPIRED') return false;
      if (etapaPrazoFilter === 'on_time' && (deadlineStatus === 'SOON' || deadlineStatus === 'EXPIRED' || !etapa.dataFim)) return false;
      if (etapaPrazoFilter === 'without_deadline' && etapa.dataFim) return false;
    }

    const search = normalizeText(etapaSearchFilter);
    if (search) {
      const haystack = [
        etapa.nome,
        etapa.descricao,
        projetoRef.nome,
        etapa.executor?.nome,
        projetoRef.supervisor?.nome,
        etapa.aba,
        etapa.sessao?.nome,
      ]
        .map(normalizeText)
        .join(' ');
      if (!haystack.includes(search)) return false;
    }

    return true;
  }

  const getEtapasVisiveisMeuTrabalho = (etapas: Etapa[], _projeto: Projeto): Etapa[] => {
    const uid = user?.id != null ? Number(user.id) : null;
    if (uid == null) return [];
    return etapas.filter((etapa) => usuarioParticipaEtapaMyWork(etapa, uid));
  };

  const projetosVisiveisCount = projetosComEtapas.reduce((acc, { projeto, etapas }) => {
    const etapasVis = getEtapasVisiveisMeuTrabalho(etapas, projeto);
    const etapasDoUsuarioFiltradas = etapasVis.filter((etapa) =>
      matchesGlobalEtapaFilters(etapa, projeto),
    );
    if (!hasGlobalEtapaFilters || etapasDoUsuarioFiltradas.length > 0) return acc + 1;
    return acc;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Resumo Geral */}
      {(projetos.length > 0 || etapasPendentes.length > 0) && (
        <div className="bg-neutral/80 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Resumo</h2>
          <div
            className={`grid grid-cols-2 md:grid-cols-3 gap-4 ${
              user && userHasProjectDeliveryReviewerPermission(user) ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
            }`}
          >
            <div className="bg-gradient-to-br from-slate-600/30 to-slate-700/20 rounded-xl p-4 border border-slate-500/30 shadow-lg text-slate-200">
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <p className="text-slate-300 text-sm font-medium leading-snug flex-1 min-w-0">Total de Projetos</p>
                <KpiInfo
                  className="text-slate-400/80"
                  text="Projetos em que você tem ao menos uma etapa, após os filtros globais (os que aparecem na lista abaixo)."
                />
              </div>
              <p className="text-3xl font-bold text-white">{projetosComEtapas.length}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500/25 to-amber-600/15 rounded-xl p-4 border border-amber-400/40 shadow-lg text-amber-100">
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <p className="text-amber-200 text-sm font-medium leading-snug flex-1 min-w-0">Não iniciadas</p>
                <KpiInfo
                  className="text-amber-200/75"
                  text="Etapas na timeline Não iniciado: a data de início ainda não chegou."
                />
              </div>
              <p className="text-3xl font-bold text-amber-300">
                {etapasPendentesFiltradas.filter((e) => getEtapaTimelineStatus(e) === 'NAO_INICIADO').length}
              </p>
            </div>
            <div className="bg-gradient-to-br from-sky-500/25 to-sky-600/15 rounded-xl p-4 border border-sky-400/40 shadow-lg text-sky-100">
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <p className="text-sky-200 text-sm font-medium leading-snug flex-1 min-w-0">Em Andamento</p>
                <KpiInfo
                  className="text-sky-200/75"
                  text="Etapas na timeline Em andamento: fora de Não iniciado e Atrasada, tarefas da etapa ainda não 100% concluídas (entrega aprovada ou marcado no cadastro)."
                />
              </div>
              <p className="text-3xl font-bold text-sky-300">
                {etapasPendentesFiltradas.filter((e) => getEtapaTimelineStatus(e) === 'EM_ANDAMENTO').length}
              </p>
            </div>
            <div
              onClick={() => etapasAtrasadasCount > 0 && setKpiDetalhe(kpiDetalhe === 'atrasadas' ? null : 'atrasadas')}
              className={`rounded-xl p-4 shadow-lg text-rose-100 transition-all ${
                etapasAtrasadasCount > 0 ? 'cursor-pointer' : ''
              } ${
                kpiDetalhe === 'atrasadas'
                  ? 'bg-gradient-to-br from-rose-500/35 to-rose-700/20 border border-rose-400/70 ring-1 ring-rose-400/40'
                  : 'bg-gradient-to-br from-rose-500/25 to-rose-700/15 border border-rose-400/40 hover:border-rose-400/60'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <p className="text-rose-100 text-sm font-medium leading-snug flex-1 min-w-0">Atrasadas</p>
                <KpiInfo
                  className="text-rose-200/80"
                  text="Etapas na timeline Atrasada: já passou a data fim e as tarefas da etapa ainda não estão 100% concluídas (entrega ou cadastro). Clique para ver detalhes."
                />
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-rose-200">{etapasAtrasadasCount}</p>
                {etapasAtrasadasCount > 0 && (
                  <span className="text-[10px] text-rose-200/50">clique p/ detalhes</span>
                )}
              </div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/25 to-emerald-700/15 rounded-xl p-4 border border-emerald-400/45 shadow-lg text-emerald-100">
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <p className="text-emerald-100 text-sm font-medium leading-snug flex-1 min-w-0">Finalizado</p>
                <KpiInfo
                  className="text-emerald-200/75"
                  text="Etapas na timeline Finalizado: há tarefas na etapa e todas as unidades (tarefa ou subtarefa) concluídas — entrega aprovada ou marcado no cadastro."
                />
              </div>
              <p className="text-3xl font-bold text-emerald-200">
                {etapasPendentesFiltradas.filter((e) => getEtapaTimelineStatus(e) === 'FINALIZADO').length}
              </p>
            </div>
            <div
              onClick={() => etapasExpirando > 0 && setKpiDetalhe(kpiDetalhe === 'vencendo' ? null : 'vencendo')}
              className={`rounded-xl p-4 shadow-lg text-amber-100 transition-all ${
                etapasExpirando > 0 ? 'cursor-pointer' : ''
              } ${
                kpiDetalhe === 'vencendo'
                  ? 'bg-gradient-to-br from-amber-500/40 to-amber-700/25 border border-amber-400/80 ring-1 ring-amber-400/40'
                  : 'bg-gradient-to-br from-amber-500/30 to-amber-700/20 border border-amber-400/60 hover:border-amber-400/80'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <p className="text-amber-100 text-sm font-medium leading-snug flex-1 min-w-0">Etapas vencendo em 7 dias</p>
                <KpiInfo
                  className="text-amber-200/80"
                  text="Etapas com data fim entre hoje e os próximos 7 dias (apenas calendário), entre as suas etapas filtradas. Clique para ver detalhes."
                />
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-amber-200">{etapasExpirando}</p>
                {etapasExpirando > 0 && (
                  <span className="text-[10px] text-amber-200/50">clique p/ detalhes</span>
                )}
              </div>
            </div>
            {user && userHasProjectDeliveryReviewerPermission(user) && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (tarefasParaAvaliarCount > 0) navigate(PROJECTS_ANALISE_ROUTE);
                }}
                onKeyDown={(e) => {
                  if (
                    tarefasParaAvaliarCount > 0 &&
                    (e.key === 'Enter' || e.key === ' ')
                  ) {
                    e.preventDefault();
                    navigate(PROJECTS_ANALISE_ROUTE);
                  }
                }}
                className={`rounded-xl p-4 shadow-lg text-fuchsia-100 transition-all border ${
                  tarefasParaAvaliarCount > 0 ? 'cursor-pointer' : ''
                } ${
                  tarefasParaAvaliarCount > 0
                    ? 'bg-gradient-to-br from-fuchsia-600/30 to-fuchsia-900/20 border-fuchsia-400/55 ring-1 ring-fuchsia-500/25 hover:border-fuchsia-300/80'
                    : 'bg-gradient-to-br from-fuchsia-600/10 to-fuchsia-900/10 border-fuchsia-500/25'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <p className="text-fuchsia-100 text-sm font-medium leading-snug flex-1 min-w-0">
                    Tarefas a avaliar
                  </p>
                  <KpiInfo
                    className="text-fuchsia-200/75"
                    text="Entregas aguardando sua avaliação. Abre Projetos na aba «Tarefas em análise»."
                  />
                </div>
                <p className="text-3xl font-bold text-fuchsia-50 tabular-nums">{tarefasParaAvaliarCount}</p>
                {tarefasParaAvaliarCount > 0 && (
                  <p className="text-[10px] text-fuchsia-200/60 mt-1">clique p/ Projetos</p>
                )}
              </div>
            )}
            {pontosUsuario !== null && (
              <div className="bg-gradient-to-br from-violet-500/25 to-violet-700/15 rounded-xl p-4 border border-violet-400/45 shadow-lg text-violet-100">
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <p className="text-violet-100 text-sm font-medium leading-snug flex-1 min-w-0">Meus pontos</p>
                  <KpiInfo
                    className="text-violet-200/75"
                    text="Soma dos pontos acumulados por tarefas de checklist aprovadas. Cada tarefa vale pelo menos 1 ponto; subtarefas dividem os pontos da tarefa-mãe entre si."
                  />
                </div>
                <p className="text-3xl font-bold text-violet-200 tabular-nums">
                  {pontosUsuario.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-violet-200/70 mt-0.5">pts em tarefas aprovadas</p>
              </div>
            )}
          </div>

          {/* Painel de detalhes — Etapas vencendo / atrasadas */}
          {kpiDetalhe && (
            <div
              className={`mt-4 rounded-xl border overflow-hidden transition-all ${
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
                const grouped = lista.reduce<Record<number, { projeto: Projeto; etapas: Etapa[] }>>((acc, e) => {
                  const pId = e.projeto.id;
                  if (!acc[pId]) acc[pId] = { projeto: e.projeto, etapas: [] };
                  acc[pId].etapas.push(e);
                  return acc;
                }, {});
                return (
                  <div className="divide-y divide-white/5">
                    {Object.values(grouped).map((g) => (
                      <div key={g.projeto.id} className="px-4 sm:px-5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="text-sm font-medium text-white/90 truncate">{g.projeto.nome}</span>
                          <span className="text-[10px] text-white/40 shrink-0">({g.etapas.length} etapa{g.etapas.length > 1 ? 's' : ''})</span>
                        </div>
                        <div className="space-y-1.5 ml-5">
                          {g.etapas.map((e) => {
                            const { resumo, tituloCompleto } = formatParticipantesResumo(
                              nomesParticipantesDaEtapaSemUsuario(e, e.projeto?.supervisor?.id ?? null),
                            );
                            return (
                            <button
                              type="button"
                              key={e.id}
                              onClick={() => {
                                setKpiDetalhe(null);
                                navigate(`${TASKS_ROUTE}?etapaId=${e.id}`);
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

          <div className="mt-4 rounded-xl border border-teal-400/40 bg-gradient-to-br from-teal-500/15 to-teal-700/10 p-4 sm:p-5 shadow-lg text-teal-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2 min-w-0">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <h3 className="text-sm text-teal-200 font-medium leading-snug shrink-0">Tarefas feitas</h3>
                <KpiInfo
                  className="text-teal-200/75 shrink-0 pt-0.5"
                  text="Unidades (tarefas e subtarefas) concluídas (entrega aprovada ou cadastro) versus total visível, mesma regra do Dashboard: supervisor ou responsável vê todas as tarefas da etapa; demais papéis seguem índices e participação na etapa."
                />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-teal-100 tabular-nums tracking-tight">
              {checklistResumoFiltrado.total > 0
                ? `${checklistResumoFiltrado.concluidos} / ${checklistResumoFiltrado.total}`
                : '—'}
            </p>
            <p className="text-xs text-teal-200/70 mt-1">concluídas (entrega ou cadastro) / total de unidades (etapas filtradas)</p>
          </div>
        </div>
      )}

      {/* Projetos e Etapas Organizados */}
      {projetosComEtapas.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Meus Projetos e Tarefas</h2>
          <div className="mb-4 rounded-xl border border-white/10 bg-neutral/70 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h3 className="text-sm font-semibold text-white/90">Filtros de etapas</h3>
              <button
                type="button"
                className={btn.secondary}
                onClick={() => {
                  setEtapaStatusFilter('all');
                  setEtapaPapelFilter('all');
                  setEtapaPrazoFilter('all');
                  setEtapaSearchFilter('');
                  setChecklistEntregaFilter('all');
                  setEtapaOrdemFilter('numerica');
                }}
                disabled={!hasGlobalEtapaFilters}
              >
                Limpar filtros
              </button>
            </div>
            <p className="text-xs text-white/60 mb-3">
              Exibindo {projetosVisiveisCount} projeto(s) com etapas conforme os filtros atuais.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-white/70 mb-1">Buscar etapa/projeto</label>
                <input
                  value={etapaSearchFilter}
                  onChange={(e) => setEtapaSearchFilter(e.target.value)}
                  placeholder="Nome da etapa, projeto, sessão..."
                  className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Status da etapa</label>
                <select
                  value={etapaStatusFilter}
                  onChange={(e) => setEtapaStatusFilter(e.target.value as EtapaStatusFilter)}
                  className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all" className="bg-neutral text-white">Todos</option>
                  <option value="NAO_INICIADO" className="bg-neutral text-white">Não iniciado</option>
                  <option value="EM_ANDAMENTO" className="bg-neutral text-white">Em andamento</option>
                  <option value="VENCIDA" className="bg-neutral text-white">Atrasada</option>
                  <option value="FINALIZADO" className="bg-neutral text-white">Finalizado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Entrega de tarefa</label>
                <select
                  value={checklistEntregaFilter}
                  onChange={(e) =>
                    setChecklistEntregaFilter(e.target.value as ChecklistEntregaFilter)
                  }
                  className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all" className="bg-neutral text-white">Todas</option>
                  <option value="EM_ANALISE" className="bg-neutral text-white">Em análise</option>
                  <option value="APROVADO" className="bg-neutral text-white">Aprovado</option>
                  <option value="REPROVADO" className="bg-neutral text-white">Reprovado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Meu papel</label>
                <select
                  value={etapaPapelFilter}
                  onChange={(e) => setEtapaPapelFilter(e.target.value as EtapaPapelFilter)}
                  className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all" className="bg-neutral text-white">Todos</option>
                  <option value="supervisor" className="bg-neutral text-white">Sou supervisor</option>
                  <option value="participante" className="bg-neutral text-white">Sou participante</option>
                  <option value="coordenador" className="bg-neutral text-white">
                    Coordenação (supervisor / resp. projeto ou etapa)
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Prazo</label>
                <select
                  value={etapaPrazoFilter}
                  onChange={(e) => setEtapaPrazoFilter(e.target.value as EtapaPrazoFilter)}
                  className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all" className="bg-neutral text-white">Todos</option>
                  <option value="soon" className="bg-neutral text-white">Vencendo em 7 dias</option>
                  <option value="expired" className="bg-neutral text-white">Atrasadas</option>
                  <option value="on_time" className="bg-neutral text-white">No prazo</option>
                  <option value="without_deadline" className="bg-neutral text-white">Sem data fim</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Ordenação das etapas</label>
                <select
                  value={etapaOrdemFilter}
                  onChange={(e) => setEtapaOrdemFilter(e.target.value as EtapaOrdemFilter)}
                  className="w-full bg-neutral border border-white/20 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="numerica" className="bg-neutral text-white">
                    Numérica (do projeto)
                  </option>
                  <option value="data_inicio" className="bg-neutral text-white">
                    Data de início
                  </option>
                  <option value="data_fim" className="bg-neutral text-white">
                    Data fim / prazo
                  </option>
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {projetosComEtapas.map(({ projeto, etapas, temEtapasPendentes }) => {
              const isExpanded = expandedProjects.has(projeto.id);
              const isResumoExpanded = expandedResumoProjects.has(projeto.id);
              const isObjetivoExpanded = expandedObjetivoProjects.has(projeto.id);
              const isDescricaoExpanded = expandedDescricaoProjects.has(projeto.id);

              // Mesma lógica da etapa: só considerar etapas em que o usuário está (executor, integrante ou responsável)
              const etapasDoUsuario = getEtapasVisiveisMeuTrabalho(etapas, projeto);

              const etapasDoUsuarioFiltradas = sortEtapasMyWork(
                etapasDoUsuario.filter((etapa) => matchesGlobalEtapaFilters(etapa, projeto)),
                etapaOrdemFilter,
              );

              if (hasGlobalEtapaFilters && etapasDoUsuarioFiltradas.length === 0) {
                return null;
              }

              const stats = getProjetoStats(projeto, etapasDoUsuarioFiltradas);
              const projetoCompleto = resolveProjetoCompleto(projeto, projetos);
              const checklistProj = getProjetoChecklistResumo(etapasDoUsuarioFiltradas, projetoCompleto);
              const hasEtapas = etapasDoUsuarioFiltradas.length > 0;

              // Sessões e abas apenas das etapas em que o usuário está
              const sessoesMap = new Map<number, Sessao>();
              etapasDoUsuarioFiltradas.forEach((etapa) => {
                if (etapa.sessao) {
                  sessoesMap.set(etapa.sessao.id, etapa.sessao);
                }
              });
              const sessoes = Array.from(sessoesMap.values()).sort(
                (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'),
              );
              const hasEtapaSemSessao = etapasDoUsuarioFiltradas.some((etapa) => etapa.sessaoId == null);
              const sessaoGroupsCount = (hasEtapaSemSessao ? 1 : 0) + sessoes.length;
              const selectedSessao =
                (selectedSessoesByProject[projeto.id] ?? 'all') as number | null | 'all';

              const etapasPorSessao =
                selectedSessao === 'all'
                  ? etapasDoUsuarioFiltradas
                  : etapasDoUsuarioFiltradas.filter((etapa) => {
                      if (selectedSessao === null) return etapa.sessaoId == null;
                      return etapa.sessaoId === selectedSessao;
                    });

              const abasSet = new Set<string>();
              etapasPorSessao.forEach((etapa) => {
                const nomeAba = (etapa.aba && etapa.aba.trim()) || 'Geral';
                abasSet.add(nomeAba);
              });
              const abasReal = Array.from(abasSet)
                .filter((n) => n !== ABA_VISUALIZACAO_TODAS)
                .sort((a, b) => a.localeCompare(b, 'pt-BR'));
              const abas =
                abasReal.length > 1
                  ? ([ABA_VISUALIZACAO_TODAS, ...abasReal] as string[])
                  : abasReal;

              // chave de aba por projeto + sessão (all / none / id)
              const sessaoKey =
                selectedSessao === 'all'
                  ? 'all'
                  : selectedSessao === null
                  ? 'none'
                  : String(selectedSessao);
              const abaStateKey = `${projeto.id}-${sessaoKey}`;

              const storedAba = selectedAbasByProject[abaStateKey];
              const selectedAba =
                storedAba === 'Todas'
                  ? ABA_VISUALIZACAO_TODAS
                  : storedAba ??
                    (abasReal.length > 1 ? ABA_VISUALIZACAO_TODAS : abasReal[0] ?? ABA_VISUALIZACAO_TODAS);
              const etapasFiltradas =
                selectedAba === ABA_VISUALIZACAO_TODAS
                  ? etapasPorSessao
                  : etapasPorSessao.filter((etapa) => {
                      const nomeAba = (etapa.aba && etapa.aba.trim()) || 'Geral';
                      return nomeAba === selectedAba;
                    });

              return (
                <div key={projeto.id} className="bg-neutral/80 border border-white/10 rounded-xl overflow-hidden">
                  {/* Cabeçalho do Projeto — mobile: coluna; desktop: linha */}
                  <div
                    className={`p-4 sm:p-5 ${
                      hasEtapas && (!isSupervisorUser ? hasProjectsAccess : true)
                        ? 'cursor-pointer hover:bg-white/5 transition-colors'
                        : ''
                    }`}
                    onClick={
                      hasEtapas && (!isSupervisorUser ? hasProjectsAccess : true)
                        ? () => toggleProject(projeto.id)
                        : undefined
                    }
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Título em destaque, sempre primeiro */}
                        <h3 className="text-base sm:text-lg font-semibold text-white mb-2">{projeto.nome}</h3>
                        {/* Status + progresso: mobile em linha abaixo do título; desktop junto */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs shrink-0 ${getStatusColor(projeto.status)}`}>
                            {getStatusLabel(projeto.status)}
                          </span>
                          {projeto.progress !== undefined && (
                            <span className="text-xs text-white/60 shrink-0">
                              {projeto.progress}% concluído
                            </span>
                          )}
                        </div>
                        {isExpanded && (
                          <>
                            {projeto.resumo && projeto.resumo.trim().length > 0 && (
                              <p className="text-white/60 text-sm mb-1 whitespace-pre-wrap break-words">
                                {getTruncatedText(projeto.resumo, 140, isResumoExpanded)}
                                {projeto.resumo.trim().length > 140 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedResumoProjects((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(projeto.id)) next.delete(projeto.id);
                                        else next.add(projeto.id);
                                        return next;
                                      });
                                    }}
                                    className="ml-1 text-primary text-xs hover:underline"
                                  >
                                    {isResumoExpanded ? 'ver menos' : 'ver mais'}
                                  </button>
                                )}
                              </p>
                            )}
                            {projeto.objetivo && projeto.objetivo.trim().length > 0 && (
                              <p className="text-white/55 text-xs mb-1 whitespace-pre-wrap break-words">
                                {getTruncatedText(projeto.objetivo, 180, isObjetivoExpanded)}
                                {projeto.objetivo.trim().length > 180 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedObjetivoProjects((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(projeto.id)) next.delete(projeto.id);
                                        else next.add(projeto.id);
                                        return next;
                                      });
                                    }}
                                    className="ml-1 text-primary text-xs hover:underline"
                                  >
                                    {isObjetivoExpanded ? 'ver menos' : 'ver mais'}
                                  </button>
                                )}
                              </p>
                            )}
                            {projeto.descricaoLonga && projeto.descricaoLonga.trim().length > 0 && (
                              <p className="text-white/50 text-xs mb-3 whitespace-pre-wrap break-words">
                                <LinkifiedText
                                  text={getTruncatedText(
                                    projeto.descricaoLonga,
                                    260,
                                    isDescricaoExpanded,
                                  )}
                                />
                                {projeto.descricaoLonga.trim().length > 260 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedDescricaoProjects((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(projeto.id)) next.delete(projeto.id);
                                        else next.add(projeto.id);
                                        return next;
                                      });
                                    }}
                                    className="ml-1 text-primary text-xs hover:underline"
                                  >
                                    {isDescricaoExpanded ? 'ver menos' : 'ver mais'}
                                  </button>
                                )}
                              </p>
                            )}
                            {Array.isArray(projeto.descricaoArquivos) && projeto.descricaoArquivos.length > 0 && (
                              <div className="mb-3 space-y-2">
                                <p className="text-[11px] text-white/50">
                                  Arquivos do projeto ({projeto.descricaoArquivos.length})
                                </p>

                                {(() => {
                                  const arquivos = projeto.descricaoArquivos ?? [];
                                  const gallery = urlsToViewerItems(
                                    arquivos.map((f) => f.url),
                                    (_, i) => arquivos[i]?.originalName || arquivos[i]?.url,
                                  );
                                  return (
                                    <>
                                      {arquivos.some((file) => getProjectFileKind(file) === 'image') && (
                                        <div className="flex flex-wrap gap-2">
                                          {arquivos
                                            .filter((file) => getProjectFileKind(file) === 'image')
                                            .map((file, index) => {
                                              const displayName = file.originalName || file.url;
                                              const gi = arquivos.findIndex((f) => f.url === file.url);
                                              return (
                                                <span
                                                  key={`${file.url}-${index}`}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <FilePreviewTrigger
                                                    src={file.url}
                                                    name={displayName}
                                                    variant="thumbnail"
                                                    gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                                                    className="group relative w-14 h-14 rounded-md overflow-hidden border border-white/15 hover:border-primary/80"
                                                    title={displayName}
                                                  >
                                                    <img
                                                      src={resolveFileUrl(file.url)}
                                                      alt={displayName}
                                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                    />
                                                  </FilePreviewTrigger>
                                                </span>
                                              );
                                            })}
                                        </div>
                                      )}
                                      {arquivos.some((file) => getProjectFileKind(file) !== 'image') && (
                                        <div className="flex flex-wrap items-center gap-2">
                                          {arquivos
                                            .filter((file) => getProjectFileKind(file) !== 'image')
                                            .map((file, index) => {
                                              const displayName = file.originalName || file.url;
                                              const gi = arquivos.findIndex((f) => f.url === file.url);
                                              return (
                                                <span
                                                  key={`${file.url}-${index}`}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <FilePreviewTrigger
                                                    src={file.url}
                                                    name={displayName}
                                                    variant="chip"
                                                    gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                                                    title={displayName}
                                                  />
                                                </span>
                                              );
                                            })}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </>
                        )}
                        {/* Etapas: total + pills (não iniciado; em andamento; atrasada na timeline; finalizado = todas as unidades concluídas na timeline) */}
                        {hasEtapas && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-white/50 w-full sm:w-auto">
                              {stats.total} etapa{stats.total !== 1 ? 's' : ''} no total
                            </span>
                            {stats.pendentes > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/25 text-amber-200 border border-amber-400/40 font-medium shrink-0" title="Data de início ainda não chegou">
                                {stats.pendentes} não iniciada{stats.pendentes !== 1 ? 's' : ''}
                              </span>
                            )}
                            {stats.emAndamento > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/25 text-sky-200 border border-sky-400/40 font-medium shrink-0">
                                {stats.emAndamento} em andamento
                              </span>
                            )}
                            {stats.vencidas > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-500/25 text-rose-200 border border-rose-400/40 font-medium shrink-0">
                                {stats.vencidas} atrasada{stats.vencidas !== 1 ? 's' : ''}
                              </span>
                            )}
                            {stats.finalizados > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 font-medium shrink-0">
                                {stats.finalizados} finalizado{stats.finalizados !== 1 ? 's' : ''}
                              </span>
                            )}
                            {checklistProj.total > 0 && (
                              <span
                                className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-200 border border-teal-400/35 font-medium shrink-0 tabular-nums"
                                title="Tarefas e subtarefas concluídas (entrega ou cadastro) / total visível (mesma regra do resumo e do Dashboard)"
                              >
                                {checklistProj.concluidos}/{checklistProj.total} tarefas (entregas)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Ações: mobile full width embaixo; desktop à direita */}
                      <div className="flex items-center gap-2 shrink-0 sm:flex-nowrap">
                        {user && canUserOpenProjectDetails(user, projeto) && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/projects/${projeto.id}`);
                              }}
                              className={`${btn.primarySoft} flex-1 sm:flex-none min-w-0`}
                            >
                              Ver Detalhes
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/projects/${projeto.id}/wiki`);
                              }}
                              className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none min-w-0 px-4 py-2 text-sm rounded-md font-semibold border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 transition-colors"
                              title="Ver documentação do projeto em formato wiki"
                            >
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Ver Wiki
                            </button>
                          </>
                        )}
                        {hasEtapas && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProject(projeto.id);
                            }}
                            className={btn.iconBtn}
                            title={isExpanded ? 'Recolher' : 'Expandir'}
                          >
                            <svg
                              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Barra de progresso: largura total do card */}
                    {projeto.progress !== undefined && (
                      <div className="mt-3">
                        <div className="w-full bg-white/10 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${projeto.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Etapas do Projeto (Colapsável) */}
                  {hasEtapas && isExpanded && (
                    <div className="border-t border-white/10 p-5 pt-4 space-y-4">
                      {/* Hierarquia: nível 1 = sessão; nível 2 = aba (indentada sob a sessão) */}
                      <div className="space-y-3 min-w-0">
                        {(sessoes.length > 0 || hasEtapas) && (
                          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between py-3 px-3 sm:px-4 rounded-lg bg-slate-800/60 border border-violet-500/25 min-w-0">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 min-w-0 [scrollbar-width:thin]">
                              <span className="text-sm font-semibold text-violet-200/90 shrink-0">Sessões</span>
                              {sessaoGroupsCount > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedSessoesByProject((prev) => ({ ...prev, [projeto.id]: 'all' }))
                                  }
                                  title="Mostra etapas de todas as sessões na mesma lista. Não é uma sessão do projeto — é só o modo de visualização."
                                  className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400/50 whitespace-nowrap ${
                                    selectedSessao === 'all'
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
                                  onClick={() =>
                                    setSelectedSessoesByProject((prev) => ({ ...prev, [projeto.id]: null }))
                                  }
                                  title="Etapas sem sessão atribuída"
                                  className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors border border-solid focus:outline-none focus:ring-2 focus:ring-violet-400/50 whitespace-nowrap ${
                                    selectedSessao === null
                                      ? 'bg-violet-600 text-white border-violet-500'
                                      : 'bg-slate-700/80 text-white/80 border-slate-600/80 hover:bg-violet-900/40 hover:border-violet-700/60'
                                  }`}
                                >
                                  Sem sessão
                                </button>
                              )}
                              {sessoes.map((sessao) => (
                                <button
                                  key={sessao.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedSessoesByProject((prev) => ({
                                      ...prev,
                                      [projeto.id]: sessao.id,
                                    }))
                                  }
                                  title={sessao.nome}
                                  className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors border border-solid focus:outline-none focus:ring-2 focus:ring-violet-400/50 whitespace-nowrap ${
                                    selectedSessao === sessao.id
                                      ? 'bg-violet-600 text-white border-violet-500'
                                      : 'bg-slate-700/80 text-white/80 border-slate-600/80 hover:bg-violet-900/40 hover:border-violet-700/60'
                                  }`}
                                >
                                  {sessao.nome}
                                </button>
                              ))}
                            </div>
                            {sessaoGroupsCount > 1 && (
                              <p className="text-[10px] text-white/45 px-1 leading-snug max-w-2xl">
                                «Todas as sessões» (tracejado) é só visualização combinada — não substitui uma
                                sessão real do projeto.
                              </p>
                            )}
                          </div>
                        )}

                        {abas.length > 1 && (
                          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between py-3 px-3 sm:px-4 rounded-lg bg-slate-800/60 border border-primary/25 min-w-0">
                            <div className="flex flex-col gap-1 min-w-0">
                              <p className="text-[10px] text-white/45 px-1 leading-snug max-w-2xl">
                                «Todas as abas» (tracejado) junta as etapas de todas as abas na lista — não é uma
                                aba cadastrada.
                              </p>
                              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 min-w-0 [scrollbar-width:thin]">
                                <span className="text-sm font-semibold text-sky-200/90 shrink-0">Abas</span>
                                {abas.map((aba) => {
                                  const isVerTodas = aba === ABA_VISUALIZACAO_TODAS;
                                  return (
                                    <button
                                      key={aba}
                                      type="button"
                                      onClick={() =>
                                        setSelectedAbasByProject((prev) => ({
                                          ...prev,
                                          [abaStateKey]: aba,
                                        }))
                                      }
                                      title={
                                        isVerTodas
                                          ? 'Mostra etapas de todas as abas juntas. Não é uma aba do projeto — só o modo de visualização.'
                                          : aba
                                      }
                                      className={`shrink-0 inline-flex items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 whitespace-nowrap ${
                                        isVerTodas
                                          ? selectedAba === aba
                                            ? 'bg-primary/90 text-white border-2 border-dashed border-sky-200/80'
                                            : 'bg-slate-700/80 text-white/80 border border-dashed border-sky-400/35 hover:bg-primary/15 hover:border-primary/45'
                                          : selectedAba === aba
                                            ? 'bg-primary text-white border border-primary'
                                            : 'bg-slate-700/80 text-white/80 border border-slate-600/80 hover:bg-primary/20 hover:border-primary/40'
                                      }`}
                                    >
                                      {isVerTodas ? 'Todas as abas' : aba}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {etapasFiltradas.map((etapa, etapaIndex) => {
                        const etapaNumero = etapa.numeroNoProjeto ?? etapaIndex + 1;
                        // Verificar se o usuário é executor usando executorId
                        const executorId = etapa.executorId;
                    // Comparar convertendo ambos para número para evitar problemas de tipo
                    const isExecutor = user?.id && executorId && Number(user.id) === Number(executorId);
                    
                    // Verificar se o usuário é integrante (auxiliar) da etapa
                    const integrantesIds = etapa.integrantes?.map(i => i.usuario?.id).filter(Boolean) || [];
                    const isIntegrante = user?.id && integrantesIds.some(id => Number(user.id) === Number(id));
                    
                    const isSupervisorProjetoEtapa =
                      user?.id != null &&
                      etapa.projeto?.supervisor?.id != null &&
                      Number(user.id) === Number(etapa.projeto.supervisor.id);
                    const podeInteragir = isExecutor || isIntegrante;
                    
                    const latestEntrega = etapa.entregas && etapa.entregas.length > 0 ? etapa.entregas[0] : null;
                    
                    const checklistItems = etapa.checklistJson && Array.isArray(etapa.checklistJson) 
                      ? etapa.checklistJson 
                      : [];
                    const filtroMeuTrabalho = etapa.meuTrabalhoChecklistIndices;
                    const filtroChecklistSet =
                      filtroMeuTrabalho != null
                        ? new Set(filtroMeuTrabalho.map((n) => Number(n)))
                        : isExecutor
                          ? null
                          : isIntegrante
                            ? new Set(
                                (checklistItems.length > 0
                                  ? checklistItems.map((_, i) => i)
                                  : []
                                ).filter((i) => {
                                  const row = checklistItems[i] as ChecklistItem & {
                                    integrantesIds?: number[];
                                  };
                                  const ids = row?.integrantesIds;
                                  if (!Array.isArray(ids) || ids.length === 0) return true;
                                  return ids.some((id) => Number(id) === Number(user?.id));
                                }),
                              )
                            : new Set<number>();
                    const checklistItemsVisiveis =
                      filtroChecklistSet != null
                        ? checklistItems.filter((_, i) => filtroChecklistSet.has(i))
                        : checklistItems;
                    const itensMarcados = checklistItemsVisiveis.filter((item) => item.concluido).length;
                    const temItensMarcados =
                      filtroChecklistSet != null
                        ? checklistItemsVisiveis.some((item) => item.concluido === true)
                        : checklistItems.some((item) => item.concluido === true);
                    const totalItens = checklistItemsVisiveis.length;
                    
                    const jaTemEntregaAprovada = etapa.entregas?.some(
                      (e: any) => e.status === 'APROVADA',
                    );
                    /** Etapas com checklist usam só "Enviar"/"Ver entrega" por tarefa; o botão global confundia após aprovar itens. */
                    const etapaUsaChecklistDeTarefas = checklistItemsVisiveis.length > 0;
                    const canEnviarEntrega =
                      podeInteragir &&
                      !jaTemEntregaAprovada &&
                      ['PENDENTE', 'EM_ANDAMENTO', 'REPROVADA'].includes(etapa.status) &&
                      temItensMarcados &&
                      !etapaUsaChecklistDeTarefas;

                    const etapaTimelineStatus = getEtapaTimelineStatus(etapa);
                    const deadlineStatus = getDeadlineStatus(etapa);

                    const deadlineBorderClass =
                      deadlineStatus === 'EXPIRED'
                        ? 'border-red-500/70'
                        : deadlineStatus === 'SOON'
                          ? 'border-amber-400/70'
                          : 'border-white/15';

                    const deadlineBadge =
                      deadlineStatus === 'EXPIRED'
                        ? {
                            label: 'Atrasada',
                            className:
                              'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-200 border border-red-400/60',
                          }
                        : deadlineStatus === 'SOON'
                          ? {
                              label: 'Vence em até 7 dias',
                              className:
                                'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-100 border border-amber-400/60',
                            }
                          : null;

                    return (
                      <div
                        key={etapa.id}
                        id={`mytasks-etapa-${etapa.id}`}
                        className={`bg-gradient-to-br from-neutral/80 to-neutral/60 rounded-xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow border ${deadlineBorderClass}`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-white/90">
                              {etapaNumero}. {etapa.nome}
                            </h4>
                            {etapa.descricao && (
                              <p className="text-sm text-white/70 mt-1">
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedDescricaoEtapas((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(etapa.id)) {
                                          next.delete(etapa.id);
                                        } else {
                                          next.add(etapa.id);
                                        }
                                        return next;
                                      });
                                    }}
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
                          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:flex-nowrap">
                            <span className={`px-2 py-1 rounded text-xs shrink-0 ${getStatusColor(etapaTimelineStatus)}`}>
                              {getStatusLabel(etapaTimelineStatus)}
                            </span>
                            {deadlineBadge && (
                              <span className={deadlineBadge.className}>
                                {deadlineBadge.label}
                              </span>
                            )}
                            {podeInteragir && etapa.status === 'EM_ANALISE' && (
                              <span className="text-xs text-white/60 shrink-0">Aguardando revisão</span>
                            )}
                            {canEnviarEntrega && (
                              <button
                                type="button"
                                onClick={() => handleOpenEntregaModal(etapa)}
                                className={`${btn.primarySoft} w-full sm:w-auto shrink-0`}
                              >
                                Enviar Entrega ({itensMarcados}/{totalItens})
                              </button>
                            )}
                          </div>
                        </div>

                        {latestEntrega ? (
                          <div className="mt-3 border border-white/10 rounded-md p-3 bg-white/5">
                            <div className="flex items-start justify-between gap-3 mb-2">
            <div>
                                <span className="text-xs text-white/60 block">Última entrega</span>
                                <span className="text-sm text-white/80">
                                  {new Date(latestEntrega.dataEnvio).toLocaleString('pt-BR')}
                                </span>
            </div>
                                  <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs ${getEntregaStatusColor(latestEntrega.status)}`}>
                                {getEntregaStatusLabel(latestEntrega.status)}
            </span>
                                    {podeInteragir && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEntregaModal(etapa, latestEntrega)}
                                        className={btn.primarySoft}
                                        title="Editar entrega"
                                      >
                                        Editar
                                      </button>
                                    )}
                                  </div>
          </div>
                            <p className="text-sm text-white/80 whitespace-pre-wrap">{latestEntrega.descricao}</p>
                            {latestEntrega.foiEditada && latestEntrega.editadoPor && latestEntrega.dataEdicao && (
                              <p className="mt-1 text-xs text-white/60">
                                Editado por {latestEntrega.editadoPor.nome} em{' '}
                                {new Date(latestEntrega.dataEdicao).toLocaleString('pt-BR')}
                              </p>
                            )}
                            {latestEntrega.imagemUrl && (
                              <div className="mt-3">
                                <FilePreviewTrigger
                                  src={latestEntrega.imagemUrl}
                                  name="Entrega da etapa"
                                  variant="thumbnail"
                                  className="max-h-48 rounded-md border border-white/10 overflow-hidden"
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
                          </div>
                        ) : null}

                      {/* Tarefas da etapa */}
                      {etapa.checklistJson && Array.isArray(etapa.checklistJson) && etapa.checklistJson.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <label className="text-sm font-medium text-white/90 block">
                              Tarefas da etapa
                              {podeInteragir && totalItens > 0 && (
                                <span className="text-white/60 text-xs font-normal ml-2">
                                  {`${itensMarcados} de ${totalItens} tarefa${totalItens !== 1 ? 's' : ''} marcada${itensMarcados !== 1 ? 's' : ''} no cadastro`}
                                </span>
                              )}
                            </label>
                          </div>
                          {(etapa.executor ||
                            etapa.projeto?.supervisor ||
                            (etapa.integrantes && etapa.integrantes.length > 0)) && (
                            <div className="mb-3 space-y-1 text-xs text-white/70">
                              {etapa.projeto?.supervisor?.nome && (
                                <p className="min-w-0">
                                  <span className="text-white/50 font-medium">Supervisor (aprovação):</span>{' '}
                                  {etapa.projeto.supervisor.nome}
                                </p>
                              )}
                              {(() => {
                                const { resumo, tituloCompleto } = formatParticipantesResumo(
                                  nomesParticipantesDaEtapaSemUsuario(etapa, etapa.projeto?.supervisor?.id ?? null),
                                );
                                return resumo ? (
                                  <p className="min-w-0" title={tituloCompleto ? `Participantes: ${tituloCompleto}` : undefined}>
                                    <span className="text-white/50 font-medium">Participantes:</span>{' '}
                                    <span className="break-words">{resumo}</span>
                                  </p>
                                ) : null;
                              })()}
                            </div>
                          )}
                          <div className="space-y-2">
                            {filtroChecklistSet != null && filtroChecklistSet.size === 0 && (
                              <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-md px-3 py-2">
                                Nenhuma tarefa desta etapa foi atribuída a você. Fale com o supervisor
                                do projeto se precisar de acesso.
                              </p>
                            )}
                            {etapa.checklistJson.map((item, index) => {
                              if (filtroChecklistSet != null && !filtroChecklistSet.has(index)) {
                                return null;
                              }
                              // Entrega do item principal (subitemIndex null/undefined = entrega do item)
                              const entregaItem = findChecklistEntregaForUnit(etapa, index, null);
                              const baseStatusItem = getChecklistUnitStatus(etapa, { checklistIndex: index });
                              const statusItem = getChecklistUnitWorkflowStatus(etapa, { checklistIndex: index });
                              const podeEnviarObjetivo =
                                podeInteragir &&
                                !item.concluido &&
                                (baseStatusItem === 'PENDENTE' || baseStatusItem === 'REPROVADO');
                              const detailsKey = `${etapa.id}-${index}`;
                              const isExpanded = expandedChecklistDetails.has(detailsKey);
                              const hasDetails = item.descricao && item.descricao.trim().length > 0;
                              const hasSubitens = item.subitens && item.subitens.length > 0;
                              const itemNumberLabel = `${etapaNumero}.${index + 1}`;
                              const statusForStyle = statusItem;
                              return (
                                <div key={index} className="space-y-1">
                                  {/* Item principal: em mobile quebra linha — linha 1: checkbox + label; linha 2: status + ações */}
                                  <div
                                    className={`flex flex-wrap items-center gap-2 p-3 rounded-lg transition-colors sm:gap-3 ${
                                      podeInteragir ? 'hover:bg-white/10' : ''
                                    } ${getChecklistItemStyle(statusForStyle)}`}
                                  >
                                    <div
                                      className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${getCheckboxStyle(item.concluido ?? false)}`}
                                      title="Status do item"
                                    >
                                      {item.concluido && (
                                        <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className={`text-sm block truncate ${getChecklistTextStyle(item.concluido ?? false)}`}>
                                        {itemNumberLabel} {item.texto}
                                      </span>
                                    </div>
                                    {/* Grupo fixo: status + ações na mesma ordem para todos os itens */}
                                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:flex-nowrap">
                                      <span
                                        className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${getChecklistItemStatusColor(statusItem)}`}
                                      >
                                        {getChecklistItemStatusLabel(statusItem)}
                                      </span>
                                      {(hasDetails || hasSubitens) && (
                                        <button
                                          type="button"
                                          onClick={() => toggleChecklistDetails(detailsKey)}
                                          className="shrink-0 px-2 py-1 rounded text-xs transition-colors bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30"
                                          title={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes e subitens'}
                                        >
                                          {hasSubitens ? `(${item.subitens!.length})` : ''} {isExpanded ? '▲' : '▼'}
                                        </button>
                                      )}
                                      {entregaItem ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedViewEntrega({ etapa, index, entrega: entregaItem });
                                            setShowViewEntregaModal(true);
                                          }}
                                          className={`${btn.primarySoft} shrink-0 whitespace-nowrap`}
                                          title="Ver detalhes da entrega"
                                        >
                                          Ver entrega
                                        </button>
                                      ) : podeEnviarObjetivo ? (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenChecklistModal(etapa, index)}
                                          className={`${btn.primarySoft} shrink-0 whitespace-nowrap`}
                                          title="Enviar entrega para análise"
                                        >
                                          Enviar
                                        </button>
                                      ) : null}
                                    </div>
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
                                      
                                      {/* Subitens: cada um com entrega independente */}
                                      {hasSubitens && (
                                        <div className="space-y-1">
                                          <p className="text-xs text-sky-300/70 font-medium">Subitens (cada um com sua própria entrega):</p>
                                          {item.subitens!.map((subitem, subIndex) => {
                                            const subKey = `${etapa.id}-${index}-${subIndex}`;
                                            const subExpanded = expandedChecklistDetails.has(subKey);
                                            const subHasDetails = subitem.descricao && subitem.descricao.trim().length > 0;
                                            // Buscar entrega do subitem (índices podem vir como number ou string)
                                            const entregaSubitem = findChecklistEntregaForUnit(etapa, index, subIndex);
                                            const baseStatusSub = getChecklistUnitStatus(etapa, {
                                              checklistIndex: index,
                                              subitemIndex: subIndex,
                                            });
                                            const statusSubitem = getChecklistUnitWorkflowStatus(etapa, {
                                              checklistIndex: index,
                                              subitemIndex: subIndex,
                                            });
                                            const podeEnviarSubitem =
                                              podeInteragir &&
                                              !subitem.concluido &&
                                              (baseStatusSub === 'PENDENTE' || baseStatusSub === 'REPROVADO');
                                            const subItemNumberLabel = `${etapaNumero}.${index + 1}.${subIndex + 1}`;
                                            
                                            return (
                                              <div key={subIndex} className="space-y-1">
                                                <div
                                                  className={`flex flex-wrap items-center gap-2 p-2 rounded-md transition-all ${
                                                    subitem.concluido
                                                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                                                      : 'bg-white/5 border border-white/10'
                                                  }`}
                                                >
                                                  <div
                                                    className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                                                      subitem.concluido
                                                        ? 'bg-emerald-500/30 border-emerald-400/50'
                                                        : 'border-slate-400/40'
                                                    }`}
                                                    title={subitem.concluido ? 'Concluído' : 'Pendente'}
                                                  >
                                                    {subitem.concluido && (
                                                      <svg className="w-3 h-3 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                      </svg>
                                                    )}
                                                  </div>
                                                  <span className={`flex-1 min-w-0 text-xs truncate ${subitem.concluido ? 'text-emerald-300/70 line-through' : 'text-white/80'}`}>
                                                    {subItemNumberLabel} {subitem.texto}
                                                  </span>
                                                  <span className="text-[10px] text-white/60 shrink-0">
                                                    {entregaSubitem?.dataEnvio
                                                      ? new Date(entregaSubitem.dataEnvio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                      : '—'}
                                                  </span>
                                                  <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                                                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${getChecklistItemStatusColor(statusSubitem)}`}>
                                                      {getChecklistItemStatusLabel(statusSubitem)}
                                                    </span>
                                                    {entregaSubitem ? (
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
                                                    ) : podeEnviarSubitem ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleOpenChecklistModal(etapa, index, subIndex)}
                                                        className={`${btn.primarySoft} shrink-0 whitespace-nowrap`}
                                                        title="Enviar entrega da subtarefa para análise"
                                                      >
                                                        Enviar
                                                      </button>
                                                    ) : null}
                                                    {subHasDetails && (
                                                      <button
                                                        type="button"
                                                        onClick={() => toggleChecklistDetails(subKey)}
                                                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border border-slate-400/30"
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
            {projetosVisiveisCount === 0 && (
              <div className="bg-neutral/70 border border-white/10 rounded-xl p-6 text-center text-white/70">
                Nenhuma etapa encontrada com os filtros selecionados.
              </div>
            )}
                          </div>
                        </div>
                      )}

                      {/* Informações da etapa */}
                      <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-white/70">
                        {etapa.dataInicio && (
                          <div>
                            <span className="font-medium">Data Início:</span>{' '}
                            {new Date(etapa.dataInicio).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </div>
                        )}
                        {etapa.dataFim && (
                          <div>
                            <span className="font-medium">Data Fim:</span>{' '}
                            {new Date(etapa.dataFim).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </div>
                        )}
                      </div>
                      </div>
                    );
                  })}
          </div>
                  )}
        </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-neutral/80 border border-white/10 rounded-xl p-8 text-center">
          <p className="text-white/60">Nenhum projeto ou tarefa encontrada</p>
        </div>
      )}

      {showEntregaModal && selectedEtapa && (
        <AppModal
          open={showEntregaModal && !!selectedEtapa}
          onClose={handleCloseEntregaModal}
          title=""
          showHeader={false}
          size="md"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {editingEntrega ? 'Editar entrega' : 'Enviar entrega'}
                </h2>
                <p className="text-sm text-white/60 mt-1">{selectedEtapa.nome}</p>
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
                  disabled={entregaLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={btn.primary}
                  disabled={entregaLoading}
                >
                  {entregaLoading 
                    ? (editingEntrega ? 'Atualizando...' : 'Enviando...') 
                    : (editingEntrega ? 'Atualizar entrega' : 'Enviar para revisão')}
                </button>
              </div>
            </form>
        </AppModal>
      )}

      {showChecklistModal && selectedChecklistEtapa !== null && selectedChecklistIndex !== null && (() => {
        const modalEtapaNum = selectedChecklistEtapa.numeroNoProjeto ?? 1;
        const modalChecklistItem = selectedChecklistEtapa.checklistJson?.[selectedChecklistIndex];
        const modalChecklistSubitem =
          selectedSubitemIndex !== null
            ? modalChecklistItem?.subitens?.[selectedSubitemIndex]
            : null;
        const modalChecklistTexto =
          selectedSubitemIndex !== null ? modalChecklistSubitem?.texto : modalChecklistItem?.texto;
        const modalChecklistDescricao =
          selectedSubitemIndex !== null
            ? modalChecklistSubitem?.descricao?.trim() || ''
            : modalChecklistItem?.descricao?.trim() || '';
        const modalObjetivoLabel =
          selectedSubitemIndex !== null
            ? `${modalEtapaNum}.${selectedChecklistIndex + 1}.${selectedSubitemIndex + 1}`
            : `${modalEtapaNum}.${selectedChecklistIndex + 1}`;
        return (
        <AppModal
          open={showChecklistModal && selectedChecklistEtapa !== null && selectedChecklistIndex !== null}
          onClose={handleCloseChecklistModal}
          title=""
          showHeader={false}
          size="md"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedSubitemIndex !== null ? 'Enviar subtarefa' : 'Enviar entrega da tarefa'}
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  {selectedChecklistEtapa.nome} • {modalObjetivoLabel}
                </p>
                {modalChecklistTexto && <p className="text-xs text-white/40">{modalChecklistTexto}</p>}
                {modalChecklistDescricao && (
                  <p className="mt-2 text-xs text-white/70 whitespace-pre-wrap">
                    {modalChecklistDescricao}
                  </p>
                )}
              </div>
              <button type="button" onClick={handleCloseChecklistModal} className="text-white/50 hover:text-white transition-colors text-2xl">✕</button>
            </div>

            <form onSubmit={handleSubmitChecklistEntrega} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Descrição da entrega <span className="text-danger">*</span>
                </label>
                <textarea
                  value={objetivoDescricao}
                  onChange={(e) => setObjetivoDescricao(e.target.value)}
                  required
                  minLength={5}
                  rows={4}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-3 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Explique o que foi realizado nesta tarefa ou subtarefa"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">
                    Arquivos (opcional) - Você pode selecionar múltiplos arquivos (até {UPLOAD_LIMITS.tarefa.maxMb} MB cada)
                  </label>
                  <FileDropInput 
                    multiple
                    onFilesSelected={(files) => {
                      void handleObjetivoFilesChange(files);
                    }} 
                    className="w-full text-sm text-white/80 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary/20 file:text-primary hover:file:bg-primary/30" 
                    dropMessage="Solte arquivos aqui"
                  />
                  <p className="text-xs text-white/50 mt-1">
                    Imagens serão exibidas como pré-visualização. Outros tipos de arquivos serão enviados normalmente (limite {UPLOAD_LIMITS.tarefa.maxMb} MB por arquivo).
                  </p>
                </div>

                {/* Previews dos arquivos */}
                {objetivoPreviews.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <label className="block text-sm font-medium text-white/90">Arquivos selecionados:</label>
                    <div className="grid grid-cols-1 gap-2">
                      {objetivoPreviews.map((preview, index) => (
                        <div key={index} className="flex items-start gap-2 p-2 bg-white/5 rounded-md border border-white/10">
                          {preview.type === 'image' ? (
                            <img 
                              src={resolveFileUrl(preview.url)} 
                              alt={preview.name} 
                              className="w-16 h-16 rounded object-cover border border-white/20"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
                              <span className="text-2xl">📄</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/80 truncate">{preview.name}</p>
                            <p className="text-xs text-white/50">{preview.type === 'image' ? 'Imagem' : 'Documento'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeObjetivoPreview(index)}
                            className="px-2 py-1 text-xs bg-danger/20 hover:bg-danger/30 text-danger rounded border border-danger/30 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {objetivoError && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">{objetivoError}</div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                <button type="button" onClick={handleCloseChecklistModal} className={btn.secondary} disabled={objetivoLoading}>
                  Cancelar
                </button>
                <button type="submit" className={btn.primary} disabled={objetivoLoading}>
                  {objetivoLoading ? 'Enviando...' : 'Enviar para análise'}
                </button>
              </div>
            </form>
        </AppModal>
        );
      })()}

      {/* Modal Visualizar Entrega */}
      {showViewEntregaModal && selectedViewEntrega && (
        <AppModal
          open={showViewEntregaModal && !!selectedViewEntrega}
          onClose={() => {
            setShowViewEntregaModal(false);
            setSelectedViewEntrega(null);
          }}
          title=""
          showHeader={false}
          size="md"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/20 flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <h2 className="text-xl font-semibold text-white">Detalhes da Entrega</h2>
                <p className="text-sm text-white/60 mt-1 break-words [overflow-wrap:anywhere]">
                  {selectedViewEntrega.etapa.nome} •{' '}
                  {(() => {
                    const n = selectedViewEntrega.etapa.numeroNoProjeto ?? 1;
                    const sub = selectedViewEntrega.entrega.subitemIndex;
                    return sub != null && sub >= 0
                      ? `${n}.${selectedViewEntrega.index + 1}.${sub + 1}`
                      : `${n}.${selectedViewEntrega.index + 1}`;
                  })()}
                </p>
                {selectedViewEntrega.etapa.checklistJson && selectedViewEntrega.etapa.checklistJson[selectedViewEntrega.index] && (
                  <p className="text-xs text-white/40 mt-1 break-words [overflow-wrap:anywhere]">
                    {selectedViewEntrega.etapa.checklistJson[selectedViewEntrega.index]?.texto}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowViewEntregaModal(false);
                  setSelectedViewEntrega(null);
                }}
                className="shrink-0 text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 min-w-0 overflow-x-hidden">
              {(() => {
                // Usuário pode editar se for executor ou integrante da etapa
                const executorId = selectedViewEntrega.etapa.executorId;
                const integrantesIds =
                  selectedViewEntrega.etapa.integrantes?.map((i) => i.usuario.id).filter(Boolean) || [];
                const userId = user?.id ? Number(user.id) : null;
                const canEditFromModal =
                  !!userId &&
                  (userId === Number(executorId) ||
                    integrantesIds.some((id) => Number(id) === userId));

                return (
                  canEditFromModal && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const entrega = selectedViewEntrega.entrega;

                          // Montar arrays de imagens/documentos a partir da entrega existente
                          const existingImages =
                            entrega.imagensUrls && Array.isArray(entrega.imagensUrls) && entrega.imagensUrls.length > 0
                              ? (entrega.imagensUrls as string[])
                              : entrega.imagemUrl
                                ? [entrega.imagemUrl]
                                : [];

                          const existingDocs =
                            entrega.documentosUrls && Array.isArray(entrega.documentosUrls) && entrega.documentosUrls.length > 0
                              ? (entrega.documentosUrls as string[])
                              : entrega.documentoUrl
                                ? [entrega.documentoUrl]
                                : [];

                          const previews: { url: string; name: string; type: 'image' | 'document' }[] = [];
                          existingImages.forEach((url, index) => {
                            previews.push({
                              url,
                              name: `Imagem ${index + 1}`,
                              type: 'image',
                            });
                          });
                          existingDocs.forEach((url, index) => {
                            previews.push({
                              url,
                              name: `Documento ${index + 1}`,
                              type: 'document',
                            });
                          });

                          // Abrir modal de envio/edição de objetivo com os dados atuais
                          setShowViewEntregaModal(false);
                          setSelectedChecklistEtapa(selectedViewEntrega.etapa);
                          setSelectedChecklistIndex(selectedViewEntrega.index);
                          setSelectedSubitemIndex(entrega.subitemIndex ?? null);
                          setObjetivoDescricao(entrega.descricao || '');
                          setObjetivoImagens(existingImages);
                          setObjetivoDocumentos(existingDocs);
                          setObjetivoPreviews(previews);
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
              })()}

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
                    className={`inline-block px-3 py-1.5 rounded-md text-xs font-semibold ${
                      selectedViewEntrega.entrega.status === 'EM_ANALISE'
                        ? 'bg-violet-500/30 text-violet-200 border border-violet-400/50'
                        : selectedViewEntrega.entrega.status === 'APROVADO'
                        ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50'
                        : selectedViewEntrega.entrega.status === 'REPROVADO'
                        ? 'bg-rose-500/30 text-rose-200 border border-rose-400/50'
                        : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    }`}
                  >
                    {selectedViewEntrega.entrega.status === 'PENDENTE'
                      ? 'Pendente'
                      : selectedViewEntrega.entrega.status === 'EM_ANALISE'
                      ? 'Em análise'
                      : selectedViewEntrega.entrega.status === 'APROVADO'
                      ? 'Aprovado'
                      : 'Reprovado'}
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

              <div className="flex justify-end pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewEntregaModal(false);
                    setSelectedViewEntrega(null);
                  }}
                  className={btn.secondary}
                >
                  Fechar
                </button>
              </div>
            </div>
        </AppModal>
      )}
    </div>
  );
}
