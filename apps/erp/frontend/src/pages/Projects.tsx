import { useEffect, useState, FormEvent, useRef, useMemo, ChangeEvent, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx-js-style';
import { api } from '../services/api';
import { Projeto, ChecklistItem, ProjetoArquivo } from '../types';
import { btn } from '../utils/buttonStyles';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { FileDropInput } from '../components/FileDropInput';
import { FilePreviewTrigger } from '../components/files/FilePreviewTrigger';
import { urlsToViewerItems } from '../contexts/FileViewerContext';
import { toast, formatApiError } from '../utils/toast';
import {
  buildAnaliseFilaFiltros,
  filterAndSortAnaliseFila,
  filaItemToReviewTarget,
  groupAnaliseFilaForDisplay,
  projetoOptionsFromAnalise,
  reviewTargetToKey,
  type AnaliseEscopoExecutor,
  type AnaliseOrdemFila,
  type AnaliseProjetoGrupo,
} from '../utils/analiseFilaEntregas';
import { countPendenciasInProjetoGrupo } from '../utils/pendingReviewFromEmAnalise';
import { UPLOAD_LIMITS, validateDescricaoProjetoFileSize } from '../utils/uploadLimits';
import { buildProjectsTemplateWorkbook } from '../utils/projectsExcelTemplate';
import { useFormValidation, validators, errorMessages } from '../utils/validation';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { useTextFilter } from '../hooks/useTextFilter';
import { AppInput } from '../components/ui/AppInput';
import { AppSelect } from '../components/ui/AppSelect';
import { AppModal } from '../components/ui/AppModal';
import { NumericInput } from '../components/ui/NumericInput';
import { ConfirmDeleteByNameModal } from '../components/ui/ConfirmDeleteByNameModal';
import { namesMatchForDeleteConfirm } from '../utils/deleteNameConfirm';
import { useAuthStore } from '../store/auth';
import { userHasPermission, userHasProjectDeliveryReviewerPermission } from '../utils/projectAccess';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';
import { ReviewEntregaPopup, type ReviewEntregaPopupTarget } from '../components/projects/ReviewEntregaPopup';
import { ProjetoEquipeMembrosField } from '../components/projects/ProjetoEquipeMembrosField';
import {
  buildProjetoResponsavelIdsPayload,
  mergeProjetoEquipeOnSetorChange,
} from '../utils/projetoEquipe';

function buildProjetoArquivosGallery(arquivos: ProjetoArquivo[]) {
  return urlsToViewerItems(
    arquivos.map((f) => f.url),
    (_url, i) => arquivos[i]?.originalName || arquivos[i]?.url || '',
  );
}

interface SimpleUser {
  id: number;
  nome: string;
}

interface SimpleSetor {
  id: number;
  nome: string;
  membros?: Array<{
    usuario: { id: number };
  }>;
}

interface CreateProjectForm {
  nome: string;
  resumo?: string;
  objetivo?: string;
  valorTotal?: number;
  supervisorId?: number;
  setorIds: number[];
  responsavelIds: number[];
  excludedAutoIds: number[];
  status?: 'EM_ANDAMENTO' | 'FINALIZADO';
  descricaoLonga?: string;
}

type ProjectsSortCol = 'nome' | 'status' | 'progresso' | 'supervisor' | 'valorTotal';

type ProjectsMainTab = 'lista' | 'analise';

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id != null ? Number(user.id) : null;
  const viewerIsAdmin = userHasPermission(user, 'sistema:administrar');
  const podeVerFilaAnalise = useMemo(
    () => userHasProjectDeliveryReviewerPermission(user),
    [user],
  );
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [setores, setSetores] = useState<SimpleSetor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [editingProject, setEditingProject] = useState<Projeto | null>(null);
  const [form, setForm] = useState<CreateProjectForm>({
    nome: '',
    resumo: '',
    objetivo: '',
    valorTotal: undefined,
    supervisorId: undefined,
    setorIds: [],
    responsavelIds: [],
    excludedAutoIds: [],
    status: 'EM_ANDAMENTO',
    descricaoLonga: '',
  });
  const [pendingDescricaoFiles, setPendingDescricaoFiles] = useState<File[]>([]);
  const [projectDescricaoArquivos, setProjectDescricaoArquivos] = useState<ProjetoArquivo[]>([]);
  const [projectDescricaoSaving, setProjectDescricaoSaving] = useState(false);
  const [projectDescricaoError, setProjectDescricaoError] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'EM_ANDAMENTO' | 'FINALIZADO'>('all');
  const [setorFilter, setSetorFilter] = useState<number | 'all'>('all');
  const [supervisorFilter, setSupervisorFilter] = useState<number | 'all'>('all');
  const [valorMin, setValorMin] = useState<string>('');
  const [valorMax, setValorMax] = useState<string>('');
  const [progressMin, setProgressMin] = useState<string>('');
  const [progressMax, setProgressMax] = useState<string>('');

  const { sortColumn: projSortCol, sortDirection: projSortDir, handleSort: handleProjSort } =
    useClientTableSort<ProjectsSortCol>('nome');

  const [mainTab, setMainTab] = useState<ProjectsMainTab>('lista');
  const mainTabRef = useRef(mainTab);
  mainTabRef.current = mainTab;
  const [analiseRows, setAnaliseRows] = useState<AnaliseProjetoGrupo[]>([]);
  const [analiseLoading, setAnaliseLoading] = useState(false);
  const [analiseRefreshing, setAnaliseRefreshing] = useState(false);
  const [analiseError, setAnaliseError] = useState<string | null>(null);
  const [showAnaliseFilters, setShowAnaliseFilters] = useState(false);
  const [analiseProjetoFilter, setAnaliseProjetoFilter] = useState<number | 'all'>('all');
  const [analiseBusca, setAnaliseBusca] = useState('');
  const [analiseOrdem, setAnaliseOrdem] = useState<AnaliseOrdemFila>('antigas');
  const [analiseEscopoExecutor, setAnaliseEscopoExecutor] = useState<AnaliseEscopoExecutor>('para_avaliar');
  const [reviewEntregaTarget, setReviewEntregaTarget] = useState<ReviewEntregaPopupTarget | null>(null);

  const loadAnalise = useCallback(async (opts?: { silent?: boolean }): Promise<AnaliseProjetoGrupo[]> => {
    if (opts?.silent) {
      setAnaliseRefreshing(true);
    } else {
      setAnaliseLoading(true);
    }
    setAnaliseError(null);
    try {
      const { data } = await api.get<AnaliseProjetoGrupo[]>('/projects/tasks-em-analise');
      const rows = Array.isArray(data) ? data : [];
      setAnaliseRows(rows);
      return rows;
    } catch (err: any) {
      setAnaliseError(err.response?.data?.message ?? 'Falha ao carregar tarefas em análise');
      setAnaliseRows([]);
      return [];
    } finally {
      if (opts?.silent) {
        setAnaliseRefreshing(false);
      } else {
        setAnaliseLoading(false);
      }
    }
  }, []);

  const analiseProjetoOptions = useMemo(
    () => projetoOptionsFromAnalise(analiseRows),
    [analiseRows],
  );

  const analiseFiltrosAtivos = useMemo(
    () =>
      buildAnaliseFilaFiltros({
        projetoId: analiseProjetoFilter,
        busca: analiseBusca,
        ordem: analiseOrdem,
        escopoExecutor: analiseEscopoExecutor,
        viewerUserId: currentUserId,
        viewerIsAdmin,
      }),
    [
      analiseProjetoFilter,
      analiseBusca,
      analiseOrdem,
      analiseEscopoExecutor,
      currentUserId,
      viewerIsAdmin,
    ],
  );

  const analiseFilaFiltrada = useMemo(
    () => filterAndSortAnaliseFila(analiseRows, analiseFiltrosAtivos),
    [analiseRows, analiseFiltrosAtivos],
  );

  const analiseRowsExibidas = useMemo(
    () => groupAnaliseFilaForDisplay(analiseFilaFiltrada),
    [analiseFilaFiltrada],
  );

  const handleEntregaAvaliada = useCallback(async () => {
    const currentKey = reviewEntregaTarget ? reviewTargetToKey(reviewEntregaTarget) : null;
    const queueBefore = filterAndSortAnaliseFila(analiseRows, analiseFiltrosAtivos);
    const idxBefore = currentKey ? queueBefore.findIndex((i) => i.key === currentKey) : 0;

    const rows = await loadAnalise({ silent: true });
    const queueAfter = filterAndSortAnaliseFila(rows, analiseFiltrosAtivos);

    if (queueAfter.length === 0) {
      setReviewEntregaTarget(null);
      toast.success('Nenhuma entrega pendente na fila com os filtros atuais.');
      return;
    }

    const nextIdx = Math.min(Math.max(0, idxBefore), queueAfter.length - 1);
    setReviewEntregaTarget(filaItemToReviewTarget(queueAfter[nextIdx]!));
  }, [
    reviewEntregaTarget,
    analiseRows,
    analiseFiltrosAtivos,
    loadAnalise,
  ]);

  useEffect(() => {
    if (!podeVerFilaAnalise) return;
    void loadAnalise();
  }, [podeVerFilaAnalise, loadAnalise]);

  useEffect(() => {
    if (mainTab !== 'analise') return;
    void loadAnalise({ silent: analiseRows.length > 0 });
  }, [mainTab, loadAnalise]);

  const canSeeAllProjects = userHasPermission(user, 'projetos:ver_todos');
  const canManageProjects = canSeeAllProjects;

  useEffect(() => {
    if (!podeVerFilaAnalise && mainTab === 'analise') {
      setMainTab('lista');
    }
  }, [podeVerFilaAnalise, mainTab]);

  useEffect(() => {
    if (searchParams.get('tab') === 'analise') {
      if (podeVerFilaAnalise) setMainTab('analise');
      else setSearchParams({}, { replace: true });
    }
  }, [searchParams, podeVerFilaAnalise, setSearchParams]);

  const openListaTab = useCallback(() => {
    setMainTab('lista');
    if (searchParams.get('tab')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const openAnaliseTab = useCallback(() => {
    if (!podeVerFilaAnalise) return;
    setMainTab('analise');
    setSearchParams({ tab: 'analise' }, { replace: true });
  }, [podeVerFilaAnalise, setSearchParams]);

  const projectsForRole = useMemo(() => {
    if (canSeeAllProjects || currentUserId == null) return projects;
    return projects.filter((p) => Number(p.supervisor?.id) === currentUserId);
  }, [projects, canSeeAllProjects, currentUserId]);

  const statusOptions = [
    { value: 'EM_ANDAMENTO', label: 'Em Andamento' },
    { value: 'FINALIZADO', label: 'Finalizado' },
  ];

  const textFilteredProjects = useTextFilter(projectsForRole, searchTerm, (p) => [
    p.nome,
    p.resumo,
    p.objetivo,
    ...(Array.isArray((p as any).setores) ? (p as any).setores.map((s: any) => s?.nome) : []),
    p.supervisor?.nome,
    ...(Array.isArray((p as any).responsaveis) ? (p as any).responsaveis.map((r: any) => r?.nome) : []),
  ]);

  const filteredProjects = useMemo(() => {
    return textFilteredProjects.filter((p) => {
      if (statusFilter !== 'all' && (p as any).status !== statusFilter) return false;
      if (
        setorFilter !== 'all' &&
        !(Array.isArray((p as any).setores) ? (p as any).setores.some((s: any) => s?.id === setorFilter) : false)
      )
        return false;
      if (supervisorFilter !== 'all' && (p as any).supervisorId !== supervisorFilter) return false;

      const valor = Number((p as any).valorTotal ?? 0);
      if (valorMin.trim()) {
        const min = Number(valorMin);
        if (!Number.isNaN(min) && valor < min) return false;
      }
      if (valorMax.trim()) {
        const max = Number(valorMax);
        if (!Number.isNaN(max) && valor > max) return false;
      }

      const progress = Number((p as any).progress ?? 0);
      if (progressMin.trim()) {
        const min = Number(progressMin);
        if (!Number.isNaN(min) && progress < min) return false;
      }
      if (progressMax.trim()) {
        const max = Number(progressMax);
        if (!Number.isNaN(max) && progress > max) return false;
      }
      return true;
    });
  }, [textFilteredProjects, statusFilter, setorFilter, supervisorFilter, valorMin, valorMax, progressMin, progressMax]);

  const totalPendenciasEmAnalise = useMemo(() => {
    const filtrosBadge = buildAnaliseFilaFiltros({
      projetoId: 'all',
      busca: '',
      ordem: 'antigas',
      escopoExecutor: 'para_avaliar',
      viewerUserId: currentUserId,
      viewerIsAdmin,
    });
    return filterAndSortAnaliseFila(analiseRows, filtrosBadge).length;
  }, [analiseRows, currentUserId, viewerIsAdmin]);

  const sortedProjects = useMemo(() => {
    const rows = [...filteredProjects];
    const statusSortKey = (p: Projeto) => ((p.progress ?? 0) >= 100 ? 'FINALIZADO' : p.status) ?? '';
    rows.sort((a, b) => {
      let cmp = 0;
      const progressA = a.progress ?? 0;
      const progressB = b.progress ?? 0;
      switch (projSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'status':
          cmp = statusSortKey(a).localeCompare(statusSortKey(b));
          break;
        case 'progresso':
          cmp = progressA - progressB;
          break;
        case 'supervisor':
          cmp = (a.supervisor?.nome ?? '').localeCompare(b.supervisor?.nome ?? '');
          break;
        case 'valorTotal':
          cmp = (a.valorTotal ?? 0) - (b.valorTotal ?? 0);
          break;
        default:
          cmp = 0;
      }
      return projSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredProjects, projSortCol, projSortDir]);

  const renderProjTh = useCallback(
    (col: ProjectsSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: projSortCol,
        sortDirection: projSortDir,
        onSort: handleProjSort,
        align: 'left',
      }),
    [projSortCol, projSortDir, handleProjSort],
  );

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== 'all' ||
    setorFilter !== 'all' ||
    supervisorFilter !== 'all' ||
    valorMin.trim().length > 0 ||
    valorMax.trim().length > 0 ||
    progressMin.trim().length > 0 ||
    progressMax.trim().length > 0;

  // Regras de validação
  const validationRules = useMemo(() => ({
    nome: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(3), message: errorMessages.minLength(3) },
      { validator: validators.maxLength(120), message: errorMessages.maxLength(120) },
    ],
    valorTotal:
      form.valorTotal !== undefined && form.valorTotal !== null
        ? [{
            validator: (v: number) => v >= 0,
            message: 'Informe um valor maior ou igual a zero',
          }]
        : [],
    supervisorId: form.supervisorId !== undefined && form.supervisorId !== null
      ? [{ validator: (v: number) => v > 0, message: 'Selecione um supervisor' }]
      : [],
  }), [form.valorTotal, form.supervisorId]);

  // Validação de formulário
  const validation = useFormValidation<CreateProjectForm>(validationRules);
  const MAX_PROJECT_FILES = 10;
  const MAX_PROJECT_FILE_SIZE_MB = UPLOAD_LIMITS.descricaoProjeto.maxMb;

  const resolveFileUrl = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }

    const base = api.defaults.baseURL || '';
    try {
      const baseUrl = new URL(base, window.location.origin);
      const origin = baseUrl.origin;
      const path = url.startsWith('/') ? url : `/${url}`;
      return `${origin}${path}`;
    } catch {
      return url;
    }
  };

  const normalizeDescricaoArquivos = (arquivos: ProjetoArquivo[] | null | undefined): ProjetoArquivo[] =>
    Array.isArray(arquivos) ? arquivos : [];

  const validateIncomingFiles = (incomingFiles: File[], currentCount: number): string | null => {
    if (currentCount + incomingFiles.length > MAX_PROJECT_FILES) {
      return `Limite de ${MAX_PROJECT_FILES} arquivos por projeto excedido.`;
    }

    for (const file of incomingFiles) {
      const erro = validateDescricaoProjetoFileSize(file);
      if (erro) return erro;
    }

    return null;
  };

  async function uploadDescricaoFiles(projectId: number, files: File[]) {
    if (!files.length) {
      return normalizeDescricaoArquivos(projectDescricaoArquivos);
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const { data } = await api.post<ProjetoArquivo[]>(
      `/projects/${projectId}/descricao-files`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );

    return normalizeDescricaoArquivos(data);
  }

  async function loadProjects(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      setError(null);
      const { data } = await api.get<Projeto[]>('/projects');
      setProjects(data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Falha ao carregar projetos');
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }

  async function loadUsers() {
    try {
      const { data } = await api.get<SimpleUser[]>('/users/options');
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

  const setCell = (
    sheet: XLSX.WorkSheet,
    r: number,
    c: number,
    value: string | number,
  ) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    const existing: any = (sheet as any)[cellRef] || {};
    const cell: any = {
      v: value,
      t: typeof value === 'number' ? 'n' : 's',
    };
    if (existing.s) cell.s = existing.s;
    (sheet as any)[cellRef] = cell;
  };

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const clearProjectSelection = () => {
    setSelectedProjectIds(new Set());
  };

  async function handleExportSelectedExcel() {
    try {
      if (selectedProjectIds.size === 0) {
        toast.error('Selecione pelo menos um projeto para exportar.');
        return;
      }

      const response = await api.post(
        '/projects/export',
        { projectIds: Array.from(selectedProjectIds) },
        { responseType: 'blob' },
      );

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedProjectIds.size === 1 ? 'projeto.xlsx' : 'projetos.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Arquivo Excel exportado com sucesso!');
      clearProjectSelection();
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      toast.error(errorMessage);
    }
  }

  async function handleExportProjectExcel(id: number) {
    try {
      const { data } = await api.get(`/projects/${id}`);

      const wb = buildProjectsTemplateWorkbook();

      const projetoNome: string = data.nome;
      const resumo: string = data.resumo ?? '';
      const objetivo: string = data.objetivo ?? '';
      const valorTotal: number = data.valorTotal ?? 0;
      const supervisorEmail: string = data.supervisor?.email ?? '';

      // Aba Projetos - linha 2 (r = 1)
      const projetosSheet = wb.Sheets.Projetos;
      if (projetosSheet) {
        setCell(projetosSheet, 1, 0, projetoNome);
        setCell(projetosSheet, 1, 1, resumo);
        setCell(projetosSheet, 1, 2, objetivo);
        setCell(projetosSheet, 1, 3, valorTotal);
        setCell(projetosSheet, 1, 4, supervisorEmail);
      }

      // Aba Sessões - preencher com as sessões do projeto (aba "Sessoes")
      const sessoesSheet = wb.Sheets.Sessoes;
      const sessoes: any[] = Array.isArray(data.sessoes) ? data.sessoes : [];
      if (sessoesSheet && sessoes.length > 0) {
        let row = 1; // começa na linha 2
        for (const sessao of sessoes) {
          setCell(sessoesSheet, row, 0, projetoNome);
          setCell(sessoesSheet, row, 1, sessao.nome ?? '');
          setCell(sessoesSheet, row, 2, typeof sessao.ordem === 'number' ? sessao.ordem : 0);
          row += 1;
        }
      }

      // Aba Etapas
      const etapasSheet = wb.Sheets.Etapas;
      const etapas: any[] = Array.isArray(data.etapas) ? data.etapas : [];
      if (etapasSheet && etapas.length > 0) {
        let row = 1; // começa na linha 2
        for (const etapa of etapas) {
          const participantesEmails = (() => {
            const emails: string[] = [];
            if (etapa.executor?.email) emails.push(etapa.executor.email);
            if (Array.isArray(etapa.integrantes)) {
              for (const i of etapa.integrantes) {
                const email = i?.usuario?.email;
                if (email && !emails.includes(email)) emails.push(email);
              }
            }
            return emails.join(', ');
          })();

          // Colunas da aba Etapas:
          // 0: projetoNome
          // 1: sessaoNome
          // 2: nome (etapa)
          // 3: aba
          // 4: descricao
          // 5: dataInicio
          // 6: dataFim
          // 7: valorInsumos
          // 8: participantesEmails

          setCell(etapasSheet, row, 0, projetoNome);
          setCell(etapasSheet, row, 1, etapa.sessao?.nome ?? '');
          setCell(etapasSheet, row, 2, etapa.nome ?? '');
          setCell(etapasSheet, row, 3, etapa.aba ?? '');
          setCell(etapasSheet, row, 4, etapa.descricao ?? '');
          setCell(
            etapasSheet,
            row,
            5,
            etapa.dataInicio ? String(etapa.dataInicio).slice(0, 10) : '',
          );
          setCell(
            etapasSheet,
            row,
            6,
            etapa.dataFim ? String(etapa.dataFim).slice(0, 10) : '',
          );
          setCell(etapasSheet, row, 7, etapa.valorInsumos ?? 0);
          setCell(etapasSheet, row, 8, participantesEmails);
          row += 1;
        }
      }

      const checklistSheet = wb.Sheets.Tarefas ?? wb.Sheets.Checklist;
      const checklistSubSheet = wb.Sheets.Subtarefas ?? wb.Sheets.ChecklistSubitens;

      if ((checklistSheet || checklistSubSheet) && etapas.length > 0) {
        let rowItem = 1; // linha 2
        let rowSub = 1;

        for (const etapa of etapas) {
          const checklist: ChecklistItem[] = Array.isArray(etapa.checklistJson)
            ? (etapa.checklistJson as ChecklistItem[])
            : [];

          const integranteIdToEmail = new Map<number, string>();
          if (Array.isArray(etapa.integrantes)) {
            for (const row of etapa.integrantes) {
              const uid = row?.usuario?.id;
              const em = row?.usuario?.email;
              if (typeof uid === 'number' && em) integranteIdToEmail.set(uid, em);
            }
          }

          for (const item of checklist) {
            const itemTexto = (item.texto ?? '').trim();
            const itemDescricao = (item.descricao ?? '').trim();

            if (!itemTexto && (!item.subitens || item.subitens.length === 0)) {
              continue;
            }

            const itemIntegrantesEmails =
              Array.isArray(item.integrantesIds) && item.integrantesIds.length > 0
                ? item.integrantesIds
                    .map((id) => integranteIdToEmail.get(Number(id)))
                    .filter((e): e is string => Boolean(e))
                    .join(', ')
                : '';

            const itemPontos =
              typeof item.pontos === 'number' && Number.isFinite(item.pontos) && item.pontos >= 1
                ? Math.min(9999, Math.floor(item.pontos))
                : 1;

            if (checklistSheet) {
              setCell(checklistSheet, rowItem, 0, projetoNome);
              setCell(checklistSheet, rowItem, 1, etapa.nome ?? '');
              setCell(checklistSheet, rowItem, 2, itemTexto);
              setCell(checklistSheet, rowItem, 3, itemDescricao);
              setCell(checklistSheet, rowItem, 4, itemPontos);
              setCell(checklistSheet, rowItem, 5, itemIntegrantesEmails);
              rowItem += 1;
            }

            if (checklistSubSheet && item.subitens && item.subitens.length > 0) {
              const itemPontosTotal =
                typeof item.pontos === 'number' && Number.isFinite(item.pontos) && item.pontos >= 1
                  ? Math.min(9999, Math.floor(item.pontos))
                  : 1;
              const totalSubitens = item.subitens.length;
              for (const sub of item.subitens) {
                const subTexto = (sub.texto ?? '').trim();
                if (!subTexto) continue;
                // Pontos de subtarefa = floor(item.pontos / total_subitens), mínimo 1
                const subPontos = Math.max(1, Math.floor(itemPontosTotal / totalSubitens));
                setCell(checklistSubSheet, rowSub, 0, projetoNome);
                setCell(checklistSubSheet, rowSub, 1, etapa.nome ?? '');
                setCell(checklistSubSheet, rowSub, 2, itemTexto);
                setCell(checklistSubSheet, rowSub, 3, subTexto);
                setCell(
                  checklistSubSheet,
                  rowSub,
                  4,
                  (sub.descricao ?? '').trim(),
                );
                setCell(checklistSubSheet, rowSub, 5, subPontos);
                rowSub += 1;
              }
            }
          }
        }
      }

      const fileName =
        projetoNome && typeof projetoNome === 'string'
          ? `projeto-${projetoNome}.xlsx`
          : `projeto-${id}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Projeto exportado para Excel com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      toast.error(errorMessage);
    }
  }

  useEffect(() => {
    loadProjects(true);
    loadUsers();
    loadSetores();

    // Recarregar projetos quando a página ganha foco novamente
    const handleFocus = () => {
      loadProjects(false);
      if (mainTabRef.current === 'analise') void loadAnalise();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (canSeeAllProjects || currentUserId == null) return;
    const supervised = projects.filter((p) => Number(p.supervisor?.id) === currentUserId);
    if (supervised.length === 0) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, canSeeAllProjects, currentUserId, projects, navigate]);

  useEffect(() => {
    // Se vier com ?edit=ID na URL, abrir automaticamente o modal de edição desse projeto
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');
    if (!editId) return;

    const idNumber = Number(editId);
    if (!Number.isFinite(idNumber) || idNumber <= 0) return;

    const project = projects.find((p) => p.id === idNumber);
    if (project) {
      openEditModal(project);
      // Limpar o parâmetro da URL para evitar reabrir ao voltar
      navigate('/projects', { replace: true });
    }
  }, [location.search, projects]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManageProjects) {
      toast.error('Você não tem permissão para alterar projetos.');
      return;
    }
    setSubmitting(true);
    setModalError(null);
    setError(null);
    setProjectDescricaoError(null);

    // Validar todos os campos
    if (!validation.validateAll(form)) {
      setSubmitting(false);
      return;
    }

    
    try {

      if (editingProject) {
        const payload: any = {
          nome: form.nome.trim(),
        };

        if (typeof form.resumo === 'string') payload.resumo = form.resumo?.trim() ?? '';
        if (typeof form.objetivo === 'string') payload.objetivo = form.objetivo?.trim() ?? '';
        if (typeof form.descricaoLonga === 'string') {
          payload.descricaoLonga = form.descricaoLonga.trim() || null;
        }
        // descricaoArquivos agora é gerenciado pelos endpoints específicos
        if (typeof form.valorTotal === 'number') payload.valorTotal = form.valorTotal;
        if (typeof form.supervisorId !== 'undefined') payload.supervisorId = form.supervisorId;
        payload.setorIds = form.setorIds;
        if (form.status) payload.status = form.status;

        await api.patch(`/projects/${editingProject.id}`, payload);
        const responsavelIds = buildProjetoResponsavelIdsPayload(
          setores,
          form.setorIds,
          form.responsavelIds,
          form.excludedAutoIds,
          form.supervisorId,
        );
        await api.patch(`/projects/${editingProject.id}/responsibles`, { responsavelIds });
      } else {
        const payload: any = {
          nome: form.nome.trim(),
        };

        if (form.resumo && form.resumo.trim().length > 0) payload.resumo = form.resumo.trim();
        if (form.objetivo && form.objetivo.trim().length > 0) payload.objetivo = form.objetivo.trim();
        if (form.descricaoLonga && form.descricaoLonga.trim().length > 0) {
          payload.descricaoLonga = form.descricaoLonga.trim();
        }
        // descricaoArquivos será anexado depois, na edição
        if (typeof form.valorTotal === 'number') payload.valorTotal = form.valorTotal;
        if (form.supervisorId) payload.supervisorId = form.supervisorId;
        payload.setorIds = form.setorIds;
        payload.responsavelIds = buildProjetoResponsavelIdsPayload(
          setores,
          form.setorIds,
          form.responsavelIds,
          form.excludedAutoIds,
          form.supervisorId,
        );

        const { data: createdProject } = await api.post<Projeto>('/projects', payload);
        if (pendingDescricaoFiles.length > 0) {
          const uploaded = await uploadDescricaoFiles(createdProject.id, pendingDescricaoFiles);
          setProjectDescricaoArquivos(uploaded);
        }
      }

      setShowModal(false);
      setEditingProject(null);
      setPendingDescricaoFiles([]);
      setProjectDescricaoArquivos([]);
      setProjectDescricaoError(null);
      setForm({
        nome: '',
        resumo: '',
        objetivo: '',
        valorTotal: undefined,
        supervisorId: undefined,
        responsavelIds: [],
        excludedAutoIds: [],
        setorIds: [],
        status: 'EM_ANDAMENTO',
        descricaoLonga: '',
      });
      validation.reset();
      await loadProjects();
      toast.success(editingProject ? 'Projeto atualizado com sucesso!' : 'Projeto criado com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setModalError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateModal() {
    if (!canManageProjects) {
      toast.error('Você não tem permissão para criar projetos.');
      return;
    }
    setEditingProject(null);
    setForm({
      nome: '',
      resumo: '',
      objetivo: '',
      valorTotal: undefined,
      supervisorId: undefined,
      responsavelIds: [],
      excludedAutoIds: [],
      setorIds: [],
      status: 'EM_ANDAMENTO',
      descricaoLonga: '',
    });
    validation.reset();
    setModalError(null);
    setPendingDescricaoFiles([]);
    setProjectDescricaoArquivos([]);
    setProjectDescricaoError(null);
    setShowModal(true);
  }

  function openEditModal(project: Projeto) {
    if (!canManageProjects) {
      toast.error('Você não tem permissão para editar dados do projeto.');
      return;
    }
    const supervisorId = project.supervisor?.id;
    setEditingProject(project);
    setForm({
      nome: project.nome,
      resumo: project.resumo ?? '',
      objetivo: project.objetivo ?? '',
      valorTotal: project.valorTotal ?? undefined,
      supervisorId: supervisorId ?? undefined,
      setorIds: Array.isArray((project as any).setores)
        ? (project as any).setores.map((s: any) => s.id)
        : (typeof (project as any).setorId !== 'undefined' && (project as any).setorId
            ? [(project as any).setorId]
            : (project as any).setor?.id
              ? [(project as any).setor.id]
              : []),
      responsavelIds: project.responsaveis
        ? project.responsaveis
            .map((r) => r.usuario.id)
            .filter((id) => id !== supervisorId)
        : [],
      excludedAutoIds: Array.isArray((project as any).responsaveisExcluidos)
        ? (project as any).responsaveisExcluidos.map((x: any) => x.usuarioId)
        : [],
      status: project.status,
      descricaoLonga: project.descricaoLonga ?? '',
    });
    validation.reset();
    setModalError(null);
    setPendingDescricaoFiles([]);
    setProjectDescricaoArquivos(normalizeDescricaoArquivos(project.descricaoArquivos));
    setProjectDescricaoError(null);
    setShowModal(true);
  }

  async function handleDeleteProject(id: number) {
    if (!canManageProjects) {
      toast.error('Você não tem permissão para excluir projetos.');
      return;
    }
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    
    setProjectToDelete(project);
    setDeleteConfirmName('');
    setError(null);
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!projectToDelete) return;
    
    if (!namesMatchForDeleteConfirm(deleteConfirmName, projectToDelete.nome)) {
      setError('O nome digitado não corresponde ao nome do projeto.');
      return;
    }

    setDeletingId(projectToDelete.id);
    setError(null);
    
    try {
      await api.delete(`/projects/${projectToDelete.id}`);
      setShowDeleteModal(false);
      setProjectToDelete(null);
      setDeleteConfirmName('');
      await loadProjects();
      toast.success('Projeto excluído com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingId(null);
    }
  }


  const statusLabels: Record<string, { label: string; className: string }> = {
    EM_ANDAMENTO: { label: 'Em Andamento', className: 'bg-blue-500/20 text-blue-300 border border-blue-500/40' },
    FINALIZADO: { label: 'Finalizado', className: 'bg-green-500/20 text-green-300 border border-green-500/40' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/70">Carregando projetos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold sm:text-xl">Projetos</h3>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {canManageProjects && (
            <>
              <button
                onClick={() => navigate('/projects/import')}
                className={`${btn.success} flex-1 sm:flex-none`}
              >
                Importar do Excel
              </button>
              <button onClick={openCreateModal} className={`${btn.primary} flex-1 sm:flex-none`}>
                Novo Projeto
              </button>
            </>
          )}
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-2 border-b border-white/10 pb-3"
        aria-label="Seções da página Projetos"
      >
        <button
          type="button"
          onClick={openListaTab}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mainTab === 'lista'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'
          }`}
        >
          Lista de projetos
        </button>
        {podeVerFilaAnalise ? (
          <button
            type="button"
            onClick={openAnaliseTab}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              mainTab === 'analise'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            Tarefas em análise
            {!analiseLoading && totalPendenciasEmAnalise > 0 ? (
              <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/25 px-1.5 text-xs font-semibold text-amber-200">
                {totalPendenciasEmAnalise}
              </span>
            ) : null}
          </button>
        ) : null}
      </nav>

      {canManageProjects && mainTab === 'lista' && selectedProjectIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm text-white/80 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
          <span>
            {selectedProjectIds.size === 1
              ? '1 projeto selecionado para exportar.'
              : `${selectedProjectIds.size} projetos selecionados para exportar.`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportSelectedExcel}
              className={btn.secondary}
            >
              Exportar selecionados (Excel)
            </button>
            <button
              type="button"
              onClick={clearProjectSelection}
              className={btn.secondary}
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {error && !showModal && mainTab === 'lista' && (
        <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {mainTab === 'analise' && analiseError && (
        <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
          {analiseError}
        </div>
      )}

      {mainTab === 'lista' && (
      <>
      <CollapsibleFilters
        show={showFilters}
        setShow={setShowFilters}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearchTerm('');
          setStatusFilter('all');
          setSetorFilter('all');
          setSupervisorFilter('all');
          setValorMin('');
          setValorMax('');
          setProgressMin('');
          setProgressMax('');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AppInput
            label="Buscar"
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Nome, resumo, objetivo, setor, supervisor..."
          />

          <AppSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as any)}
            options={[
              { value: 'all', label: 'Todos' },
              ...statusOptions.map((s) => ({ value: s.value, label: s.label })),
            ]}
          />

          <AppSelect
            label="Setor"
            value={setorFilter}
            onChange={(value) => setSetorFilter(value === 'all' ? 'all' : Number(value))}
            options={[
              { value: 'all', label: 'Todos' },
              ...setores.map((s) => ({ value: s.id, label: s.nome })),
            ]}
          />

          <AppSelect
            label="Supervisor"
            value={supervisorFilter}
            onChange={(value) => setSupervisorFilter(value === 'all' ? 'all' : Number(value))}
            options={[
              { value: 'all', label: 'Todos' },
              ...users.map((u) => ({ value: u.id, label: u.nome })),
            ]}
          />

          <AppInput
            label="Progresso (mín %)"
            type="number"
            min={0}
            max={100}
            value={progressMin}
            onChange={setProgressMin}
            placeholder="Ex.: 0"
          />

          <AppInput
            label="Progresso (máx %)"
            type="number"
            min={0}
            max={100}
            value={progressMax}
            onChange={setProgressMax}
            placeholder="Ex.: 100"
          />

          <AppInput
            label="Valor total (mín)"
            type="number"
            min={0}
            value={valorMin}
            onChange={setValorMin}
            placeholder="Ex.: 0"
          />

          <AppInput
            label="Valor total (máx)"
            type="number"
            min={0}
            value={valorMax}
            onChange={setValorMax}
            placeholder="Ex.: 100000"
          />
        </div>
      </CollapsibleFilters>

      <DataTable<Projeto>
        data={sortedProjects}
        keyExtractor={(p) => p.id}
        emptyMessage="Nenhum projeto cadastrado"
        paginate
        initialPageSize={20}
        onRowClick={(p) => navigate(`/projects/${p.id}`)}
        renderMobileCard={(p) => {
          const progressValue = p.progress ?? 0;
          const statusKey = progressValue === 100 ? 'FINALIZADO' : p.status;
          const status = statusLabels[statusKey] ?? statusLabels.EM_ANDAMENTO;
          return (
            <div
              className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3 cursor-pointer active:bg-white/5"
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              {/* Cabeçalho: nome + status */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white whitespace-normal break-words flex-1">{p.nome}</p>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              {/* Barra de progresso */}
              <div className="space-y-1">
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      progressValue >= 100
                        ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                        : progressValue >= 50
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                          : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    }`}
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${
                  progressValue >= 100 ? 'text-green-400' : progressValue >= 50 ? 'text-blue-400' : 'text-amber-400'
                }`}>{progressValue}% concluído</span>
              </div>
              {/* Info: supervisor + valor */}
              <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-lg p-3 text-sm">
                <div>
                  <p className="text-xs text-white/50 mb-0.5">Supervisor</p>
                  <p className="text-white/90 whitespace-normal break-words">{p.supervisor?.nome ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-white/50 mb-0.5">Valor Total</p>
                  <p className="text-white/90 font-medium">
                    {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>
              {/* Ações */}
              {canManageProjects && (
                <div className="flex items-center gap-2 pt-1 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEditModal(p)} className={btn.editSm}>Editar</button>
                  <button
                    onClick={() => handleDeleteProject(p.id)}
                    className={btn.dangerSm}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              )}
            </div>
          );
        }}
        columns={[
          {
            key: 'selecionar',
            label: '',
            thClassName: 'w-10',
            tdClassName: 'w-10',
            stopRowClick: true,
            render: (p) =>
              canManageProjects ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/40 bg-neutral/60 text-primary focus:ring-primary"
                  checked={selectedProjectIds.has(p.id)}
                  onChange={() => toggleProjectSelection(p.id)}
                />
              ) : (
                <span />
              ),
          },
          {
            key: 'nome',
            label: '',
            renderTh: () => renderProjTh('nome', 'Nome'),
            tdClassName: 'max-w-[28rem] align-top',
            render: (p) => (
              <span className="block whitespace-normal break-words font-medium" title={p.nome}>
                {p.nome}
              </span>
            ),
          },
          {
            key: 'status',
            label: '',
            renderTh: () => renderProjTh('status', 'Status'),
            thClassName: 'min-w-[7rem]',
            tdClassName: 'whitespace-nowrap min-w-[7rem]',
            render: (p) => {
              const progressValue = p.progress ?? 0;
              const statusKey = progressValue === 100 ? 'FINALIZADO' : p.status;
              const status = statusLabels[statusKey] ?? statusLabels.EM_ANDAMENTO;
              return (
                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap min-w-[6.5rem] ${status.className}`}>
                  {status.label}
                </span>
              );
            },
          },
          {
            key: 'progresso',
            label: '',
            renderTh: () => renderProjTh('progresso', 'Progresso'),
            render: (p) => {
              const progressValue = p.progress ?? 0;
              return (
                <div className="space-y-1 min-w-[6rem]">
                  <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        progressValue >= 100
                          ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                          : progressValue >= 50
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                            : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                      }`}
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${
                    progressValue >= 100 ? 'text-green-400' : progressValue >= 50 ? 'text-blue-400' : 'text-amber-400'
                  }`}>{progressValue}%</span>
                </div>
              );
            },
          },
          {
            key: 'supervisor',
            label: '',
            renderTh: () => renderProjTh('supervisor', 'Supervisor'),
            render: (p) => <span>{p.supervisor?.nome ?? '—'}</span>,
          },
          {
            key: 'valorTotal',
            label: '',
            renderTh: () => renderProjTh('valorTotal', 'Valor Total'),
            render: (p) => (
              <span className="whitespace-nowrap">
                {p.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            stopRowClick: true,
            render: (p) => (
              <div className="flex items-center gap-1.5 flex-nowrap">
                {canManageProjects && (
                  <button onClick={() => openEditModal(p)} className={btn.editSm}>
                    Editar
                  </button>
                )}
                {canManageProjects && (
                  <button
                    onClick={() => handleExportProjectExcel(p.id)}
                    className={btn.primarySoft}
                  >
                    Exportar
                  </button>
                )}
                {canManageProjects && (
                  <button
                    onClick={() => handleDeleteProject(p.id)}
                    className={btn.dangerSm}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                )}
              </div>
            ),
          },
        ] satisfies DataTableColumn<Projeto>[]}
      />
      </>
      )}

      {mainTab === 'analise' && (
        <div className="space-y-4">
          <p className="text-sm text-white/65">
            Entregas aguardando avaliação (supervisor do projeto). A fila usa por padrão a{' '}
            <strong className="text-white/80">mais antiga primeiro</strong>. Após salvar, a lista atualiza sem
            recarregar a página e o painel abre a próxima pendente na fila.
          </p>

          <CollapsibleFilters
            title="Filtros da fila de análise"
            show={showAnaliseFilters}
            setShow={setShowAnaliseFilters}
            hasActiveFilters={
              analiseProjetoFilter !== 'all' ||
              analiseBusca.trim().length > 0 ||
              analiseOrdem !== 'antigas' ||
              analiseEscopoExecutor !== 'para_avaliar'
            }
            onClear={() => {
              setAnaliseProjetoFilter('all');
              setAnaliseBusca('');
              setAnaliseOrdem('antigas');
              setAnaliseEscopoExecutor('para_avaliar');
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">Projeto</label>
                <AppSelect
                  value={analiseProjetoFilter === 'all' ? 'all' : String(analiseProjetoFilter)}
                  onChange={(v) =>
                    setAnaliseProjetoFilter(v === 'all' ? 'all' : Number(v))
                  }
                  options={[
                    { value: 'all', label: 'Todos os projetos' },
                    ...analiseProjetoOptions.map((p) => ({
                      value: String(p.id),
                      label: p.nome,
                    })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Busca</label>
                <AppInput
                  value={analiseBusca}
                  onChange={setAnaliseBusca}
                  placeholder="Tarefa, etapa, colaborador..."
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Ordem na fila</label>
                <AppSelect
                  value={analiseOrdem}
                  onChange={(v) => setAnaliseOrdem(v as AnaliseOrdemFila)}
                  options={[
                    { value: 'antigas', label: 'Mais antigas primeiro (padrão)' },
                    { value: 'recentes', label: 'Mais recentes primeiro' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Quem enviou</label>
                <AppSelect
                  value={analiseEscopoExecutor}
                  onChange={(v) => setAnaliseEscopoExecutor(v as AnaliseEscopoExecutor)}
                  options={[
                    {
                      value: 'para_avaliar',
                      label: 'Para eu avaliar (exceto minhas entregas)',
                    },
                    {
                      value: 'do_supervisor',
                      label: 'Enviadas pelo supervisor do projeto',
                    },
                    { value: 'todas', label: 'Todas as entregas' },
                  ]}
                />
                <p className="text-[11px] text-white/45 mt-1 leading-snug">
                  Oculta apenas entregas que você mesmo enviou. Com acesso a todos os projetos, você
                  pode avaliar entregas de qualquer equipe ou supervisor.
                </p>
              </div>
            </div>
          </CollapsibleFilters>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
            <span>
              {analiseFilaFiltrada.length} na fila
              {analiseRefreshing ? ' · atualizando…' : ''}
            </span>
            <button
              type="button"
              disabled={analiseLoading || analiseRefreshing}
              onClick={() => void loadAnalise({ silent: true })}
              className={`${btn.secondary} text-xs`}
            >
              Atualizar lista
            </button>
          </div>

          {analiseLoading ? (
            <div className="flex justify-center py-16 text-white/60">Carregando tarefas em análise…</div>
          ) : analiseRows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-10 text-center text-white/65">
              Nenhuma entrega aguardando sua avaliação nos projetos aos quais você tem acesso.
              Entregas enviadas por você não entram na fila (exceto administrador do sistema).
            </div>
          ) : analiseFilaFiltrada.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-10 text-center text-white/65">
              Nenhuma entrega corresponde aos filtros. Ajuste projeto, busca ou quem enviou.
            </div>
          ) : (
            <div className="space-y-6">
              {analiseRowsExibidas.map((grupo) => (
                <section
                  key={grupo.projeto.id}
                  className="overflow-hidden rounded-xl border border-white/10 bg-neutral/40 shadow-lg shadow-black/20"
                >
                  <div className="flex flex-col gap-1 border-b border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-white">{grupo.projeto.nome}</h4>
                      <p className="text-xs text-white/55">
                        {countPendenciasInProjetoGrupo(grupo).toLocaleString('pt-BR')} tarefa
                        {countPendenciasInProjetoGrupo(grupo) !== 1 ? 's' : ''} aguardando avaliação
                        {grupo.etapas.length > 0 && (
                          <span className="text-white/40">
                            {' '}
                            · {grupo.etapas.length} etapa{grupo.etapas.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${grupo.projeto.id}`)}
                      className={`${btn.secondary} shrink-0 text-sm`}
                    >
                      Abrir projeto
                    </button>
                  </div>
                  <ul className="divide-y divide-white/10">
                    {grupo.etapas.map((et) => {
                      const loc = [et.sessaoNome, et.aba].filter(Boolean).join(' · ');
                      return (
                        <li key={et.id} className="px-4 py-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-white/90">{et.nome}</p>
                              {loc ? <p className="text-xs text-white/55">{loc}</p> : null}
                              <p className="text-xs text-white/50">
                                Responsável pela etapa: {et.executor.nome}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 space-y-2 pl-1">
                            {et.pendenciasChecklist.map((p) => (
                              <div
                                key={`chk-${et.id}-${p.checklistIndex}-${p.subitemIndex ?? 'm'}-${p.dataEnvio}`}
                                className="flex flex-col gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0 text-sm">
                                  <span className="font-medium text-amber-100/95">
                                    {p.subitemIndex != null ? 'Subtarefa' : 'Tarefa'}
                                  </span>
                                  <span className="text-white/85"> · {p.textoLinha}</span>
                                  <p className="mt-0.5 text-xs text-white/50">
                                    Enviado por {p.executor.nome} em{' '}
                                    {new Date(p.dataEnvio).toLocaleString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReviewEntregaTarget({
                                      mode: 'checklist',
                                      projetoId: grupo.projeto.id,
                                      etapaId: et.id,
                                      checklistIndex: p.checklistIndex,
                                      subitemIndex: p.subitemIndex,
                                    })
                                  }
                                  className={`${btn.primary} shrink-0 text-sm`}
                                >
                                  Avaliar entrega
                                </button>
                              </div>
                            ))}
                            {et.pendenciasEtapaEntrega.map((en) => (
                              <div
                                key={`et-${et.id}-${en.id}`}
                                className="flex flex-col gap-2 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0 text-sm">
                                  <span className="font-medium text-violet-100/95">Entrega geral da etapa</span>
                                  <p className="mt-0.5 text-xs text-white/50">
                                    Enviado por {en.executor.nome} em{' '}
                                    {new Date(en.dataEnvio).toLocaleString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReviewEntregaTarget({
                                      mode: 'etapa_entrega',
                                      projetoId: grupo.projeto.id,
                                      etapaId: et.id,
                                      entregaId: en.id,
                                    })
                                  }
                                  className={`${btn.primary} shrink-0 text-sm`}
                                >
                                  Avaliar entrega
                                </button>
                              </div>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      <ReviewEntregaPopup
        open={reviewEntregaTarget != null}
        target={reviewEntregaTarget}
        onClose={() => setReviewEntregaTarget(null)}
        onReviewed={() => void handleEntregaAvaliada()}
      />

      {/* Modal de Novo Projeto */}
      <AppModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setError(null);
          setModalError(null);
          setEditingProject(null);
          setPendingDescricaoFiles([]);
          setProjectDescricaoArquivos([]);
          setProjectDescricaoError(null);
        }}
        title={editingProject ? 'Editar Projeto' : 'Novo Projeto'}
        size="lg"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Nome do Projeto <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, nome: e.target.value }));
                    validation.handleChange('nome', e.target.value);
                  }}
                  onBlur={() => validation.handleBlur('nome')}
                  className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                    validation.hasError('nome')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-white/10 focus:ring-primary'
                  }`}
                  required
                  maxLength={120}
                />
                {validation.hasError('nome') && (
                  <p className="text-red-500 text-xs mt-1">{validation.getFieldError('nome')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Resumo</label>
                <textarea
                value={form.resumo}
                onChange={(e) => setForm((prev) => ({ ...prev, resumo: e.target.value }))}
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Objetivo do projeto</label>
                <textarea
                value={form.objetivo}
                onChange={(e) => setForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Descrição detalhada do projeto
                </label>
                <textarea
                  value={form.descricaoLonga}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, descricaoLonga: e.target.value }))
                  }
                  placeholder="Descreva o contexto geral, escopo, observações importantes do projeto..."
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Arquivos e imagens da descrição
                </label>
                <FileDropInput
                  multiple
                  onFilesSelected={async (files) => {
                    if (!files.length) return;

                    setProjectDescricaoError(null);
                    if (editingProject) {
                      const validationError = validateIncomingFiles(
                        files,
                        projectDescricaoArquivos.length,
                      );
                      if (validationError) {
                        setProjectDescricaoError(validationError);
                        return;
                      }

                      try {
                        setProjectDescricaoSaving(true);
                        const uploaded = await uploadDescricaoFiles(editingProject.id, files);
                        setProjectDescricaoArquivos(uploaded);
                        toast.success('Arquivos anexados ao projeto.');
                      } catch (err: any) {
                        const message = formatApiError(err);
                        setProjectDescricaoError(message);
                        toast.error(message);
                      } finally {
                        setProjectDescricaoSaving(false);
                      }
                      return;
                    }

                    const validationError = validateIncomingFiles(files, pendingDescricaoFiles.length);
                    if (validationError) {
                      setProjectDescricaoError(validationError);
                      return;
                    }

                    setPendingDescricaoFiles((prev) => [...prev, ...files]);
                  }}
                  disabled={projectDescricaoSaving || submitting}
                  className="mt-1 block w-full text-sm text-white/80 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/80 file:text-white hover:file:bg-primary transition-colors cursor-pointer"
                  dropMessage="Solte arquivos da descrição aqui"
                />
                <p className="text-xs text-white/50 mt-2">
                  Até {MAX_PROJECT_FILES} arquivos por projeto, com limite de {MAX_PROJECT_FILE_SIZE_MB}MB por arquivo.
                </p>

                {editingProject ? (
                  <>
                    {projectDescricaoArquivos.length > 0 ? (
                      <div className="mt-2 space-y-2 max-h-44 overflow-y-auto bg-black/10 rounded-md p-2">
                        {(() => {
                          const gallery = buildProjetoArquivosGallery(projectDescricaoArquivos);
                          return projectDescricaoArquivos.map((file, index) => {
                            const displayName = file.originalName || file.url;
                            const gi = projectDescricaoArquivos.findIndex((f) => f.url === file.url);
                            return (
                              <div
                                key={`${file.url}-${index}`}
                                className="flex items-center justify-between gap-3 text-xs text-white/80"
                              >
                                <FilePreviewTrigger
                                  src={file.url}
                                  name={displayName}
                                  gallery={{ items: gallery, index: gi >= 0 ? gi : index }}
                                  className="truncate hover:text-primary transition-colors text-left max-w-[70%]"
                                  title={displayName}
                                >
                                  {displayName}
                                </FilePreviewTrigger>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      setProjectDescricaoSaving(true);
                                      const { data } = await api.delete<ProjetoArquivo[]>(
                                        `/projects/${editingProject.id}/descricao-files`,
                                        { data: { url: file.url } },
                                      );
                                      setProjectDescricaoArquivos(normalizeDescricaoArquivos(data));
                                    } catch (err: any) {
                                      const message = formatApiError(err);
                                      setProjectDescricaoError(message);
                                      toast.error(message);
                                    } finally {
                                      setProjectDescricaoSaving(false);
                                    }
                                  }}
                                  className="inline-flex items-center px-2 py-0.5 rounded border border-danger/60 text-[11px] text-danger hover:bg-danger/10 transition-colors"
                                  disabled={projectDescricaoSaving || submitting}
                                >
                                  Remover
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-white/50 mt-2">Nenhum arquivo anexado ainda.</p>
                    )}
                  </>
                ) : (
                  <>
                    {pendingDescricaoFiles.length > 0 ? (
                      <div className="mt-2 space-y-2 max-h-44 overflow-y-auto bg-black/10 rounded-md p-2">
                        {pendingDescricaoFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${file.lastModified}-${index}`}
                            className="flex items-center justify-between gap-3 text-xs text-white/80"
                          >
                            <span className="truncate" title={file.name}>
                              {file.name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDescricaoFiles((prev) =>
                                  prev.filter((_, fileIndex) => fileIndex !== index),
                                )
                              }
                              className="inline-flex items-center px-2 py-0.5 rounded border border-danger/60 text-[11px] text-danger hover:bg-danger/10 transition-colors"
                              disabled={submitting}
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/50 mt-2">
                        Os arquivos selecionados serao enviados automaticamente apos criar o projeto.
                      </p>
                    )}
                  </>
                )}

                {projectDescricaoError && (
                  <p className="text-xs text-danger mt-2">{projectDescricaoError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Valor Total (R$)</label>
                <NumericInput
                  min={0}
                  step={0.01}
                  value={form.valorTotal}
                  onValueChange={(v) => {
                    const next = v === null ? undefined : v;
                    setForm((prev) => ({ ...prev, valorTotal: next }));
                    if (next !== undefined) {
                      validation.handleChange('valorTotal', next);
                    }
                  }}
                  onBlur={() => {
                    if (form.valorTotal !== undefined) {
                      validation.handleBlur('valorTotal');
                    }
                  }}
                  className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                    validation.hasError('valorTotal')
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-white/10 focus:ring-primary'
                  }`}
                />
                {validation.hasError('valorTotal') && (
                  <p className="text-red-500 text-xs mt-1">{validation.getFieldError('valorTotal')}</p>
                )}
              </div>

              {editingProject && (
                <div>
                  <label className="block text-sm text-white/70 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        status: e.target.value as 'EM_ANDAMENTO' | 'FINALIZADO',
                      }))
                    }
                    className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Setores</label>
                {setores.length === 0 ? (
                  <p className="text-xs text-white/50">Carregando setores...</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {setores.map((setor) => {
                      const checked = form.setorIds.includes(setor.id);
                      return (
                        <label key={setor.id} className="flex items-center gap-3 text-sm text-white/85">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setForm((prev) => {
                                const nextSetorIds = isChecked
                                  ? Array.from(new Set([...prev.setorIds, setor.id]))
                                  : prev.setorIds.filter((id) => id !== setor.id);
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
                    {form.setorIds.length === 0 && (
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
                  value={form.supervisorId ?? ''}
                  onChange={(e) => {
                    const newSupervisorId = e.target.value ? Number(e.target.value) : undefined;
                    setForm((prev) => ({
                      ...prev,
                      supervisorId: newSupervisorId,
                    }));
                  }}
                  className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="" className="bg-neutral text-white">Selecione um supervisor...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id} className="bg-neutral text-white">
                      {user.nome}
                    </option>
                  ))}
                </select>
              </div>

              <ProjetoEquipeMembrosField
                users={users}
                setores={setores}
                disabled={submitting}
                value={{
                  setorIds: form.setorIds,
                  responsavelIds: form.responsavelIds,
                  excludedAutoIds: form.excludedAutoIds,
                  supervisorId: form.supervisorId,
                }}
                onChange={(next) =>
                  setForm((prev) => ({
                    ...prev,
                    setorIds: next.setorIds,
                    responsavelIds: next.responsavelIds,
                    excludedAutoIds: next.excludedAutoIds,
                  }))
                }
              />

              {modalError && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setError(null);
                    setModalError(null);
                    setEditingProject(null);
                  setPendingDescricaoFiles([]);
                  setProjectDescricaoArquivos([]);
                  setProjectDescricaoError(null);
                  }}
                  className={btn.secondaryLg}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={btn.primaryLg}
                  disabled={submitting}
                >
                  {submitting ? (editingProject ? 'Salvando...' : 'Criando...') : editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                </button>
              </div>
            </form>
      </AppModal>

      {/* Modal Confirmar Exclusão de Projeto */}
      {showDeleteModal && projectToDelete && (
        <ConfirmDeleteByNameModal
          open={showDeleteModal}
          title="Confirmar Exclusão"
          entityLabel="o projeto"
          entityName={projectToDelete.nome}
          confirmValue={deleteConfirmName}
          onConfirmValueChange={setDeleteConfirmName}
          onClose={() => {
            setShowDeleteModal(false);
            setProjectToDelete(null);
            setDeleteConfirmName('');
            setError(null);
          }}
          onConfirm={handleConfirmDelete}
          loading={deletingId === projectToDelete.id}
          errorMessage={error}
          confirmButtonLabel="Confirmar Remoção"
        />
      )}
    </div>
  );
}
