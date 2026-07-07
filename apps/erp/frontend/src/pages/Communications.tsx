import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { toast, formatApiError } from '../utils/toast';
import { calculateCotacaoTotal } from '../utils/stockHelpers';
import { INITIAL_COTACAO } from '../constants/stock';
import type { Cotacao, Supplier, Projeto } from '../types/stock';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { btn } from '../utils/buttonStyles';
import { FileDropInput } from '../components/FileDropInput';
import { AppModal } from '../components/ui/AppModal';
import { PurchaseRequestFields } from '../components/stock/PurchaseRequestFields';
import { createEmptyCotacao, sanitizeCotacoesForPayload } from '../utils/purchaseRequest';
import { useAuthStore } from '../store/auth';
import { parseAttachmentUrls, serializeAttachmentUrls } from '../utils/attachmentUrls';
import { isPersistedUrl, resolvePublicUploadUrl, uploadFiles, uploadSingleFile } from '../utils/uploadFile';
import { UPLOAD_LIMITS, validateGenericFileSize } from '../utils/uploadLimits';
import { RequerimentoAnexosView } from '../components/communications/RequerimentoAnexosView';
import { AttachmentList } from '../components/files/AttachmentList';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { userHasAnyPermission } from '../utils/projectAccess';
import {
  normalizeRequerimentoSearchText,
  requerimentoDestinatarioLabel,
  requerimentoLeituraLabel,
} from '../utils/requerimentos';

type RequerimentoTipo = 'SOLICITACAO' | 'APROVACAO' | 'INFORMACAO' | 'RECLAMACAO' | 'SUGESTAO' | 'COMPRA' | 'OUTRO';

const REQUERIMENTO_TIPO_OPTIONS: { value: RequerimentoTipo | ''; label: string }[] = [
  { value: '', label: 'Todos os tipos' },
  { value: 'SOLICITACAO', label: 'Requerimento' },
  { value: 'APROVACAO', label: 'Aprovação' },
  { value: 'INFORMACAO', label: 'Informação' },
  { value: 'RECLAMACAO', label: 'Reclamação' },
  { value: 'SUGESTAO', label: 'Sugestão' },
  { value: 'COMPRA', label: 'Compra' },
  { value: 'OUTRO', label: 'Outro' },
];

const LIST_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function parseListPageSize(raw: string | null): number {
  const n = parseInt(raw ?? '20', 10);
  return (LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : 20;
}

function parseListPage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

interface Request {
  id: number;
  texto: string;
  tipo: RequerimentoTipo;
  status: string;
  dataCriacao: string;
  usuarioId?: number;
  destinatarioId?: number | null;
  dataLeituraDestinatario?: string | null;
  dataResposta?: string | null;
  resposta?: string | null;
  anexo?: string | null;
  anexoResposta?: string | null;
  usuario?: { nome: string } | null;
  destinatario?: { nome: string } | null;
  etapa?: { nome: string } | null;
  compras?: CompraDetail[];
}

interface CompraDetail {
  id: number;
  item: string;
  descricao?: string | null;
  quantidade: number;
  valorUnitario?: number | null;
  imagemUrl?: string | null;
  cotacoesJson?: any;
  status: string;
  categoria?: { nome: string } | null;
  projeto?: { nome: string } | null;
  etapa?: { nome: string } | null;
  observacao?: string | null;
}

interface SimpleUser {
  id: number;
  nome: string;
}

interface Category {
  id: number;
  nome: string;
  ativo: boolean;
}

interface CompraItem {
  item: string;
  descricao?: string;
  quantidade: number | null;
  imagemUrl?: string;
  categoriaId?: number;
  projetoId?: number;
  selectedCotacaoIndex?: number;
  cotacoes: Cotacao[];
  observacao?: string;
}

export default function Communications() {
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const subTab: 'sent' | 'received' = searchParams.get('tab') === 'received' ? 'received' : 'sent';
  const filterQ = searchParams.get('q') ?? '';
  const filterTipo = (searchParams.get('tipo') ?? '') as RequerimentoTipo | '';
  const filterLeitura = searchParams.get('leitura') ?? '';
  const filterStatus = searchParams.get('status') ?? '';
  const listPage = parseListPage(searchParams.get('page'));
  const listPageSize = parseListPageSize(searchParams.get('pageSize'));
  const detailIdParam = searchParams.get('id');
  const [requests, setRequests] = useState<Request[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itensCompra, setItensCompra] = useState<CompraItem[]>([
    { item: '', descricao: '', quantidade: 1, categoriaId: undefined, projetoId: undefined, selectedCotacaoIndex: 0, cotacoes: [{ ...INITIAL_COTACAO }] },
  ]);
  const [form, setForm] = useState<{
    destinatarioIds: number[];
    tipo: RequerimentoTipo;
    texto?: string;
  }>({
    tipo: 'OUTRO',
    texto: '',
    destinatarioIds: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyAnexos, setReplyAnexos] = useState<File[]>([]);
  const [createAnexos, setCreateAnexos] = useState<File[]>([]);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [destinatariosBusca, setDestinatariosBusca] = useState('');
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null);
  const [showListFilters, setShowListFilters] = useState(
    () => sessionStorage.getItem('communications:showFilters') === '1',
  );
  const pollingRequestRef = useRef(false);
  const detailLoadRef = useRef<number | null>(null);

  const podeResponderCompra = userHasAnyPermission(user, 'compras:aprovar', 'sistema:administrar');

  const updateListParams = useCallback(
    (patch: Record<string, string | null>, replace = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const hasActiveListFilters =
    filterQ.trim().length > 0 ||
    filterTipo !== '' ||
    filterLeitura !== '' ||
    filterStatus !== '';

  const filteredRequests = useMemo(() => {
    const q = normalizeRequerimentoSearchText(filterQ);
    return requests.filter((r) => {
      if (filterTipo && r.tipo !== filterTipo) return false;
      if (filterLeitura === 'lida' && requerimentoLeituraLabel(r) !== 'Lida') return false;
      if (filterLeitura === 'nao_lida' && requerimentoLeituraLabel(r) !== 'Não lida') return false;
      if (filterStatus === 'pendente' && r.status === 'respondida') return false;
      if (filterStatus === 'respondida' && r.status !== 'respondida') return false;
      if (!q) return true;
      const texto = normalizeRequerimentoSearchText(r.texto ?? '');
      const remetente = normalizeRequerimentoSearchText(r.usuario?.nome ?? '');
      const destinatario = normalizeRequerimentoSearchText(requerimentoDestinatarioLabel(r));
      const tipoLabel = normalizeRequerimentoSearchText(
        REQUERIMENTO_TIPO_OPTIONS.find((o) => o.value === r.tipo)?.label ?? r.tipo,
      );
      if (r.tipo === 'COMPRA' && 'requerimento de compra'.includes(q)) return true;
      return (
        texto.includes(q) ||
        remetente.includes(q) ||
        destinatario.includes(q) ||
        tipoLabel.includes(q)
      );
    });
  }, [requests, filterQ, filterTipo, filterLeitura, filterStatus]);

  const usuariosFiltradosDestinatarios = useMemo(() => {
    const raw = destinatariosBusca.trim();
    if (!raw) {
      return users;
    }
    const q = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return users.filter((u) => {
      const nome = u.nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return nome.includes(q);
    });
  }, [users, destinatariosBusca]);

  // URL: ?tab=received | ?id= (detalhe) | filtros e paginação
  useEffect(() => {
    if (!detailIdParam) {
      setSelectedRequest(null);
      detailLoadRef.current = null;
      return;
    }
    const id = parseInt(detailIdParam, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    if (detailLoadRef.current === id) return;
    detailLoadRef.current = id;
    void loadRequestDetail(id);
  }, [detailIdParam]);

  useEffect(() => {
    sessionStorage.setItem('communications:showFilters', showListFilters ? '1' : '0');
  }, [showListFilters]);

  useEffect(() => {
    setReplyText('');
    setReplyAnexos([]);
  }, [selectedRequest?.id]);

  async function persistAnexoFiles(files: File[]): Promise<string | null> {
    if (files.length === 0) return null;
    for (const f of files) {
      const sizeErr = validateGenericFileSize(f);
      if (sizeErr) throw new Error(sizeErr);
    }
    const uploaded = await uploadFiles(files);
    const urls = uploaded.map((r) => r.url).filter(Boolean);
    return serializeAttachmentUrls(urls);
  }

  function appendUniqueFiles(prev: File[], incoming: File[]): File[] {
    const next = [...prev];
    for (const f of incoming) {
      const dup = next.some(
        (x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified,
      );
      if (!dup) next.push(f);
    }
    return next;
  }

  async function loadUsers() {
    try {
      const { data } = await api.get<SimpleUser[]>('/users/options');
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCategories() {
    try {
      const { data } = await api.get<Category[]>('/categories?tipo=ITEM');
      setCategories(data.filter((c) => c.ativo));
    } catch (err) {
      console.error(err);
    }
  }

  async function loadProjects() {
    try {
      const { data } = await api.get<Projeto[]>('/projects/options?todas=1');
      setProjects(data);
    } catch (err) {
      console.error('Erro ao carregar projetos:', err);
    }
  }

  async function loadSuppliers() {
    try {
      const { data } = await api.get<Supplier[]>('/suppliers');
      setSuppliers(data.filter((s) => s.ativo));
    } catch (err) {
      console.error(err);
    }
  }

  async function loadRequests(
    currentTab: 'sent' | 'received',
    options?: { silent?: boolean },
  ) {
    const silent = options?.silent === true;
    if (silent && pollingRequestRef.current) return;
    try {
      if (silent) {
        pollingRequestRef.current = true;
      } else {
        setLoading(true);
      }
      const { data } = await api.get<Request[]>(`/requests/${currentTab}`);
      setRequests(data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao carregar requerimentos');
    } finally {
      if (silent) {
        pollingRequestRef.current = false;
      } else {
        setLoading(false);
      }
    }
  }

  async function loadRequestDetail(id: number) {
    try {
      setLoadingDetail(true);
      const { data } = await api.get<Request>(`/requests/${id}`);
      setSelectedRequest(data);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleRequestClick(request: Request) {
    updateListParams({ id: String(request.id) });
  }

  function handleBackToList() {
    setSelectedRequest(null);
    detailLoadRef.current = null;
    updateListParams({ id: null });
    void loadRequests(subTab);
  }

  function clearListFilters() {
    updateListParams({ q: null, tipo: null, leitura: null, status: null, page: null });
  }

  function patchListFilters(patch: Record<string, string | null>) {
    updateListParams({ ...patch, page: null });
  }

  async function handleSubmitReply(event: FormEvent) {
    event.preventDefault();
    if (!selectedRequest) return;
    const trimmed = replyText.trim();
    if (!trimmed && replyAnexos.length === 0) {
      toast.error('Escreva uma resposta ou anexe pelo menos um arquivo.');
      return;
    }
    setSubmittingReply(true);
    try {
      const anexoResposta = await persistAnexoFiles(replyAnexos);
      await api.post(`/requests/${selectedRequest.id}/respond`, {
        resposta: trimmed.slice(0, 1500) || '(resposta com anexo)',
        ...(anexoResposta ? { anexoResposta } : {}),
      });
      toast.success('Resposta enviada com sucesso!');
      setReplyText('');
      setReplyAnexos([]);
      await loadRequestDetail(selectedRequest.id);
      loadRequests(subTab);
    } catch (err: unknown) {
      toast.error(formatApiError(err));
    } finally {
      setSubmittingReply(false);
    }
  }

  async function handleDeleteRequest(request: Request) {
    setRequestToDelete(request);
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!requestToDelete) return;

    try {
      setDeletingRequestId(requestToDelete.id);
      await api.delete(`/requests/${requestToDelete.id}`);
      toast.success('Requerimento excluído com sucesso!');
      setShowDeleteConfirm(false);
      setRequestToDelete(null);
      loadRequests(subTab); // Recarregar a lista
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      toast.error(errorMessage);
    } finally {
      setDeletingRequestId(null);
    }
  }

  useEffect(() => {
    loadUsers();
    loadCategories();
    loadProjects();
    loadSuppliers();
  }, []);

  useEffect(() => {
    loadRequests(subTab);
    
    // Atualizar requerimentos a cada 10 segundos quando estiver na aba de recebidos
    if (subTab === 'received') {
      const interval = setInterval(() => {
        void loadRequests('received', { silent: true });
      }, 10000);
      
      return () => clearInterval(interval);
    }
  }, [subTab]);

  useEffect(() => {
    // Resetar itens quando mudar o tipo
    if (form.tipo !== 'COMPRA') {
      setItensCompra([{ item: '', descricao: '', quantidade: 1, categoriaId: undefined, projetoId: undefined, selectedCotacaoIndex: 0, cotacoes: [{ ...INITIAL_COTACAO }] }]);
    } else if (itensCompra.length === 0) {
      setItensCompra([{ item: '', descricao: '', quantidade: 1, categoriaId: undefined, projetoId: undefined, selectedCotacaoIndex: 0, cotacoes: [{ ...INITIAL_COTACAO }] }]);
    }
  }, [form.tipo, itensCompra.length]);

  function addItem() {
    setItensCompra([
      ...itensCompra,
      { item: '', descricao: '', quantidade: 1, categoriaId: undefined, projetoId: undefined, selectedCotacaoIndex: 0, cotacoes: [createEmptyCotacao()] },
    ]);
  }

  function removeItem(index: number) {
    if (itensCompra.length > 1) {
      setItensCompra(itensCompra.filter((_, i) => i !== index));
    }
  }

  function updateItem(index: number, field: keyof CompraItem, value: any) {
    const newItens = [...itensCompra];
    newItens[index] = { ...newItens[index], [field]: value };
    setItensCompra(newItens);
  }

  async function handleFileUpload(index: number, field: 'imagemUrl', file: File) {
    const sizeErr = validateGenericFileSize(file);
    if (sizeErr) {
      toast.error(sizeErr);
      return;
    }

    setUploadingImageIndex(index);
    try {
      const url = await uploadSingleFile(file);
      if (!url) {
        toast.error('Não foi possível enviar a imagem');
        return;
      }
      updateItem(index, field, url);
    } catch (err) {
      toast.error(formatApiError(err) || 'Erro ao enviar imagem');
    } finally {
      setUploadingImageIndex(null);
    }
  }

  function calculateTotal(cotacao: Cotacao, quantidade: number): number {
    return calculateCotacaoTotal(cotacao, quantidade);
  }

  function getSupplierName(fornecedorId?: number): string {
    if (!fornecedorId) return '-';
    const supplier = suppliers.find((s) => s.id === fornecedorId);
    return supplier ? supplier.nomeFantasia : '-';
  }

  async function handleSubmitRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Validar itens se for tipo COMPRA
      if (form.tipo === 'COMPRA') {
        const itensValidos = itensCompra
          .filter((item) => item.item.trim() && item.quantidade != null && item.quantidade > 0)
          .map((item) => ({
            item: item.item.trim(),
            descricao: item.descricao?.trim() || undefined,
            quantidade: item.quantidade,
            imagemUrl:
              item.imagemUrl && isPersistedUrl(item.imagemUrl) ? item.imagemUrl : undefined,
            categoriaId: item.categoriaId,
            projetoId: item.projetoId,
            observacao: item.observacao?.trim() || undefined,
            cotacoes: sanitizeCotacoesForPayload(item.cotacoes || []),
          }));
        if (itensValidos.length === 0) {
          setError('Adicione pelo menos um item válido');
          setSubmitting(false);
          return;
        }

        // Validar que pelo menos uma cotação tenha link em cada item
        for (const item of itensValidos) {
          if (!item.cotacoes || item.cotacoes.length === 0) {
            setError(`O item "${item.item}" deve ter pelo menos uma cotação`);
            setSubmitting(false);
            return;
          }

          const temLink = item.cotacoes.some((cotacao) => cotacao.link && cotacao.link.trim().length > 0);
          if (!temLink) {
            setError(`O item "${item.item}" deve ter pelo menos uma cotação com link`);
            setSubmitting(false);
            return;
          }
        }

        const textoCompra = form.texto?.trim() ?? '';
        const anexoCompra = await persistAnexoFiles(createAnexos);
        const payload: Record<string, unknown> = {
          tipo: form.tipo,
          itensCompra: itensValidos,
        };
        if (textoCompra) payload.texto = textoCompra;
        if (anexoCompra) payload.anexo = anexoCompra;
        await api.post('/requests', payload);
        toast.success('Requerimento enviado com sucesso!');
      } else {
        if (form.destinatarioIds.length === 0) {
          setError('Selecione ao menos um destinatário');
          setSubmitting(false);
          return;
        }
        const textoTrimmed = form.texto?.trim() ?? '';
        const anexo = await persistAnexoFiles(createAnexos);
        if (!textoTrimmed && !anexo) {
          setError('Escreva a mensagem ou anexe pelo menos um arquivo');
          setSubmitting(false);
          return;
        }
        const payload: {
          tipo: RequerimentoTipo;
          texto: string;
          destinatarioIds: number[];
          anexo?: string;
        } = {
          tipo: form.tipo,
          texto: textoTrimmed || '(requerimento com anexo)',
          destinatarioIds: [...new Set(form.destinatarioIds.map(Number))],
        };
        if (anexo) payload.anexo = anexo;
        const { data } = await api.post<{ count?: number }>('/requests', payload);
        const n = typeof data?.count === 'number' ? data.count : 1;
        toast.success(
          n > 1 ? `Requerimento enviado para ${n} usuários.` : 'Requerimento enviado com sucesso!',
        );
      }

      setForm({ tipo: 'OUTRO', texto: '', destinatarioIds: [] });
      setCreateAnexos([]);
      setDestinatariosBusca('');
      setItensCompra([{ item: '', descricao: '', quantidade: 1, categoriaId: undefined, projetoId: undefined, selectedCotacaoIndex: 0, cotacoes: [createEmptyCotacao()] }]);
      updateListParams({ tab: null, id: null, page: null });
      void loadRequests('sent');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  // Se houver um requerimento selecionado, mostrar visualização detalhada
  if (selectedRequest) {
    const tipoLabels: Record<RequerimentoTipo, string> = {
      SOLICITACAO: 'Requerimento',
      APROVACAO: 'Aprovação',
      INFORMACAO: 'Informação',
      RECLAMACAO: 'Reclamação',
      SUGESTAO: 'Sugestão',
      COMPRA: 'Compra',
      OUTRO: 'Outro',
    };
    const leituraDetalhe = requerimentoLeituraLabel(selectedRequest);

    return (
      <div className="space-y-6">
        <button
          onClick={handleBackToList}
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para lista
        </button>

        <div className="bg-neutral/80 border border-white/10 rounded-xl p-6 space-y-6">
          {/* Cabeçalho do E-mail */}
          <div className="border-b border-white/10 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">{tipoLabels[selectedRequest.tipo] || selectedRequest.tipo}</h2>
              <span
                className={`px-3 py-1 rounded text-sm border ${
                  leituraDetalhe === 'Lida'
                    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35'
                    : leituraDetalhe === 'Não lida'
                      ? 'bg-amber-500/10 text-amber-100 border-amber-500/30'
                      : 'bg-white/10 text-white/60 border-white/20'
                }`}
              >
                {leituraDetalhe}
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-white/60">De:</span>
                <p className="text-white font-medium">{selectedRequest.usuario?.nome ?? '—'}</p>
              </div>
              <div>
                <span className="text-white/60">Para:</span>
                <p className="text-white font-medium">{requerimentoDestinatarioLabel(selectedRequest)}</p>
              </div>
              <div>
                <span className="text-white/60">Data:</span>
                <p className="text-white">{new Date(selectedRequest.dataCriacao).toLocaleString('pt-BR')}</p>
              </div>
              {selectedRequest.etapa && (
                <div>
                  <span className="text-white/60">Etapa:</span>
                  <p className="text-white">{selectedRequest.etapa.nome}</p>
                </div>
              )}
            </div>
          </div>

          {/* Conteúdo */}
          {selectedRequest.tipo === 'COMPRA' && selectedRequest.compras ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Itens de Compra</h3>
              {selectedRequest.compras.map((compra, index) => (
                <div key={compra.id} className="bg-neutral/60 border border-white/10 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <h4 className="font-semibold text-lg">Item {index + 1}: {compra.item}</h4>
                    <span className="px-2 py-1 rounded text-xs bg-white/10 text-white/70">{compra.status}</span>
                  </div>
                  {compra.descricao && (
                    <div>
                      <span className="text-white/60 text-sm">Descrição:</span>
                      <p className="text-white">{compra.descricao}</p>
                    </div>
                  )}
                  <div className="grid md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Quantidade:</span>
                      <p className="text-white font-medium">{compra.quantidade}</p>
                    </div>
                    {compra.categoria && (
                      <div>
                        <span className="text-white/60">Categoria:</span>
                        <p className="text-white">{compra.categoria.nome}</p>
                      </div>
                    )}
                    {compra.projeto && (
                      <div>
                        <span className="text-white/60">Projeto:</span>
                        <p className="text-white">{compra.projeto.nome}</p>
                      </div>
                    )}
                  </div>
                  <AttachmentList raw={compra.imagemUrl} title="Imagens" variant="grid" className="mt-0" />
                  {compra.cotacoesJson && Array.isArray(compra.cotacoesJson) && compra.cotacoesJson.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h5 className="font-semibold mb-3">Cotações</h5>
                      <div className="space-y-3">
                        {compra.cotacoesJson.map((cotacao: any, cotIndex: number) => (
                          <div key={cotIndex} className="bg-neutral/40 border border-white/5 rounded-lg p-3">
                            <div className="grid md:grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-white/60">Valor Unitário:</span>
                                <p className="text-white">
                                  {Number(cotacao.valorUnitario || 0).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </p>
                              </div>
                              <div>
                                <span className="text-white/60">Frete:</span>
                                <p className="text-white">
                                  {Number(cotacao.frete || 0).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </p>
                              </div>
                              <div>
                                <span className="text-white/60">Impostos:</span>
                                <p className="text-white">
                                  {Number(cotacao.impostos || 0).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </p>
                              </div>
                              <div>
                                <span className="text-white/60">Desconto:</span>
                                <p className="text-white">
                                  {(cotacao.descontoTipo || 'valor') === 'porcentagem'
                                    ? `${cotacao.desconto ?? 0}%`
                                    : Number(cotacao.desconto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                              </div>
                              {cotacao.link && (
                                <div className="md:col-span-2">
                                  <span className="text-white/60">Link:</span>
                                  <p className="text-white">
                                    <a href={cotacao.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                      {cotacao.link}
                                    </a>
                                  </p>
                                </div>
                              )}
                              {cotacao.fornecedorId && (
                                <div>
                                  <span className="text-white/60">Fornecedor:</span>
                                  <p className="text-white">{getSupplierName(cotacao.fornecedorId)}</p>
                                </div>
                              )}
                              {cotacao.formaPagamento && (
                                <div>
                                  <span className="text-white/60">Forma de Pagamento:</span>
                                  <p className="text-white">{cotacao.formaPagamento}</p>
                                </div>
                              )}
                            </div>
                            <div className="mt-3 pt-3 border-t border-white/5">
                              <span className="text-white/60 text-sm">
                                Total ({compra.quantidade} unidades):{' '}
                              </span>
                              <span className="font-semibold text-primary">
                                {calculateTotal(cotacao, compra.quantidade).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <span className="text-white/60 text-sm font-medium">Observação:</span>
                    <p className="text-white mt-2 whitespace-pre-wrap">{compra.observacao || 'Nenhuma observação'}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold mb-3">Mensagem</h3>
              <div className="bg-neutral/60 border border-white/10 rounded-lg p-4">
                <p className="text-white whitespace-pre-wrap">{selectedRequest.texto || '—'}</p>
              </div>
              <RequerimentoAnexosView raw={selectedRequest.anexo} />
            </div>
          )}

          {(() => {
            const currentUserId = user?.id != null ? Number(user.id) : null;
            const isDestinatario =
              currentUserId != null &&
              selectedRequest.destinatarioId != null &&
              currentUserId === Number(selectedRequest.destinatarioId);
            const isSetorCompras =
              selectedRequest.tipo === 'COMPRA' && podeResponderCompra;
            const podeResponder =
              (isDestinatario || isSetorCompras) && !selectedRequest.resposta?.trim();
            const isRemetente =
              currentUserId != null &&
              selectedRequest.usuarioId != null &&
              currentUserId === Number(selectedRequest.usuarioId);

            return (
              <>
                {podeResponder && (
                  <form
                    onSubmit={handleSubmitReply}
                    className="border-t border-white/10 pt-6 mt-2 space-y-3"
                  >
                    <h3 className="text-lg font-semibold text-white">Responder</h3>
                    <p className="text-sm text-white/55">
                      Sua mensagem será registrada como resposta a este requerimento (apenas o destinatário pode
                      responder uma vez).
                    </p>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full min-h-[140px] bg-neutral/60 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none resize-y"
                      placeholder="Escreva sua resposta..."
                      maxLength={1500}
                      disabled={submittingReply || loadingDetail}
                    />
                    <label className="text-sm text-white/70 block">
                      Anexos (opcional)
                      <FileDropInput
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                        disabled={submittingReply || loadingDetail}
                        onFilesSelected={(files) =>
                          setReplyAnexos((prev) => appendUniqueFiles(prev, files))
                        }
                        className="mt-1 w-full bg-neutral/80 border border-white/10 rounded-md px-3 py-2 text-white text-sm"
                        dropMessage="Solte os arquivos aqui"
                      />
                      <span className="text-xs text-white/45 mt-1 block">
                        Até {UPLOAD_LIMITS.generic.maxMb} MB por arquivo. Imagens, PDF, Office, etc.
                      </span>
                    </label>
                    {replyAnexos.length > 0 && (
                      <ul className="space-y-1 text-sm text-white/80">
                        {replyAnexos.map((f, i) => (
                          <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <button
                              type="button"
                              className="text-danger text-xs shrink-0 hover:underline"
                              onClick={() => setReplyAnexos((prev) => prev.filter((_, j) => j !== i))}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-white/45">{replyText.length}/1500</span>
                      <button
                        type="submit"
                        disabled={
                          submittingReply ||
                          loadingDetail ||
                          (!replyText.trim() && replyAnexos.length === 0)
                        }
                        className={btn.primary}
                      >
                        {submittingReply ? 'Enviando...' : 'Enviar resposta'}
                      </button>
                    </div>
                  </form>
                )}

                {isRemetente && !selectedRequest.resposta?.trim() && !podeResponder && (
                  <div className="border-t border-white/10 pt-6 mt-2 rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/70">
                    Aguardando resposta de{' '}
                    <span className="text-white font-medium">
                      {selectedRequest.destinatario?.nome ?? 'destinatário'}
                    </span>
                    .
                  </div>
                )}
              </>
            );
          })()}

          {/* Resposta */}
          {selectedRequest.resposta && (
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Resposta</h3>
                {selectedRequest.dataResposta && (
                  <span className="text-sm text-white/60">
                    {new Date(selectedRequest.dataResposta).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              <div className="bg-neutral/60 border border-white/10 rounded-lg p-4">
                <p className="text-white whitespace-pre-wrap">{selectedRequest.resposta}</p>
              </div>
              <RequerimentoAnexosView raw={selectedRequest.anexoResposta} title="Anexos da resposta" />
            </div>
          )}
        </div>
      </div>
    );
  }

  function goToSentTab() {
    updateListParams({ tab: null, id: null, page: null });
  }

  function goToReceivedTab() {
    updateListParams({ tab: 'received', id: null, page: null });
  }

  return (
    <div className="space-y-6">
      {/* Tabs: Enviados / Recebidos */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 p-1 rounded-lg bg-white/5 border border-white/10 w-fit">
          <button
            type="button"
            onClick={goToSentTab}
            className={`px-4 py-2 rounded-md text-sm transition-colors ${
              subTab === 'sent'
                ? 'bg-primary text-neutral font-semibold shadow-sm'
                : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
          >
            Enviados
          </button>
          <button
            type="button"
            onClick={goToReceivedTab}
            className={`px-4 py-2 rounded-md text-sm transition-colors ${
              subTab === 'received'
                ? 'bg-primary text-neutral font-semibold shadow-sm'
                : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
          >
            Recebidos
          </button>
        </div>
        <p className="text-sm text-white/55 max-w-xl">
          {subTab === 'sent'
            ? 'Envie novos requerimentos e acompanhe o que você mandou.'
            : 'Requerimentos endereçados a você ou ao setor de compras (quando aplicável).'}
        </p>
      </div>

      {/* Formulário: só na aba Enviados — evita parecer a mesma tela que Recebidos */}
      {subTab === 'sent' && (
      <form onSubmit={handleSubmitRequest} className="bg-neutral/80 border border-white/10 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Novo Requerimento</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm text-white/70">
            Tipo
            <select
              value={form.tipo}
              onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value as RequerimentoTipo }))}
              className="mt-1 w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 text-white"
              required
            >
              <option value="SOLICITACAO" className="bg-neutral text-white">
                Requerimento
              </option>
              <option value="APROVACAO" className="bg-neutral text-white">
                Aprovação
              </option>
              <option value="INFORMACAO" className="bg-neutral text-white">
                Informação
              </option>
              <option value="RECLAMACAO" className="bg-neutral text-white">
                Reclamação
              </option>
              <option value="SUGESTAO" className="bg-neutral text-white">
                Sugestão
              </option>
              <option value="COMPRA" className="bg-neutral text-white">
                Compra
              </option>
              <option value="OUTRO" className="bg-neutral text-white">
                Outro
              </option>
            </select>
          </label>
        </div>
        {form.tipo !== 'COMPRA' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-white/70 font-medium">Destinatários *</span>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, destinatarioIds: users.map((u) => u.id) }))
                  }
                  className="text-primary hover:text-primary/90 underline underline-offset-2"
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, destinatarioIds: [] }))}
                  className="text-white/50 hover:text-white/80 underline underline-offset-2"
                >
                  Limpar
                </button>
              </div>
            </div>
            <p className="text-xs text-white/45">
              Marque um ou mais usuários. Será criado um requerimento igual para cada um.
            </p>
            <input
              type="search"
              value={destinatariosBusca}
              onChange={(e) => setDestinatariosBusca(e.target.value)}
              placeholder="Buscar destinatário por nome..."
              className="w-full rounded-md border border-white/15 bg-neutral/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoComplete="off"
            />
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-white/45">
              <span>
                {destinatariosBusca.trim()
                  ? `${usuariosFiltradosDestinatarios.length} de ${users.length} usuário(s) na lista`
                  : `${users.length} usuário(s) no total — role para ver mais`}
              </span>
            </div>
            {/* ~5 linhas + fração da 6ª para indicar que há rolagem */}
            <div className="max-h-[12.5rem] overflow-y-auto overflow-x-hidden rounded-md border border-white/10 bg-neutral/40 divide-y divide-white/10 scroll-py-1">
              {users.length === 0 ? (
                <p className="px-3 py-4 text-sm text-white/45 text-center">Nenhum usuário disponível</p>
              ) : usuariosFiltradosDestinatarios.length === 0 ? (
                <p className="px-3 py-4 text-sm text-white/45 text-center">
                  Nenhum usuário encontrado para «{destinatariosBusca.trim()}»
                </p>
              ) : (
                usuariosFiltradosDestinatarios.map((u) => (
                  <label
                    key={u.id}
                    className="flex min-h-[2.25rem] items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-white/30 bg-neutral/80 text-primary focus:ring-primary shrink-0"
                      checked={form.destinatarioIds.includes(u.id)}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          destinatarioIds: prev.destinatarioIds.includes(u.id)
                            ? prev.destinatarioIds.filter((id) => id !== u.id)
                            : [...prev.destinatarioIds, u.id],
                        }))
                      }
                    />
                    <span className="text-sm text-white/90 truncate">{u.nome}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-white/50">
              {form.destinatarioIds.length} usuário(s) selecionado(s)
            </p>
          </div>
        )}
        {/* Campo de mensagem para tipos que não são Compra */}
        {form.tipo !== 'COMPRA' && (
          <>
            <label className="text-sm text-white/70 block">
              Mensagem *
              <textarea
                value={form.texto ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, texto: e.target.value }))}
                className="mt-1 w-full min-h-[120px] bg-neutral/60 border border-white/10 rounded-md px-3 py-2 text-white placeholder:text-white/50 focus:border-primary focus:outline-none resize-y"
                placeholder="Escreva o conteúdo do requerimento..."
                maxLength={1500}
              />
              <span className="text-xs text-white/50 mt-1 block">
                {(form.texto?.length ?? 0)}/1500 caracteres — ou envie só anexos
              </span>
            </label>
            <label className="text-sm text-white/70 block">
              Anexos (opcional)
              <FileDropInput
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                disabled={submitting}
                onFilesSelected={(files) =>
                  setCreateAnexos((prev) => appendUniqueFiles(prev, files))
                }
                className="mt-1 w-full bg-neutral/80 border border-white/10 rounded-md px-3 py-2 text-white text-sm"
                dropMessage="Solte os arquivos aqui"
              />
              <span className="text-xs text-white/45 mt-1 block">
                Até {UPLOAD_LIMITS.generic.maxMb} MB por arquivo
              </span>
            </label>
            {createAnexos.length > 0 && (
              <ul className="space-y-1 text-sm text-white/80">
                {createAnexos.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="text-danger text-xs shrink-0 hover:underline"
                      onClick={() => setCreateAnexos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {form.tipo === 'COMPRA' && (
          <>
            <label className="text-sm text-white/70 block">
              Destinatário
              <input
                type="text"
                value="Setor de Compras"
                disabled
                className="mt-1 w-full bg-neutral/40 border border-white/10 rounded-md px-3 py-2 text-white/60 cursor-not-allowed"
              />
            </label>
            <label className="text-sm text-white/70 block">
              Observação (opcional)
              <textarea
                value={form.texto ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, texto: e.target.value }))}
                className="mt-1 w-full min-h-[80px] bg-neutral/60 border border-white/10 rounded-md px-3 py-2 text-white placeholder:text-white/50 focus:border-primary focus:outline-none resize-y"
                placeholder="Mensagem adicional para o setor de compras..."
                maxLength={1500}
              />
            </label>
            <label className="text-sm text-white/70 block">
              Anexos do requerimento (opcional)
              <FileDropInput
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                disabled={submitting}
                onFilesSelected={(files) =>
                  setCreateAnexos((prev) => appendUniqueFiles(prev, files))
                }
                className="mt-1 w-full bg-neutral/80 border border-white/10 rounded-md px-3 py-2 text-white text-sm"
                dropMessage="Solte os arquivos aqui"
              />
            </label>
            {createAnexos.length > 0 && (
              <ul className="space-y-1 text-sm text-white/80">
                {createAnexos.map((f, i) => (
                  <li key={`c-${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="text-danger text-xs shrink-0 hover:underline"
                      onClick={() => setCreateAnexos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {/* Formulário de Itens de Compra */}
        {form.tipo === 'COMPRA' && (
          <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
            <h4 className="text-md font-semibold">Itens de Compra</h4>
            <p className="text-xs text-white/50">
              Vários itens no mesmo requerimento — use &quot;Adicionar outro item&quot; ao lado de &quot;Adicionar Cotação&quot;.
            </p>
            {itensCompra.map((item, index) => (
              <div key={index} className="bg-neutral/60 border border-white/10 rounded-lg p-4 space-y-3">
                <PurchaseRequestFields
                  value={item}
                  onChange={(next) => {
                    const newItens = [...itensCompra];
                    newItens[index] = {
                      ...newItens[index],
                      ...next,
                    };
                    setItensCompra(newItens);
                  }}
                  projects={projects}
                  categories={categories}
                  suppliers={suppliers}
                  showProject
                  showCategory
                  showObservacao
                  compact
                  quoteOptionalText="(mínimo uma com link)"
                  lineIndex={index + 1}
                  lineCount={itensCompra.length}
                  onAddLineItem={index === itensCompra.length - 1 ? addItem : undefined}
                  onRemoveLineItem={itensCompra.length > 1 ? () => removeItem(index) : undefined}
                />
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="text-sm text-white/70">
                    Imagem
                    <FileDropInput
                      accept="image/*"
                      disabled={uploadingImageIndex === index}
                      onFilesSelected={(files) => {
                        const file = files[0];
                        if (file) handleFileUpload(index, 'imagemUrl', file);
                      }}
                      className="mt-1 w-full bg-neutral/80 border border-white/10 rounded-md px-3 py-2 text-white text-sm"
                      dropMessage="Solte a imagem aqui"
                    />
                    {uploadingImageIndex === index && (
                      <p className="mt-1 text-xs text-white/50">Enviando imagem...</p>
                    )}
                  </label>
                </div>
                {item.imagemUrl && (
                  <div className="mt-2">
                    <img
                      src={resolvePublicUploadUrl(item.imagemUrl)}
                      alt="Preview"
                      className="max-w-xs max-h-32 rounded border border-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(index, 'imagemUrl', undefined)}
                      className="mt-1 text-xs text-danger hover:text-danger/80"
                    >
                      Remover imagem
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className={btn.primary}
        >
          {submitting ? 'Enviando...' : 'Enviar Requerimento'}
        </button>
      </form>
      )}
      {/* Tabela de Requerimentos */}
      {(() => {
        const tipoLabels: Record<RequerimentoTipo, string> = {
          SOLICITACAO: 'Requerimento',
          APROVACAO: 'Aprovação',
          INFORMACAO: 'Informação',
          RECLAMACAO: 'Reclamação',
          SUGESTAO: 'Sugestão',
          COMPRA: 'Compra',
          OUTRO: 'Outro',
        };
        return (
          <div className="space-y-2">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Caixa de Entrada
              </h3>
              <p className="text-sm text-white/50 mt-0.5">
                {filteredRequests.length === requests.length
                  ? `${requests.length} requerimento(s)`
                  : `${filteredRequests.length} de ${requests.length} requerimento(s)`}
              </p>
            </div>

            <CollapsibleFilters
              show={showListFilters}
              setShow={setShowListFilters}
              hasActiveFilters={hasActiveListFilters}
              onClear={clearListFilters}
              title="Busca e filtros"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
                  <input
                    type="search"
                    placeholder="Texto, remetente, destinatário..."
                    value={filterQ}
                    onChange={(e) => patchListFilters({ q: e.target.value || null })}
                    className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/90 mb-1">Tipo</label>
                  <select
                    value={filterTipo}
                    onChange={(e) =>
                      patchListFilters({ tipo: e.target.value || null })
                    }
                    className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    {REQUERIMENTO_TIPO_OPTIONS.map((opt) => (
                      <option key={opt.value || 'all'} value={opt.value} className="bg-neutral text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/90 mb-1">Leitura</label>
                  <select
                    value={filterLeitura}
                    onChange={(e) =>
                      patchListFilters({ leitura: e.target.value || null })
                    }
                    className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="" className="bg-neutral text-white">Todas</option>
                    <option value="nao_lida" className="bg-neutral text-white">Não lida</option>
                    <option value="lida" className="bg-neutral text-white">Lida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/90 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) =>
                      patchListFilters({ status: e.target.value || null })
                    }
                    className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="" className="bg-neutral text-white">Todos</option>
                    <option value="pendente" className="bg-neutral text-white">Pendente</option>
                    <option value="respondida" className="bg-neutral text-white">Respondida</option>
                  </select>
                </div>
              </div>
            </CollapsibleFilters>

          <DataTable<Request>
            data={filteredRequests}
            keyExtractor={(r) => r.id}
            loading={loading}
            emptyMessage={
              hasActiveListFilters
                ? 'Nenhum requerimento corresponde aos filtros aplicados.'
                : subTab === 'sent'
                  ? 'Você ainda não enviou nenhum requerimento.'
                  : 'Nenhum requerimento recebido por enquanto.'
            }
            paginate
            page={listPage}
            pageSize={listPageSize}
            onPageChange={(page) => updateListParams({ page: page <= 1 ? null : String(page) })}
            onPageSizeChange={(size) =>
              updateListParams({ pageSize: size === 20 ? null : String(size), page: null })
            }
            pageSizeOptions={[...LIST_PAGE_SIZE_OPTIONS]}
            onRowClick={(r) => handleRequestClick(r)}
            renderMobileCard={(r) => (
              <div
                className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3 cursor-pointer active:bg-white/5"
                onClick={() => handleRequestClick(r)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs px-2 py-0.5 rounded font-medium bg-primary/20 text-primary border border-primary/30 shrink-0">
                    {tipoLabels[r.tipo] || r.tipo}
                  </span>
                  {(() => {
                    const leitura = requerimentoLeituraLabel(r);
                    if (leitura === '—') {
                      return <span className="text-xs text-white/35">—</span>;
                    }
                    return (
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          leitura === 'Lida' ? 'text-emerald-300/95' : 'text-amber-200/85'
                        }`}
                      >
                        {leitura}
                      </span>
                    );
                  })()}
                </div>
                {/* Mensagem / título (prévia; texto completo no detalhe ao tocar) */}
                <div className="min-w-0">
                  {r.tipo === 'COMPRA' ? (
                    <>
                      <p className="font-medium text-white/90">Requerimento de compra</p>
                      {r.texto?.trim() ? (
                        <p
                          className="text-sm text-white/75 line-clamp-2 break-words mt-0.5"
                          title={r.texto}
                        >
                          {r.texto}
                        </p>
                      ) : (
                        <p className="text-sm text-white/50 mt-0.5">—</p>
                      )}
                    </>
                  ) : (
                    <p
                      className="font-medium text-white/90 line-clamp-3 break-words"
                      title={r.texto?.trim() ? r.texto : undefined}
                    >
                      {r.texto?.trim() ? r.texto : '—'}
                    </p>
                  )}
                  <p className="text-xs text-white/50 mt-1">
                    {new Date(r.dataCriacao).toLocaleString('pt-BR')}
                  </p>
                </div>
                {/* Info: usuário + status */}
                <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-lg p-3 text-sm">
                  <div>
                    <p className="text-xs text-white/50 mb-0.5">
                      {subTab === 'sent' ? 'Destinatário' : 'Remetente'}
                    </p>
                    <p className="text-white/80 text-xs truncate">
                      {subTab === 'sent' ? requerimentoDestinatarioLabel(r) : r.usuario?.nome ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/50 mb-0.5">Leitura</p>
                    <p
                      className={`text-xs font-medium ${
                        requerimentoLeituraLabel(r) === 'Lida'
                          ? 'text-emerald-300/95'
                          : requerimentoLeituraLabel(r) === 'Não lida'
                            ? 'text-amber-200/85'
                            : 'text-white/40'
                      }`}
                    >
                      {requerimentoLeituraLabel(r)}
                    </p>
                  </div>
                </div>
                {/* Ação excluir */}
                <div className="flex justify-end pt-1 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleDeleteRequest(r)}
                    disabled={deletingRequestId === r.id}
                    className={btn.dangerSm}
                  >
                    {deletingRequestId === r.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </div>
            )}
            columns={[
              {
                key: 'tipo',
                label: 'Tipo',
                render: (r) => (
                  <span className="px-2 py-1 rounded text-xs bg-primary/20 text-primary border border-primary/30">
                    {tipoLabels[r.tipo] || r.tipo}
                  </span>
                ),
              },
              {
                key: 'mensagem',
                label: 'Mensagem',
                tdClassName: 'max-w-md min-w-[12rem]',
                render: (r) => (
                  <div className="min-w-0">
                    {r.tipo === 'COMPRA' ? (
                      <>
                        <p className="font-medium text-white/90">Requerimento de compra</p>
                        {r.texto?.trim() ? (
                          <p
                            className="text-sm text-white/75 line-clamp-2 break-words mt-0.5"
                            title={r.texto}
                          >
                            {r.texto}
                          </p>
                        ) : (
                          <p className="text-sm text-white/50 mt-0.5">—</p>
                        )}
                      </>
                    ) : (
                      <p
                        className="font-medium text-white/90 line-clamp-3 break-words"
                        title={r.texto?.trim() ? r.texto : undefined}
                      >
                        {r.texto?.trim() ? r.texto : '—'}
                      </p>
                    )}
                    <p className="text-xs text-white/50 mt-1 tabular-nums">
                      {new Date(r.dataCriacao).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ),
              },
              {
                key: 'usuario',
                label: subTab === 'sent' ? 'Destinatário' : 'Remetente',
                render: (r) => (
                  <span className="text-white/80">
                    {subTab === 'sent' ? requerimentoDestinatarioLabel(r) : r.usuario?.nome ?? '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) => {
                  const leitura = requerimentoLeituraLabel(r);
                  if (leitura === '—') {
                    return <span className="text-white/40">—</span>;
                  }
                  return (
                    <span
                      className={
                        leitura === 'Lida'
                          ? 'text-emerald-300/95 font-medium'
                          : 'text-amber-200/85 font-medium'
                      }
                    >
                      {leitura}
                    </span>
                  );
                },
              },
              {
                key: 'acoes',
                label: 'Ações',
                stopRowClick: true,
                render: (r) => (
                  <button
                    onClick={() => handleDeleteRequest(r)}
                    disabled={deletingRequestId === r.id}
                    className="text-danger hover:text-danger/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Excluir requerimento"
                  >
                    {deletingRequestId === r.id ? (
                      <span className="text-sm">Excluindo...</span>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                ),
              },
            ] satisfies DataTableColumn<Request>[]}
          />
          </div>
        );
      })()}

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && requestToDelete && (
        <AppModal
          open={showDeleteConfirm}
          onClose={() => {
            setShowDeleteConfirm(false);
            setRequestToDelete(null);
          }}
          title="Confirmar Exclusão"
          size="sm"
          stickyHeader={false}
          bodyClassName="p-6"
        >
          <p className="text-white/80 mb-6">
            Tem certeza que deseja excluir este requerimento? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                setRequestToDelete(null);
              }}
              className={btn.secondary}
              disabled={deletingRequestId !== null}
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              disabled={deletingRequestId !== null}
              className={btn.danger}
            >
              {deletingRequestId !== null ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </AppModal>
      )}
    </div>
  );
}
