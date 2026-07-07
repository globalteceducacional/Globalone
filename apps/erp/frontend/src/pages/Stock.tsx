import { useEffect, useState, FormEvent, useMemo, useCallback } from 'react';
import { btn } from '../utils/buttonStyles';
import { api } from '../services/api';
import * as XLSX from 'xlsx-js-style';
import { ExcelDownloadButton } from '../components/ExcelDownloadButton';
import { toast, formatApiError } from '../utils/toast';
import { UPLOAD_LIMITS, formatMb } from '../utils/uploadLimits';
import { buildStyledEstoqueSheetWorkbook, ESTOQUE_SHEET_IMPORT_HEADERS } from '../utils/estoqueSheetExcel';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';
import { useFormValidation, validators, errorMessages } from '../utils/validation';
import type { 
  Cotacao, 
  StockItem, 
  Purchase, 
  Supplier, 
  Category, 
  CreateItemForm,
  CreatePurchaseForm,
  StockTab,
  SignatureMonthReportResponse,
} from '../types/stock';
import { PagoPorListEditor } from '../components/stock/PagoPorListEditor';
import { normalizePagoPorFromApi, pagoPorToApiPayload, formatPagoPorSummary } from '../utils/pagoPor';
import { 
  STATUS_ENTREGA_OPTIONS as statusEntregaOptions,
  FORMAS_PAGAMENTO as formasPagamento,
} from '../constants/stock';
import { 
  SupplierModal, 
  CategoryModal,
  PurchaseFilters,
  StockComprasToolbar,
  PurchaseSubTabs,
  PurchaseMobileList,
  PurchaseDesktopTable,
  CreatePurchaseModal,
  DeletePurchaseModal,
  BulkDeletePurchaseModal,
  BulkApprovePurchaseModal,
  PurchaseStatusModal,
  SolicitacoesSection,
  PurchaseEditModal,
  ViewRequestModal,
  RejectRequestModal,
  ItemDetailsModal,
  PurchaseDetailsModal,
  PurchaseReportModal,
} from '../components/stock';
import { buildPurchaseReportPdf } from '../utils/purchaseReportPdf';
import {
  buildPurchasePayloadFromLine,
  createEmptyPurchaseLineItem,
} from '../utils/purchaseRequest';
import type { PurchaseLineItem } from '../types/stock';
import { NumericInput } from '../components/ui/NumericInput';
import {
  updateCotacao as updateCotacaoHelper,
  addCotacao as addCotacaoHelper,
  removeCotacao as removeCotacaoHelper,
  getSupplierName as getSupplierNameHelper,
  getCategoryName as getCategoryNameHelper,
  calculateCotacaoTotal as calculateCotacaoTotalHelper,
  getCotacaoValorMedioPorUnidade,
  getCotacaoValorUnitario,
  getPurchaseLineTotal,
  getPurchaseLineUnitValue,
  normalizeCotacaoForForm,
  truncateDisplayText,
  canApprovePurchaseWithExistingCotacoes,
  buildQuickApprovePurchasePayload,
} from '../utils/stockHelpers';
import { useStockData } from '../hooks/useStockData';
import { usePurchaseFilters } from '../hooks/usePurchaseFilters';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { TablePagination } from '../components/TablePagination';
import { FileDropInput } from '../components/FileDropInput';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppInput } from '../components/ui/AppInput';
import { AppSelect } from '../components/ui/AppSelect';
import { UploadFileLink } from '../components/files/UploadFileLink';
import { uploadSingleFile, resolvePublicUploadUrl } from '../utils/uploadFile';
import { parseAttachmentUrls, serializeAttachmentUrls } from '../utils/attachmentUrls';
const SOLICITACOES_VISTAS_STORAGE_KEY = 'erp.stock.solicitacoesVistasIds';
/** Palavra que o usuário deve digitar para confirmar exclusão em massa */
const BULK_DELETE_CONFIRM_PHRASE = 'APAGAR';
function isBulkDeleteConfirmPhrase(value: string): boolean {
  return value.trim().toUpperCase() === BULK_DELETE_CONFIRM_PHRASE;
}
function loadSolicitacoesVistasIds(): number[] {
  try {
    const raw = localStorage.getItem(SOLICITACOES_VISTAS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === 'number' && Number.isInteger(n));
  } catch {
    return [];
  }
}
function persistSolicitacoesVistasIds(ids: number[]) {
  try {
    localStorage.setItem(SOLICITACOES_VISTAS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
  }
}
/** Limite de caracteres para nome/descrição em tabelas/cards (texto completo no `title`). Valores menores evitam linhas muito largas. */
const LIST_ITEM_NAME_MAX_LEN = 36;
const LIST_ITEM_DESC_MAX_LEN = 22;
/** Paginação: lista de estoque, compras (tabela custom) e solicitações. */
const STOCK_TABLE_PAGE_SIZE_DEFAULT = 20;
const STOCK_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export default function Stock() {
  const {
    items,
    purchases,
    projects,
    suppliers,
    categories,
    users,
    metodosPago,
    load: loadData,
    loadMetodosPago,
    setPurchases,
    setSuppliers,
    setCategories,
  } = useStockData();
  interface SimpleSetor {
    id: number;
    nome: string;
  }
  const [setores, setSetores] = useState<SimpleSetor[]>([]);
  const [etapas, setEtapas] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  /** Fluxo explícito de registro na aba Assinaturas (categoria obrigatória e filtrada). */
  const [purchaseModalMode, setPurchaseModalMode] = useState<'compra' | 'assinatura' | 'despesa'>('compra');
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [showEditPurchaseModal, setShowEditPurchaseModal] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [showDeletePurchaseModal, setShowDeletePurchaseModal] = useState(false);
  const [deletingPurchase, setDeletingPurchase] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showTagStatusConfirmModal, setShowTagStatusConfirmModal] = useState(false);
  const [purchaseToUpdateStatus, setPurchaseToUpdateStatus] = useState<Purchase | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newStatusEntrega, setNewStatusEntrega] = useState<string>('');
  const [newPrevisaoEntrega, setNewPrevisaoEntrega] = useState<string>('');
  const [newDataEntrega, setNewDataEntrega] = useState<string>('');
  const [newEnderecoEntrega, setNewEnderecoEntrega] = useState<string>('');
  const [newRecebidoPor, setNewRecebidoPor] = useState<string>('');
  const [newObservacao, setNewObservacao] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<number | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [estoqueOnlyAvailable, setEstoqueOnlyAvailable] = useState(false);
  const [estoqueMinDisponivel, setEstoqueMinDisponivel] = useState<string>('');
  type EstoqueSortCol = 'item' | 'quantidade' | 'alocada' | 'disponivel';
  const { sortColumn: estoqueSortCol, sortDirection: estoqueSortDir, handleSort: handleEstoqueSort } =
    useClientTableSort<EstoqueSortCol>('item');
  const [solicitanteFilter, setSolicitanteFilter] = useState<number | 'all'>('all');
  const [solicitacaoOrigemFilter, setSolicitacaoOrigemFilter] = useState<'all' | 'futura' | 'normal'>('all');
  const [selectedPurchases, setSelectedPurchases] = useState<number[]>([]);
  const [selectedSolicitacaoIds, setSelectedSolicitacaoIds] = useState<number[]>([]);
  const [showBulkDeletePurchaseModal, setShowBulkDeletePurchaseModal] = useState(false);
  const [bulkDeletePurchaseIds, setBulkDeletePurchaseIds] = useState<number[]>([]);
  const [deletingBulkPurchase, setDeletingBulkPurchase] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [bulkApproveEligibleIds, setBulkApproveEligibleIds] = useState<number[]>([]);
  const [bulkApproveSkipped, setBulkApproveSkipped] = useState<
    Array<{ id: number; item: string; reason: string }>
  >([]);
  const [approvingBulkPurchase, setApprovingBulkPurchase] = useState(false);
  const [bulkApproveProgress, setBulkApproveProgress] = useState<string | null>(null);
  const [selectedStockItemIds, setSelectedStockItemIds] = useState<number[]>([]);
  const [showBulkDeleteStockModal, setShowBulkDeleteStockModal] = useState(false);
  const [deletingBulkStock, setDeletingBulkStock] = useState(false);
  const [bulkDeleteConfirmInput, setBulkDeleteConfirmInput] = useState('');
  const [showTagModal, setShowTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState('#3B82F6');
  const [applyingTag, setApplyingTag] = useState(false);
  const [removingTagBulk, setRemovingTagBulk] = useState(false);
  const [showImportSheetModal, setShowImportSheetModal] = useState(false);
  const [importingSheet, setImportingSheet] = useState(false);
  const [importSheetFile, setImportSheetFile] = useState<File | null>(null);
  const [importSheetProjetoId, setImportSheetProjetoId] = useState<number | ''>('');
  const [importSheetCategoriaId, setImportSheetCategoriaId] = useState<number | ''>('');
  const [importSheetSetorId, setImportSheetSetorId] = useState<number | ''>('');
  const [importSheetOverwrite, setImportSheetOverwrite] = useState(false);
  const [showImportSheetFeedbackModal, setShowImportSheetFeedbackModal] = useState(false);
  const [importSheetFeedback, setImportSheetFeedback] = useState<{
    variant: 'error' | 'warning';
    title: string;
    text: string;
    source?: 'compras' | 'estoque';
  } | null>(null);
  const [showImportEstoqueSheetModal, setShowImportEstoqueSheetModal] = useState(false);
  const [importEstoqueSheetFile, setImportEstoqueSheetFile] = useState<File | null>(null);
  const [importEstoqueProjetoId, setImportEstoqueProjetoId] = useState<number | ''>('');
  const [importEstoqueCategoriaId, setImportEstoqueCategoriaId] = useState<number | ''>('');
  const [importingEstoqueSheet, setImportingEstoqueSheet] = useState(false);
  const [exportingStockSheet, setExportingStockSheet] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [includeSignaturesInReport, setIncludeSignaturesInReport] = useState(false);
  const [signatureAlertsByPurchaseId, setSignatureAlertsByPurchaseId] = useState<
    Record<number, { mesReferencia: string; precisaConfirmacao: boolean }>
  >({});
  const [selectedSignatureMonth, setSelectedSignatureMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  type PurchaseReportMode = 'selection' | 'signature-month' | 'solicitacoes-pending';
  const [purchaseReportMode, setPurchaseReportMode] = useState<PurchaseReportMode>('selection');
  const [signatureReportMonthInModal, setSignatureReportMonthInModal] = useState('');
  const [cachedSignatureReportPurchases, setCachedSignatureReportPurchases] = useState<Purchase[]>([]);
  const [signatureReportLoading, setSignatureReportLoading] = useState(false);
  const [showBatchAcaminhoModal, setShowBatchAcaminhoModal] = useState(false);
  const [showBatchTagWarningModal, setShowBatchTagWarningModal] = useState(false);
  const [batchAcaminhoSubmitting, setBatchAcaminhoSubmitting] = useState(false);
  // --- Arquivos pendentes de upload (File em vez de base64) ---
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const [pendingNfFiles, setPendingNfFiles] = useState<File[]>([]);
  const [pendingComprovanteFiles, setPendingComprovanteFiles] = useState<File[]>([]);
  const [pendingItemImageFile, setPendingItemImageFile] = useState<File | null>(null);
  const [pendingItemNfFile, setPendingItemNfFile] = useState<File | null>(null);
  const [pendingItemComprovanteFile, setPendingItemComprovanteFile] = useState<File | null>(null);
  const [itemStockDocRemoveConfirm, setItemStockDocRemoveConfirm] = useState<
    null | 'nfUrl' | 'comprovantePagamentoUrl'
  >(null);
  const [pendingBatchNfFiles, setPendingBatchNfFiles] = useState<File[]>([]);
  const [pendingBatchComprovanteFiles, setPendingBatchComprovanteFiles] = useState<File[]>([]);

  const [batchAcaminhoForm, setBatchAcaminhoForm] = useState({
    formaPagamento: '',
    dataCompra: '',
    previsaoEntrega: '',
    statusEntrega: 'NAO_ENTREGUE' as string,
    enderecoEntrega: '',
    observacao: '',
    descontoTipo: 'valor' as 'valor' | 'porcentagem',
    descontoValor: 0,
    freteLote: 0,
  });
  const [activeTab, setActiveTab] = useState<StockTab>('estoque');
  const purchaseFiltersHook = usePurchaseFilters(
    purchases,
    activeTab,
    selectedProjectFilter,
    searchTerm,
    metodosPago,
  );
  const {
    subTab: purchaseSubTab,
    setSubTab: setPurchaseSubTab,
    filters: purchaseFiltersState,
    setFilters: setPurchaseFilters,
    showFilters: showPurchaseFilters,
    setShowFilters: setShowPurchaseFilters,
    clearFilters: clearPurchaseFilters,
    hasActiveFilters,
    sortColumn,
    sortDirection,
    handleSort,
    filteredPurchases,
    sortedPurchases,
    purchaseCounts,
  } = purchaseFiltersHook;
  const [purchaseListPage, setPurchaseListPage] = useState(1);
  const [purchaseListPageSize, setPurchaseListPageSize] = useState(
    STOCK_TABLE_PAGE_SIZE_DEFAULT,
  );
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [purchaseToReject, setPurchaseToReject] = useState<Purchase | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showViewRequestModal, setShowViewRequestModal] = useState(false);
  const [purchaseToView, setPurchaseToView] = useState<Purchase | null>(null);
  const [openedSolicitacaoIds, setOpenedSolicitacaoIds] = useState<number[]>(loadSolicitacoesVistasIds);
  const [approveCotacoes, setApproveCotacoes] = useState<Cotacao[]>([{ valorUnitario: 0, frete: 0, impostos: 0, desconto: 0, descontoTipo: 'valor', link: '', fornecedorId: undefined, formaPagamento: '' }]);
  const [selectedCotacaoIndex, setSelectedCotacaoIndex] = useState<number>(0);
  const [approveWithChangesMode, setApproveWithChangesMode] = useState(false);
  const [approveQuantity, setApproveQuantity] = useState<number | null>(1);
  const [reducedQuantityAction, setReducedQuantityAction] = useState<'COMPRAR_DEPOIS' | 'REMOVER'>('REMOVER');
  const [approveCategoriaId, setApproveCategoriaId] = useState<number | ''>('');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAlocacaoModal, setShowAlocacaoModal] = useState(false);
  const [itemParaAlocar, setItemParaAlocar] = useState<StockItem | null>(null);
  const [alocacoes, setAlocacoes] = useState<any[]>([]);
  const [alocacaoForm, setAlocacaoForm] = useState({
    projetoId: undefined as number | undefined,
    etapaId: undefined as number | undefined,
    usuarioId: undefined as number | undefined,
    setorId: undefined as number | undefined,
    quantidade: 1,
  });
  const [currentCotacaoIndex, setCurrentCotacaoIndex] = useState<number | null>(null);
  const [supplierPick, setSupplierPick] = useState<{ lineIndex: number; cotIndex: number } | null>(null);
  const [purchaseLineItems, setPurchaseLineItems] = useState<PurchaseLineItem[]>([
    createEmptyPurchaseLineItem(),
  ]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalAssinaturaDefault, setCategoryModalAssinaturaDefault] = useState(false);
  const [showItemDetailsModal, setShowItemDetailsModal] = useState(false);
  const [itemToView, setItemToView] = useState<StockItem | null>(null);
  const [showPurchaseDetailsModal, setShowPurchaseDetailsModal] = useState(false);
  const [purchaseToViewDetails, setPurchaseToViewDetails] = useState<Purchase | null>(null);
  const [itemForm, setItemForm] = useState<CreateItemForm>({
    item: '',
    codigo: '',
    categoriaId: undefined,
    descricao: '',
    quantidade: 1,
    valorUnitario: 0,
    unidadeMedida: 'UN',
    localizacao: '',
    imagemUrl: '',
    nfUrl: '',
    comprovantePagamentoUrl: '',
  });
  const [purchaseForm, setPurchaseForm] = useState<CreatePurchaseForm>({
    item: '',
    descricao: '',
    quantidade: 1,
    imagemUrls: [],
    nfUrls: [],
    comprovanteUrls: [],
    cotacoes: [{ valorUnitario: 0, frete: 0, impostos: 0, desconto: 0, descontoTipo: 'valor', link: '', fornecedorId: undefined, formaPagamento: '' }],
    projetoId: 0,
    setorId: undefined,
    solicitadoPorId: undefined,
    selectedCotacaoIndex: 0,
    dataCompra: '',
    categoriaId: undefined,
    observacao: '',
    pagoPor: [],
  });
  const emptyPurchaseForm = useMemo(
    (): CreatePurchaseForm => ({
      item: '',
      descricao: '',
      quantidade: 1,
      imagemUrls: [],
      nfUrls: [],
      comprovanteUrls: [],
      cotacoes: [
        {
          valorUnitario: 0,
          frete: 0,
          impostos: 0,
          desconto: 0,
          descontoTipo: 'valor',
          link: '',
          fornecedorId: undefined,
          formaPagamento: '',
        },
      ],
      projetoId: 0,
      setorId: undefined,
      solicitadoPorId: undefined,
      selectedCotacaoIndex: 0,
      dataCompra: '',
      categoriaId: undefined,
      observacao: '',
      pagoPor: [],
    }),
    [],
  );
  const signaturePurchaseCategories = useMemo(
    () => categories.filter((c) => c.ativo && c.isAssinatura),
    [categories],
  );
  const itemValidationRules = useMemo(() => ({
    item: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(2), message: errorMessages.minLength(2) },
    ],
    quantidade: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.positive, message: errorMessages.positive },
    ],
    valorUnitario: [
      {
        validator: (v: number | null) =>
          v !== null && v !== undefined && typeof v === 'number' && !Number.isNaN(v) && v >= 0,
        message: 'Informe um valor unitário (maior ou igual a zero)',
      },
    ],
  }), []);
  const purchaseValidationRules = useMemo(() => ({
    item: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(2), message: errorMessages.minLength(2) },
    ],
    quantidade: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.positive, message: errorMessages.positive },
    ],
  }), []);
  const itemValidation = useFormValidation<CreateItemForm>(itemValidationRules);
  const purchaseValidation = useFormValidation<CreatePurchaseForm>(purchaseValidationRules);
  const getSupplierName = (fornecedorId?: number) => getSupplierNameHelper(fornecedorId, suppliers);
  const getCategoryName = (categoriaId?: number) => getCategoryNameHelper(categoriaId, categories);
  const isSignaturePurchase = (purchase: Purchase) =>
    purchase.classe === 'ASSINATURA' || Boolean(purchase.categoria?.isAssinatura);
  const isDespesaPurchase = (purchase: Purchase) =>
    purchase.classe === 'DESPESA' || Boolean(purchase.categoria?.isDespesa);
  const isCompraFuturaRemanescente = (purchase: Purchase) => {
    const obs = String(purchase.observacao || '').toLowerCase();
    return obs.includes('remanescente da solicitação') || obs.includes('remanescente do pedido');
  };
  function openCategoryModal(opts?: { assinaturaDefault?: boolean }) {
    setCategoryModalAssinaturaDefault(Boolean(opts?.assinaturaDefault));
    setShowCategoryModal(true);
  }
  function openNovaCompraModal() {
    setPurchaseModalMode('compra');
    setPurchaseForm({ ...emptyPurchaseForm });
    setPurchaseLineItems([createEmptyPurchaseLineItem()]);
    setPendingImageFiles([]);
    setPendingNfFiles([]);
    setPendingComprovanteFiles([]);
    setShowPurchaseModal(true);
  }
  function openNovaDespesaModal() {
    setPurchaseModalMode('despesa');
    setPurchaseSubTab('despesas');
    setPurchaseForm({ ...emptyPurchaseForm });
    setPurchaseLineItems([createEmptyPurchaseLineItem()]);
    setPendingImageFiles([]);
    setPendingNfFiles([]);
    setPendingComprovanteFiles([]);
    setShowPurchaseModal(true);
  }
  function openNovaAssinaturaModal() {
    const sigCats = categories.filter((c) => c.ativo && c.isAssinatura);
    const categoriaId = sigCats.length === 1 ? sigCats[0].id : undefined;
    setPurchaseModalMode('assinatura');
    setPurchaseSubTab('assinaturas');
    setPurchaseForm({ ...emptyPurchaseForm, categoriaId });
    setPurchaseLineItems([createEmptyPurchaseLineItem()]);
    setPendingImageFiles([]);
    setPendingNfFiles([]);
    setPendingComprovanteFiles([]);
    setShowPurchaseModal(true);
  }
  function handleCategoryCreated(newCategory: Category) {
    setCategories((prev) => [...prev, newCategory]);
    setPurchaseForm((prev) => ({ ...prev, categoriaId: newCategory.id }));
  }
  function openSupplierModal(cotacaoIndex: number) {
    setSupplierPick(null);
    setCurrentCotacaoIndex(cotacaoIndex);
    setShowSupplierModal(true);
  }
  function openSupplierModalFromCreate(lineIndex: number, cotacaoIndex: number) {
    setSupplierPick({ lineIndex, cotIndex: cotacaoIndex });
    setCurrentCotacaoIndex(null);
    setShowSupplierModal(true);
  }
  function openPurchaseStatusModal(purchase: Purchase) {
    setPurchaseToUpdateStatus(purchase);
    const assinatura = Boolean(purchase.categoria?.isAssinatura);
    const statusInicial =
      assinatura && purchase.status === 'COMPRADO_ACAMINHO' ? 'PENDENTE' : purchase.status;
    setNewStatus(statusInicial);
    if (assinatura) {
      setNewStatusEntrega('');
      setNewPrevisaoEntrega('');
      setNewDataEntrega('');
      setNewEnderecoEntrega('');
      setNewRecebidoPor('');
    } else if (purchase.status === 'COMPRADO_ACAMINHO') {
      setNewStatusEntrega(purchase.statusEntrega || 'NAO_ENTREGUE');
      setNewPrevisaoEntrega(purchase.previsaoEntrega ? new Date(purchase.previsaoEntrega).toISOString().split('T')[0] : '');
      setNewDataEntrega('');
      setNewEnderecoEntrega('');
      setNewRecebidoPor('');
    } else if (purchase.status === 'ENTREGUE') {
      setNewStatusEntrega('');
      setNewPrevisaoEntrega('');
      setNewDataEntrega(purchase.dataEntrega ? new Date(purchase.dataEntrega).toISOString().split('T')[0] : '');
      setNewEnderecoEntrega(purchase.enderecoEntrega || '');
      setNewRecebidoPor(purchase.recebidoPor || '');
    } else {
      setNewStatusEntrega('');
      setNewDataEntrega('');
      setNewEnderecoEntrega('');
      setNewRecebidoPor('');
    }
    setNewObservacao(purchase.observacao || '');
    setShowStatusModal(true);
  }
  function closePurchaseStatusModal() {
    setShowStatusModal(false);
    setPurchaseToUpdateStatus(null);
    setNewStatus('');
    setNewStatusEntrega('');
    setNewPrevisaoEntrega('');
    setNewDataEntrega('');
    setNewEnderecoEntrega('');
    setNewRecebidoPor('');
    setNewObservacao('');
    setShowTagStatusConfirmModal(false);
    setError(null);
  }
  function openEditPurchaseModal(purchase: Purchase) {
    setEditingPurchase(purchase);
    const mappedCotacoes: Cotacao[] =
      purchase.cotacoesJson && Array.isArray(purchase.cotacoesJson)
        ? purchase.cotacoesJson.map((cot: Cotacao) => normalizeCotacaoForForm(cot))
        : [
            {
              valorUnitario: 0,
              frete: 0,
              impostos: 0,
              desconto: 0,
              descontoTipo: 'valor' as const,
              link: '',
              fornecedorId: undefined,
              formaPagamento: '',
            },
          ];
    const idxRaw = purchase.cotacaoSelecionadaIndex ?? 0;
    const selectedIdx = Math.min(Math.max(0, idxRaw), Math.max(0, mappedCotacoes.length - 1));
    const docsDoMes =
      isSignaturePurchase(purchase) && purchaseSubTab === 'assinaturas';
    const mesDoc = purchase.assinaturaMesSelecionado;
    setPurchaseForm({
      item: purchase.item || '',
      descricao: purchase.descricao || '',
      quantidade: purchase.quantidade || 1,
      imagemUrls: parseAttachmentUrls(purchase.imagemUrl || ''),
      nfUrls: parseAttachmentUrls(
        docsDoMes ? mesDoc?.nfUrl || purchase.nfUrl || '' : purchase.nfUrl || '',
      ),
      comprovanteUrls: parseAttachmentUrls(
        docsDoMes
          ? mesDoc?.comprovantePagamentoUrl || purchase.comprovantePagamentoUrl || ''
          : purchase.comprovantePagamentoUrl || '',
      ),
      cotacoes: mappedCotacoes,
      projetoId: purchase.projetoId ?? 0,
      selectedCotacaoIndex: selectedIdx,
      setorId: purchase.setor?.id ?? purchase.setorId ?? undefined,
      solicitadoPorId: purchase.solicitadoPorId ?? undefined,
      dataCompra: purchase.dataCompra ? new Date(purchase.dataCompra).toISOString().split('T')[0] : '',
      categoriaId: purchase.categoriaId || undefined,
      observacao: purchase.observacao || '',
      pagoPor: normalizePagoPorFromApi(purchase.pagoPorJson),
    });
    setPendingImageFiles([]);
    setPendingNfFiles([]);
    setPendingComprovanteFiles([]);
    setShowEditPurchaseModal(true);
  }
  function openDeletePurchaseModal(purchase: Purchase) {
    setPurchaseToDelete(purchase);
    setShowDeletePurchaseModal(true);
  }
  function handleSupplierCreated(newSupplier: Supplier) {
    setSuppliers([...suppliers, newSupplier]);
    if (supplierPick != null) {
      const { lineIndex, cotIndex } = supplierPick;
      setPurchaseLineItems((prev) =>
        prev.map((line, li) =>
          li === lineIndex
            ? {
                ...line,
                cotacoes: line.cotacoes.map((c, ci) =>
                  ci === cotIndex ? { ...c, fornecedorId: newSupplier.id } : c,
                ),
              }
            : line,
        ),
      );
      setSupplierPick(null);
    } else if (currentCotacaoIndex !== null) {
      if (showViewRequestModal && approveCotacoes.length > currentCotacaoIndex) {
        const newCotacoes = [...approveCotacoes];
        newCotacoes[currentCotacaoIndex].fornecedorId = newSupplier.id;
        setApproveCotacoes(newCotacoes);
      } else if (purchaseForm.cotacoes.length > currentCotacaoIndex) {
        updateCotacao(purchaseForm, setPurchaseForm, currentCotacaoIndex, 'fornecedorId', newSupplier.id);
      }
      setCurrentCotacaoIndex(null);
    }
  }
  useEffect(() => {
    if (activeTab !== 'compras') {
      setPurchaseSubTab('pendente');
    }
  }, [activeTab, setPurchaseSubTab]);
  useEffect(() => {
    if (activeTab !== 'compras' || purchaseSubTab !== 'assinaturas') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Array<{ id: number; mesReferencia: string; precisaConfirmacao: boolean }>>(
          '/stock/purchases/signatures/alerts',
          { params: { mesReferencia: selectedSignatureMonth } },
        );
        if (cancelled) return;
        const next: Record<number, { mesReferencia: string; precisaConfirmacao: boolean }> = {};
        for (const row of Array.isArray(data) ? data : []) {
          next[row.id] = {
            mesReferencia: row.mesReferencia,
            precisaConfirmacao: Boolean(row.precisaConfirmacao),
          };
        }
        setSignatureAlertsByPurchaseId(next);
      } catch {
        if (!cancelled) setSignatureAlertsByPurchaseId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, purchaseSubTab, selectedSignatureMonth]);

  useEffect(() => {
    if (activeTab !== 'compras' || purchaseSubTab !== 'assinaturas') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Purchase[]>('/stock/purchases', {
          params: { mesReferenciaAssinatura: selectedSignatureMonth },
        });
        if (!cancelled && Array.isArray(data)) {
          setPurchases(data);
        }
      } catch {
        /* mantém lista atual */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, purchaseSubTab, selectedSignatureMonth, setPurchases]);

  useEffect(() => {
    if (!showReportModal || purchaseReportMode !== 'signature-month' || !signatureReportMonthInModal) return;
    let cancelled = false;
    setSignatureReportLoading(true);
    (async () => {
      try {
        const { data } = await api.get<SignatureMonthReportResponse>('/stock/purchases/signatures/report', {
          params: { mesReferencia: signatureReportMonthInModal },
        });
        if (cancelled) return;
        const mapped: Purchase[] = (data?.itens ?? []).map(({ compra, mes }) => ({
          ...compra,
          nfUrl: mes.nfUrl ?? compra.nfUrl,
          comprovantePagamentoUrl: mes.comprovantePagamentoUrl ?? compra.comprovantePagamentoUrl,
        }));
        setCachedSignatureReportPurchases(mapped);
      } catch {
        if (!cancelled) {
          setCachedSignatureReportPurchases([]);
          toast.error('Não foi possível carregar o relatório mensal de assinaturas.');
        }
      } finally {
        if (!cancelled) setSignatureReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showReportModal, purchaseReportMode, signatureReportMonthInModal]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<SimpleSetor[]>('/setores/options');
        if (!cancelled) {
          setSetores(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setSetores([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const load = useCallback(async () => {
    await loadData();
    if (activeTab === 'compras' && purchaseSubTab === 'assinaturas') {
      try {
        const { data } = await api.get<Purchase[]>('/stock/purchases', {
          params: { mesReferenciaAssinatura: selectedSignatureMonth },
        });
        if (Array.isArray(data)) {
          setPurchases(data);
        }
      } catch {
        /* lista já atualizada pelo loadData */
      }
    }
  }, [loadData, activeTab, purchaseSubTab, selectedSignatureMonth, setPurchases]);
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      const itemName = item.item?.toLowerCase() || '';
      const itemDesc = item.descricao?.toLowerCase() || '';
      if (!itemName.includes(searchLower) && !itemDesc.includes(searchLower)) {
        return false;
      }
    }
    const disponivel = item.quantidadeDisponivel ?? item.quantidade ?? 0;
    if (estoqueOnlyAvailable && disponivel <= 0) {
      return false;
    }
    if (estoqueMinDisponivel.trim()) {
      const min = Number(estoqueMinDisponivel);
      if (!Number.isNaN(min) && disponivel < min) {
        return false;
      }
    }
    return true;
  });
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (estoqueSortCol) {
        case 'item':
          cmp = (a.item ?? '').localeCompare(b.item ?? '');
          break;
        case 'quantidade':
          cmp = (a.quantidade || 0) - (b.quantidade || 0);
          break;
        case 'alocada':
          cmp = (a.quantidadeAlocada ?? 0) - (b.quantidadeAlocada ?? 0);
          break;
        case 'disponivel': {
          const da = a.quantidadeDisponivel ?? a.quantidade ?? 0;
          const db = b.quantidadeDisponivel ?? b.quantidade ?? 0;
          cmp = da - db;
          break;
        }
        default:
          cmp = 0;
      }
      return estoqueSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [items, searchTerm, estoqueOnlyAvailable, estoqueMinDisponivel, estoqueSortCol, estoqueSortDir]);
  useEffect(() => {
    setSelectedStockItemIds((prev) => {
      const allowed = new Set(filteredItems.map((i) => i.id));
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredItems]);
  useEffect(() => {
    if (activeTab !== 'estoque') {
      setSelectedStockItemIds([]);
    }
  }, [activeTab]);
  const filteredSolicitacoes = useMemo(() => {
    if (activeTab !== 'solicitacoes') return [];
    return sortedPurchases.filter((p) => {
      if (p.status !== 'SOLICITADO') return false;
      if (solicitanteFilter === 'all') return true;
      const solicitanteId = (p as any).solicitadoPor?.id;
      if (solicitanteId !== solicitanteFilter) return false;
      return true;
    });
  }, [activeTab, sortedPurchases, solicitanteFilter]);
  const filteredSolicitacoesByOrigem = useMemo(() => {
    if (solicitacaoOrigemFilter === 'all') return filteredSolicitacoes;
    return filteredSolicitacoes.filter((p) => {
      const futura = isCompraFuturaRemanescente(p);
      if (solicitacaoOrigemFilter === 'futura') return futura;
      return !futura;
    });
  }, [filteredSolicitacoes, solicitacaoOrigemFilter]);
  useEffect(() => {
    setSelectedSolicitacaoIds((prev) => {
      const allowed = new Set(filteredSolicitacoesByOrigem.map((p) => p.id));
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredSolicitacoesByOrigem]);
  useEffect(() => {
    if (activeTab !== 'solicitacoes') {
      setSelectedSolicitacaoIds([]);
    }
  }, [activeTab]);
  const unreadSolicitacoesCount = useMemo(() => {
    return purchases.filter(
      (p) => p.status === 'SOLICITADO' && !openedSolicitacaoIds.includes(p.id),
    ).length;
  }, [purchases, openedSolicitacaoIds]);
  function isSolicitacaoNova(purchase: Purchase): boolean {
    return !openedSolicitacaoIds.includes(purchase.id);
  }
  function openSolicitacaoDetails(purchase: Purchase) {
    setOpenedSolicitacaoIds((prev) => (prev.includes(purchase.id) ? prev : [...prev, purchase.id]));
    setPurchaseToView(purchase);
    setShowViewRequestModal(true);
  }
  useEffect(() => {
    persistSolicitacoesVistasIds(openedSolicitacaoIds);
  }, [openedSolicitacaoIds]);
  /** Ao abrir a aba Solicitações, marca todas as solicitações atuais como vistas (persiste no navegador). */
  useEffect(() => {
    if (activeTab !== 'solicitacoes') return;
    const ids = purchases.filter((p) => p.status === 'SOLICITADO').map((p) => p.id);
    if (ids.length === 0) return;
    setOpenedSolicitacaoIds((prev) => {
      const next = Array.from(new Set([...prev, ...ids]));
      if (next.length === prev.length && ids.every((id) => prev.includes(id))) return prev;
      return next;
    });
  }, [activeTab, purchases]);
  useEffect(() => {
    if (!showViewRequestModal || !purchaseToView) return;
    setApproveWithChangesMode(false);
    setApproveQuantity(purchaseToView.quantidade || 1);
    setReducedQuantityAction('REMOVER');
    setApproveCategoriaId(purchaseToView.categoriaId || '');
    const isRevise =
      purchaseToView.status === 'PENDENTE' && Boolean((purchaseToView as Purchase).solicitacaoAprovadaEm);
    if (isRevise && purchaseToView.cotacoesJson && Array.isArray(purchaseToView.cotacoesJson) && purchaseToView.cotacoesJson.length > 0) {
      const mapped = purchaseToView.cotacoesJson.map((c: Cotacao) =>
        normalizeCotacaoForForm(c),
      );
      setApproveCotacoes(mapped);
      const idx = (purchaseToView as Purchase).cotacaoSelecionadaIndex ?? 0;
      setSelectedCotacaoIndex(Math.min(Math.max(0, idx), mapped.length - 1));
      return;
    }
    if (purchaseToView.status === 'SOLICITADO' && (!purchaseToView.cotacoesJson || purchaseToView.cotacoesJson.length === 0)) {
      setApproveCotacoes([
        { valorUnitario: 0, frete: 0, impostos: 0, desconto: 0, descontoTipo: 'valor', link: '', fornecedorId: undefined, formaPagamento: '' },
      ]);
      setSelectedCotacaoIndex(0);
    }
  }, [showViewRequestModal, purchaseToView?.id, purchaseToView?.status, purchaseToView?.solicitacaoAprovadaEm]);
  const isReviseApprovalModal =
    showViewRequestModal &&
    !!purchaseToView &&
    purchaseToView.status === 'PENDENTE' &&
    Boolean((purchaseToView as Purchase).solicitacaoAprovadaEm);
  const isSolicitacaoComCotacoes =
    !!purchaseToView &&
    purchaseToView.status === 'SOLICITADO' &&
    Array.isArray(purchaseToView.cotacoesJson) &&
    purchaseToView.cotacoesJson.length > 0;
  const finalSortedPurchases = useMemo(() => {
    if (sortColumn === 'cotacoes') {
      return [...filteredPurchases].sort((a, b) => {
        const cotacoesA = a.cotacoesJson && Array.isArray(a.cotacoesJson) ? a.cotacoesJson : [];
        const cotacoesB = b.cotacoesJson && Array.isArray(b.cotacoesJson) ? b.cotacoesJson : [];
        const totalA = cotacoesA.reduce((sum: number, cot: any) => {
          return sum + calculateCotacaoTotalHelper({ ...cot, descontoTipo: cot.descontoTipo || 'valor' }, a.quantidade || 1);
        }, 0);
        const totalB = cotacoesB.reduce((sum: number, cot: any) => {
          return sum + calculateCotacaoTotalHelper({ ...cot, descontoTipo: cot.descontoTipo || 'valor' }, b.quantidade || 1);
        }, 0);
        if (totalA < totalB) return sortDirection === 'asc' ? -1 : 1;
        if (totalA > totalB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortedPurchases;
  }, [filteredPurchases, sortedPurchases, sortColumn, sortDirection]);
  const purchaseSafeSize = Math.max(1, purchaseListPageSize);
  const purchaseTotalCount = finalSortedPurchases.length;
  const purchaseTotalPages = Math.max(1, Math.ceil(purchaseTotalCount / purchaseSafeSize));
  const purchaseCurrentPage = Math.min(
    Math.max(1, purchaseListPage),
    purchaseTotalPages,
  );
  const purchaseSliceStart = (purchaseCurrentPage - 1) * purchaseSafeSize;
  const paginatedPurchases = useMemo(
    () =>
      finalSortedPurchases.slice(
        purchaseSliceStart,
        purchaseSliceStart + purchaseSafeSize,
      ),
    [finalSortedPurchases, purchaseSliceStart, purchaseSafeSize],
  );
  useEffect(() => {
    setPurchaseListPage(1);
  }, [purchaseSubTab, sortColumn, sortDirection]);
  useEffect(() => {
    if (purchaseListPage > purchaseTotalPages) {
      setPurchaseListPage(purchaseTotalPages);
    }
  }, [purchaseListPage, purchaseTotalPages]);
  const handlePurchasePageSizeChange = useCallback((size: number) => {
    setPurchaseListPageSize(size);
    setPurchaseListPage(1);
  }, []);
  const renderSortableHeader = (column: string, label: string) =>
    renderSortableTableTh({
      columnKey: column,
      label,
      activeColumn: sortColumn,
      sortDirection,
      onSort: handleSort,
      align: 'left',
    });
  const renderEstoqueTh = useCallback(
    (col: EstoqueSortCol, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: estoqueSortCol,
        sortDirection: estoqueSortDir,
        onSort: handleEstoqueSort,
        align,
      }),
    [estoqueSortCol, estoqueSortDir, handleEstoqueSort],
  );
  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      SOLICITADO: 'Solicitado',
      REPROVADO: 'Reprovado',
      PENDENTE: 'Pendente',
      COMPRADO_ACAMINHO: 'Comprado/A Caminho',
      ENTREGUE: 'Entregue',
    };
    return labels[status] || status;
  }
  function getStatusColor(status: string): string {
    switch (status) {
      case 'SOLICITADO':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
      case 'REPROVADO':
        return 'bg-red-500/20 text-red-300 border border-red-500/40';
      case 'PENDENTE':
        return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
      case 'COMPRADO_ACAMINHO':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
      case 'ENTREGUE':
        return 'bg-green-500/20 text-green-300 border border-green-500/40';
      default:
        return 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
    }
  }
  function getStatusEntregaLabel(status: string): string {
    const labels: Record<string, string> = {
      NAO_ENTREGUE: 'Não Entregue',
      ENTREGUE: 'Entregue',
      CANCELADO: 'Cancelado',
    };
    if (status === 'PARCIAL') return 'Não Entregue';
    return labels[status] || status;
  }
  function getStatusEntregaColor(status: string): string {
    switch (status) {
      case 'NAO_ENTREGUE':
        return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
      case 'PARCIAL':
        return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
      case 'ENTREGUE':
        return 'bg-green-500/20 text-green-300 border border-green-500/40';
      case 'CANCELADO':
        return 'bg-red-500/20 text-red-300 border border-red-500/40';
      default:
        return 'bg-gray-500/20 text-gray-300 border border-gray-500/40';
    }
  }
  function calculateTotal(cotacao: Cotacao, quantidade: number): number {
    return calculateCotacaoTotalHelper(cotacao, quantidade);
  }
  const updateCotacao = updateCotacaoHelper;
  const addCotacao = addCotacaoHelper;
  const removeCotacao = removeCotacaoHelper;
  function updateCreatePurchaseCotacao(
    index: number,
    field: keyof Cotacao,
    value: string | number | undefined | 'valor' | 'porcentagem',
  ) {
    updateCotacao(purchaseForm, setPurchaseForm, index, field, value);
  }
  function addCreatePurchaseCotacao() {
    addCotacao(purchaseForm, setPurchaseForm);
  }
  function removeCreatePurchaseCotacao(index: number) {
    removeCotacao(purchaseForm, setPurchaseForm, index);
  }
  function togglePurchaseSelection(purchaseId: number) {
    setSelectedPurchases((prev) =>
      prev.includes(purchaseId)
        ? prev.filter((id) => id !== purchaseId)
        : [...prev, purchaseId]
    );
  }
  function toggleStockItemSelection(itemId: number) {
    setSelectedStockItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  }
  function toggleAllFilteredStockItems() {
    if (selectedStockItemIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedStockItemIds([]);
    } else {
      setSelectedStockItemIds(filteredItems.map((i) => i.id));
    }
  }
  function toggleAllPurchases() {
    if (selectedPurchases.length === finalSortedPurchases.length && finalSortedPurchases.length > 0) {
      setSelectedPurchases([]);
    } else {
      setSelectedPurchases(finalSortedPurchases.map((p) => p.id));
    }
  }
  function toggleSolicitacaoSelection(purchaseId: number) {
    setSelectedSolicitacaoIds((prev) =>
      prev.includes(purchaseId) ? prev.filter((id) => id !== purchaseId) : [...prev, purchaseId],
    );
  }
  function toggleAllSolicitacoesFiltered() {
    if (
      selectedSolicitacaoIds.length === filteredSolicitacoesByOrigem.length &&
      filteredSolicitacoesByOrigem.length > 0
    ) {
      setSelectedSolicitacaoIds([]);
    } else {
      setSelectedSolicitacaoIds(filteredSolicitacoesByOrigem.map((p) => p.id));
    }
  }
  function openBulkDeletePurchaseModal() {
    const ids =
      activeTab === 'solicitacoes' ? selectedSolicitacaoIds : selectedPurchases;
    if (ids.length === 0) return;
    setBulkDeletePurchaseIds([...ids]);
    setBulkDeleteConfirmInput('');
    setError(null);
    setShowBulkDeletePurchaseModal(true);
  }
  function partitionSolicitacoesForBulkApprove(selectedIds: number[]) {
    const idSet = new Set(selectedIds);
    const selected = purchases.filter((p) => idSet.has(p.id) && p.status === 'SOLICITADO');
    const eligible: number[] = [];
    const skipped: Array<{ id: number; item: string; reason: string }> = [];
    for (const p of selected) {
      if (canApprovePurchaseWithExistingCotacoes(p)) {
        eligible.push(p.id);
        continue;
      }
      const semCotacao =
        !Array.isArray(p.cotacoesJson) || p.cotacoesJson.length === 0;
      skipped.push({
        id: p.id,
        item: p.item || `Pedido #${p.id}`,
        reason: semCotacao
          ? 'sem cotações no pedido'
          : 'cotações sem valor unitário válido',
      });
    }
    return { eligible, skipped };
  }
  function openBulkApproveModal() {
    if (selectedSolicitacaoIds.length === 0) return;
    const { eligible, skipped } = partitionSolicitacoesForBulkApprove(selectedSolicitacaoIds);
    setBulkApproveEligibleIds(eligible);
    setBulkApproveSkipped(skipped);
    setBulkApproveProgress(null);
    setError(null);
    setShowBulkApproveModal(true);
  }
  async function handleBulkApprovePurchases() {
    if (bulkApproveEligibleIds.length === 0) return;
    setApprovingBulkPurchase(true);
    setError(null);
    const failures: string[] = [];
    const succeededIds = new Set<number>();
    const total = bulkApproveEligibleIds.length;
    try {
      for (let i = 0; i < bulkApproveEligibleIds.length; i++) {
        const id = bulkApproveEligibleIds[i];
        const purchase = purchases.find((p) => p.id === id);
        if (!purchase) continue;
        setBulkApproveProgress(`Aprovando ${i + 1} de ${total}…`);
        const payload = buildQuickApprovePurchasePayload(purchase);
        if (!payload) {
          failures.push(`${purchase.item || `#${id}`}: sem cotação válida`);
          continue;
        }
        try {
          await api.post(`/stock/purchases/${id}/approve`, payload);
          succeededIds.add(id);
        } catch (err: unknown) {
          failures.push(`${purchase.item || `#${id}`}: ${formatApiError(err)}`);
        }
      }
      await load();
      setSelectedSolicitacaoIds((prev) => prev.filter((id) => !succeededIds.has(id)));
      setShowBulkApproveModal(false);
      setBulkApproveEligibleIds([]);
      setBulkApproveSkipped([]);
      const ok = succeededIds.size;
      if (ok > 0 && failures.length === 0) {
        toast.success(
          ok === 1 ? '1 solicitação aprovada.' : `${ok} solicitações aprovadas com sucesso.`,
        );
      } else if (ok > 0 && failures.length > 0) {
        toast.warning(`${ok} aprovada(s); ${failures.length} falhou(aram).`);
        setError(failures.slice(0, 5).join('\n'));
      } else {
        toast.error('Nenhuma solicitação foi aprovada.');
        setError(failures.slice(0, 5).join('\n') || 'Falha ao aprovar as solicitações selecionadas.');
      }
    } finally {
      setApprovingBulkPurchase(false);
      setBulkApproveProgress(null);
    }
  }
  function getSelectedPurchasesData() {
    return purchases.filter((p) => selectedPurchases.includes(p.id));
  }
  /** Itens SOLICITADO para relatório: seleção na lista ou todos os filtrados visíveis. */
  function getSolicitacoesReportPurchases(): Purchase[] {
    if (selectedSolicitacaoIds.length > 0) {
      const set = new Set(selectedSolicitacaoIds);
      return filteredSolicitacoesByOrigem.filter((p) => set.has(p.id));
    }
    return [...filteredSolicitacoesByOrigem];
  }
  function openSolicitacoesReportModal() {
    if (filteredSolicitacoesByOrigem.length === 0) {
      toast.error('Não há solicitações pendentes na lista para gerar o relatório.');
      return;
    }
    setPurchaseReportMode('solicitacoes-pending');
    setShowReportModal(true);
  }
  async function refreshSignatureAlerts() {
    if (activeTab !== 'compras' || purchaseSubTab !== 'assinaturas') return;
    try {
      const { data } = await api.get<Array<{ id: number; mesReferencia: string; precisaConfirmacao: boolean }>>(
        '/stock/purchases/signatures/alerts',
        { params: { mesReferencia: selectedSignatureMonth } },
      );
      const next: Record<number, { mesReferencia: string; precisaConfirmacao: boolean }> = {};
      for (const row of Array.isArray(data) ? data : []) {
        next[row.id] = {
          mesReferencia: row.mesReferencia,
          precisaConfirmacao: Boolean(row.precisaConfirmacao),
        };
      }
      setSignatureAlertsByPurchaseId(next);
    } catch {
      setSignatureAlertsByPurchaseId({});
    }
  }
  /** Total da compra (cotação selecionada ou melhor cotação; alinhado ao relatório). */
  function getPurchaseTotal(p: Purchase): number {
    return getPurchaseLineTotal(p);
  }
  const selectedPurchasesPendente = useMemo(() => {
    return getSelectedPurchasesData().filter((p) => p.status === 'PENDENTE');
  }, [purchases, selectedPurchases]);
  const purchaseTagOptions = useMemo(() => {
    const tags = new Set<string>();
    purchases.forEach((p) => {
      const list = Array.isArray((p as any).tagsJson) ? (p as any).tagsJson : [];
      list.forEach((t: any) => {
        const nome = String(t?.nome || '').trim();
        if (nome) tags.add(nome);
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [purchases]);
  const purchaseTagCatalog = useMemo(() => {
    const map = new Map<string, string>();
    purchases.forEach((p) => {
      const list = Array.isArray((p as any).tagsJson) ? (p as any).tagsJson : [];
      list.forEach((t: any) => {
        const nome = String(t?.nome || '').trim();
        const cor = String(t?.cor || '#3B82F6').trim();
        if (!nome) return;
        if (!map.has(nome.toLowerCase())) {
          map.set(nome.toLowerCase(), cor || '#3B82F6');
        }
      });
    });
    return Array.from(map.entries())
      .map(([key, cor]) => {
        const originalName = purchaseTagOptions.find((n) => n.toLowerCase() === key) || key;
        return { nome: originalName, cor };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [purchases, purchaseTagOptions]);
  const selectedPurchaseTagCatalog = useMemo(() => {
    const selectedSet = new Set(selectedPurchases);
    const map = new Map<string, string>();
    purchases.forEach((p) => {
      if (!selectedSet.has(p.id)) return;
      const list = Array.isArray((p as any).tagsJson) ? (p as any).tagsJson : [];
      list.forEach((t: any) => {
        const nome = String(t?.nome || '').trim();
        const cor = String(t?.cor || '#3B82F6').trim();
        if (!nome) return;
        if (!map.has(nome.toLowerCase())) {
          map.set(nome.toLowerCase(), cor || '#3B82F6');
        }
      });
    });
    return Array.from(map.entries())
      .map(([key, cor]) => {
        const originalName = purchaseTagOptions.find((n) => n.toLowerCase() === key) || key;
        return { nome: originalName, cor };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [purchases, selectedPurchases, purchaseTagOptions]);
  function calculateReportTotals() {
    if (purchaseReportMode === 'signature-month') {
      const selected = cachedSignatureReportPurchases;
      const totalValor = selected.reduce((sum, p) => sum + getPurchaseLineTotal(p), 0);
      const totalQuantidade = selected.reduce((sum, p) => sum + (p.quantidade || 0), 0);
      const totalItens = selected.length;
      return {
        totalValor,
        totalQuantidade,
        totalItens,
        purchases: selected,
      };
    }
    if (purchaseReportMode === 'solicitacoes-pending') {
      const selected = getSolicitacoesReportPurchases();
      const totalValor = selected.reduce((sum, p) => sum + getPurchaseLineTotal(p), 0);
      const totalQuantidade = selected.reduce((sum, p) => sum + (p.quantidade || 0), 0);
      return {
        totalValor,
        totalQuantidade,
        totalItens: selected.length,
        purchases: selected,
      };
    }
    const selected = getSelectedPurchasesData().filter(
      (p) => includeSignaturesInReport || !isSignaturePurchase(p),
    );
    const totalValor = selected.reduce((sum, p) => sum + getPurchaseLineTotal(p), 0);
    const totalQuantidade = selected.reduce((sum, p) => sum + (p.quantidade || 0), 0);
    const totalItens = selected.length;
    return {
      totalValor,
      totalQuantidade,
      totalItens,
      purchases: selected,
    };
  }
  function buildPurchasesWorkbook() {
      const reportData = calculateReportTotals();
      const wb = XLSX.utils.book_new();
      const sigMes = purchaseReportMode === 'signature-month';
      const solPend = purchaseReportMode === 'solicitacoes-pending';
      const headers = solPend
        ? [
            'Projeto',
            'Item',
            'Motivo / Descrição',
            'Quantidade',
            'Valor Unitário',
            'Valor Total',
            'Status',
            'Solicitado Por',
            'Cargo',
            'Data Solicitação',
            'Origem',
            'Observações',
          ]
        : sigMes
        ? [
            'Mês referência',
            'Projeto',
            'Item',
            'Categoria',
            'Quantidade',
            'Valor Unitário',
            'Valor Total',
            'Status',
            'Solicitado Por',
            'Cargo',
            'Link NF (mês)',
            'Link comprovante (mês)',
            'Descrição',
            'Observações',
          ]
        : [
            'Projeto',
            'Item',
            'Categoria',
            'Quantidade',
            'Valor Unitário',
            'Valor Total',
            'Status',
            'Solicitado Por',
            'Cargo',
            'Data Compra',
            'Forma Pagamento',
            'Previsão Entrega',
            'Data Entrega',
            'Status Entrega',
            'Recebido Por',
            'Fornecedor',
            'Descrição',
            'Observações',
          ];
      const tableData: any[][] = [headers];
      const projetoGroups: Record<number, Purchase[]> = {};
      reportData.purchases.forEach((purchase) => {
        const projetoId = purchase.projetoId || 0;
        if (!projetoGroups[projetoId]) {
          projetoGroups[projetoId] = [];
        }
        projetoGroups[projetoId].push(purchase);
      });
      Object.entries(projetoGroups).forEach(([projetoId, projetoPurchases]) => {
        const projeto = projects.find((p) => p.id === Number(projetoId));
        projetoPurchases.forEach((purchase) => {
          const cotacoes = purchase.cotacoesJson && Array.isArray(purchase.cotacoesJson) ? purchase.cotacoesJson : [];
          const idxSel = Math.min(
            Math.max(0, purchase.cotacaoSelecionadaIndex ?? 0),
            Math.max(0, cotacoes.length - 1),
          );
          const cotacaoSelecionada = cotacoes.length > 0 ? cotacoes[idxSel] : null;
          const valorTotal = getPurchaseLineTotal(purchase);
          const valorUnitarioLinha = getPurchaseLineUnitValue(purchase);
          if (solPend) {
            tableData.push([
              projeto ? projeto.nome : 'Sem Projeto',
              purchase.item,
              purchase.descricao || '-',
              purchase.quantidade || 0,
              valorUnitarioLinha,
              valorTotal,
              getStatusLabel(purchase.status),
              purchase.solicitadoPor?.nome || '-',
              purchase.solicitadoPor?.cargo?.nome || '-',
              purchase.dataSolicitacao ? new Date(purchase.dataSolicitacao) : null,
              isCompraFuturaRemanescente(purchase) ? 'Futura / remanescente' : 'Solicitação normal',
              purchase.observacao || '-',
            ]);
          } else if (sigMes) {
            tableData.push([
              signatureReportMonthInModal,
              projeto ? projeto.nome : 'Sem Projeto',
              purchase.item,
              (purchase as any).categoriaId ? getCategoryName((purchase as any).categoriaId) : '-',
              purchase.quantidade || 0,
              valorUnitarioLinha,
              valorTotal,
              getStatusLabel(purchase.status),
              purchase.solicitadoPor?.nome || '-',
              purchase.solicitadoPor?.cargo?.nome || '-',
              parseAttachmentUrls(purchase.nfUrl).join('; ') || '-',
              parseAttachmentUrls(purchase.comprovantePagamentoUrl).join('; ') || '-',
              purchase.descricao || '-',
              purchase.observacao || '-',
            ]);
          } else {
            tableData.push([
              projeto ? projeto.nome : 'Sem Projeto',
              purchase.item,
              (purchase as any).categoriaId ? getCategoryName((purchase as any).categoriaId) : '-',
              purchase.quantidade || 0,
              valorUnitarioLinha,
              valorTotal,
              getStatusLabel(purchase.status),
              purchase.solicitadoPor?.nome || '-',
              purchase.solicitadoPor?.cargo?.nome || '-',
              purchase.dataCompra ? new Date(purchase.dataCompra) : null,
              purchase.formaPagamento || '-',
              purchase.status === 'COMPRADO_ACAMINHO' && purchase.previsaoEntrega
                ? new Date(purchase.previsaoEntrega)
                : null,
              purchase.dataEntrega ? new Date(purchase.dataEntrega) : null,
              purchase.statusEntrega ? getStatusLabel(purchase.statusEntrega) : '-',
              purchase.recebidoPor || '-',
              cotacaoSelecionada?.fornecedorId ? getSupplierName(cotacaoSelecionada.fornecedorId) : '-',
              purchase.descricao || '-',
              purchase.observacao || '-',
            ]);
          }
        });
      });

      let footerRowIndex = -1;
      if (reportData.purchases.length > 0) {
        tableData.push([]);
        if (solPend) {
          footerRowIndex = tableData.length;
          tableData.push([
            '',
            '',
            'TOTAL GERAL',
            reportData.totalQuantidade,
            '',
            reportData.totalValor,
            `${reportData.totalItens} item(ns)`,
            '',
            '',
            '',
            '',
            '',
          ]);
        } else if (sigMes) {
          footerRowIndex = tableData.length;
          tableData.push([
            '',
            '',
            '',
            'TOTAL GERAL',
            reportData.totalQuantidade,
            '',
            reportData.totalValor,
            `${reportData.totalItens} item(ns)`,
            '',
            '',
            '',
            '',
            '',
            '',
          ]);
        } else {
          footerRowIndex = tableData.length;
          tableData.push([
            '',
            '',
            'TOTAL GERAL',
            reportData.totalQuantidade,
            '',
            reportData.totalValor,
            `${reportData.totalItens} item(ns)`,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(tableData);
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const headerStyle: any = {
        fill: {
          fgColor: { rgb: '1E3A8A' } // Azul escuro
        },
        font: {
          color: { rgb: 'FFFFFF' }, // Branco
          bold: true,
          sz: 11
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center',
          wrapText: true
        },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { t: 's', v: '' };
        }
        ws[cellAddress].s = headerStyle;
      }
      const footerStyle: any = {
        fill: { fgColor: { rgb: 'DBEAFE' } },
        font: { color: { rgb: '000000' }, bold: true, sz: 11 },
        alignment: { vertical: 'center', wrapText: true },
        border: {
          top: { style: 'medium', color: { rgb: '1E3A8A' } },
          bottom: { style: 'medium', color: { rgb: '1E3A8A' } },
          left: { style: 'thin', color: { rgb: '1E3A8A' } },
          right: { style: 'thin', color: { rgb: '1E3A8A' } },
        },
      };

      for (let row = 1; row <= range.e.r; row++) {
        const isFooterRow = footerRowIndex >= 0 && row === footerRowIndex;
        const isEven = row % 2 === 0;
        const rowStyle: any = {
          fill: {
            fgColor: { rgb: isEven ? 'E8F4F8' : 'FFFFFF' } // Azul claro alternado com branco
          },
          font: {
            color: { rgb: '000000' },
            sz: 10
          },
          alignment: {
            vertical: 'center',
            wrapText: true
          },
          border: {
            top: { style: 'thin', color: { rgb: 'D0D0D0' } },
            bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
            left: { style: 'thin', color: { rgb: 'D0D0D0' } },
            right: { style: 'thin', color: { rgb: 'D0D0D0' } }
          }
        };
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (!ws[cellAddress]) continue;
          if (isFooterRow) {
            const qtyCol = sigMes ? 4 : 3;
            const totalCol = sigMes ? 6 : 5;
            if (col === qtyCol) {
              ws[cellAddress].s = { ...footerStyle, numFmt: '#,##0' };
            } else if (col === totalCol) {
              ws[cellAddress].s = { ...footerStyle, numFmt: '"R$" #,##0.00' };
            } else {
              ws[cellAddress].s = footerStyle;
            }
            continue;
          }
          if (col === 3) { // Quantidade
            ws[cellAddress].s = {
              ...rowStyle,
              numFmt: '#,##0'
            };
          } else if (col === 4 || col === 5) { // Valor Unitário e Valor Total
            ws[cellAddress].s = {
              ...rowStyle,
              numFmt: '"R$" #,##0.00'
            };
          } else if (col === 9 || col === 11 || col === 12) { // Datas
            if (ws[cellAddress].v && ws[cellAddress].v instanceof Date) {
              ws[cellAddress].s = {
                ...rowStyle,
                numFmt: 'dd/mm/yyyy'
              };
            } else {
              ws[cellAddress].s = rowStyle;
            }
          } else {
            ws[cellAddress].s = rowStyle;
          }
        }
      }
      ws['!cols'] = [
        { wch: 20 }, // Projeto
        { wch: 30 }, // Item
        { wch: 20 }, // Categoria
        { wch: 12 }, // Quantidade
        { wch: 15 }, // Valor Unitário
        { wch: 15 }, // Valor Total
        { wch: 18 }, // Status
        { wch: 20 }, // Solicitado Por
        { wch: 15 }, // Cargo
        { wch: 12 }, // Data Compra
        { wch: 15 }, // Forma Pagamento
        { wch: 15 }, // Previsão Entrega
        { wch: 12 }, // Data Entrega
        { wch: 15 }, // Status Entrega
        { wch: 18 }, // Recebido Por
        { wch: 25 }, // Fornecedor
        { wch: 40 }, // Descrição
        { wch: 40 }, // Observações
      ];
      const filterRange = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } });
      ws['!autofilter'] = { ref: filterRange };
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        solPend ? 'Solicitações pendentes' : 'Compras',
      );
    return wb;
  }
  // --- Validação de arquivo antes de aceitar ---
  function validateFileSelection(file: File, allowedTypes?: string[]): boolean {
    const validTypes = allowedTypes ?? ['image/', 'application/pdf'];
    const isValid = validTypes.some((t) => file.type.startsWith(t) || file.type === t);
    if (!isValid) {
      setError('Tipo de arquivo não permitido. Aceitos: imagem ou PDF.');
      return false;
    }
    if (file.size > UPLOAD_LIMITS.generic.maxBytes) {
      setError(
        `Arquivo muito grande (${formatMb(file.size)}). Máximo: ${UPLOAD_LIMITS.generic.maxMb} MB.`,
      );
      return false;
    }
    setError(null);
    return true;
  }

  function storedNorm(s: string | null | undefined): string | null {
    const t = s?.trim();
    return t ? t : null;
  }

  async function uploadPendingUrls(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const f of files) {
      const u = await uploadSingleFile(f);
      if (u) urls.push(u);
    }
    return urls;
  }

  function handlePurchaseImagesAppend(files: File[]) {
    if (files.length === 0) return;
    for (const file of files) {
      if (!validateFileSelection(file, ['image/'])) return;
    }
    setPendingImageFiles((prev) => [...prev, ...files]);
  }
  function handlePurchaseNfAppend(files: File[]) {
    if (files.length === 0) return;
    for (const file of files) {
      if (!validateFileSelection(file)) return;
    }
    setPendingNfFiles((prev) => [...prev, ...files]);
  }
  function handlePurchaseComprovanteAppend(files: File[]) {
    if (files.length === 0) return;
    for (const file of files) {
      if (!validateFileSelection(file)) return;
    }
    setPendingComprovanteFiles((prev) => [...prev, ...files]);
  }
  function handleItemImageSelected(file: File | undefined) {
    if (!file) return;
    if (!validateFileSelection(file, ['image/'])) return;
    setPendingItemImageFile(file);
  }
  async function handleDeleteItem() {
    if (!itemToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/stock/items/${itemToDelete.id}`);
      setShowDeleteModal(false);
      setItemToDelete(null);
      load();
      toast.success('Item de estoque removido com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeleting(false);
    }
  }
  async function handleBulkDeleteStockItems() {
    if (selectedStockItemIds.length === 0) return;
    if (!isBulkDeleteConfirmPhrase(bulkDeleteConfirmInput)) return;
    setDeletingBulkStock(true);
    setError(null);
    try {
      const { data } = await api.post<{ deleted?: number }>('/stock/items/batch-delete', {
        ids: selectedStockItemIds,
      });
      const n = typeof data?.deleted === 'number' ? data.deleted : selectedStockItemIds.length;
      setShowBulkDeleteStockModal(false);
      setBulkDeleteConfirmInput('');
      setSelectedStockItemIds([]);
      load();
      toast.success(
        n === 1
          ? '1 item removido do estoque.'
          : `${n} itens removidos do estoque.`,
      );
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingBulkStock(false);
    }
  }
  async function handleUpdateItem(event: FormEvent) {
    event.preventDefault();
    if (!editingItem) return;
    setError(null);
    setSubmitting(true);
    if (!itemValidation.validateAll(itemForm)) {
      setSubmitting(false);
      return;
    }
    try {
      const payload: any = {};
      if (itemForm.item && itemForm.item.trim().length > 0) {
        payload.item = itemForm.item.trim();
      }
      if (itemForm.descricao && itemForm.descricao.trim().length > 0) {
        payload.descricao = itemForm.descricao.trim();
      }
      if (itemForm.quantidade != null && itemForm.quantidade > 0) {
        payload.quantidade = itemForm.quantidade;
      }
      if (itemForm.valorUnitario != null) {
        payload.valorUnitario = itemForm.valorUnitario;
      }
      if (pendingItemImageFile) {
        const url = await uploadSingleFile(pendingItemImageFile);
        if (url) payload.imagemUrl = url;
      } else if (!itemForm.imagemUrl) {
        payload.imagemUrl = null;
      }
      if (pendingItemNfFile) {
        const url = await uploadSingleFile(pendingItemNfFile);
        if (url) payload.nfUrl = url;
      } else if (!itemForm.nfUrl) {
        payload.nfUrl = null;
      }
      if (pendingItemComprovanteFile) {
        const url = await uploadSingleFile(pendingItemComprovanteFile);
        if (url) payload.comprovantePagamentoUrl = url;
      } else if (!itemForm.comprovantePagamentoUrl) {
        payload.comprovantePagamentoUrl = null;
      }
      if (itemForm.categoriaId !== undefined) {
        payload.categoriaId = itemForm.categoriaId ? Number(itemForm.categoriaId) : null;
      }
      await api.patch(`/stock/items/${editingItem.id}`, payload);
      setShowEditModal(false);
      setEditingItem(null);
      setPendingItemImageFile(null);
      setPendingItemNfFile(null);
      setPendingItemComprovanteFile(null);
      setItemStockDocRemoveConfirm(null);
      setItemForm({
        item: '',
        codigo: '',
        categoriaId: undefined,
        descricao: '',
        quantidade: 1,
        valorUnitario: 0,
        unidadeMedida: 'UN',
        localizacao: '',
        imagemUrl: '',
        nfUrl: '',
        comprovantePagamentoUrl: '',
      });
      load();
      toast.success('Item de estoque atualizado com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function handleCreateItem(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    if (!itemValidation.validateAll(itemForm)) {
      setSubmitting(false);
      return;
    }
    try {
      const payload: any = {
        item: itemForm.item.trim(),
        quantidade: itemForm.quantidade as number,
      };
      if (itemForm.descricao && itemForm.descricao.trim().length > 0) {
        payload.descricao = itemForm.descricao.trim();
      }
      if (itemForm.categoriaId) {
        payload.categoriaId = Number(itemForm.categoriaId);
      }
      if (itemForm.valorUnitario != null) {
        payload.valorUnitario = itemForm.valorUnitario;
      }
      if (pendingItemNfFile) {
        const url = await uploadSingleFile(pendingItemNfFile);
        if (url) payload.nfUrl = url;
      }
      if (pendingItemComprovanteFile) {
        const url = await uploadSingleFile(pendingItemComprovanteFile);
        if (url) payload.comprovantePagamentoUrl = url;
      }
      await api.post('/stock/items', payload);
      setShowItemModal(false);
      setPendingItemNfFile(null);
      setPendingItemComprovanteFile(null);
      setItemForm({
        item: '',
        codigo: '',
        categoriaId: undefined,
        descricao: '',
        quantidade: 1,
        valorUnitario: 0,
        unidadeMedida: 'UN',
        localizacao: '',
        imagemUrl: '',
        nfUrl: '',
        comprovantePagamentoUrl: '',
      });
      load();
      itemValidation.reset();
      toast.success('Item de estoque criado com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function openAlocacaoModal(item: StockItem) {
    setItemParaAlocar(item);
    setAlocacaoForm({
      projetoId: undefined,
      etapaId: undefined,
      usuarioId: undefined,
      setorId: undefined,
      quantidade: 1,
    });
    try {
      const response = await api.get(`/stock/alocacoes?estoqueId=${item.id}`);
      setAlocacoes(response.data || []);
    } catch (err: any) {
      console.error('Erro ao carregar alocações:', err);
      setAlocacoes([]);
    }
    setShowAlocacaoModal(true);
  }
  async function handleCreateAlocacao() {
    if (!itemParaAlocar) return;
    const quantidadeDisponivel = (itemParaAlocar.quantidade || 0) - alocacoes.reduce((sum, a) => sum + (a.quantidade || 0), 0);
    if (quantidadeDisponivel <= 0) {
      setError('Não há mais itens no estoque para alocar');
      return;
    }
    if (alocacaoForm.quantidade > quantidadeDisponivel) {
      setError(`Quantidade solicitada (${alocacaoForm.quantidade}) excede a quantidade disponível (${quantidadeDisponivel})`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/stock/alocacoes', {
        estoqueId: itemParaAlocar.id,
        projetoId: alocacaoForm.projetoId,
        etapaId: alocacaoForm.etapaId,
        usuarioId: alocacaoForm.usuarioId,
        setorId: alocacaoForm.setorId,
        quantidade: alocacaoForm.quantidade,
      });
      toast.success('Alocação criada com sucesso!');
      await openAlocacaoModal(itemParaAlocar); // Recarregar alocações
      setAlocacaoForm({
        projetoId: undefined,
        etapaId: undefined,
        usuarioId: undefined,
        setorId: undefined,
        quantidade: 1,
      });
      load(); // Recarregar lista de itens
    } catch (err: any) {
      let errorMessage = formatApiError(err);
      if (errorMessage.includes('excede a quantidade disponível') || 
          errorMessage.includes('não há mais itens') ||
          errorMessage.includes('quantidade disponível')) {
        errorMessage = 'Não há mais itens no estoque para alocar';
      }
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function handleDeleteAlocacao(alocacaoId: number) {
    if (!confirm('Tem certeza que deseja remover esta alocação?')) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/stock/alocacoes/${alocacaoId}`);
      toast.success('Alocação removida com sucesso!');
      if (itemParaAlocar) {
        await openAlocacaoModal(itemParaAlocar); // Recarregar alocações
      }
      load(); // Recarregar lista de itens
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function handleCreatePurchase(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const validLines = purchaseLineItems.filter(
      (line) =>
        line.item.trim().length >= 2 &&
        line.quantidade != null &&
        Number(line.quantidade) > 0,
    );
    if (validLines.length === 0) {
      toast.error('Adicione pelo menos um item com nome e quantidade válidos.');
      setSubmitting(false);
      return;
    }
    if (purchaseModalMode === 'assinatura') {
      if (!purchaseForm.categoriaId) {
        toast.error('Selecione uma categoria de assinatura ou crie uma nova.');
        setSubmitting(false);
        return;
      }
      const cat = categories.find((c) => c.id === purchaseForm.categoriaId);
      if (!cat?.isAssinatura) {
        toast.error('A categoria escolhida não é de assinatura. Use "Nova assinatura" e uma categoria marcada como assinatura.');
        setSubmitting(false);
        return;
      }
    }
    try {
      const uploadedImagens = await uploadPendingUrls(pendingImageFiles);
      const uploadedNfs = await uploadPendingUrls(pendingNfFiles);
      const uploadedComps = await uploadPendingUrls(pendingComprovanteFiles);
      const imagemSerialized = serializeAttachmentUrls([...purchaseForm.imagemUrls, ...uploadedImagens]);
      const nfSerialized = serializeAttachmentUrls([...purchaseForm.nfUrls, ...uploadedNfs]);
      const compSerialized = serializeAttachmentUrls([...purchaseForm.comprovanteUrls, ...uploadedComps]);
      const shared = {
        projetoId: purchaseForm.projetoId || undefined,
        setorId: purchaseForm.setorId,
        solicitadoPorId: purchaseForm.solicitadoPorId,
        dataCompra: purchaseForm.dataCompra,
        categoriaId: purchaseForm.categoriaId,
        observacao: purchaseForm.observacao,
        pagoPor: purchaseForm.pagoPor,
        imagemUrl: imagemSerialized || undefined,
        nfUrl: nfSerialized || undefined,
        comprovantePagamentoUrl: compSerialized || undefined,
      };
      let created = 0;
      for (const line of validLines) {
        const body = buildPurchasePayloadFromLine(line, shared, {
          assinaturaMode: purchaseModalMode === 'assinatura',
          classe:
            purchaseModalMode === 'assinatura'
              ? 'ASSINATURA'
              : purchaseModalMode === 'despesa'
                ? 'DESPESA'
                : 'ESTOQUE',
        });
        if (!body) continue;
        await api.post('/stock/purchases', body);
        created += 1;
      }
      if (created === 0) {
        setError('Nenhum item pôde ser registrado. Verifique os dados.');
        setSubmitting(false);
        return;
      }
      const registrouAssinatura = purchaseModalMode === 'assinatura';
      const registrouDespesa = purchaseModalMode === 'despesa';
      setShowPurchaseModal(false);
      setPurchaseModalMode('compra');
      setPurchaseForm({ ...emptyPurchaseForm });
      setPurchaseLineItems([createEmptyPurchaseLineItem()]);
      setPendingImageFiles([]);
      setPendingNfFiles([]);
      setPendingComprovanteFiles([]);
      load();
      const label = registrouAssinatura ? 'assinatura' : registrouDespesa ? 'despesa' : 'compra';
      const labelCap = registrouAssinatura ? 'Assinatura' : registrouDespesa ? 'Despesa' : 'Compra';
      toast.success(
        created === 1
          ? `${labelCap} criada com sucesso!`
          : `${created} ${label}s criadas na mesma solicitação!`,
      );
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function handleDeletePurchase() {
    if (!purchaseToDelete) return;
    setDeletingPurchase(true);
    setError(null);
    try {
      await api.delete(`/stock/purchases/${purchaseToDelete.id}`);
      setShowDeletePurchaseModal(false);
      setPurchaseToDelete(null);
      load();
      toast.success('Compra removida com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingPurchase(false);
    }
  }
  async function handleBulkDeletePurchasesBatch() {
    if (bulkDeletePurchaseIds.length === 0) return;
    if (!isBulkDeleteConfirmPhrase(bulkDeleteConfirmInput)) return;
    setDeletingBulkPurchase(true);
    setError(null);
    try {
      const { data } = await api.post<{ deleted?: number }>('/stock/purchases/batch-delete', {
        ids: bulkDeletePurchaseIds,
      });
      const n = typeof data?.deleted === 'number' ? data.deleted : bulkDeletePurchaseIds.length;
      const deletedSet = new Set(bulkDeletePurchaseIds);
      setShowBulkDeletePurchaseModal(false);
      setBulkDeleteConfirmInput('');
      setBulkDeletePurchaseIds([]);
      setSelectedPurchases((prev) => prev.filter((id) => !deletedSet.has(id)));
      setSelectedSolicitacaoIds((prev) => prev.filter((id) => !deletedSet.has(id)));
      load();
      toast.success(n === 1 ? '1 compra removida.' : `${n} compras removidas.`);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingBulkPurchase(false);
    }
  }
  async function handleUpdatePurchaseStatus(options?: {
    skipTagWarning?: boolean;
    removeTags?: boolean;
  }) {
    const skipTagWarning = options?.skipTagWarning ?? false;
    const shouldRemoveTags = options?.removeTags ?? false;
    if (!purchaseToUpdateStatus || !newStatus) return;
    const purchaseTags = Array.isArray((purchaseToUpdateStatus as any).tagsJson)
      ? (purchaseToUpdateStatus as any).tagsJson
      : [];
    const purchaseTagNames = purchaseTags
      .map((t: any) => String(t?.nome || '').trim())
      .filter((n: string) => n.length > 0);
    const hasTags = purchaseTags.length > 0;
    const statusChanged = purchaseToUpdateStatus.status !== newStatus;
    if (!skipTagWarning && hasTags && statusChanged) {
      setShowTagStatusConfirmModal(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: { 
        status: string; 
        statusEntrega?: string;
        previsaoEntrega?: string;
        dataEntrega?: string;
        enderecoEntrega?: string;
        recebidoPor?: string;
        observacao?: string;
      } = {
        status: newStatus,
      };
      if (newStatus === 'COMPRADO_ACAMINHO') {
        if (newStatusEntrega) payload.statusEntrega = newStatusEntrega;
        if (newPrevisaoEntrega) payload.previsaoEntrega = newPrevisaoEntrega;
      }
      if (newStatus === 'ENTREGUE') {
        if (newDataEntrega) payload.dataEntrega = newDataEntrega;
        if (newEnderecoEntrega) payload.enderecoEntrega = newEnderecoEntrega;
        if (newRecebidoPor) payload.recebidoPor = newRecebidoPor;
      }
      if (newObservacao) payload.observacao = newObservacao;
      await api.patch(`/stock/purchases/${purchaseToUpdateStatus.id}/status`, payload);
      if (shouldRemoveTags && hasTags && statusChanged) {
        await removeTagsFromPurchasesByNames([purchaseToUpdateStatus.id], purchaseTagNames);
      }
      setShowStatusModal(false);
      setShowTagStatusConfirmModal(false);
      setPurchaseToUpdateStatus(null);
      setNewStatus('');
      setNewStatusEntrega('');
      setNewPrevisaoEntrega('');
      setNewDataEntrega('');
      setNewEnderecoEntrega('');
      setNewRecebidoPor('');
      setNewObservacao('');
      load();
      toast.success(
        shouldRemoveTags && hasTags && statusChanged
          ? 'Status atualizado e tags removidas com sucesso!'
          : 'Status da compra atualizado com sucesso!',
      );
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
        setSubmitting(false);
    }
  }
  async function handleBatchAcaminhoSubmit(options?: {
    skipTagWarning?: boolean;
    removeTags?: boolean;
  }) {
    const skipTagWarning = options?.skipTagWarning ?? false;
    const shouldRemoveTags = options?.removeTags ?? false;
    if (selectedPurchasesPendente.length === 0) return;
    const selectedIds = selectedPurchasesPendente.map((p) => p.id);
    const taggedNames = Array.from(
      new Set(
        selectedPurchasesPendente.flatMap((p) =>
          Array.isArray((p as any).tagsJson)
            ? (p as any).tagsJson
                .map((t: any) => String(t?.nome || '').trim())
                .filter((n: string) => n.length > 0)
            : [],
        ),
      ),
    );
    if (!skipTagWarning) {
      const hasTaggedPurchases = taggedNames.length > 0;
      if (hasTaggedPurchases) {
        setShowBatchTagWarningModal(true);
        return;
      }
    }
    setError(null);
    setBatchAcaminhoSubmitting(true);
    try {
      const payload: any = {
        purchaseIds: selectedPurchasesPendente.map((p) => p.id),
        formaPagamento: batchAcaminhoForm.formaPagamento?.trim() || undefined,
        dataCompra: batchAcaminhoForm.dataCompra || undefined,
        previsaoEntrega: batchAcaminhoForm.previsaoEntrega || undefined,
        statusEntrega: batchAcaminhoForm.statusEntrega || undefined,
        enderecoEntrega: batchAcaminhoForm.enderecoEntrega?.trim() || undefined,
        observacao: batchAcaminhoForm.observacao?.trim() || undefined,
        descontoTipo: batchAcaminhoForm.descontoTipo,
        descontoValor: batchAcaminhoForm.descontoValor ?? 0,
        freteLote: batchAcaminhoForm.freteLote ?? 0,
      };
      // Upload real de NF/comprovante do lote
      if (pendingBatchNfFiles.length > 0) {
        const urls = await uploadPendingUrls(pendingBatchNfFiles);
        const s = serializeAttachmentUrls(urls);
        if (s) payload.nfUrl = s;
      }
      if (pendingBatchComprovanteFiles.length > 0) {
        const urls = await uploadPendingUrls(pendingBatchComprovanteFiles);
        const s = serializeAttachmentUrls(urls);
        if (s) payload.comprovantePagamentoUrl = s;
      }
      await api.patch('/stock/purchases/batch-acaminho', payload);
      if (shouldRemoveTags && taggedNames.length > 0) {
        await removeTagsFromPurchasesByNames(selectedIds, taggedNames);
      }
      load();
      setShowBatchAcaminhoModal(false);
      setShowBatchTagWarningModal(false);
      setSelectedPurchases((prev) => prev.filter((id) => !selectedPurchasesPendente.some((p) => p.id === id)));
      setPendingBatchNfFiles([]);
      setPendingBatchComprovanteFiles([]);
      setBatchAcaminhoForm({
        formaPagamento: '',
        dataCompra: '',
        previsaoEntrega: '',
        statusEntrega: 'NAO_ENTREGUE',
        enderecoEntrega: '',
        observacao: '',
        descontoTipo: 'valor',
        descontoValor: 0,
        freteLote: 0,
      });
      toast.success(
        shouldRemoveTags && taggedNames.length > 0
          ? `Compra em lote concluída e tags removidas: ${selectedPurchasesPendente.length} item(ns) enviado(s) para A Caminho.`
          : `Compra em lote concluída: ${selectedPurchasesPendente.length} item(ns) enviado(s) para A Caminho.`,
      );
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setBatchAcaminhoSubmitting(false);
    }
  }
  async function handleApplyTagToSelectedPurchases() {
    const nome = tagNameInput.trim();
    if (!nome) {
      setError('Informe o nome da tag.');
      return;
    }
    if (!/^#([0-9A-Fa-f]{6})$/.test(tagColorInput)) {
      setError('Cor inválida. Use formato hexadecimal, ex: #3B82F6.');
      return;
    }
    if (selectedPurchases.length === 0) {
      setError('Selecione ao menos uma compra.');
      return;
    }
    setApplyingTag(true);
    setError(null);
    try {
      await api.patch('/stock/purchases/tags/apply', {
        purchaseIds: selectedPurchases,
        nome,
        cor: tagColorInput,
      });
      await load();
      setShowTagModal(false);
      setTagNameInput('');
      setTagColorInput('#3B82F6');
      toast.success('Tag aplicada nas compras selecionadas.');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setApplyingTag(false);
    }
  }
  async function handleRemoveSingleTag(purchaseId: number, tagName: string) {
    setError(null);
    try {
      await api.patch('/stock/purchases/tags/remove', {
        purchaseIds: [purchaseId],
        nome: tagName,
      });
      await load();
      toast.success('Tag removida com sucesso.');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    }
  }
  async function removeTagsFromPurchasesByNames(purchaseIds: number[], tagNames: string[]) {
    const uniqueTagNames = Array.from(new Set(tagNames.map((n) => n.trim()).filter((n) => n.length > 0)));
    if (purchaseIds.length === 0 || uniqueTagNames.length === 0) return;
    await Promise.all(
      uniqueTagNames.map((nome) =>
        api.patch('/stock/purchases/tags/remove', {
          purchaseIds,
          nome,
        }),
      ),
    );
  }
  async function handleRemoveTagFromSelectedPurchases(tagName: string) {
    const nome = tagName.trim();
    if (!nome) {
      setError('Informe o nome da tag para remover.');
      return;
    }
    if (selectedPurchases.length === 0) {
      setError('Selecione ao menos uma compra.');
      return;
    }
    setRemovingTagBulk(true);
    setError(null);
    try {
      await api.patch('/stock/purchases/tags/remove', {
        purchaseIds: selectedPurchases,
        nome,
      });
      await load();
      toast.success(`Tag "${nome}" removida das compras selecionadas.`);
      setShowRemoveTagModal(false);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setRemovingTagBulk(false);
    }
  }
  async function handleImportPurchaseSheet() {
    if (!importSheetFile) {
      toast.error('Selecione um arquivo .xlsx para importar.');
      return;
    }
    setImportingSheet(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', importSheetFile);
      if (importSheetProjetoId) formData.append('projetoId', String(importSheetProjetoId));
      if (importSheetCategoriaId) formData.append('categoriaId', String(importSheetCategoriaId));
      if (importSheetSetorId) formData.append('setorId', String(importSheetSetorId));
      formData.append('overwriteCurrent', String(importSheetOverwrite));
      const response = await api.post('/stock/purchases/import-sheet', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
      const data = response?.data ?? {};
      const imported = Number(data.imported ?? 0);
      const skipped = Number(data.skipped ?? 0);
      const importedAsEntregue = Number(data.importedAsEntregue ?? 0);
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      setShowImportSheetModal(false);
      setImportSheetFile(null);
      setImportSheetProjetoId('');
      setImportSheetCategoriaId('');
      setImportSheetSetorId('');
      setImportSheetOverwrite(false);
      if (warnings.length > 0) {
        const base =
          skipped > 0
            ? `Foram importados ${imported} item(ns). ${skipped} linha(s) ignorada(s).`
            : `Foram importados ${imported} item(ns).`;
        const title =
          skipped > 0 ? 'Importação parcial' : 'Importação concluída com avisos';
        setImportSheetFeedback({
          variant: 'warning',
          title,
          source: 'compras',
          text: `${base}\n\nRevise os avisos abaixo (estoque, projeto, etc.).\n\n${warnings.map((w: string) => `• ${w}`).join('\n')}`,
        });
        setShowImportSheetFeedbackModal(true);
      } else {
        toast.success(
          `Importação concluída: ${imported} item(ns) importado(s), ${skipped} linha(s) ignorada(s).` +
            (importedAsEntregue > 0
              ? ` ${importedAsEntregue} com status Entregue: quantidade lançada no estoque.`
              : ''),
        );
      }
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setImportSheetFeedback({
        variant: 'error',
        title: 'Erro na importação',
        source: 'compras',
        text: errorMessage,
      });
      setShowImportSheetFeedbackModal(true);
    } finally {
      setImportingSheet(false);
    }
  }
  async function handleImportEstoqueSheet() {
    if (!importEstoqueSheetFile) {
      toast.error('Selecione um arquivo .xlsx para importar.');
      return;
    }
    setImportingEstoqueSheet(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', importEstoqueSheetFile);
      if (importEstoqueProjetoId) formData.append('projetoId', String(importEstoqueProjetoId));
      if (importEstoqueCategoriaId) formData.append('categoriaId', String(importEstoqueCategoriaId));
      const response = await api.post('/stock/items/import-sheet', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
      const data = response?.data ?? {};
      const imported = Number(data.imported ?? 0);
      const skipped = Number(data.skipped ?? 0);
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      setShowImportEstoqueSheetModal(false);
      setImportEstoqueSheetFile(null);
      setImportEstoqueProjetoId('');
      setImportEstoqueCategoriaId('');
      if (warnings.length > 0) {
        const base =
          skipped > 0
            ? `Foram importados ${imported} item(ns). ${skipped} linha(s) ignorada(s).`
            : `Foram importados ${imported} item(ns).`;
        const title =
          skipped > 0 ? 'Importação parcial' : 'Importação concluída com avisos';
        setImportSheetFeedback({
          variant: 'warning',
          title,
          source: 'estoque',
          text: `${base}\n\nRevise os avisos abaixo (ex.: projeto não encontrado — item importado sem projeto).\n\n${warnings.map((w: string) => `• ${w}`).join('\n')}`,
        });
        setShowImportSheetFeedbackModal(true);
      } else {
        toast.success(`Importação concluída: ${imported} item(ns) importado(s), ${skipped} linha(s) ignorada(s).`);
      }
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setImportSheetFeedback({
        variant: 'error',
        title: 'Erro na importação',
        source: 'estoque',
        text: errorMessage,
      });
      setShowImportSheetFeedbackModal(true);
    } finally {
      setImportingEstoqueSheet(false);
    }
  }

  async function handleExportStockSheet() {
    if (selectedStockItemIds.length === 0) {
      toast.error('Selecione pelo menos um item para exportar.');
      return;
    }
    setExportingStockSheet(true);
    setError(null);
    try {
      const { data } = await api.post<{ rows: (string | number)[][] }>('/stock/items/export-sheet', {
        ids: selectedStockItemIds,
      });
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      if (rows.length === 0) {
        toast.error('Nenhuma linha retornada para exportar.');
        return;
      }
      const wb = buildStyledEstoqueSheetWorkbook(rows, 'Estoque');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `estoque_export_${stamp}.xlsx`);
      toast.success(`Exportação concluída: ${Math.max(0, rows.length - 1)} item(ns).`);
    } catch (err: unknown) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setExportingStockSheet(false);
    }
  }

  function downloadImportSheetFeedbackLog() {
    if (!importSheetFeedback) return;
    const kind = importSheetFeedback.variant === 'error' ? 'erro' : 'avisos';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const source = importSheetFeedback.source === 'estoque' ? 'estoque' : 'compras';
    const header = [
      `ERP Globaltec — Importação de planilha de ${source === 'estoque' ? 'estoque' : 'compras'}`,
      `Tipo: ${importSheetFeedback.variant === 'error' ? 'Erro' : 'Aviso'}`,
      `Título: ${importSheetFeedback.title}`,
      `Data/hora: ${new Date().toLocaleString('pt-BR')}`,
      '',
      '---',
      '',
    ].join('\n');
    const blob = new Blob([header + importSheetFeedback.text], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `importacao-${source}-${kind}-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function handleDownloadPurchaseImportTemplate() {
    const headers = [
      'item *',
      'link *',
      'quantidade *',
      'valor unitario *',
      'desconto *',
      'frete *',
      'impostos *',
      'status da compra',
      'projeto',
      'categoria *',
      'setor',
      'solicitante',
      'data da compra',
      'fornecedor',
      'observacao',
      'forma pagamento',
    ];
    const exampleRow = [
      'Notebook Lenovo i5',
      'https://fornecedor.com/produto/notebook-lenovo-i5',
      2,
      3500,
      100,
      120,
      80,
      'PENDENTE',
      'Projeto ERP',
      'Informática',
      'TI',
      'joao.silva@empresa.com',
      '2026-03-31',
      'Fornecedor ABC',
      'Compra para equipe de desenvolvimento',
      'Boleto',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    ws['!cols'] = [
      { wch: 30 },
      { wch: 55 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 16 },
      { wch: 28 },
      { wch: 16 },
      { wch: 22 },
      { wch: 40 },
      { wch: 20 },
    ];
    const borderStyle = {
      top: { style: 'thin', color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
      left: { style: 'thin', color: { rgb: 'D1D5DB' } },
      right: { style: 'thin', color: { rgb: 'D1D5DB' } },
    };
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[cellAddress];
        if (!cell) continue;
        if (row === 0) {
          cell.s = {
            fill: { fgColor: { rgb: '1E40AF' } },
            font: { color: { rgb: 'FFFFFF' }, bold: true },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: borderStyle as any,
          };
        } else {
          cell.s = {
            border: borderStyle as any,
          };
        }
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo Compras');
    XLSX.writeFile(wb, 'modelo-importacao-compras.xlsx');
  }
  function handleDownloadEstoqueImportTemplate() {
    const exampleRow = [
      'Parafuso M6x20',
      10,
      '',
      'Aço inox',
      'Ferragens',
      'Projeto ERP',
      'usuario@exemplo.com (3); TI (2)',
    ];
    const wb = buildStyledEstoqueSheetWorkbook(
      [[...ESTOQUE_SHEET_IMPORT_HEADERS], exampleRow],
      'Modelo Estoque',
    );
    XLSX.writeFile(wb, 'modelo-importacao-estoque.xlsx');
  }
  async function handleUpdatePurchase(event: FormEvent) {
    event.preventDefault();
    if (!editingPurchase) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload: any = {};
      if (purchaseForm.item && purchaseForm.item.trim().length > 0) {
        payload.item = purchaseForm.item.trim();
      }
      if (purchaseForm.descricao && purchaseForm.descricao.trim().length > 0) {
        payload.descricao = purchaseForm.descricao.trim();
      }
      if (purchaseForm.quantidade != null && purchaseForm.quantidade > 0) {
        payload.quantidade = purchaseForm.quantidade;
      }
      payload.projetoId = purchaseForm.projetoId ? Number(purchaseForm.projetoId) : null;
      payload.setorId = purchaseForm.setorId ? Number(purchaseForm.setorId) : null;
      payload.solicitadoPorId = purchaseForm.solicitadoPorId
        ? Number(purchaseForm.solicitadoPorId)
        : null;
      if (purchaseForm.cotacoes.length > 0) {
        const selectedCotacao = purchaseForm.cotacoes[purchaseForm.selectedCotacaoIndex ?? 0];
        if (selectedCotacao) {
          const isAssinatura = isSignaturePurchase(editingPurchase);
          const qCompra = Math.max(1, Number(purchaseForm.quantidade) || 1);
          const totalPorUnidade = getCotacaoValorMedioPorUnidade(selectedCotacao, qCompra);
          payload.valorUnitario = Number(Math.max(0, totalPorUnidade).toFixed(2));
        }
      }
      // Upload / remoção de anexos (múltiplos por campo)
      const uploadedImagemUrls = await uploadPendingUrls(pendingImageFiles);
      const uploadedNfUrls = await uploadPendingUrls(pendingNfFiles);
      const uploadedCompUrls = await uploadPendingUrls(pendingComprovanteFiles);
      const imagemFinal = serializeAttachmentUrls([...purchaseForm.imagemUrls, ...uploadedImagemUrls]);
      const nfFinal = serializeAttachmentUrls([...purchaseForm.nfUrls, ...uploadedNfUrls]);
      const compFinal = serializeAttachmentUrls([...purchaseForm.comprovanteUrls, ...uploadedCompUrls]);

      if (storedNorm(imagemFinal) !== storedNorm(editingPurchase.imagemUrl)) {
        payload.imagemUrl = imagemFinal;
      }

      const salvarNfComprovanteNoMes =
        purchaseSubTab === 'assinaturas' && isSignaturePurchase(editingPurchase);

      if (!salvarNfComprovanteNoMes) {
        if (storedNorm(nfFinal) !== storedNorm(editingPurchase.nfUrl)) {
          payload.nfUrl = nfFinal;
        }
        if (storedNorm(compFinal) !== storedNorm(editingPurchase.comprovantePagamentoUrl)) {
          payload.comprovantePagamentoUrl = compFinal;
        }
      }
      if (purchaseForm.dataCompra && purchaseForm.dataCompra.trim().length > 0) {
        payload.dataCompra = purchaseForm.dataCompra.trim();
      }
      if (purchaseForm.categoriaId) {
        payload.categoriaId = Number(purchaseForm.categoriaId);
      } else {
        payload.categoriaId = null;
      }
      if (purchaseForm.observacao !== undefined) {
        payload.observacao = purchaseForm.observacao?.trim() || null;
      }
      payload.pagoPor = pagoPorToApiPayload(purchaseForm.pagoPor ?? []);
      if (purchaseForm.cotacoes.length > 0) {
        const cotacoesFiltradas = purchaseForm.cotacoes
          .map((cot: Cotacao) => {
            const valorUnitario = Number(cot.valorUnitario) || 0;
            const frete = isSignaturePurchase(editingPurchase) ? 0 : Number(cot.frete) || 0;
            const impostos = Number(cot.impostos) || 0;
            const desconto = Number(cot.desconto) || 0;
            if (valorUnitario >= 0 && frete >= 0 && impostos >= 0 &&
                !isNaN(valorUnitario) && !isNaN(frete) && !isNaN(impostos)) {
              const cotacao: any = {
                valorUnitario,
                frete,
                impostos,
              };
              if (desconto > 0) {
                cotacao.desconto = desconto;
                cotacao.descontoTipo = cot.descontoTipo || 'valor';
              }
              if (cot.link && cot.link.trim().length > 0) {
                cotacao.link = cot.link.trim();
              }
              if (cot.fornecedorId) {
                cotacao.fornecedorId = Number(cot.fornecedorId);
              }
              if (cot.formaPagamento && cot.formaPagamento.trim().length > 0) {
                cotacao.formaPagamento = cot.formaPagamento.trim();
              }
              return cotacao;
            }
            return null;
          })
          .filter((cot) => cot !== null);
        if (cotacoesFiltradas.length > 0) {
          payload.cotacoes = cotacoesFiltradas;
        }
      }
      if (Object.keys(payload).length === 0) {
        setError('É necessário alterar pelo menos um campo');
        setSubmitting(false);
        return;
      }
      await api.patch(`/stock/purchases/${editingPurchase.id}`, payload);
      if (salvarNfComprovanteNoMes) {
        await api.patch(`/stock/purchases/${editingPurchase.id}/signatures/month-entry`, {
          mesReferencia: selectedSignatureMonth,
          nfUrl: nfFinal,
          comprovantePagamentoUrl: compFinal,
        });
      }
      setShowEditPurchaseModal(false);
      setEditingPurchase(null);
      setPurchaseForm({ ...emptyPurchaseForm });
      setPendingImageFiles([]);
      setPendingNfFiles([]);
      setPendingComprovanteFiles([]);
      load();
      if (salvarNfComprovanteNoMes) {
        void refreshSignatureAlerts();
      }
    } catch (err: any) {
      let errorMessage = 'Erro ao atualizar compra';
      if (err.response) {
        if (err.response.status === 404) {
          errorMessage = 'Compra não encontrada';
        } else if (err.response.status === 400) {
          errorMessage = 'Dados inválidos. Verifique os campos preenchidos.';
        } else if (err.response.data?.message) {
        if (Array.isArray(err.response.data.message)) {
          errorMessage = err.response.data.message
            .map((msg: any) => {
              if (typeof msg === 'string') return msg;
              if (msg.constraints) {
                return Object.values(msg.constraints).join(', ');
              }
              return JSON.stringify(msg);
            })
            .join('. ');
        } else {
          errorMessage = err.response.data.message;
        }
        } else if (err.response.statusText) {
          errorMessage = `${err.response.statusText}. Status: ${err.response.status}`;
        }
      } else if (err.request) {
        errorMessage = 'Não foi possível conectar ao servidor. Verifique sua conexão.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  function closeEditPurchaseModal() {
    setShowEditPurchaseModal(false);
    setEditingPurchase(null);
    setError(null);
    setPurchaseForm({ ...emptyPurchaseForm });
    setPendingImageFiles([]);
    setPendingNfFiles([]);
    setPendingComprovanteFiles([]);
  }
  function closeViewRequestModal() {
    setShowViewRequestModal(false);
    setPurchaseToView(null);
    setError(null);
    setApproveWithChangesMode(false);
    setApproveCategoriaId('');
    setApproveCotacoes([
      {
        valorUnitario: 0,
        frete: 0,
        impostos: 0,
        desconto: 0,
        descontoTipo: 'valor',
        link: '',
        fornecedorId: undefined,
        formaPagamento: '',
      },
    ]);
    setSelectedCotacaoIndex(0);
  }
  async function handleReviseApproval() {
    if (!purchaseToView) return;
    if (approveCotacoes.length === 0) {
      setError('Informe ao menos uma cotação');
      return;
    }
    const sel = approveCotacoes[selectedCotacaoIndex];
    const total = calculateCotacaoTotalHelper(
      { ...sel, descontoTipo: sel?.descontoTipo || 'valor' } as Cotacao,
      Math.max(1, purchaseToView.quantidade || 1),
    );
    if (!total || total <= 0) {
      setError('A cotação selecionada precisa ter valor total maior que zero');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/stock/purchases/${purchaseToView.id}/revise-approval`, {
        cotacoes: approveCotacoes,
        selectedCotacaoIndex,
      });
      await load();
      closeViewRequestModal();
      toast.success('Aprovação atualizada. Quem abriu o pedido de compra foi notificado.');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function handleApproveRequest() {
    if (!purchaseToView) return;
    const cotacoesToSend = approveWithChangesMode
      ? approveCotacoes.filter((c) => getCotacaoValorUnitario(c) > 0)
      : purchaseToView.cotacoesJson &&
          Array.isArray(purchaseToView.cotacoesJson) &&
          purchaseToView.cotacoesJson.length > 0
        ? purchaseToView.cotacoesJson
        : approveCotacoes.filter((c) => getCotacaoValorUnitario(c) > 0);
    if (cotacoesToSend.length === 0) {
      setError('Adicione pelo menos uma cotação com valor unitário para aprovar o pedido de compra');
      return;
    }
    if (approveQuantity == null || approveQuantity <= 0) {
      setError('A quantidade aprovada deve ser maior que zero');
      return;
    }
    const selectedIndexToSend = Math.min(Math.max(0, selectedCotacaoIndex), cotacoesToSend.length - 1);
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/stock/purchases/${purchaseToView.id}/approve`, {
        cotacoes: cotacoesToSend,
        selectedCotacaoIndex: selectedIndexToSend,
        withChanges: approveWithChangesMode,
        approvedQuantity: approveQuantity as number,
        categoriaId: approveCategoriaId || undefined,
        reducedQuantityAction:
          purchaseToView && approveQuantity != null && approveQuantity < purchaseToView.quantidade
            ? reducedQuantityAction
            : undefined,
      });
      await load();
      closeViewRequestModal();
      toast.success('Pedido de compra aprovado com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  async function handleRejectRequestConfirm() {
    if (!purchaseToReject) return;
    if (!rejectReason.trim()) {
      setError('Por favor, informe o motivo da rejeição');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/stock/purchases/${purchaseToReject.id}/reject`, {
        motivoRejeicao: rejectReason.trim(),
      });
      await load();
      setShowRejectModal(false);
      setPurchaseToReject(null);
      setRejectReason('');
      setError(null);
      toast.success('Pedido de compra reprovado.');
      if (purchaseToReject.projetoId) {
        window.location.href = `/projects/${purchaseToReject.projetoId}`;
      }
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }
  function handleExportPurchasesPdf() {
    const reportData = calculateReportTotals();
    const day = new Date().toISOString().split('T')[0];
    if (purchaseReportMode === 'solicitacoes-pending') {
      buildPurchaseReportPdf({
        purchases: reportData.purchases,
        getStatusLabel,
        title: 'RELATÓRIO DE SOLICITAÇÕES PENDENTES',
        subtitle: `Status: Solicitado · ${reportData.purchases.length} item(ns)`,
        fileNamePrefix: `relatorio-solicitacoes-pendentes-${day}`,
      });
      return;
    }
    buildPurchaseReportPdf({
      purchases: reportData.purchases,
      getStatusLabel,
      subtitle:
        purchaseReportMode === 'signature-month'
          ? `Assinaturas com NF e comprovante — competência ${signatureReportMonthInModal}`
          : undefined,
    });
  }
  return (
    <div className="space-y-8">
      {error && <p className="text-danger bg-danger/20 border border-danger/50 px-4 py-3 rounded-md">{error}</p>}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('estoque')}
            className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
              activeTab === 'estoque'
                ? 'bg-primary text-white border-b-2 border-primary'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Estoque
          </button>
          <button
            onClick={() => setActiveTab('compras')}
            className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
              activeTab === 'compras'
                ? 'bg-primary text-white border-b-2 border-primary'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Compras
          </button>
          <button
            onClick={() => setActiveTab('solicitacoes')}
            className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors relative ${
              activeTab === 'solicitacoes'
                ? 'bg-primary text-white border-b-2 border-primary'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Pedidos de compra
            {unreadSolicitacoesCount > 0 && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadSolicitacoesCount}
              </span>
            )}
          </button>
        </div>
      </div>
      {activeTab !== 'compras' && (
        <CollapsibleFilters
          show={showQuickFilters}
          setShow={setShowQuickFilters}
          hasActiveFilters={
            searchTerm.trim().length > 0 ||
            (activeTab === 'solicitacoes' &&
              (selectedProjectFilter !== 'all' ||
                solicitanteFilter !== 'all' ||
                solicitacaoOrigemFilter !== 'all')) ||
            (activeTab === 'estoque' && (estoqueOnlyAvailable || estoqueMinDisponivel.trim().length > 0))
          }
          onClear={() => {
            setSearchTerm('');
            setSelectedProjectFilter('all');
            setSolicitanteFilter('all');
            setSolicitacaoOrigemFilter('all');
            setEstoqueOnlyAvailable(false);
            setEstoqueMinDisponivel('');
          }}
        >
          {activeTab === 'estoque' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AppInput
                className="md:col-span-2"
                label="Buscar"
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Item ou descrição..."
              />
              <AppInput
                label="Mín. disponível"
                type="number"
                min={0}
                value={estoqueMinDisponivel}
                onChange={setEstoqueMinDisponivel}
                placeholder="Ex.: 1"
              />
              <div className="md:col-span-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={estoqueOnlyAvailable}
                    onChange={(e) => setEstoqueOnlyAvailable(e.target.checked)}
                    className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-white/80">Somente com disponível &gt; 0</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AppInput
                className="md:col-span-2"
                label="Buscar"
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Item, motivo, requisitante, projeto, futura/remanescente..."
              />
              <AppSelect
                label="Projeto"
                value={selectedProjectFilter}
                onChange={(value) => setSelectedProjectFilter(value === 'all' ? 'all' : Number(value))}
                options={[
                  { value: 'all', label: 'Todos os Projetos' },
                  ...projects.map((project) => ({ value: project.id, label: project.nome })),
                ]}
              />
              <AppSelect
                className="md:col-span-1"
                label="Requisitante"
                value={solicitanteFilter}
                onChange={(value) => setSolicitanteFilter(value === 'all' ? 'all' : Number(value))}
                options={[
                  { value: 'all', label: 'Todos' },
                  ...users.map((u) => ({ value: u.id, label: u.nome })),
                ]}
              />
              <AppSelect
                className="md:col-span-1"
                label="Origem"
                value={solicitacaoOrigemFilter}
                onChange={(value) =>
                  setSolicitacaoOrigemFilter(
                    value === 'futura' || value === 'normal' ? value : 'all',
                  )
                }
                options={[
                  { value: 'all', label: 'Todas' },
                  { value: 'futura', label: 'Compra futura (remanescente)' },
                  { value: 'normal', label: 'Compra normal' },
                ]}
              />
            </div>
          )}
        </CollapsibleFilters>
      )}
      {activeTab === 'estoque' && (
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xl font-semibold">Estoque</h3>
          <div className="flex flex-wrap items-center gap-2">
            {selectedStockItemIds.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportStockSheet}
                  disabled={exportingStockSheet}
                  className={btn.secondary}
                >
                  {exportingStockSheet ? 'Exportando…' : `Exportar selecionados (${selectedStockItemIds.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setBulkDeleteConfirmInput('');
                    setShowBulkDeleteStockModal(true);
                  }}
                  className={btn.danger}
                >
                  Apagar todos esses itens ({selectedStockItemIds.length})
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowImportEstoqueSheetModal(true);
              }}
              className={btn.secondary}
            >
              Importar Planilha
            </button>
          <button
            onClick={() => {
              setError(null);
              setPendingItemNfFile(null);
              setPendingItemComprovanteFile(null);
              setItemForm({
                item: '',
                codigo: '',
                categoriaId: undefined,
                descricao: '',
                quantidade: 1,
                valorUnitario: 0,
                unidadeMedida: 'UN',
                localizacao: '',
                imagemUrl: '',
                nfUrl: '',
                comprovantePagamentoUrl: '',
              });
              itemValidation.reset();
              setShowItemModal(true);
            }}
            className={btn.primary}
          >
            Adicionar Item
          </button>
          </div>
        </div>
        <DataTable<StockItem>
          data={filteredItems}
          keyExtractor={(i) => i.id}
          emptyMessage={items.length === 0 ? 'Nenhum item no estoque' : 'Nenhum item encontrado com os filtros aplicados'}
          paginate
          initialPageSize={STOCK_TABLE_PAGE_SIZE_DEFAULT}
          pageSizeOptions={[...STOCK_TABLE_PAGE_SIZE_OPTIONS]}
          tableClassName="table-fixed sm:table-auto"
          onRowClick={(item) => { setItemToView(item); setShowItemDetailsModal(true); }}
          renderMobileCard={(item) => {
            const alocada = item.quantidadeAlocada ?? 0;
            const disponivel = item.quantidadeDisponivel ?? item.quantidade ?? 0;
            return (
              <div
                className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3 cursor-pointer active:bg-white/5"
                onClick={() => { setItemToView(item); setShowItemDetailsModal(true); }}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-white/30 align-middle"
                      checked={selectedStockItemIds.includes(item.id)}
                      onChange={() => toggleStockItemSelection(item.id)}
                      aria-label={`Selecionar item ${item.item || item.id}`}
                    />
                  </div>
                  {item.imagemUrl && (item.imagemUrl.startsWith('data:image/') || item.imagemUrl.startsWith('http://') || item.imagemUrl.startsWith('https://')) && (
                    <img src={item.imagemUrl} alt={item.item || 'Item'} className="w-12 h-12 object-cover rounded-lg shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className="font-semibold text-white line-clamp-2 break-words"
                      title={item.item || 'Sem nome'}
                    >
                      {truncateDisplayText(item.item || 'Sem nome', LIST_ITEM_NAME_MAX_LEN)}
                    </p>
                    {item.descricao && (
                      <p
                        className="text-xs text-white/60 mt-0.5 line-clamp-2 break-words"
                        title={item.descricao}
                      >
                        {truncateDisplayText(item.descricao, LIST_ITEM_DESC_MAX_LEN)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-lg p-3">
                  <div className="text-center">
                    <p className="text-xs text-white/50 mb-1">Total</p>
                    <p className="text-sm font-bold text-white">{item.quantidade || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-white/50 mb-1">Alocada</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${alocada > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-white/50'}`}>
                      {alocada}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-white/50 mb-1">Disponível</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${disponivel > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {disponivel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openAlocacaoModal(item)} className={btn.editSm}>Alocar</button>
                  <button onClick={async () => {
                    setEditingItem(item);
                    setPendingItemImageFile(null);
                    setPendingItemNfFile(null);
                    setPendingItemComprovanteFile(null);
                    setItemStockDocRemoveConfirm(null);
                    let etapasData: any[] = [];
                    if (item.projetoId) {
                      try {
                        const r = await api.get(`/projects/${item.projetoId}`);
                        etapasData = r.data?.etapas || [];
                        setEtapas(etapasData);
                      } catch { setEtapas([]); }
                    } else { setEtapas([]); }
                    setItemForm({
                      item: item.item || '',
                      codigo: (item as any).codigo || '',
                      categoriaId: (item as any).categoriaId || undefined,
                      descricao: item.descricao || '',
                      quantidade: item.quantidade || 1,
                      valorUnitario: item.valorUnitario || 0,
                      unidadeMedida: (item as any).unidadeMedida || 'UN',
                      localizacao: (item as any).localizacao || '',
                      imagemUrl: item.imagemUrl || '',
                      nfUrl: item.nfUrl || '',
                      comprovantePagamentoUrl: item.comprovantePagamentoUrl || '',
                    });
                    setShowEditModal(true);
                  }} className={btn.editSm}>Editar</button>
                  <button onClick={() => { setItemToDelete(item); setShowDeleteModal(true); }} className={btn.dangerSm}>Remover</button>
                </div>
              </div>
            );
          }}
          columns={[
            {
              key: '_select',
              label: (
                <input
                  type="checkbox"
                  className="rounded border-white/30"
                  checked={
                    filteredItems.length > 0 &&
                    selectedStockItemIds.length === filteredItems.length
                  }
                  onChange={toggleAllFilteredStockItems}
                  title="Selecionar todos os itens da lista filtrada"
                  aria-label="Selecionar todos os itens da lista filtrada"
                />
              ),
              thClassName: 'w-11 min-w-[2.75rem]',
              tdClassName: 'w-11 min-w-[2.75rem] align-top',
              stopRowClick: true,
              render: (item) => (
                <input
                  type="checkbox"
                  className="rounded border-white/30"
                  checked={selectedStockItemIds.includes(item.id)}
                  onChange={() => toggleStockItemSelection(item.id)}
                  aria-label={`Selecionar ${item.item || 'item'}`}
                />
              ),
            },
            {
              key: 'item',
              label: '',
              renderTh: () => renderEstoqueTh('item', 'Item'),
              thClassName: 'max-w-[11rem] sm:max-w-[13rem] lg:max-w-[15rem]',
              tdClassName: 'min-w-0 align-top max-w-[11rem] sm:max-w-[13rem] lg:max-w-[15rem]',
              render: (item) => (
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {item.imagemUrl && (item.imagemUrl.startsWith('data:image/') || item.imagemUrl.startsWith('http://') || item.imagemUrl.startsWith('https://')) && (
                    <img src={item.imagemUrl} alt={item.item || 'Item'} className="w-10 h-10 object-cover rounded shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <div className="min-w-0 flex-1 overflow-hidden w-full">
                    <div
                      className="font-medium truncate"
                      title={item.item || 'Sem nome'}
                    >
                      {truncateDisplayText(item.item || 'Sem nome', LIST_ITEM_NAME_MAX_LEN)}
                    </div>
                    {item.descricao && (
                      <div
                        className="text-xs text-white/60 truncate"
                        title={item.descricao}
                      >
                        {truncateDisplayText(item.descricao, LIST_ITEM_DESC_MAX_LEN)}
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'quantidade',
              label: '',
              renderTh: () => renderEstoqueTh('quantidade', 'Quantidade Total'),
              thClassName: 'whitespace-nowrap w-24 min-w-[5rem]',
              tdClassName: 'align-top whitespace-nowrap w-24 min-w-[5rem]',
              render: (item) => <span className="font-medium">{item.quantidade || 0}</span>,
            },
            {
              key: 'alocada',
              label: '',
              renderTh: () => renderEstoqueTh('alocada', 'Alocada'),
              thClassName: 'whitespace-nowrap w-16 min-w-[4rem]',
              tdClassName: 'align-top whitespace-nowrap w-16 min-w-[4rem]',
              render: (item) => {
                const qtd = item.quantidadeAlocada ?? 0;
                return (
                  <span className={`px-2 py-1 rounded text-xs ${qtd > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-white/50'}`}>
                    {qtd}
                  </span>
                );
              },
            },
            {
              key: 'disponivel',
              label: '',
              renderTh: () => renderEstoqueTh('disponivel', 'Disponível'),
              thClassName: 'whitespace-nowrap w-16 min-w-[4rem]',
              tdClassName: 'align-top whitespace-nowrap w-16 min-w-[4rem]',
              render: (item) => {
                const qtd = item.quantidadeDisponivel ?? item.quantidade ?? 0;
                return (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${qtd > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {qtd}
                  </span>
                );
              },
            },
            {
              key: 'acoes',
              label: 'Ações',
              stopRowClick: true,
              render: (item) => (
                <div className="flex items-center gap-1.5 flex-nowrap">
                  <button onClick={() => openAlocacaoModal(item)}
                    className={btn.editSm} title="Gerenciar alocações">
                    Alocar
                  </button>
                  <button
                    onClick={async () => {
                      setEditingItem(item);
                      setPendingItemImageFile(null);
                      setPendingItemNfFile(null);
                      setPendingItemComprovanteFile(null);
                      setItemStockDocRemoveConfirm(null);
                      let etapasData: any[] = [];
                      if (item.projetoId) {
                        try {
                          const projetoResponse = await api.get(`/projects/${item.projetoId}`);
                          etapasData = projetoResponse.data?.etapas || [];
                          setEtapas(etapasData);
                        } catch (err) {
                          console.error('Erro ao carregar etapas:', err);
                          setEtapas([]);
                        }
                      } else {
                        setEtapas([]);
                      }
                      setItemForm({
                        item: item.item || '',
                        codigo: (item as any).codigo || '',
                        categoriaId: (item as any).categoriaId || undefined,
                        descricao: item.descricao || '',
                        quantidade: item.quantidade || 1,
                        valorUnitario: item.valorUnitario || 0,
                        unidadeMedida: (item as any).unidadeMedida || 'UN',
                        localizacao: (item as any).localizacao || '',
                        imagemUrl: item.imagemUrl || '',
                        nfUrl: item.nfUrl || '',
                        comprovantePagamentoUrl: item.comprovantePagamentoUrl || '',
                      });
                      setShowEditModal(true);
                    }}
                    className={btn.editSm}>
                    Editar
                  </button>
                  <button onClick={() => { setItemToDelete(item); setShowDeleteModal(true); }}
                    className={btn.dangerSm}>
                    Remover
                  </button>
                </div>
              ),
            },
          ] satisfies DataTableColumn<StockItem>[]}
        />
      </section>
      )}
      {activeTab === 'compras' && (
      <section>
        <StockComprasToolbar
          selectedPurchasesCount={selectedPurchases.length}
          selectedPurchasesPendenteCount={selectedPurchasesPendente.length}
          showAssinaturasMesReport={purchaseSubTab === 'assinaturas'}
          onOpenAssinaturasMesReport={() => {
            setPurchaseReportMode('signature-month');
            setSignatureReportMonthInModal(selectedSignatureMonth);
            setIncludeSignaturesInReport(true);
            setShowReportModal(true);
          }}
          onOpenReport={() => {
            setPurchaseReportMode('selection');
            setIncludeSignaturesInReport(false);
            setShowReportModal(true);
          }}
          onOpenAddTag={() => setShowTagModal(true)}
          onOpenRemoveTag={() => setShowRemoveTagModal(true)}
          onOpenBulkDelete={openBulkDeletePurchaseModal}
          onOpenBatchAcaminho={() => setShowBatchAcaminhoModal(true)}
          onOpenImportSheet={() => setShowImportSheetModal(true)}
          onOpenNovaCompra={openNovaCompraModal}
          onOpenNovaDespesa={openNovaDespesaModal}
          onOpenNovaAssinatura={openNovaAssinaturaModal}
        />
        <PurchaseSubTabs
          subTab={purchaseSubTab}
          counts={purchaseCounts}
          onChange={setPurchaseSubTab}
        />
        {purchaseSubTab === 'assinaturas' && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <label className="text-sm font-medium text-white/90">Competência</label>
            <input
              type="month"
              value={selectedSignatureMonth}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setSelectedSignatureMonth(v);
              }}
              className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white"
            />
            <span className="text-xs text-white/55">
              Edite a assinatura para anexar NF e comprovante da competência selecionada.
            </span>
          </div>
        )}
        <PurchaseFilters
          filters={purchaseFiltersState}
          setFilters={setPurchaseFilters}
          showFilters={showPurchaseFilters}
          setShowFilters={setShowPurchaseFilters}
          clearFilters={clearPurchaseFilters}
          hasActiveFilters={hasActiveFilters}
          categories={categories}
          projects={projects}
          metodosPago={metodosPago}
          selectedProjectFilter={selectedProjectFilter}
          setSelectedProjectFilter={setSelectedProjectFilter}
          tagOptions={purchaseTagOptions}
        />
        <PurchaseMobileList
          purchases={paginatedPurchases}
          allPurchasesCount={purchases.length}
          selectedPurchases={selectedPurchases}
          listItemNameMaxLen={LIST_ITEM_NAME_MAX_LEN}
          listItemDescMaxLen={LIST_ITEM_DESC_MAX_LEN}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          getStatusEntregaColor={getStatusEntregaColor}
          getStatusEntregaLabel={getStatusEntregaLabel}
          getCategoryName={getCategoryName}
          truncateDisplayText={truncateDisplayText}
          calculateCotacaoTotal={calculateCotacaoTotalHelper}
          toggleSelection={togglePurchaseSelection}
          onOpenDetails={(purchase) => {
            setPurchaseToViewDetails(purchase);
            setShowPurchaseDetailsModal(true);
          }}
          onOpenStatus={openPurchaseStatusModal}
          onOpenEdit={openEditPurchaseModal}
          onOpenDelete={openDeletePurchaseModal}
          onRemoveSingleTag={handleRemoveSingleTag}
          isSignaturePurchase={isSignaturePurchase}
          signatureAlertsByPurchaseId={signatureAlertsByPurchaseId}
          selectedSignatureMonth={selectedSignatureMonth}
          showEntregaColumn={purchaseSubTab !== 'assinaturas' && purchaseSubTab !== 'despesas'}
        />
        <PurchaseDesktopTable
          finalSortedPurchases={finalSortedPurchases}
          paginatedPurchases={paginatedPurchases}
          selectedPurchases={selectedPurchases}
          toggleAllPurchases={toggleAllPurchases}
          togglePurchaseSelection={togglePurchaseSelection}
          renderSortableHeader={renderSortableHeader}
          getCategoryName={getCategoryName}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          getStatusEntregaColor={getStatusEntregaColor}
          getStatusEntregaLabel={getStatusEntregaLabel}
          isSignaturePurchase={isSignaturePurchase}
          signatureAlertsByPurchaseId={signatureAlertsByPurchaseId}
          selectedSignatureMonth={selectedSignatureMonth}
          onOpenDetails={(purchase) => {
                      setPurchaseToViewDetails(purchase);
                      setShowPurchaseDetailsModal(true);
                    }}
          onOpenStatus={openPurchaseStatusModal}
          onOpenEdit={openEditPurchaseModal}
          onOpenDelete={openDeletePurchaseModal}
          onRemoveSingleTag={handleRemoveSingleTag}
          truncateDisplayText={truncateDisplayText}
          listItemNameMaxLen={LIST_ITEM_NAME_MAX_LEN}
          listItemDescMaxLen={LIST_ITEM_DESC_MAX_LEN}
          purchasesCount={purchases.length}
          showEntregaColumn={purchaseSubTab !== 'assinaturas' && purchaseSubTab !== 'despesas'}
        />
        <TablePagination
          totalItems={purchaseTotalCount}
          page={purchaseListPage}
          pageSize={purchaseSafeSize}
          onPageChange={setPurchaseListPage}
          onPageSizeChange={handlePurchasePageSizeChange}
          pageSizeOptions={[...STOCK_TABLE_PAGE_SIZE_OPTIONS]}
        />
      </section>
      )}
      {activeTab === 'solicitacoes' && (
        <SolicitacoesSection
          filteredSolicitacoesByOrigem={filteredSolicitacoesByOrigem}
          selectedSolicitacaoIds={selectedSolicitacaoIds}
          onOpenReport={openSolicitacoesReportModal}
          onOpenBulkApprove={openBulkApproveModal}
          onOpenBulkDelete={openBulkDeletePurchaseModal}
          onToggleSolicitacaoSelection={toggleSolicitacaoSelection}
          onToggleAllSolicitacoesFiltered={toggleAllSolicitacoesFiltered}
          onOpenSolicitacaoDetails={openSolicitacaoDetails}
          isCompraFuturaRemanescente={isCompraFuturaRemanescente}
          isSolicitacaoNova={isSolicitacaoNova}
          truncateDisplayText={truncateDisplayText}
          listItemNameMaxLen={LIST_ITEM_NAME_MAX_LEN}
          listItemDescMaxLen={LIST_ITEM_DESC_MAX_LEN}
        />
      )}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/20 px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Adicionar Item ao Estoque</h2>
              <button
                onClick={() => {
                  setShowItemModal(false);
                  setError(null);
                  setPendingItemNfFile(null);
                  setPendingItemComprovanteFile(null);
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateItem} className="p-8 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Nome do Item *</label>
                <input
                  type="text"
                  required
                  value={itemForm.item}
                  onChange={(e) => setItemForm({ ...itemForm, item: e.target.value })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ex: Parafuso M6x20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Código/SKU</label>
                  <input
                    type="text"
                    value={itemForm.codigo || ''}
                    onChange={(e) => setItemForm({ ...itemForm, codigo: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ex: PRF-M6-20"
                />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Descrição</label>
                <textarea
                  value={itemForm.descricao}
                  onChange={(e) => setItemForm({ ...itemForm, descricao: e.target.value })}
                  rows={3}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Descrição detalhada do item..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Categoria</label>
                <select
                    value={itemForm.categoriaId || ''}
                    onChange={(e) => setItemForm({ ...itemForm, categoriaId: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 1rem center',
                      paddingRight: '2.5rem'
                    }}
                >
                  <option value="" className="bg-neutral text-white">Selecione uma categoria (opcional)</option>
                  {categories.filter(c => c.ativo).map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-neutral text-white">
                      {cat.nome}
                    </option>
                  ))}
                </select>
              </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Unidade de Medida *</label>
                  <select
                    value={itemForm.unidadeMedida || 'UN'}
                    onChange={(e) => setItemForm({ ...itemForm, unidadeMedida: e.target.value })}
                    className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 1rem center',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="UN" className="bg-neutral text-white">UN (Unidade)</option>
                    <option value="KG" className="bg-neutral text-white">KG (Quilograma)</option>
                    <option value="M" className="bg-neutral text-white">M (Metro)</option>
                    <option value="M2" className="bg-neutral text-white">M² (Metro Quadrado)</option>
                    <option value="M3" className="bg-neutral text-white">M³ (Metro Cúbico)</option>
                    <option value="L" className="bg-neutral text-white">L (Litro)</option>
                    <option value="CX" className="bg-neutral text-white">CX (Caixa)</option>
                    <option value="PC" className="bg-neutral text-white">PC (Peça)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Localização</label>
                            <input
                    type="text"
                    value={itemForm.localizacao || ''}
                    onChange={(e) => setItemForm({ ...itemForm, localizacao: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ex: Prateleira A-3"
                  />
                        </div>
                      </div>
              <div className="max-w-md">
                  <label className="block text-sm font-medium text-white/90 mb-2">Quantidade *</label>
                  <NumericInput
                    required
                    min={1}
                    integer
                    value={itemForm.quantidade}
                    onValueChange={(v) => setItemForm({ ...itemForm, quantidade: v })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                        </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
                <p className="text-xs text-white/55">
                  Nota fiscal e comprovante (opcional): anexe aqui no cadastro manual ou deixe que sejam preenchidos
                  automaticamente quando uma compra deste item for entregue no estoque.
                </p>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">NF (imagem ou PDF)</label>
                  <FileDropInput
                    accept="image/*,.pdf"
                    onFilesSelected={(files) => {
                      if (files[0]) setPendingItemNfFile(files[0]);
                    }}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                    dropMessage="Solte a NF aqui"
                  />
                  {pendingItemNfFile && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                      <span className="truncate">{pendingItemNfFile.name}</span>
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => setPendingItemNfFile(null)}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Comprovante de pagamento (opcional)</label>
                  <FileDropInput
                    accept="image/*,.pdf"
                    onFilesSelected={(files) => {
                      if (files[0]) setPendingItemComprovanteFile(files[0]);
                    }}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                    dropMessage="Solte o comprovante aqui"
                  />
                  {pendingItemComprovanteFile && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                      <span className="truncate">{pendingItemComprovanteFile.name}</span>
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => setPendingItemComprovanteFile(null)}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
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
                    setShowItemModal(false);
                    setError(null);
                    setPendingItemNfFile(null);
                    setPendingItemComprovanteFile(null);
                  }}
                  className={btn.secondary}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={btn.primary}
                >
                  {submitting ? 'Salvando...' : 'Adicionar Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAlocacaoModal && itemParaAlocar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-neutral border border-white/20 rounded-lg sm:rounded-xl shadow-2xl max-w-2xl w-full my-auto max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
              <h2 className="text-lg sm:text-xl font-bold text-white">Gerenciar Alocações - {itemParaAlocar.item}</h2>
              <button
                onClick={() => {
                  setShowAlocacaoModal(false);
                  setItemParaAlocar(null);
                  setAlocacoes([]);
                  setError(null);
                }}
                className="text-white/50 hover:text-white transition-colors text-lg sm:text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-white/70">Total:</span>
                    <span className="ml-2 font-semibold text-white">{itemParaAlocar.quantidade || 0}</span>
                  </div>
                  <div>
                    <span className="text-white/70">Alocada:</span>
                    <span className="ml-2 font-semibold text-yellow-400">
                      {alocacoes.reduce((sum, a) => sum + (a.quantidade || 0), 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/70">Disponível:</span>
                    <span className="ml-2 font-semibold text-green-400">
                      {(itemParaAlocar.quantidade || 0) - alocacoes.reduce((sum, a) => sum + (a.quantidade || 0), 0)}
                    </span>
                  </div>
                </div>
              </div>
              <h3 className="text-base font-semibold text-white mb-3">Nova Alocação</h3>
              <p className="text-xs text-white/55 mb-2">
                Informe apenas um destino: projeto (etapa opcional), usuário ou setor.
              </p>
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1">Projeto</label>
                    <select
                      value={alocacaoForm.projetoId || ''}
                      onChange={async (e) => {
                        const projetoId = e.target.value ? Number(e.target.value) : undefined;
                        setAlocacaoForm({
                          ...alocacaoForm,
                          projetoId,
                          etapaId: undefined,
                          usuarioId: undefined,
                          setorId: undefined,
                        });
                        if (projetoId) {
                          try {
                            const response = await api.get(`/projects/${projetoId}`);
                            setEtapas(response.data.etapas || []);
                          } catch (err) {
                            setEtapas([]);
                          }
                        } else {
                          setEtapas([]);
                        }
                      }}
                      className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.75rem center',
                        paddingRight: '2rem'
                      }}
                    >
                      <option value="" className="bg-neutral text-white">Selecione (opcional)</option>
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id} className="bg-neutral text-white">
                          {proj.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1">Etapa</label>
                    <select
                      value={alocacaoForm.etapaId || ''}
                      onChange={(e) =>
                        setAlocacaoForm({
                          ...alocacaoForm,
                          etapaId: e.target.value ? Number(e.target.value) : undefined,
                          usuarioId: undefined,
                          setorId: undefined,
                        })
                      }
                      className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.75rem center',
                        paddingRight: '2rem'
                      }}
                      disabled={!alocacaoForm.projetoId}
                    >
                      <option value="" className="bg-neutral text-white">Selecione (opcional)</option>
                      {etapas.filter(e => e.projetoId === alocacaoForm.projetoId).map((etapa) => (
                        <option key={etapa.id} value={etapa.id} className="bg-neutral text-white">
                          {etapa.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1">Usuário</label>
                    <select
                      value={alocacaoForm.usuarioId || ''}
                      onChange={(e) =>
                        setAlocacaoForm({
                          ...alocacaoForm,
                          usuarioId: e.target.value ? Number(e.target.value) : undefined,
                          projetoId: undefined,
                          etapaId: undefined,
                          setorId: undefined,
                        })
                      }
                      className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.75rem center',
                        paddingRight: '2rem'
                      }}
                    >
                      <option value="" className="bg-neutral text-white">Selecione (opcional)</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id} className="bg-neutral text-white">
                          {user.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1">Setor</label>
                    <select
                      value={alocacaoForm.setorId || ''}
                      onChange={(e) =>
                        setAlocacaoForm({
                          ...alocacaoForm,
                          setorId: e.target.value ? Number(e.target.value) : undefined,
                          projetoId: undefined,
                          etapaId: undefined,
                          usuarioId: undefined,
                        })
                      }
                      className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.75rem center',
                        paddingRight: '2rem',
                      }}
                    >
                      <option value="" className="bg-neutral text-white">
                        Selecione (opcional)
                      </option>
                      {setores.map((s) => (
                        <option key={s.id} value={s.id} className="bg-neutral text-white">
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1">Quantidade *</label>
                    <input
                      type="number"
                      min="1"
                      max={(itemParaAlocar.quantidade || 0) - alocacoes.reduce((sum, a) => sum + (a.quantidade || 0), 0)}
                      value={alocacaoForm.quantidade}
                      onChange={(e) => setAlocacaoForm({ ...alocacaoForm, quantidade: Number(e.target.value) || 1 })}
                      className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleCreateAlocacao}
                disabled={
                  submitting || 
                  alocacaoForm.quantidade < 1 || 
                  (!alocacaoForm.projetoId && !alocacaoForm.usuarioId && !alocacaoForm.setorId) ||
                  ((itemParaAlocar?.quantidade || 0) - alocacoes.reduce((sum, a) => sum + (a.quantidade || 0), 0)) <= 0
                }
                className={`${btn.primary} w-full sm:w-auto mb-4`}
              >
                {submitting ? 'Criando...' : 'Criar Alocação'}
              </button>
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-2 rounded-md mb-3 text-xs">
                  {error}
                </div>
              )}
              <h3 className="text-base font-semibold text-white mb-3 mt-6">Alocações Existentes</h3>
              {alocacoes.length === 0 ? (
                <p className="text-white/50 text-sm">Nenhuma alocação cadastrada</p>
              ) : (
                <div className="space-y-2">
                  {alocacoes.map((alocacao) => (
                    <div key={alocacao.id} className="bg-white/5 p-3 rounded-md border border-white/10 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-white">
                          <span className="font-semibold">Quantidade: {alocacao.quantidade}</span>
                        </div>
                        <div className="text-xs text-white/70 mt-1">
                          {alocacao.projeto && `Projeto: ${alocacao.projeto.nome}`}
                          {alocacao.projeto && alocacao.etapa && ' • '}
                          {alocacao.etapa && `Etapa: ${alocacao.etapa.nome}`}
                          {alocacao.usuario && (
                            <>
                              {alocacao.projeto || alocacao.etapa ? ' • ' : ''}
                              Usuário: {alocacao.usuario.nome}
                            </>
                          )}
                          {alocacao.setor && (
                            <>
                              {alocacao.projeto || alocacao.etapa || alocacao.usuario ? ' • ' : ''}
                              Setor: {alocacao.setor.nome}
                            </>
                          )}
                          {!alocacao.projeto && !alocacao.etapa && !alocacao.usuario && !alocacao.setor && 'Sem destino'}
                        </div>
                        <div className="text-xs text-white/50 mt-1">
                          {new Date(alocacao.dataAlocacao).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteAlocacao(alocacao.id)}
                        disabled={submitting}
                        className={btn.dangerSm}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/20 px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Editar Item</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                  setError(null);
                  setPendingItemImageFile(null);
                  setPendingItemNfFile(null);
                  setPendingItemComprovanteFile(null);
                  setItemStockDocRemoveConfirm(null);
                  setItemForm({
                    item: '',
                    codigo: '',
                    categoriaId: undefined,
                    descricao: '',
                    quantidade: 1,
                    valorUnitario: 0,
                    unidadeMedida: 'UN',
                    localizacao: '',
                    imagemUrl: '',
                    nfUrl: '',
                    comprovantePagamentoUrl: '',
                  });
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdateItem} className="p-8 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Nome do Item *</label>
                <input
                  type="text"
                  required
                  value={itemForm.item}
                  onChange={(e) => setItemForm({ ...itemForm, item: e.target.value })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ex: Parafuso M6x20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Código/SKU</label>
                  <input
                    type="text"
                    value={itemForm.codigo || ''}
                    onChange={(e) => setItemForm({ ...itemForm, codigo: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ex: PRF-M6-20"
                />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Descrição</label>
                <textarea
                  value={itemForm.descricao}
                  onChange={(e) => setItemForm({ ...itemForm, descricao: e.target.value })}
                  rows={3}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Descrição detalhada do item..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Categoria</label>
                  <select
                    value={itemForm.categoriaId || ''}
                    onChange={(e) => setItemForm({ ...itemForm, categoriaId: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 1rem center',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="" className="bg-neutral text-white">Selecione uma categoria (opcional)</option>
                    {categories.filter(c => c.ativo).map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-neutral text-white">
                        {cat.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Unidade de Medida *</label>
                  <select
                    value={itemForm.unidadeMedida || 'UN'}
                    onChange={(e) => setItemForm({ ...itemForm, unidadeMedida: e.target.value })}
                    className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 1rem center',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="UN" className="bg-neutral text-white">UN (Unidade)</option>
                    <option value="KG" className="bg-neutral text-white">KG (Quilograma)</option>
                    <option value="M" className="bg-neutral text-white">M (Metro)</option>
                    <option value="M2" className="bg-neutral text-white">M² (Metro Quadrado)</option>
                    <option value="M3" className="bg-neutral text-white">M³ (Metro Cúbico)</option>
                    <option value="L" className="bg-neutral text-white">L (Litro)</option>
                    <option value="CX" className="bg-neutral text-white">CX (Caixa)</option>
                    <option value="PC" className="bg-neutral text-white">PC (Peça)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Localização</label>
                  <input
                    type="text"
                    value={itemForm.localizacao || ''}
                    onChange={(e) => setItemForm({ ...itemForm, localizacao: e.target.value })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ex: Prateleira A-3"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Quantidade *</label>
                  <NumericInput
                    required
                    min={1}
                    integer
                    value={itemForm.quantidade}
                    onValueChange={(v) => setItemForm({ ...itemForm, quantidade: v })}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Valor Unitário (R$)</label>
                  <NumericInput
                    min={0}
                    step={0.01}
                    value={itemForm.valorUnitario}
                    onValueChange={(v) => {
                      const n = v;
                      setItemForm({ ...itemForm, valorUnitario: n });
                      itemValidation.handleChange('valorUnitario', n);
                    }}
                    onBlur={() => itemValidation.handleBlur('valorUnitario')}
                    className={`w-full bg-white/10 border rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 ${
                      itemValidation.hasError('valorUnitario')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/30 focus:ring-primary focus:border-primary'
                    }`}
                    placeholder="0.00"
                  />
                  {itemValidation.hasError('valorUnitario') && (
                    <p className="text-red-500 text-xs mt-1">{itemValidation.getFieldError('valorUnitario')}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Imagem</label>
                <FileDropInput
                  accept="image/*"
                  onFilesSelected={(files) => {
                    handleItemImageSelected(files[0]);
                  }}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                  dropMessage="Solte a imagem aqui"
                />
                {itemForm.imagemUrl && (
                  <img src={itemForm.imagemUrl} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded border border-white/20" />
                )}
                {editingItem.imagemUrl && !itemForm.imagemUrl && (
                  <div className="mt-2">
                    <p className="text-sm text-white/60 mb-2">Imagem atual:</p>
                    <img src={editingItem.imagemUrl} alt="Atual" className="w-32 h-32 object-cover rounded border border-white/20" />
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
                <p className="text-xs text-white/55">
                  Nota fiscal e comprovante: podem vir da compra entregue (atualizam a linha do estoque) ou você anexa
                  manualmente aqui.
                </p>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">NF (imagem ou PDF)</label>
                  <FileDropInput
                    accept="image/*,.pdf"
                    onFilesSelected={(files) => {
                      if (files[0]) setPendingItemNfFile(files[0]);
                    }}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                    dropMessage="Solte a NF aqui"
                  />
                  {pendingItemNfFile && (
                    <p className="mt-2 text-xs text-white/70">Novo arquivo: {pendingItemNfFile.name}</p>
                  )}
                  {itemForm.nfUrl && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <UploadFileLink
                        src={itemForm.nfUrl}
                        className="text-sm text-primary underline hover:text-primary/80"
                      >
                        Ver NF anexada
                      </UploadFileLink>
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => setItemStockDocRemoveConfirm('nfUrl')}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">Comprovante de pagamento (opcional)</label>
                  <FileDropInput
                    accept="image/*,.pdf"
                    onFilesSelected={(files) => {
                      if (files[0]) setPendingItemComprovanteFile(files[0]);
                    }}
                    className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                    dropMessage="Solte o comprovante aqui"
                  />
                  {pendingItemComprovanteFile && (
                    <p className="mt-2 text-xs text-white/70">Novo arquivo: {pendingItemComprovanteFile.name}</p>
                  )}
                  {itemForm.comprovantePagamentoUrl && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <UploadFileLink
                        src={itemForm.comprovantePagamentoUrl}
                        className="text-sm text-primary underline hover:text-primary/80"
                      >
                        Ver comprovante anexado
                      </UploadFileLink>
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => setItemStockDocRemoveConfirm('comprovantePagamentoUrl')}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
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
                    setShowEditModal(false);
                    setEditingItem(null);
                    setError(null);
                    setPendingItemImageFile(null);
                    setPendingItemNfFile(null);
                    setPendingItemComprovanteFile(null);
                    setItemStockDocRemoveConfirm(null);
                    setItemForm({
                      item: '',
                      codigo: '',
                      categoriaId: undefined,
                      descricao: '',
                      quantidade: 1,
                      valorUnitario: 0,
                      unidadeMedida: 'UN',
                      localizacao: '',
                      imagemUrl: '',
                      nfUrl: '',
                      comprovantePagamentoUrl: '',
                    });
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
                  {submitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
          {itemStockDocRemoveConfirm && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setItemStockDocRemoveConfirm(null)}
            >
              <div
                className="w-full max-w-md rounded-lg border border-white/20 bg-neutral p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-white">Remover anexo?</h3>
                <p className="mt-2 text-sm text-white/75">
                  Deseja remover{' '}
                  {itemStockDocRemoveConfirm === 'nfUrl'
                    ? 'a nota fiscal (NF)'
                    : 'o comprovante de pagamento'}
                  ? A alteração só será aplicada ao salvar o item.
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => setItemStockDocRemoveConfirm(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={btn.danger}
                    onClick={() => {
                      if (itemStockDocRemoveConfirm === 'nfUrl') {
                        setItemForm((f) => ({ ...f, nfUrl: '' }));
                        setPendingItemNfFile(null);
                      } else {
                        setItemForm((f) => ({ ...f, comprovantePagamentoUrl: '' }));
                        setPendingItemComprovanteFile(null);
                      }
                      setItemStockDocRemoveConfirm(null);
                    }}
                  >
                    Sim, remover
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {showDeleteModal && itemToDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-8 py-6 border-b border-white/20">
              <h2 className="text-2xl font-bold text-white">Confirmar Exclusão</h2>
            </div>
            <div className="p-8">
              <p className="text-white/90 mb-2">
                Tem certeza que deseja remover o item:
              </p>
              <p className="text-xl font-semibold text-white mb-6">
                "{itemToDelete.item}"
              </p>
              <p className="text-sm text-white/70 mb-6">
                Esta ação não pode ser desfeita.
              </p>
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-md mb-4 text-sm">
                  {error}
                </div>
              )}
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                    setError(null);
                  }}
                  className={btn.secondaryLg}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteItem}
                  className={btn.dangerLg}
                  disabled={deleting}
                >
                  {deleting ? 'Removendo...' : 'Confirmar Remoção'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showBulkDeleteStockModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-8 py-6 border-b border-white/20">
              <h2 className="text-2xl font-bold text-white">Apagar todos esses itens?</h2>
            </div>
            <div className="p-8">
              <p className="text-white/90 mb-2">
                Você está prestes a remover <strong className="text-white">{selectedStockItemIds.length}</strong>{' '}
                {selectedStockItemIds.length === 1 ? 'item' : 'itens'} do estoque de uma só vez.
              </p>
              <p className="text-sm text-white/70 mb-4">
                Esta ação não pode ser desfeita. Confirme se deseja apagar todos esses itens.
              </p>
              <div className="mb-6">
                <label htmlFor="bulk-delete-stock-confirm" className="block text-sm font-medium text-white/90 mb-2">
                  Digite <span className="font-mono text-primary font-semibold">{BULK_DELETE_CONFIRM_PHRASE}</span> para
                  confirmar:
                </label>
                <input
                  id="bulk-delete-stock-confirm"
                  type="text"
                  value={bulkDeleteConfirmInput}
                  onChange={(e) => setBulkDeleteConfirmInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={BULK_DELETE_CONFIRM_PHRASE}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-md mb-4 text-sm">
                  {error}
              </div>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                  onClick={() => {
                    setShowBulkDeleteStockModal(false);
                    setBulkDeleteConfirmInput('');
                    setError(null);
                  }}
                  className={btn.secondaryLg}
                  disabled={deletingBulkStock}
                >
                  Cancelar
                  </button>
                            <button
                              type="button"
                  onClick={handleBulkDeleteStockItems}
                  className={btn.dangerLg}
                  disabled={
                    deletingBulkStock || !isBulkDeleteConfirmPhrase(bulkDeleteConfirmInput)
                  }
                >
                  {deletingBulkStock ? 'Apagando...' : 'Sim, apagar todos esses itens'}
                            </button>
                        </div>
                      </div>
                        </div>
                        </div>
      )}
      <CreatePurchaseModal
        isOpen={showPurchaseModal}
        purchaseModalMode={purchaseModalMode}
        purchaseForm={purchaseForm}
        lineItems={purchaseLineItems}
        setLineItems={setPurchaseLineItems}
        pendingImageFiles={pendingImageFiles}
        pendingNfFiles={pendingNfFiles}
        pendingComprovanteFiles={pendingComprovanteFiles}
        projects={projects}
        setores={setores}
        users={users}
        metodosPago={metodosPago}
        suppliers={suppliers}
        categories={categories}
        signaturePurchaseCategories={signaturePurchaseCategories}
        formasPagamento={formasPagamento}
        submitting={submitting}
        error={error}
        onClose={() => {
          setShowPurchaseModal(false);
          setPurchaseModalMode('compra');
          setError(null);
          setPendingImageFiles([]);
          setPendingNfFiles([]);
          setPendingComprovanteFiles([]);
        }}
        onSubmit={handleCreatePurchase}
        setPurchaseForm={setPurchaseForm}
        onRefreshMetodos={loadMetodosPago}
        onOpenCategoryModal={openCategoryModal}
        onOpenSupplierModal={openSupplierModalFromCreate}
        onAppendPurchaseImages={handlePurchaseImagesAppend}
        onAppendPurchaseNf={handlePurchaseNfAppend}
        onAppendPurchaseComprovante={handlePurchaseComprovanteAppend}
        onRemovePendingImage={(index) => {
          setPendingImageFiles((prev) => prev.filter((_, i) => i !== index));
        }}
        onRemovePendingNf={(index) => {
          setPendingNfFiles((prev) => prev.filter((_, i) => i !== index));
        }}
        onRemovePendingComprovante={(index) => {
          setPendingComprovanteFiles((prev) => prev.filter((_, i) => i !== index));
        }}
        onClearPendingAttachment={(field) => {
          if (field === 'imagemUrl') setPendingImageFiles([]);
          if (field === 'nfUrl') setPendingNfFiles([]);
          if (field === 'comprovantePagamentoUrl') setPendingComprovanteFiles([]);
        }}
      />
      <PurchaseEditModal
        isOpen={showEditPurchaseModal}
        editingPurchase={editingPurchase}
        purchaseForm={purchaseForm}
        pendingImageFiles={pendingImageFiles}
        pendingNfFiles={pendingNfFiles}
        pendingComprovanteFiles={pendingComprovanteFiles}
        isAssinatura={Boolean(editingPurchase && isSignaturePurchase(editingPurchase))}
        isDespesa={Boolean(editingPurchase && isDespesaPurchase(editingPurchase))}
        projects={projects}
        setores={setores}
        users={users}
        metodosPago={metodosPago}
        suppliers={suppliers}
        categories={categories}
        formasPagamento={formasPagamento}
        submitting={submitting}
        error={error}
        setPurchaseForm={setPurchaseForm}
        loadMetodosPago={loadMetodosPago}
        handleUpdatePurchase={handleUpdatePurchase}
        onAppendPurchaseImages={handlePurchaseImagesAppend}
        onAppendPurchaseNf={handlePurchaseNfAppend}
        onAppendPurchaseComprovante={handlePurchaseComprovanteAppend}
        onRemovePendingImage={(index) => {
          setPendingImageFiles((prev) => prev.filter((_, i) => i !== index));
        }}
        onRemovePendingNf={(index) => {
          setPendingNfFiles((prev) => prev.filter((_, i) => i !== index));
        }}
        onRemovePendingComprovante={(index) => {
          setPendingComprovanteFiles((prev) => prev.filter((_, i) => i !== index));
        }}
        openCategoryModal={openCategoryModal}
        openSupplierModal={openSupplierModal}
        getSupplierName={getSupplierName}
        updateCotacao={updateCotacao}
        addCotacao={addCotacao}
        removeCotacao={removeCotacao}
        getCotacaoValorUnitario={getCotacaoValorUnitario}
        calculateTotal={calculateTotal}
        onClose={closeEditPurchaseModal}
        assinaturaCompetenciaMes={
          purchaseSubTab === 'assinaturas' && editingPurchase && isSignaturePurchase(editingPurchase)
            ? selectedSignatureMonth
            : null
        }
        onClearPendingAttachment={(field) => {
          if (field === 'imagemUrl') setPendingImageFiles([]);
          if (field === 'nfUrl') setPendingNfFiles([]);
          if (field === 'comprovantePagamentoUrl') setPendingComprovanteFiles([]);
        }}
      />
      <DeletePurchaseModal
        isOpen={showDeletePurchaseModal}
        purchaseToDelete={purchaseToDelete}
        error={error}
        deletingPurchase={deletingPurchase}
        onClose={() => {
          setShowDeletePurchaseModal(false);
          setPurchaseToDelete(null);
          setError(null);
        }}
        onConfirm={handleDeletePurchase}
      />
      <BulkDeletePurchaseModal
        isOpen={showBulkDeletePurchaseModal}
        count={bulkDeletePurchaseIds.length}
        activeTab={activeTab}
        confirmPhrase={BULK_DELETE_CONFIRM_PHRASE}
        confirmInput={bulkDeleteConfirmInput}
        error={error}
        deleting={deletingBulkPurchase}
        isConfirmValid={isBulkDeleteConfirmPhrase(bulkDeleteConfirmInput)}
        onChangeConfirmInput={setBulkDeleteConfirmInput}
        onClose={() => {
          setShowBulkDeletePurchaseModal(false);
          setBulkDeletePurchaseIds([]);
          setBulkDeleteConfirmInput('');
          setError(null);
        }}
        onConfirm={handleBulkDeletePurchasesBatch}
      />
      <BulkApprovePurchaseModal
        isOpen={showBulkApproveModal}
        eligibleCount={bulkApproveEligibleIds.length}
        skipped={bulkApproveSkipped}
        error={error}
        approving={approvingBulkPurchase}
        progressLabel={bulkApproveProgress}
        onClose={() => {
          if (approvingBulkPurchase) return;
          setShowBulkApproveModal(false);
          setBulkApproveEligibleIds([]);
          setBulkApproveSkipped([]);
          setBulkApproveProgress(null);
          setError(null);
        }}
        onConfirm={() => void handleBulkApprovePurchases()}
      />
      <PurchaseStatusModal
        isOpen={showStatusModal}
        purchaseToUpdateStatus={purchaseToUpdateStatus}
        newStatus={newStatus}
        newStatusEntrega={newStatusEntrega}
        newPrevisaoEntrega={newPrevisaoEntrega}
        newDataEntrega={newDataEntrega}
        newEnderecoEntrega={newEnderecoEntrega}
        newRecebidoPor={newRecebidoPor}
        newObservacao={newObservacao}
        error={error}
        submitting={submitting}
        statusEntregaOptions={statusEntregaOptions}
        setNewStatus={setNewStatus}
        setNewStatusEntrega={setNewStatusEntrega}
        setNewPrevisaoEntrega={setNewPrevisaoEntrega}
        setNewDataEntrega={setNewDataEntrega}
        setNewEnderecoEntrega={setNewEnderecoEntrega}
        setNewRecebidoPor={setNewRecebidoPor}
        setNewObservacao={setNewObservacao}
        onClose={closePurchaseStatusModal}
        onConfirm={() => {
          void handleUpdatePurchaseStatus();
        }}
      />
      {showTagStatusConfirmModal && purchaseToUpdateStatus && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-white">Confirmar mudança de status</h2>
                            <button
                              type="button"
                onClick={() => setShowTagStatusConfirmModal(false)}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
                disabled={submitting}
                            >
                ✕
                            </button>
                          </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/80">
                Esta compra possui tag(s):{' '}
                <span className="font-semibold">
                  {(
                    Array.isArray((purchaseToUpdateStatus as any).tagsJson)
                      ? (purchaseToUpdateStatus as any).tagsJson
                      : []
                  )
                    .map((t: any) => String(t?.nome || '').trim())
                    .filter((n: string) => n.length > 0)
                    .join(', ') || 'sem nome'}
                            </span>
                . Ao alterar o status, você pode manter ou remover as tags desta compra. O que deseja fazer?
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTagStatusConfirmModal(false)}
                  className={btn.secondary}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { void handleUpdatePurchaseStatus({ skipTagWarning: true, removeTags: false }); }}
                  className={btn.primarySoft}
                  disabled={submitting}
                >
                  {submitting ? 'Atualizando...' : 'Continuar mantendo tags'}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleUpdatePurchaseStatus({ skipTagWarning: true, removeTags: true }); }}
                  className={btn.primary}
                  disabled={submitting}
                >
                  {submitting ? 'Atualizando...' : 'Continuar e remover tags'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Adicionar tag nas compras</h2>
              <button
                type="button"
                onClick={() => {
                  setShowTagModal(false);
                  setTagNameInput('');
                  setTagColorInput('#3B82F6');
                  setError(null);
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/70">
                Aplicar tag em <strong>{selectedPurchases.length}</strong> compra(s) selecionada(s).
              </p>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Nome da tag</label>
                <input
                  type="text"
                  maxLength={40}
                  value={tagNameInput}
                  onChange={(e) => setTagNameInput(e.target.value)}
                  placeholder="Ex.: Urgente, Prioridade alta..."
                  className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2 text-white"
                />
              </div>
              {purchaseTagCatalog.length > 0 && (
              <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">Tags existentes</label>
                  <div className="flex flex-wrap gap-2">
                    {purchaseTagCatalog.map((tag) => (
                      <button
                        key={tag.nome}
                        type="button"
                        onClick={() => {
                          setTagNameInput(tag.nome);
                          setTagColorInput(tag.cor || '#3B82F6');
                        }}
                        className="text-xs px-2 py-1 rounded border transition-colors"
                        style={{
                          backgroundColor: `${tag.cor || '#3B82F6'}33`,
                          borderColor: `${tag.cor || '#3B82F6'}88`,
                          color: tag.cor || '#93C5FD',
                        }}
                        title="Usar esta tag"
                      >
                        {tag.nome}
                      </button>
                    ))}
                  </div>
              </div>
              )}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Cor da tag</label>
                <input
                  type="color"
                  value={tagColorInput}
                  onChange={(e) => setTagColorInput(e.target.value)}
                  className="h-10 w-20 rounded border border-white/20 bg-transparent p-1 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                  onClick={() => setShowTagModal(false)}
                  className={btn.secondary}
                  disabled={applyingTag}
                  >
                  Cancelar
                  </button>
                  <button
                    type="button"
                  onClick={handleApplyTagToSelectedPurchases}
                  className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={applyingTag}
                  >
                  {applyingTag ? 'Aplicando...' : 'Aplicar tag'}
                  </button>
                </div>
                        </div>
                      </div>
                        </div>
      )}
      {showRemoveTagModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Remover tag nas compras</h2>
                            <button
                              type="button"
                onClick={() => setShowRemoveTagModal(false)}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
                            >
                ✕
                            </button>
                          </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/70">
                Selecione uma tag para remover de <strong>{selectedPurchases.length}</strong> compra(s).
              </p>
              {selectedPurchaseTagCatalog.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedPurchaseTagCatalog.map((tag) => (
                    <button
                      key={tag.nome}
                      type="button"
                      onClick={() => { void handleRemoveTagFromSelectedPurchases(tag.nome); }}
                      className="text-xs px-2 py-1 rounded border transition-colors disabled:opacity-60"
                            style={{
                        backgroundColor: `${tag.cor || '#3B82F6'}33`,
                        borderColor: `${tag.cor || '#3B82F6'}88`,
                        color: tag.cor || '#93C5FD',
                      }}
                      disabled={removingTagBulk}
                      title={`Remover tag ${tag.nome}`}
                    >
                      {removingTagBulk ? 'Removendo...' : `${tag.nome} ×`}
                    </button>
                  ))}
                        </div>
              ) : (
                <div className="text-sm text-white/60">
                  As compras selecionadas não possuem tags para remover.
                          </div>
                        )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRemoveTagModal(false)}
                  className={btn.secondary}
                  disabled={removingTagBulk}
                >
                  Fechar
                </button>
                        </div>
                        </div>
                      </div>
                </div>
              )}
      {showImportSheetModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Importar planilha de compras</h2>
                <button
                  type="button"
                  onClick={() => {
                  setShowImportSheetModal(false);
                  setImportSheetFile(null);
                  setImportSheetProjetoId('');
                  setImportSheetCategoriaId('');
                  setImportSheetSetorId('');
                  setImportSheetOverwrite(false);
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
              >
                ✕
                </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/70">
                Campos obrigatórios nas colunas da planilha: item, link, quantidade, valor unitário,
                desconto, frete e impostos.{' '}
                <span className="text-amber-200/90">
                  A categoria é obrigatória: preencha a coluna «categoria» na planilha{' '}
                  <strong className="font-semibold">ou</strong> escolha uma «Categoria (padrão)» abaixo
                  (se a coluna estiver vazia, o padrão do modal é obrigatório).
                </span>{' '}
                Projeto e setor podem vir na planilha ou pelos padrões abaixo. O solicitante deve ser o
                e-mail cadastrado no sistema.
              </p>
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handleDownloadPurchaseImportTemplate}
                  className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
                >
                  Baixar modelo da planilha
                </button>
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-2">Arquivo (.xlsx)</label>
                <FileDropInput
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onFilesSelected={(files) => setImportSheetFile(files[0] ?? null)}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white"
                />
                {importSheetFile && (
                  <p className="text-xs text-white/60 mt-2">Selecionado: {importSheetFile.name}</p>
                )}
    </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <AppSelect
                  label="Projeto (padrão)"
                  value={importSheetProjetoId === '' ? 'all' : String(importSheetProjetoId)}
                  onChange={(value) => setImportSheetProjetoId(value === 'all' ? '' : Number(value))}
                  options={[
                    { value: 'all', label: 'Sem projeto padrão' },
                    ...projects.map((p) => ({ value: String(p.id), label: p.nome })),
                  ]}
                />
                <AppSelect
                  label="Categoria (padrão)"
                  value={importSheetCategoriaId === '' ? 'all' : String(importSheetCategoriaId)}
                  onChange={(value) => setImportSheetCategoriaId(value === 'all' ? '' : Number(value))}
                  options={[
                    {
                      value: 'all',
                      label: 'Sem padrão (exige coluna categoria na planilha)',
                    },
                    ...categories.map((c) => ({ value: String(c.id), label: c.nome })),
                  ]}
                />
                <AppSelect
                  label="Setor (padrão)"
                  value={importSheetSetorId === '' ? 'all' : String(importSheetSetorId)}
                  onChange={(value) => setImportSheetSetorId(value === 'all' ? '' : Number(value))}
                  options={[
                    { value: 'all', label: 'Sem setor padrão' },
                    ...setores.map((s) => ({ value: String(s.id), label: s.nome })),
                  ]}
                />
                </div>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={importSheetOverwrite}
                  onChange={(e) => setImportSheetOverwrite(e.target.checked)}
                />
                Sobrescrever compras abertas do projeto selecionado (SOLICITADO/PENDENTE/REPROVADO)
              </label>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setShowImportSheetModal(false)}
                  disabled={importingSheet}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={btn.primary}
                  onClick={handleImportPurchaseSheet}
                  disabled={importingSheet}
                >
                  {importingSheet ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showImportEstoqueSheetModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Importar planilha de estoque</h2>
              <button
                type="button"
                onClick={() => {
                  setShowImportEstoqueSheetModal(false);
                  setImportEstoqueSheetFile(null);
                  setImportEstoqueProjetoId('');
                  setImportEstoqueCategoriaId('');
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/70">
                Colunas obrigatórias: <strong className="text-white/90">item</strong> e{' '}
                <strong className="text-white/90">quantidade</strong>.{' '}
                <strong className="text-white/90">Valor unitário</strong> é opcional (se vazio, grava como 0).{' '}
                <span className="text-amber-200/90">
                  A categoria é obrigatória: preencha a coluna «categoria» na planilha{' '}
                  <strong className="font-semibold">ou</strong> escolha «Categoria (padrão)» abaixo.
                </span>{' '}
                Descrição e projeto são opcionais (projeto por nome ou id, como no cadastro).{' '}
                <strong className="text-white/90">Alocações</strong> (opcional): coluna «alocacoes» com
                e-mail (usuário) ou nome do setor igual ao cadastro, quantidade entre parênteses; blocos separados por ; —{' '}
                exemplo: <code className="text-emerald-200/90 text-xs">usuario@exemplo.com (2); TI (4)</code>.
                A soma das quantidades alocadas não pode ser maior que a coluna quantidade.
              </p>
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handleDownloadEstoqueImportTemplate}
                  className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
                >
                  Baixar modelo da planilha
                </button>
              </div>
                  <div>
                <label className="block text-sm text-white/80 mb-2">Arquivo (.xlsx)</label>
                <FileDropInput
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onFilesSelected={(files) => setImportEstoqueSheetFile(files[0] ?? null)}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white"
                />
                {importEstoqueSheetFile && (
                  <p className="text-xs text-white/60 mt-2">Selecionado: {importEstoqueSheetFile.name}</p>
                )}
                  </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <AppSelect
                  label="Projeto (padrão)"
                  value={importEstoqueProjetoId === '' ? 'all' : String(importEstoqueProjetoId)}
                  onChange={(value) => setImportEstoqueProjetoId(value === 'all' ? '' : Number(value))}
                  options={[
                    { value: 'all', label: 'Sem projeto padrão' },
                    ...projects.map((p) => ({ value: String(p.id), label: p.nome })),
                  ]}
                />
                <AppSelect
                  label="Categoria (padrão)"
                  value={importEstoqueCategoriaId === '' ? 'all' : String(importEstoqueCategoriaId)}
                  onChange={(value) => setImportEstoqueCategoriaId(value === 'all' ? '' : Number(value))}
                  options={[
                    {
                      value: 'all',
                      label: 'Sem padrão (exige coluna categoria na planilha)',
                    },
                    ...categories.map((c) => ({ value: String(c.id), label: c.nome })),
                  ]}
                    />
                  </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setShowImportEstoqueSheetModal(false)}
                  disabled={importingEstoqueSheet}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={btn.primary}
                  onClick={handleImportEstoqueSheet}
                  disabled={importingEstoqueSheet}
                >
                  {importingEstoqueSheet ? 'Importando...' : 'Importar'}
                </button>
                </div>
              </div>
          </div>
                </div>
              )}
      {showImportSheetFeedbackModal && importSheetFeedback && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div
            className={`bg-neutral rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border ${
              importSheetFeedback.variant === 'error' ? 'border-red-500/50' : 'border-amber-500/40'
            }`}
          >
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-white">{importSheetFeedback.title}</h2>
                <button
                  type="button"
                  onClick={() => {
                  setShowImportSheetFeedbackModal(false);
                  setImportSheetFeedback(null);
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
                aria-label="Fechar"
              >
                ✕
                </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 min-h-0">
              <pre className="text-sm text-white/90 whitespace-pre-wrap font-sans break-words">
                {importSheetFeedback.text}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                className={btn.secondary}
                onClick={downloadImportSheetFeedbackLog}
              >
                {importSheetFeedback.variant === 'error'
                  ? 'Baixar log de erro (.txt)'
                  : 'Baixar log de avisos (.txt)'}
              </button>
              <button
                type="button"
                className={btn.primary}
                onClick={() => {
                  setShowImportSheetFeedbackModal(false);
                  setImportSheetFeedback(null);
                }}
              >
                Fechar
                </button>
            </div>
          </div>
        </div>
      )}
      {showBatchAcaminhoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-neutral border-b border-white/20 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-white">Compra em lote</h2>
              <button
                type="button"
                onClick={() => {
                  setShowBatchAcaminhoModal(false);
                  setError(null);
                  setPendingBatchNfFiles([]);
                  setPendingBatchComprovanteFiles([]);
                  setBatchAcaminhoForm({
                    formaPagamento: '',
                    dataCompra: '',
                    previsaoEntrega: '',
                    statusEntrega: 'NAO_ENTREGUE',
                    enderecoEntrega: '',
                    observacao: '',
                    descontoTipo: 'valor',
                    descontoValor: 0,
                    freteLote: 0,
                  });
                }}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="rounded-lg border border-white/20 bg-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                  <h3 className="text-sm font-semibold text-white">Resumo do lote</h3>
                  <p className="text-xs text-white/70 mt-0.5">
                    {selectedPurchasesPendente.length} compra(s) pendente(s) → status <strong>A Caminho</strong>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/80 border-b border-white/20 bg-white/10">
                        <th className="px-4 py-2.5 font-medium">Item</th>
                        <th className="px-4 py-2.5 font-medium w-20 text-center">Qtd</th>
                        <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPurchasesPendente.map((p, idx) => (
                        <tr
                          key={p.id}
                          className={`border-b border-white/10 ${idx % 2 === 0 ? 'bg-white/[0.06]' : 'bg-white/[0.02]'}`}
                        >
                          <td
                            className="px-4 py-2.5 text-white max-w-xs truncate"
                            title={p.item || p.descricao || 'Item'}
                          >
                            {truncateDisplayText(p.item || p.descricao || 'Item', LIST_ITEM_NAME_MAX_LEN)}
                          </td>
                          <td className="px-4 py-2.5 text-center text-white">{p.quantidade || 1}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-white">
                            R$ {getPurchaseTotal(p).toFixed(2).replace('.', ',')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const totalBruto = selectedPurchasesPendente.reduce((s, p) => s + getPurchaseTotal(p), 0);
                  const desc = batchAcaminhoForm.descontoTipo === 'porcentagem'
                    ? totalBruto * (batchAcaminhoForm.descontoValor || 0) / 100
                    : (batchAcaminhoForm.descontoValor || 0);
                  const frete = batchAcaminhoForm.freteLote || 0;
                  const totalFinal = Math.max(0, totalBruto - desc + frete);
                  return (
                    <div className="px-4 py-4 border-t border-white/10 bg-white/5 space-y-3">
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <div>
                          <span className="text-xs text-white/60">Total bruto</span>
                          <p className="text-base font-semibold text-white">R$ {totalBruto.toFixed(2).replace('.', ',')}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-white/60">Desconto</span>
                          <label className="flex items-center gap-1.5 text-sm text-white/90 cursor-pointer">
                            <input
                              type="radio"
                              name="batchDescontoTipo"
                              checked={batchAcaminhoForm.descontoTipo === 'valor'}
                              onChange={() => setBatchAcaminhoForm((f) => ({ ...f, descontoTipo: 'valor' }))}
                              className="rounded"
                            />
                            R$
                          </label>
                          <label className="flex items-center gap-1.5 text-sm text-white/90 cursor-pointer">
                            <input
                              type="radio"
                              name="batchDescontoTipo"
                              checked={batchAcaminhoForm.descontoTipo === 'porcentagem'}
                              onChange={() => setBatchAcaminhoForm((f) => ({ ...f, descontoTipo: 'porcentagem' }))}
                              className="rounded"
                            />
                            %
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={batchAcaminhoForm.descontoTipo === 'porcentagem' ? 0.1 : 0.01}
                            value={batchAcaminhoForm.descontoValor || ''}
                            onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, descontoValor: Number(e.target.value) || 0 }))}
                            className="w-28 bg-white/10 border border-white/30 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-white/60">Frete (lote total)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={batchAcaminhoForm.freteLote || ''}
                            onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, freteLote: Number(e.target.value) || 0 }))}
                            className="w-28 bg-white/10 border border-white/30 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                            title="Valor repartido igualmente entre as compras do lote (somado ao frete por unidade de cada item)"
                          />
                          <span className="text-[10px] text-white/45 max-w-[14rem] leading-tight">
                            Repartido entre {selectedPurchasesPendente.length} item(ns) na confirmação
                          </span>
                        </div>
                        <div className="ml-auto">
                          <span className="text-xs text-white/60 block">Total (bruto − desconto + frete)</span>
                          <p className="text-xl font-bold text-primary">R$ {totalFinal.toFixed(2).replace('.', ',')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-3 pb-2 border-b border-white/10">Dados da compra</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1.5">Forma de pagamento</label>
                    <select
                      value={batchAcaminhoForm.formaPagamento}
                      onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, formaPagamento: e.target.value }))}
                      className="w-full bg-neutral border border-white/25 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary [&>option]:bg-neutral [&>option]:text-white"
                    >
                      <option value="">Selecione</option>
                      {formasPagamento.map((fp) => (
                        <option key={fp} value={fp}>{fp}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1.5">NF (imagem ou PDF)</label>
                    <FileDropInput
                      accept="image/*,.pdf"
                      multiple
                      onFilesSelected={(files) => {
                        if (files.length === 0) return;
                        const ok: File[] = [];
                        for (const f of files) {
                          const validTypes = ['image/', 'application/pdf'];
                          const isValid = validTypes.some((t) => f.type.startsWith(t) || f.type === t);
                          if (!isValid) {
                            setError('Tipo de arquivo não permitido. Aceitos: imagem ou PDF.');
                            return;
                          }
                          if (f.size > UPLOAD_LIMITS.generic.maxBytes) {
                            setError(
                              `Arquivo muito grande (${formatMb(f.size)}). Máximo: ${UPLOAD_LIMITS.generic.maxMb} MB.`,
                            );
                            return;
                          }
                          ok.push(f);
                        }
                        setError(null);
                        setPendingBatchNfFiles((prev) => [...prev, ...ok]);
                      }}
                      className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2 text-sm text-white/90 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white"
                      dropMessage="Solte uma ou mais NFs aqui"
                    />
                    {pendingBatchNfFiles.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {pendingBatchNfFiles.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-white/70">
                            <span className="truncate flex-1">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setPendingBatchNfFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="shrink-0 text-red-400 hover:text-red-300"
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1.5">Comprovante de pagamento (opcional)</label>
                    <FileDropInput
                      accept="image/*,.pdf"
                      multiple
                      onFilesSelected={(files) => {
                        if (files.length === 0) return;
                        const ok: File[] = [];
                        for (const f of files) {
                          const validTypes = ['image/', 'application/pdf'];
                          const isValid = validTypes.some((t) => f.type.startsWith(t) || f.type === t);
                          if (!isValid) {
                            setError('Tipo de arquivo não permitido. Aceitos: imagem ou PDF.');
                            return;
                          }
                          if (f.size > UPLOAD_LIMITS.generic.maxBytes) {
                            setError(
                              `Arquivo muito grande (${formatMb(f.size)}). Máximo: ${UPLOAD_LIMITS.generic.maxMb} MB.`,
                            );
                            return;
                          }
                          ok.push(f);
                        }
                        setError(null);
                        setPendingBatchComprovanteFiles((prev) => [...prev, ...ok]);
                      }}
                      className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2 text-sm text-white/90 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white"
                      dropMessage="Solte um ou mais comprovantes aqui"
                    />
                    {pendingBatchComprovanteFiles.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {pendingBatchComprovanteFiles.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-white/70">
                            <span className="truncate flex-1">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => setPendingBatchComprovanteFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="shrink-0 text-red-400 hover:text-red-300"
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/90 mb-1.5">Data da compra</label>
                      <input
                        type="date"
                        value={batchAcaminhoForm.dataCompra}
                        onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, dataCompra: e.target.value }))}
                        className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/90 mb-1.5">Previsão de entrega</label>
                      <input
                        type="date"
                        value={batchAcaminhoForm.previsaoEntrega}
                        onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, previsaoEntrega: e.target.value }))}
                        className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1.5">Status de entrega</label>
                    <select
                      value={batchAcaminhoForm.statusEntrega}
                      onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, statusEntrega: e.target.value }))}
                      className="w-full bg-neutral border border-white/25 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary [&>option]:bg-neutral [&>option]:text-white"
                    >
                      {statusEntregaOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1.5">Endereço de entrega</label>
                    <input
                      type="text"
                      value={batchAcaminhoForm.enderecoEntrega}
                      onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, enderecoEntrega: e.target.value }))}
                      placeholder="Opcional"
                      className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/90 mb-1.5">Observação</label>
                    <textarea
                      value={batchAcaminhoForm.observacao}
                      onChange={(e) => setBatchAcaminhoForm((f) => ({ ...f, observacao: e.target.value }))}
                      placeholder="Opcional"
                      rows={2}
                      className="w-full bg-white/10 border border-white/30 rounded-md px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                </div>
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-2 rounded-md text-sm">
                  {error}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowBatchAcaminhoModal(false);
                    setError(null);
                    setPendingBatchNfFiles([]);
                    setPendingBatchComprovanteFiles([]);
                    setBatchAcaminhoForm({
                      formaPagamento: '',
                      dataCompra: '',
                      previsaoEntrega: '',
                      statusEntrega: 'NAO_ENTREGUE',
                      enderecoEntrega: '',
                      observacao: '',
                      descontoTipo: 'valor',
                      descontoValor: 0,
                      freteLote: 0,
                    });
                  }}
                  className="px-4 py-2.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold text-sm"
                  disabled={batchAcaminhoSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { void handleBatchAcaminhoSubmit(); }}
                  className="px-5 py-2.5 rounded-md bg-primary hover:opacity-90 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={batchAcaminhoSubmitting}
                >
                  {batchAcaminhoSubmitting ? 'Enviando...' : 'Confirmar compra em lote'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showBatchTagWarningModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-white">Confirmar compra em lote</h2>
                      <button
                        type="button"
                onClick={() => setShowBatchTagWarningModal(false)}
                className="text-white/50 hover:text-white transition-colors text-2xl leading-none p-1"
                disabled={batchAcaminhoSubmitting}
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/80">
                Existem compras com tag(s) na seleção. Ao enviar para{' '}
                <strong>A Caminho</strong>, você pode manter ou remover as tags das compras alteradas. O que deseja fazer?
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  new Set(
                    selectedPurchasesPendente.flatMap((p) =>
                      Array.isArray((p as any).tagsJson)
                        ? (p as any).tagsJson
                            .map((t: any) => String(t?.nome || '').trim())
                            .filter((n: string) => n.length > 0)
                        : [],
                    ),
                  ),
                )
                  .slice(0, 12)
                  .map((nome) => (
                    <span key={nome} className="text-xs px-2 py-1 rounded border border-white/20 bg-white/10 text-white/80">
                      {nome}
                  </span>
                    ))}
                  </div>
              <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2">
                            <button
                              type="button"
                  onClick={() => setShowBatchTagWarningModal(false)}
                  className={btn.secondary}
                  disabled={batchAcaminhoSubmitting}
                >
                  Cancelar
                            </button>
                              <button
                                type="button"
                  onClick={() => { void handleBatchAcaminhoSubmit({ skipTagWarning: true, removeTags: false }); }}
                  className={btn.primarySoft}
                  disabled={batchAcaminhoSubmitting}
                >
                  {batchAcaminhoSubmitting ? 'Enviando...' : 'Continuar mantendo tags'}
                              </button>
                              <button
                                type="button"
                  onClick={() => { void handleBatchAcaminhoSubmit({ skipTagWarning: true, removeTags: true }); }}
                  className={btn.primary}
                  disabled={batchAcaminhoSubmitting}
                >
                  {batchAcaminhoSubmitting ? 'Enviando...' : 'Continuar e remover tags'}
                              </button>
                        </div>
                          </div>
                          </div>
                          </div>
                        )}
      <PurchaseReportModal
        isOpen={showReportModal}
        reportMode={purchaseReportMode}
        includeSignaturesInReport={includeSignaturesInReport}
        selectedPurchases={selectedPurchases}
        purchases={purchases}
        signatureReportMonth={signatureReportMonthInModal}
        onChangeSignatureReportMonth={setSignatureReportMonthInModal}
        signatureReportLoading={signatureReportLoading}
        onToggleIncludeSignatures={setIncludeSignaturesInReport}
        onClose={() => {
          setShowReportModal(false);
          setPurchaseReportMode('selection');
          setCachedSignatureReportPurchases([]);
        }}
        onCloseAndClearSelection={() => {
          setShowReportModal(false);
          setPurchaseReportMode('selection');
          setSelectedPurchases([]);
        }}
        calculateReportTotals={calculateReportTotals}
        getStatusLabel={getStatusLabel}
        getStatusColor={getStatusColor}
        getCategoryName={getCategoryName}
        buildWorkbook={buildPurchasesWorkbook}
        onExportPdf={handleExportPurchasesPdf}
      />
      <ViewRequestModal
        isOpen={showViewRequestModal}
        purchaseToView={purchaseToView}
        isReviseApprovalModal={isReviseApprovalModal}
        isSolicitacaoComCotacoes={isSolicitacaoComCotacoes}
        approveWithChangesMode={approveWithChangesMode}
        approveCotacoes={approveCotacoes}
        selectedCotacaoIndex={selectedCotacaoIndex}
        approveQuantity={approveQuantity}
        reducedQuantityAction={reducedQuantityAction}
        error={error}
        submitting={submitting}
        suppliers={suppliers}
        formasPagamento={formasPagamento}
        categories={categories}
        approveCategoriaId={approveCategoriaId}
        onClose={closeViewRequestModal}
        setApproveWithChangesMode={setApproveWithChangesMode}
        setApproveCotacoes={setApproveCotacoes}
        setSelectedCotacaoIndex={setSelectedCotacaoIndex}
        setApproveQuantity={setApproveQuantity}
        setReducedQuantityAction={setReducedQuantityAction}
        setApproveCategoriaId={setApproveCategoriaId}
        setCurrentCotacaoIndex={setCurrentCotacaoIndex}
        openSupplierModal={openSupplierModal}
        getStatusColor={getStatusColor}
        getStatusLabel={getStatusLabel}
        getStatusEntregaColor={getStatusEntregaColor}
        getStatusEntregaLabel={getStatusEntregaLabel}
        getSupplierName={getSupplierName}
        getCotacaoValorUnitario={getCotacaoValorUnitario}
        normalizeCotacaoForForm={normalizeCotacaoForForm}
        onReviseApproval={() => {
          void handleReviseApproval();
        }}
        onApprove={() => {
          void handleApproveRequest();
        }}
        onOpenReject={() => {
                    setShowViewRequestModal(false);
                    setPurchaseToReject(purchaseToView);
                    setRejectReason('');
                    setShowRejectModal(true);
                  }}
      />
      <RejectRequestModal
        isOpen={showRejectModal}
        purchaseToReject={purchaseToReject}
        rejectReason={rejectReason}
        error={error}
        submitting={submitting}
        onChangeReason={setRejectReason}
        onClose={() => {
                    setShowRejectModal(false);
                    setPurchaseToReject(null);
                    setRejectReason('');
                    setError(null);
                  }}
        onConfirm={() => {
          void handleRejectRequestConfirm();
        }}
      />
      <SupplierModal
        isOpen={showSupplierModal}
        onClose={() => {
          setShowSupplierModal(false);
          setCurrentCotacaoIndex(null);
        }}
        onSupplierCreated={handleSupplierCreated}
      />
      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setCategoryModalAssinaturaDefault(false);
        }}
        onCategoryCreated={handleCategoryCreated}
        defaultIsAssinatura={categoryModalAssinaturaDefault}
      />
      <ItemDetailsModal
        isOpen={showItemDetailsModal}
        item={itemToView}
        onClose={() => {
                  setShowItemDetailsModal(false);
                  setItemToView(null);
                }}
        getCategoryName={getCategoryName}
        getSupplierName={getSupplierName}
        getCotacaoValorUnitario={getCotacaoValorUnitario}
      />
      <PurchaseDetailsModal
        isOpen={showPurchaseDetailsModal}
        purchase={purchaseToViewDetails}
        onClose={() => {
                  setShowPurchaseDetailsModal(false);
                  setPurchaseToViewDetails(null);
                }}
        getStatusColor={getStatusColor}
        getStatusLabel={getStatusLabel}
        getStatusEntregaColor={getStatusEntregaColor}
        getStatusEntregaLabel={getStatusEntregaLabel}
        getCategoryName={getCategoryName}
        getSupplierName={getSupplierName}
        getCotacaoValorUnitario={getCotacaoValorUnitario}
        pagoPorResumo={
          purchaseToViewDetails
            ? formatPagoPorSummary(normalizePagoPorFromApi(purchaseToViewDetails.pagoPorJson))
            : ''
        }
      />
    </div>
  );
}
