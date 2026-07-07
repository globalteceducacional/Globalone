import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { Category, Projeto, Supplier } from '../types/stock';
import { btn } from '../utils/buttonStyles';
import { formatApiError, toast } from '../utils/toast';
import { ExcelDownloadButton } from '../components/ExcelDownloadButton';
import { FileDropInput } from '../components/FileDropInput';
import { UploadFileLink } from '../components/files/UploadFileLink';
import { buildCuradoriaTemplateWorkbook } from '../utils/curadoriaExcelTemplate';
import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppModal } from '../components/ui/AppModal';
import { AppSelect } from '../components/ui/AppSelect';
import { ConfirmDeleteByNameModal } from '../components/ui/ConfirmDeleteByNameModal';
import { namesMatchForDeleteConfirm } from '../utils/deleteNameConfirm';
import { userHasPermission } from '../utils/projectAccess';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';

interface CuradoriaBudget {
  id: number;
  nome: string;
  projetoId?: number | null;
  setorId?: number | null;
  fornecedorId?: number | null;
  observacao?: string | null;
  status?: 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO';
  nfUrl?: string | null;
  formaPagamento?: string | null;
  arquivoOrcamentoUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  projeto?: { id: number; nome: string } | null;
  setor?: { id: number; nome: string } | null;
  fornecedor?: { id: number; nomeFantasia: string; razaoSocial: string; cnpj: string } | null;
  descontoAplicadoEm?: 'ITEM' | 'TOTAL';
  descontoTotal?: number;
  totalItens: number;
  totalQuantidade: number;
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  dataCriacao: string;
}

interface CuradoriaStockItem {
  isbn: string;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidadeTotal: number;
  /** Unidades reservadas no almoxarifado (galpão). */
  quantidadeAlocada: number;
  /** Estoque físico na curadoria menos alocado (para movimentação no galpão). */
  quantidadeDisponivel: number;
  /** Soma histórica de unidades avariadas (almoxarifado). */
  quantidadeAvariadaTotal: number;
  valorMedio: number;
  valorTotal: number;
   descontoMedio: number;
  autor?: string | null;
  editora?: string | null;
  anoPublicacao?: string | null;
}

interface CuradoriaLivroAvariaLinha {
  id: number;
  quantidade: number;
  justificativa: string;
  dataCriacao: string;
  galpaoProduto?: { id: number; nome: string } | null;
  projeto?: { id: number; nome: string } | null;
  fornecedor?: { id: number; nomeFantasia: string; razaoSocial: string } | null;
}

type CuradoriaStockSortColumn =
  | 'isbn'
  | 'nome'
  | 'categoria'
  | 'autor'
  | 'quantidadeTotal'
  | 'quantidadeAlocada'
  | 'quantidadeDisponivel'
  | 'quantidadeAvariadaTotal'
  | 'valorTotal';

type CuradoriaBudgetSortColumn =
  | 'nome'
  | 'status'
  | 'projeto'
  | 'fornecedor'
  | 'totalItens'
  | 'totalQuantidade'
  | 'totalLiquido'
  | 'dataCriacao';

interface CuradoriaStockQuote {
  itemId: number;
  orcamentoId: number;
  orcamentoNome: string;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  dataCriacao: string;
  projetoId: number | null;
  projetoNome: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidade: number;
  valor: number;
  desconto: number;
  valorLiquido: number;
}

interface CuradoriaItemForm {
  nome: string;
  isbn: string;
  categoriaId?: number;
  quantidade?: number;
  valor?: number;
  desconto?: number;
  autor?: string;
  editora?: string;
  anoPublicacao?: string;
  fornecedorId?: number;
}

interface CuradoriaStockQuoteForm {
  itemId?: number;
  orcamentoId?: number;
  categoriaId?: number;
  quantidade?: number;
  valor?: number;
  desconto?: number;
  descontoTipo: 'VALOR' | 'PERCENTUAL';
  fornecedorId?: number;
}

interface CuradoriaStockItemPayload {
  nome: string;
  isbn: string;
  categoriaId: number;
  quantidade: number;
  valor: number;
  desconto: number;
  autor?: string;
  editora?: string;
  anoPublicacao?: string;
}

interface CuradoriaCreateForm {
  nome: string;
  projetoId?: number;
  setorId?: number;
  fornecedorId?: number;
  nfUrl: string;
  formaPagamento: string;
  status: 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO';
  arquivoOrcamentoUrl: string;
  comprovantePagamentoUrl: string;
  observacao: string;
  descontoAplicadoEm: 'ITEM' | 'TOTAL';
  descontoTotal: number;
  itens: CuradoriaItemForm[];
}

interface CuradoriaEditForm {
  nome: string;
  projetoId?: number;
  setorId?: number;
  fornecedorId?: number;
  nfUrl: string;
  formaPagamento: string;
  status: 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO';
  arquivoOrcamentoUrl: string;
  comprovantePagamentoUrl: string;
  observacao: string;
  descontoAplicadoEm: 'ITEM' | 'TOTAL';
  descontoTotal: number;
}

interface SimpleSetor {
  id: number;
  nome: string;
}

type TotalDiscountInputType = 'VALOR' | 'PERCENTUAL';

const CURADORIA_STATUS_OPTIONS: Array<{
  value: 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO';
  label: string;
}> = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'COMPRADO_ACAMINHO', label: 'Comprado / A caminho' },
  { value: 'ENTREGUE', label: 'Entregue' },
  { value: 'SOLICITADO', label: 'Solicitado' },
  { value: 'REPROVADO', label: 'Reprovado' },
];

interface IsbnBookData {
  isbn: string;
  titulo: string | null;
  autores: string[];
  editora: string | null;
  anoPublicacao: string | null;
  categorias: string[];
}

interface CuradoriaImportResult {
  id: number;
  nome: string;
  totalItens: number;
  imported: number;
  skipped: number;
  missingTitleIsbns?: string[];
  message?: string;
}

const createEmptyItem = (): CuradoriaItemForm => ({
  nome: '',
  isbn: '',
  categoriaId: undefined,
  quantidade: 1,
  valor: undefined,
  desconto: undefined,
  autor: '',
  editora: '',
  anoPublicacao: '',
});

const createEmptyStockQuote = (): CuradoriaStockQuoteForm => ({
  categoriaId: undefined,
  quantidade: 1,
  valor: 0,
  desconto: 0,
  descontoTipo: 'VALOR',
  fornecedorId: undefined,
});

export default function Curadoria() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<CuradoriaBudget[]>([]);
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [setores, setSetores] = useState<SimpleSetor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [activeTab, setActiveTab] = useState<'orcamentos' | 'estoque'>('orcamentos');
  const [stockItems, setStockItems] = useState<CuradoriaStockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockLoaded, setStockLoaded] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategoryId, setStockCategoryId] = useState<number | 'all'>('all');
  const [stockSortKey, setStockSortKey] = useState<CuradoriaStockSortColumn>('nome');
  const [stockSortDir, setStockSortDir] = useState<'asc' | 'desc'>('asc');
  const [showEstoqueFilters, setShowEstoqueFilters] = useState(false);
  const [selectedStockItemKeys, setSelectedStockItemKeys] = useState<string[]>([]);
  const [showStockReportModal, setShowStockReportModal] = useState(false);

  const [budgetStatusFilter, setBudgetStatusFilter] = useState<
    '' | 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO'
  >('');
  const [budgetProjectFilter, setBudgetProjectFilter] = useState<number | 'all'>('all');
  const [budgetSetorFilter, setBudgetSetorFilter] = useState<number | 'all'>('all');
  const [budgetSupplierFilter, setBudgetSupplierFilter] = useState<number | 'all'>('all');
  const [showOrcamentosFilters, setShowOrcamentosFilters] = useState(false);
  const { sortColumn: budgetSortCol, sortDirection: budgetSortDir, handleSort: handleBudgetSort } =
    useClientTableSort<CuradoriaBudgetSortColumn>('nome');

  const [showStockItemModal, setShowStockItemModal] = useState(false);
  const [stockItemForm, setStockItemForm] = useState<CuradoriaItemForm>(createEmptyItem());
  const [stockItemSaving, setStockItemSaving] = useState(false);
  const [stockIsbnLoading, setStockIsbnLoading] = useState(false);
  const [stockItemMode, setStockItemMode] = useState<'add' | 'edit'>('add');
  const [stockQuotesForm, setStockQuotesForm] = useState<CuradoriaStockQuoteForm[]>([createEmptyStockQuote()]);
  const [originalStockQuoteRefs, setOriginalStockQuoteRefs] = useState<Array<{ itemId: number; orcamentoId: number }>>([]);
  const [showStockQuotesModal, setShowStockQuotesModal] = useState(false);
  const [stockQuotesLoading, setStockQuotesLoading] = useState(false);
  const [stockQuotes, setStockQuotes] = useState<CuradoriaStockQuote[]>([]);
  const [stockQuotesItem, setStockQuotesItem] = useState<CuradoriaStockItem | null>(null);

  const [showStockLivroAvariasModal, setShowStockLivroAvariasModal] = useState(false);
  const [stockLivroAvariasItem, setStockLivroAvariasItem] = useState<CuradoriaStockItem | null>(null);
  const [stockLivroAvariasLoading, setStockLivroAvariasLoading] = useState(false);
  const [stockLivroAvariasLinhas, setStockLivroAvariasLinhas] = useState<CuradoriaLivroAvariaLinha[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<CuradoriaBudget | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteBudgetAlsoStock, setDeleteBudgetAlsoStock] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [editingBudgetTotalBruto, setEditingBudgetTotalBruto] = useState(0);
  const [editingBudgetSaving, setEditingBudgetSaving] = useState(false);
  const [isbnLoadingByIndex, setIsbnLoadingByIndex] = useState<Record<number, boolean>>({});

  const [showStockDeleteModal, setShowStockDeleteModal] = useState(false);
  const [stockItemToDelete, setStockItemToDelete] = useState<CuradoriaStockItem | null>(null);
  const [stockDeleting, setStockDeleting] = useState(false);

  const [createForm, setCreateForm] = useState<CuradoriaCreateForm>({
    nome: '',
    projetoId: undefined,
    setorId: undefined,
    fornecedorId: undefined,
    nfUrl: '',
    formaPagamento: '',
    status: 'PENDENTE',
    arquivoOrcamentoUrl: '',
    comprovantePagamentoUrl: '',
    observacao: '',
    descontoAplicadoEm: 'ITEM',
    descontoTotal: 0,
    itens: [createEmptyItem()],
  });

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importName, setImportName] = useState('');
  const [importProjectId, setImportProjectId] = useState<number | undefined>(undefined);
  const [importCategoryId, setImportCategoryId] = useState<number | undefined>(undefined);
  const [importSupplierId, setImportSupplierId] = useState<number | undefined>(undefined);
  const [overwriteCurrent, setOverwriteCurrent] = useState(true);
  const [importDiscountMode, setImportDiscountMode] = useState<'ITEM' | 'TOTAL'>('ITEM');
  const [importDiscountTotal, setImportDiscountTotal] = useState(0);
  const [createDiscountTotalType, setCreateDiscountTotalType] = useState<TotalDiscountInputType>('VALOR');
  const [editDiscountTotalType, setEditDiscountTotalType] = useState<TotalDiscountInputType>('VALOR');
  const [importDiscountTotalType, setImportDiscountTotalType] = useState<TotalDiscountInputType>('VALOR');
  const [importEstimatedTotalBruto, setImportEstimatedTotalBruto] = useState(0);
  const [importEstimatedBooks, setImportEstimatedBooks] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const importProgressStartedAtRef = useRef<number | null>(null);
  const [editForm, setEditForm] = useState<CuradoriaEditForm>({
    nome: '',
    projetoId: undefined,
    setorId: undefined,
    fornecedorId: undefined,
    nfUrl: '',
    formaPagamento: '',
    status: 'PENDENTE',
    arquivoOrcamentoUrl: '',
    comprovantePagamentoUrl: '',
    observacao: '',
    descontoAplicadoEm: 'ITEM',
    descontoTotal: 0,
  });

  const permissionKeys = useMemo(() => {
    if (!user || !user.cargo || typeof user.cargo === 'string') {
      return new Set<string>();
    }
    const permissions = Array.isArray(user.cargo.permissions) ? user.cargo.permissions : [];
    return new Set<string>(
      permissions.map((permission) => permission.chave ?? `${permission.modulo}:${permission.acao}`),
    );
  }, [user]);

  const canEdit =
    permissionKeys.has('sistema:administrar') ||
    permissionKeys.has('curadoria:criar') ||
    permissionKeys.has('curadoria:editar') ||
    permissionKeys.has('curadoria:gerenciar') ||
    permissionKeys.has('compras:solicitar') ||
    permissionKeys.has('compras:aprovar');
  const canView =
    canEdit ||
    permissionKeys.has('curadoria:visualizar') ||
    permissionKeys.has('compras:visualizar') ||
    permissionKeys.has('trabalhos:visualizar');
  const fieldClass =
    'w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';
  const fileFieldClass =
    'w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30';
  const labelClass = 'block text-sm font-medium text-white/90 mb-2';

  async function loadData() {
    if (!canView) {
      setError('Seu perfil não possui acesso à Curadoria.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [budgetsRes, projectsRes, setoresRes, categoriesRes, suppliersRes] = await Promise.all([
        api.get<CuradoriaBudget[]>('/curadoria/orcamentos'),
        api.get<Projeto[]>('/projects/options'),
        api.get<SimpleSetor[]>('/setores/options').catch(() => ({ data: [] as SimpleSetor[] })),
        api.get<Category[]>('/categories/all?tipo=LIVRO').catch(() => ({ data: [] as Category[] })),
        api.get<Supplier[]>('/suppliers').catch(() => ({ data: [] as Supplier[] })),
      ]);
      setBudgets(Array.isArray(budgetsRes.data) ? budgetsRes.data : []);
      setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
      setSetores(Array.isArray(setoresRes.data) ? setoresRes.data : []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
      setSuppliers(Array.isArray(suppliersRes.data) ? suppliersRes.data : []);
    } catch (err: any) {
      const message = formatApiError(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canView]);

  async function loadStock() {
    if (!canView) {
      return;
    }
    try {
      setStockLoading(true);
      const { data } = await api.get<CuradoriaStockItem[]>('/curadoria/estoque', {
        params: { _ts: Date.now() },
      });
      const items = Array.isArray(data) ? data : [];
      setStockItems(items);
      const currentKeys = new Set(items.map((item) => getStockItemKey(item)));
      setSelectedStockItemKeys((prev) => prev.filter((key) => currentKeys.has(key)));
      setStockLoaded(true);
    } catch (err: any) {
      const message = formatApiError(err);
      toast.error(message);
    } finally {
      setStockLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'estoque' && canView && !stockLoaded && !stockLoading) {
      void loadStock();
    }
  }, [activeTab, canView, stockLoaded, stockLoading]);

  useEffect(() => {
    if (!importing) {
      importProgressStartedAtRef.current = null;
      setImportProgress(0);
      return;
    }

    importProgressStartedAtRef.current = Date.now();
    setImportProgress((current) => (current > 0 && current < 95 ? current : 8));

    const estimatedMs = Math.max(8000, Math.min(90000, Math.max(1, importEstimatedBooks) * 900));
    const intervalId = window.setInterval(() => {
      const startedAt = importProgressStartedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      const progressByTime = Math.min(95, Math.floor((elapsedMs / estimatedMs) * 100));
      const nextProgress = Math.max(8, progressByTime);
      setImportProgress((current) => (nextProgress > current ? nextProgress : current));
    }, 300);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [importing, importEstimatedBooks]);

  const filteredBudgets = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = budgets.filter((budget) => {
      const matchesSearch =
        !term ||
        budget.nome.toLowerCase().includes(term) ||
        budget.observacao?.toLowerCase().includes(term) ||
        budget.projeto?.nome?.toLowerCase().includes(term) ||
        budget.fornecedor?.nomeFantasia?.toLowerCase().includes(term) ||
        budget.fornecedor?.razaoSocial?.toLowerCase().includes(term);

      const matchesStatus = !budgetStatusFilter || (budget.status ?? 'PENDENTE') === budgetStatusFilter;
      const matchesProject =
        budgetProjectFilter === 'all' ||
        (budget.projetoId != null && budget.projetoId === budgetProjectFilter);

      const matchesSetor =
        budgetSetorFilter === 'all' ||
        (budget.setorId != null && budget.setorId === budgetSetorFilter);
      const matchesSupplier =
        budgetSupplierFilter === 'all' ||
        (budget.fornecedorId != null && budget.fornecedorId === budgetSupplierFilter);

      return matchesSearch && matchesStatus && matchesProject && matchesSetor && matchesSupplier;
    });
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (budgetSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'status':
          cmp = (a.status ?? 'PENDENTE').localeCompare(b.status ?? 'PENDENTE');
          break;
        case 'projeto':
          cmp = (a.projeto?.nome ?? '').localeCompare(b.projeto?.nome ?? '');
          break;
        case 'fornecedor':
          cmp = (a.fornecedor?.nomeFantasia ?? a.fornecedor?.razaoSocial ?? '').localeCompare(
            b.fornecedor?.nomeFantasia ?? b.fornecedor?.razaoSocial ?? '',
          );
          break;
        case 'totalItens':
          cmp = a.totalItens - b.totalItens;
          break;
        case 'totalQuantidade':
          cmp = a.totalQuantidade - b.totalQuantidade;
          break;
        case 'totalLiquido':
          cmp = a.totalLiquido - b.totalLiquido;
          break;
        case 'dataCriacao':
          cmp = new Date(a.dataCriacao).getTime() - new Date(b.dataCriacao).getTime();
          break;
        default:
          cmp = 0;
      }
      return budgetSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [
    budgets,
    search,
    budgetStatusFilter,
    budgetProjectFilter,
    budgetSetorFilter,
    budgetSupplierFilter,
    budgetSortCol,
    budgetSortDir,
  ]);

  const filteredStockItems = useMemo(() => {
    const term = stockSearch.trim().toLowerCase();
    let data = stockItems.filter((item) => {
      const inNome = item.nome.toLowerCase().includes(term);
      const inIsbn = item.isbn.toLowerCase().includes(term);
      const inCategoria = (item.categoriaNome ?? '').toLowerCase().includes(term);
      const inAutor = (item.autor ?? '').toLowerCase().includes(term);
      const inEditora = (item.editora ?? '').toLowerCase().includes(term);
      return inNome || inIsbn || inCategoria || inAutor || inEditora;
    });

    if (stockCategoryId !== 'all') {
      data = data.filter((item) => item.categoriaId === stockCategoryId);
    }

    const sorted = [...data].sort((a, b) => {
      let cmp = 0;
      switch (stockSortKey) {
        case 'isbn':
          cmp = a.isbn.localeCompare(b.isbn);
          break;
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'categoria':
          cmp = (a.categoriaNome ?? '').localeCompare(b.categoriaNome ?? '');
          break;
        case 'autor':
          cmp = (a.autor ?? '').localeCompare(b.autor ?? '');
          break;
        case 'quantidadeTotal':
          cmp = a.quantidadeTotal - b.quantidadeTotal;
          break;
        case 'quantidadeAlocada':
          cmp = (a.quantidadeAlocada ?? 0) - (b.quantidadeAlocada ?? 0);
          break;
        case 'quantidadeDisponivel':
          cmp = (a.quantidadeDisponivel ?? 0) - (b.quantidadeDisponivel ?? 0);
          break;
        case 'quantidadeAvariadaTotal':
          cmp = (a.quantidadeAvariadaTotal ?? 0) - (b.quantidadeAvariadaTotal ?? 0);
          break;
        case 'valorTotal':
          cmp = a.valorTotal - b.valorTotal;
          break;
        default:
          cmp = 0;
      }
      return stockSortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [stockItems, stockSearch, stockCategoryId, stockSortKey, stockSortDir]);

  function getStockItemKey(item: CuradoriaStockItem): string {
    return `${item.isbn}-${item.categoriaId ?? 'sem-categoria'}`;
  }

  const selectedStockItemKeySet = useMemo(() => new Set(selectedStockItemKeys), [selectedStockItemKeys]);

  const selectedStockItems = useMemo(() => {
    return stockItems.filter((item) => selectedStockItemKeySet.has(getStockItemKey(item)));
  }, [stockItems, selectedStockItemKeySet]);

  const filteredStockItemKeys = useMemo(
    () => filteredStockItems.map((item) => getStockItemKey(item)),
    [filteredStockItems],
  );

  const allFilteredStockSelected =
    filteredStockItemKeys.length > 0 && filteredStockItemKeys.every((key) => selectedStockItemKeySet.has(key));

  function toggleStockItemSelection(itemKey: string) {
    setSelectedStockItemKeys((prev) => (prev.includes(itemKey) ? prev.filter((k) => k !== itemKey) : [...prev, itemKey]));
  }

  function toggleAllFilteredStockItems() {
    if (filteredStockItemKeys.length === 0) return;
    setSelectedStockItemKeys((prev) => {
      const prevSet = new Set(prev);

      if (filteredStockItemKeys.every((key) => selectedStockItemKeySet.has(key))) {
        filteredStockItemKeys.forEach((k) => prevSet.delete(k));
        return Array.from(prevSet);
      }

      filteredStockItemKeys.forEach((k) => prevSet.add(k));
      return Array.from(prevSet);
    });
  }

  function calculateCuradoriaStockReportTotals() {
    const selected = selectedStockItems;

    const totalItens = selected.length;
    const totalQuantidade = selected.reduce((sum, item) => sum + (item.quantidadeTotal ?? 0), 0);
    const totalValor = selected.reduce((sum, item) => sum + (item.valorTotal ?? 0), 0);

    const byCategoriaMap: Record<
      string,
      {
        categoriaId: number | null;
        categoriaNome: string;
        count: number;
        totalQuantidade: number;
        totalValor: number;
      }
    > = {};

    selected.forEach((item) => {
      const categoriaId = item.categoriaId ?? null;
      const mapKey = String(categoriaId ?? 'sem-categoria');

      if (!byCategoriaMap[mapKey]) {
        byCategoriaMap[mapKey] = {
          categoriaId,
          categoriaNome: item.categoriaNome ?? 'Sem gênero literário',
          count: 0,
          totalQuantidade: 0,
          totalValor: 0,
        };
      }

      byCategoriaMap[mapKey].count += 1;
      byCategoriaMap[mapKey].totalQuantidade += item.quantidadeTotal ?? 0;
      byCategoriaMap[mapKey].totalValor += item.valorTotal ?? 0;
    });

    const byCategoria = Object.values(byCategoriaMap).sort((a, b) => b.totalValor - a.totalValor);

    return {
      totalItens,
      totalQuantidade,
      totalValor,
      items: selected,
      byCategoria,
    };
  }

  function buildCuradoriaStockReportWorkbook() {
    const reportData = calculateCuradoriaStockReportTotals();

    const wb = XLSX.utils.book_new();
    const headers = [
      'ISBN',
      'Título',
      'Gênero literário',
      'Autor',
      'Editora',
      'Qtd em estoque',
      'Alocada (galpão)',
      'Disponível',
      'Avarias (total)',
      'Valor médio',
      'Desconto médio',
      'Valor total',
    ];

    const tableData: any[][] = [headers];
    reportData.items.forEach((item) => {
      tableData.push([
        item.isbn ?? '',
        item.nome ?? '-',
        item.categoriaNome ?? 'Sem gênero literário',
        item.autor ?? '-',
        item.editora ?? '-',
        item.quantidadeTotal ?? 0,
        item.quantidadeAlocada ?? 0,
        item.quantidadeDisponivel ?? 0,
        item.quantidadeAvariadaTotal ?? 0,
        item.valorMedio ?? 0,
        item.descontoMedio ?? 0,
        item.valorTotal ?? 0,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(tableData);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    const headerStyle: any = {
      fill: { fgColor: { rgb: '1F2937' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: '374151' } },
        bottom: { style: 'thin', color: { rgb: '374151' } },
        left: { style: 'thin', color: { rgb: '374151' } },
        right: { style: 'thin', color: { rgb: '374151' } },
      },
    };

    const rowStyle: any = {
      font: { color: { rgb: '000000' }, sz: 10 },
      alignment: { vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'D1D5DB' } },
        bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
        left: { style: 'thin', color: { rgb: 'D1D5DB' } },
        right: { style: 'thin', color: { rgb: 'D1D5DB' } },
      },
    };

    // Estilo do cabeçalho
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };
      ws[cellAddress].s = headerStyle;
    }

    // Estilo das linhas
    for (let row = 1; row <= range.e.r; row++) {
      const isEven = row % 2 === 0;
      const fill = isEven ? { fgColor: { rgb: 'F3F4F6' } } : { fgColor: { rgb: 'FFFFFF' } };

      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[cellAddress]) continue;

        const cellStyle = { ...rowStyle, fill };

        // 5..8 = quantidades, 9..11 = valores monetários
        if (col >= 5 && col <= 8) {
          ws[cellAddress].s = { ...cellStyle, numFmt: '#,##0' };
        } else if (col >= 9 && col <= 11) {
          ws[cellAddress].s = { ...cellStyle, numFmt: '"R$" #,##0.00' };
        } else {
          ws[cellAddress].s = cellStyle;
        }
      }
    }

    // Largura aproximada
    ws['!cols'] = [
      { wch: 20 },
      { wch: 35 },
      { wch: 22 },
      { wch: 26 },
      { wch: 26 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];

    const filterRange = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } });
    ws['!autofilter'] = { ref: filterRange };
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

    XLSX.utils.book_append_sheet(wb, ws, 'Estoque Curadoria');
    return wb;
  }

  function exportCuradoriaStockReportPdf() {
    const reportData = calculateCuradoriaStockReportTotals();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    const formatBRL = (value: number) =>
      (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const checkPageBreak = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - margin - 25) {
        doc.addPage();
        yPosition = margin;
      }
    };

    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE ESTOQUE - CURADORIA', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Data de Geração: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, yPosition, {
      align: 'center',
    });
    yPosition += 6;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    checkPageBreak(7);
    doc.text(`Itens selecionados: ${reportData.totalItens}`, margin, yPosition);
    yPosition += 6;
    doc.text(`Quantidade total: ${reportData.totalQuantidade}`, margin, yPosition);
    yPosition += 6;
    doc.setTextColor(0, 100, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`Valor total: ${formatBRL(reportData.totalValor)}`, margin, yPosition);
    yPosition += 12;

    // Distribuição por gênero
    if (reportData.byCategoria.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      checkPageBreak(8);
      doc.text('Distribuição por gênero literário', margin, yPosition);
      yPosition += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);

      reportData.byCategoria.slice(0, 12).forEach((c) => {
        const line = `- ${c.categoriaNome}: ${c.count} item(ns) | Qtd: ${c.totalQuantidade} | Total: ${formatBRL(
          c.totalValor,
        )}`;
        const lines = doc.splitTextToSize(line, pageWidth - margin * 2);
        lines.forEach((l: string) => {
          checkPageBreak(5);
          doc.text(l, margin, yPosition);
          yPosition += 5;
        });
      });

      if (reportData.byCategoria.length > 12) {
        checkPageBreak(5);
        doc.text(`(mostrando top 12 de ${reportData.byCategoria.length})`, margin, yPosition);
        yPosition += 7;
      } else {
        yPosition += 5;
      }
    }

    // Detalhamento por item
    if (reportData.items.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      checkPageBreak(8);
      doc.text('Detalhamento dos itens selecionados', margin, yPosition);
      yPosition += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);

      reportData.items.forEach((item, idx) => {
        const title = `${idx + 1}. ${item.nome ?? '-'}`;
        const titleLines = doc.splitTextToSize(title, pageWidth - margin * 2);
        titleLines.forEach((l: string) => {
          checkPageBreak(6);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(l, margin, yPosition);
          yPosition += 6;
        });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);

        const detailLines = [
          `ISBN: ${item.isbn ?? '-'}`,
          `Gênero: ${item.categoriaNome ?? 'Sem gênero literário'}`,
          `Autor: ${item.autor ?? '-'}`,
          `Qtd em estoque: ${item.quantidadeTotal ?? 0}`,
          `Alocada (galpão): ${item.quantidadeAlocada ?? 0} | Disponível: ${item.quantidadeDisponivel ?? 0} | Avarias (total): ${item.quantidadeAvariadaTotal ?? 0}`,
          `Valor total: ${formatBRL(item.valorTotal ?? 0)}`,
          `Valor médio: ${formatBRL(item.valorMedio ?? 0)} | Desconto médio: ${formatBRL(
            item.descontoMedio ?? 0,
          )}`,
        ];

        detailLines.forEach((dl) => {
          const lns = doc.splitTextToSize(dl, pageWidth - margin * 2);
          lns.forEach((l: string) => {
            checkPageBreak(5);
            doc.text(l, margin, yPosition);
            yPosition += 5;
          });
        });

        yPosition += 6;
      });
    }

    // Rodapé com número de páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    doc.save(`relatorio-estoque-curadoria-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  async function openStockQuotes(item: CuradoriaStockItem) {
    try {
      setStockQuotesItem(item);
      setShowStockQuotesModal(true);
      setStockQuotesLoading(true);
      const { data } = await api.get<CuradoriaStockQuote[]>(`/curadoria/estoque/${encodeURIComponent(item.isbn)}/cotacoes`);
      setStockQuotes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setStockQuotesLoading(false);
    }
  }

  async function openStockLivroAvarias(item: CuradoriaStockItem) {
    setStockLivroAvariasItem(item);
    setShowStockLivroAvariasModal(true);
    setStockLivroAvariasLoading(true);
    setStockLivroAvariasLinhas([]);
    try {
      const params: Record<string, string> = { isbn: item.isbn };
      if (item.categoriaId != null) {
        params.categoriaId = String(item.categoriaId);
      }
      const { data } = await api.get<CuradoriaLivroAvariaLinha[]>('/curadoria/estoque/livro-avarias', { params });
      setStockLivroAvariasLinhas(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setStockLivroAvariasLoading(false);
    }
  }

  async function openStockItemEditor(item: CuradoriaStockItem) {
    setStockItemMode('edit');
    setStockItemForm({
      nome: item.nome,
      isbn: item.isbn,
      autor: item.autor ?? '',
      editora: item.editora ?? '',
      anoPublicacao: item.anoPublicacao ?? '',
    });
    try {
      const { data } = await api.get<CuradoriaStockQuote[]>(
        `/curadoria/estoque/${encodeURIComponent(item.isbn)}/cotacoes`,
      );
      const quotes = (Array.isArray(data) ? data : []).filter(
        (quote) => quote.categoriaId === item.categoriaId,
      );

      if (quotes.length > 0) {
        setStockQuotesForm(
          quotes.map((quote) => ({
            itemId: quote.itemId,
            orcamentoId: quote.orcamentoId,
            categoriaId: quote.categoriaId ?? undefined,
            quantidade: quote.quantidade,
            valor: quote.valor,
            desconto: quote.desconto,
            descontoTipo: 'VALOR',
            fornecedorId: quote.fornecedorId ?? undefined,
          })),
        );
        setOriginalStockQuoteRefs(
          quotes.map((quote) => ({ itemId: quote.itemId, orcamentoId: quote.orcamentoId })),
        );
      } else {
        setStockQuotesForm([
          {
            categoriaId: item.categoriaId ?? undefined,
            quantidade: item.quantidadeTotal,
            valor: item.valorMedio,
            desconto: item.descontoMedio,
            descontoTipo: 'VALOR',
            fornecedorId: undefined,
          },
        ]);
        setOriginalStockQuoteRefs([]);
      }
      setShowStockItemModal(true);
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  function updateItem(index: number, field: keyof CuradoriaItemForm, value: string | number | undefined) {
    setCreateForm((prev) => ({
      ...prev,
      itens: prev.itens.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }));
  }

  function updateStockItem(field: keyof CuradoriaItemForm, value: string | number | undefined) {
    setStockItemForm((prev) => ({ ...prev, [field]: value as any }));
  }

  function updateStockQuote(
    index: number,
    field: keyof CuradoriaStockQuoteForm,
    value: number | 'VALOR' | 'PERCENTUAL' | undefined,
  ) {
    setStockQuotesForm((prev) =>
      prev.map((quote, quoteIndex) => (quoteIndex === index ? { ...quote, [field]: value as any } : quote)),
    );
  }

  function addStockQuote() {
    setStockQuotesForm((prev) => [...prev, createEmptyStockQuote()]);
  }

  function removeStockQuote(index: number) {
    setStockQuotesForm((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, quoteIndex) => quoteIndex !== index);
    });
  }

  function addItem() {
    setCreateForm((prev) => ({ ...prev, itens: [...prev.itens, createEmptyItem()] }));
  }

  function normalizeHeader(header: string): string {
    return String(header ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '');
  }

  function parseNumber(raw: unknown): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    if (typeof raw !== 'string') return 0;
    const value = raw.trim();
    if (!value) return 0;
    const normalized = value
      .replace(/\s+/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function estimateImportMetrics(file: File): Promise<{ totalBruto: number; totalLivros: number }> {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) return { totalBruto: 0, totalLivros: 0 };

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });

      let total = 0;
      let validRows = 0;
      rows.forEach((row) => {
        const normalizedRow = Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
          acc[normalizeHeader(key)] = value;
          return acc;
        }, {});

        const nome = String(normalizedRow.titulo ?? normalizedRow.nome ?? '').trim();
        const isbn = String(normalizedRow.isbn ?? '').trim();
        const valor = parseNumber(normalizedRow.valor);
        const quantidade = Math.max(1, Math.floor(parseNumber(normalizedRow.quantidade)));
        if (!nome || !isbn || valor < 0) return;
        validRows += 1;
        total += valor * quantidade;
      });

      return { totalBruto: Number(total.toFixed(2)), totalLivros: validRows };
    } catch {
      return { totalBruto: 0, totalLivros: 0 };
    }
  }

  async function handleImportFileChange(file: File | null) {
    setImportFile(file);
    if (!file) {
      setImportEstimatedTotalBruto(0);
      setImportEstimatedBooks(0);
      return;
    }
    const estimated = await estimateImportMetrics(file);
    setImportEstimatedTotalBruto(estimated.totalBruto);
    setImportEstimatedBooks(estimated.totalLivros);
  }

  function getDataUrlFileName(dataUrl?: string | null): string {
    if (!dataUrl) return 'arquivo';
    if (dataUrl.startsWith('/uploads/') || dataUrl.startsWith('http')) {
      const segments = dataUrl.split('/');
      return segments[segments.length - 1] || 'arquivo';
    }
    const match = dataUrl.match(/name=([^;]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
    return 'arquivo';
  }

  async function fileToUploadedUrl(file: File): Promise<string> {
    const { uploadSingleFile } = await import('../utils/uploadFile');
    const url = await uploadSingleFile(file);
    if (!url) throw new Error('Falha ao enviar arquivo.');
    return url;
  }

  function removeItem(index: number) {
    setCreateForm((prev) => {
      if (prev.itens.length <= 1) return prev;
      return { ...prev, itens: prev.itens.filter((_, itemIndex) => itemIndex !== index) };
    });
  }

  async function fetchIsbn(index: number) {
    const isbnRaw = createForm.itens[index]?.isbn ?? '';
    const isbn = isbnRaw.toUpperCase().replace(/[^0-9X]/g, '');
    if (!(isbn.length === 10 || isbn.length === 13)) return;

    try {
      setIsbnLoadingByIndex((prev) => ({ ...prev, [index]: true }));
      const { data } = await api.get<IsbnBookData>(`/curadoria/books/isbn/${isbn}`);

      setCreateForm((prev) => {
        const next = [...prev.itens];
        const item = next[index];
        if (!item) return prev;
        const matchingCategory = categories.find((category) =>
          data.categorias.some(
            (bookCategory) =>
              bookCategory.toLowerCase().includes(category.nome.toLowerCase()) ||
              category.nome.toLowerCase().includes(bookCategory.toLowerCase()),
          ),
        );
        next[index] = {
          ...item,
          isbn: data.isbn || item.isbn,
          nome: data.titulo || item.nome,
          autor: data.autores?.join(', ') || item.autor,
          editora: data.editora || item.editora,
          anoPublicacao: data.anoPublicacao || item.anoPublicacao,
          categoriaId: item.categoriaId || matchingCategory?.id,
        };
        return { ...prev, itens: next };
      });
      toast.success('Dados do ISBN carregados.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setIsbnLoadingByIndex((prev) => ({ ...prev, [index]: false }));
    }
  }

  async function fetchIsbnForStock() {
    const isbnRaw = stockItemForm.isbn ?? '';
    const isbn = isbnRaw.toUpperCase().replace(/[^0-9X]/g, '');
    if (!(isbn.length === 10 || isbn.length === 13)) return;

    try {
      setStockIsbnLoading(true);
      const { data } = await api.get<IsbnBookData>(`/curadoria/books/isbn/${isbn}`);
      const matchingCategory = categories.find((category) =>
        data.categorias.some(
          (bookCategory) =>
            bookCategory.toLowerCase().includes(category.nome.toLowerCase()) ||
            category.nome.toLowerCase().includes(bookCategory.toLowerCase()),
        ),
      );

      setStockItemForm((prev) => {
        return {
          ...prev,
          isbn: data.isbn || prev.isbn,
          nome: data.titulo || prev.nome,
          autor: data.autores?.join(', ') || prev.autor,
          editora: data.editora || prev.editora,
          anoPublicacao: data.anoPublicacao || prev.anoPublicacao,
        };
      });
      if (matchingCategory?.id) {
        setStockQuotesForm((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          if (!next[0].categoriaId) {
            next[0] = { ...next[0], categoriaId: matchingCategory.id };
          }
          return next;
        });
      }
      toast.success('Dados do ISBN carregados.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setStockIsbnLoading(false);
    }
  }

  async function handleSaveStockItem(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) {
      toast.error('Seu perfil não pode ajustar o estoque de curadoria.');
      return;
    }

    if (!stockItemForm.isbn.trim()) {
      toast.error('Informe o ISBN do livro.');
      return;
    }
    if (!stockQuotesForm.length) {
      toast.error('Adicione ao menos uma cotação.');
      return;
    }
    const invalidQuote = stockQuotesForm.some(
      (quote) =>
        !quote.categoriaId ||
        quote.quantidade == null ||
        Number(quote.quantidade) <= 0 ||
        quote.valor == null ||
        Number(quote.valor) < 0 ||
        (quote.desconto != null && Number(quote.desconto) < 0),
    );
    if (invalidQuote) {
      toast.error('Preencha gênero literário, quantidade, valor e desconto válido em todas as cotações.');
      return;
    }

    try {
      setStockItemSaving(true);
      const payloadFromQuote = (quote: CuradoriaStockQuoteForm): CuradoriaStockItemPayload => {
        const valorUnitario = Number(quote.valor || 0);
        const rawDesconto = Number(quote.desconto || 0);
        const descontoCalculado =
          quote.descontoTipo === 'PERCENTUAL'
            ? Number(((valorUnitario * rawDesconto) / 100).toFixed(2))
            : rawDesconto;

        return {
          nome: stockItemForm.nome.trim(),
          isbn: stockItemForm.isbn.trim(),
          categoriaId: Number(quote.categoriaId),
          quantidade: Number(quote.quantidade || 1),
          valor: valorUnitario,
          desconto: descontoCalculado,
          autor: stockItemForm.autor?.trim() || undefined,
          editora: stockItemForm.editora?.trim() || undefined,
          anoPublicacao: stockItemForm.anoPublicacao?.trim() || undefined,
        };
      };

      const createInternalDeliveredBudget = async (
        firstItem: CuradoriaStockItemPayload,
        fornecedorId?: number,
      ) => {
        const autoName = `Estoque avulso - ${stockItemForm.isbn.trim()}`;
        const { data } = await api.post<CuradoriaBudget>('/curadoria/orcamentos', {
          nome: autoName,
          status: 'ENTREGUE',
          observacao: '[AUTO_ESTOQUE_AVULSO] orçamento técnico criado automaticamente pelo estoque de curadoria.',
          fornecedorId: fornecedorId || undefined,
          descontoAplicadoEm: 'ITEM',
          descontoTotal: 0,
          itens: [firstItem],
        });
        return data;
      };

      const deliveredBudgets = budgets.filter((budget) => (budget.status ?? 'PENDENTE') === 'ENTREGUE');

      if (stockItemMode === 'edit') {
        const currentRefSet = new Set(
          stockQuotesForm
            .map((quote) => (quote.itemId && quote.orcamentoId ? `${quote.orcamentoId}:${quote.itemId}` : null))
            .filter((value): value is string => Boolean(value)),
        );

        const removedRefs = originalStockQuoteRefs.filter(
          (ref) => !currentRefSet.has(`${ref.orcamentoId}:${ref.itemId}`),
        );

        for (const removed of removedRefs) {
          await api.delete(`/curadoria/orcamentos/${removed.orcamentoId}/itens/${removed.itemId}`);
        }

        for (const quote of stockQuotesForm) {
          if (quote.itemId && quote.orcamentoId) {
            await api.patch(
              `/curadoria/orcamentos/${quote.orcamentoId}/itens/${quote.itemId}`,
              payloadFromQuote(quote),
            );
            continue;
          }

          const targetBudget =
            deliveredBudgets.find(
              (budget) =>
                quote.fornecedorId != null &&
                budget.fornecedorId != null &&
                budget.fornecedorId === quote.fornecedorId,
            ) ?? deliveredBudgets[0];

          if (!targetBudget) {
            await createInternalDeliveredBudget(
              payloadFromQuote(quote),
              quote.fornecedorId,
            );
            continue;
          }
          await api.post(`/curadoria/orcamentos/${targetBudget.id}/itens`, payloadFromQuote(quote));
        }
      } else {
        let createdByFallback = false;
        let fallbackBudgetId: number | undefined;

        for (const quote of stockQuotesForm) {
          let targetBudget =
            deliveredBudgets.find(
              (budget) =>
                quote.fornecedorId != null &&
                budget.fornecedorId != null &&
                budget.fornecedorId === quote.fornecedorId,
            ) ?? deliveredBudgets[0];

          if (!targetBudget && fallbackBudgetId) {
            targetBudget = { id: fallbackBudgetId } as CuradoriaBudget;
          }

          if (!targetBudget) {
            const firstItemPayload = payloadFromQuote(quote);
            const createdBudget = await createInternalDeliveredBudget(
              firstItemPayload,
              quote.fornecedorId,
            );
            createdByFallback = true;
            fallbackBudgetId = createdBudget.id;
            continue;
          }
          await api.post(`/curadoria/orcamentos/${targetBudget.id}/itens`, payloadFromQuote(quote));
        }

        if (createdByFallback) {
          toast.success('Item adicionado ao estoque usando orçamento técnico automático.');
        }
      }

      const totalItens = stockQuotesForm.length;
      toast.success(
        totalItens > 1
          ? `${totalItens} cotações adicionadas ao estoque da curadoria.`
          : 'Item adicionado ao estoque da curadoria.',
      );
      setShowStockItemModal(false);
      setStockItemForm(createEmptyItem());
      setStockQuotesForm([createEmptyStockQuote()]);
      setOriginalStockQuoteRefs([]);
      await Promise.all([loadData(), loadStock()]);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setStockItemSaving(false);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) {
      toast.error('Seu perfil não pode criar orçamentos de curadoria.');
      return;
    }

    if (!createForm.nome.trim()) {
      toast.error('Informe o nome do orçamento.');
      return;
    }

    const invalidItem = createForm.itens.some(
      (item) =>
        !item.isbn.trim() ||
        !item.categoriaId ||
        item.quantidade == null ||
        Number(item.quantidade) <= 0 ||
        item.valor == null ||
        Number(item.valor) < 0 ||
        (createForm.descontoAplicadoEm === 'ITEM' && Number(item.desconto ?? 0) < 0),
    );
    if (invalidItem) {
      toast.error('Preencha os itens com ISBN, gênero literário, quantidade, valor e desconto válido.');
      return;
    }

    try {
      const totalBrutoEstimado = createForm.itens.reduce(
        (acc, item) => acc + Number(item.valor || 0) * Number(item.quantidade || 1),
        0,
      );
      const descontoTotalCalculado =
        createForm.descontoAplicadoEm === 'TOTAL'
          ? createDiscountTotalType === 'PERCENTUAL'
            ? (totalBrutoEstimado * Number(createForm.descontoTotal || 0)) / 100
            : Number(createForm.descontoTotal || 0)
          : 0;

      setCreating(true);
      await api.post('/curadoria/orcamentos', {
        nome: createForm.nome.trim(),
        projetoId: createForm.projetoId || undefined,
        setorId: createForm.setorId || undefined,
        fornecedorId: createForm.fornecedorId || undefined,
        nfUrl: createForm.nfUrl.trim() || undefined,
        formaPagamento: createForm.formaPagamento.trim() || undefined,
        status: createForm.status,
        arquivoOrcamentoUrl: createForm.arquivoOrcamentoUrl.trim() || undefined,
        comprovantePagamentoUrl: createForm.comprovantePagamentoUrl.trim() || undefined,
        observacao: createForm.observacao.trim() || undefined,
        descontoAplicadoEm: createForm.descontoAplicadoEm,
        descontoTotal: createForm.descontoAplicadoEm === 'TOTAL' ? Number(descontoTotalCalculado.toFixed(2)) : undefined,
        itens: createForm.itens.map((item) => ({
          nome: item.nome.trim(),
          isbn: item.isbn.trim(),
          categoriaId: Number(item.categoriaId),
          quantidade: Number(item.quantidade || 1),
          valor: Number(item.valor || 0),
          desconto: Number(item.desconto || 0),
          autor: item.autor?.trim() || undefined,
          editora: item.editora?.trim() || undefined,
          anoPublicacao: item.anoPublicacao?.trim() || undefined,
        })),
      });
      toast.success('Orçamento criado com sucesso.');
      setShowCreateModal(false);
      setCreateForm({
        nome: '',
        projetoId: undefined,
        setorId: undefined,
        fornecedorId: undefined,
        nfUrl: '',
        formaPagamento: '',
        status: 'PENDENTE',
        arquivoOrcamentoUrl: '',
        comprovantePagamentoUrl: '',
        observacao: '',
        descontoAplicadoEm: 'ITEM',
        descontoTotal: 0,
        itens: [createEmptyItem()],
      });
      setCreateDiscountTotalType('VALOR');
      await loadData();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleImportXlsx(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) {
      toast.error('Seu perfil não pode importar orçamentos.');
      return;
    }
    if (!importFile) {
      toast.error('Selecione um arquivo XLSX.');
      return;
    }
    try {
      const descontoTotalCalculado =
        importDiscountMode === 'TOTAL'
          ? importDiscountTotalType === 'PERCENTUAL'
            ? (importEstimatedTotalBruto * Number(importDiscountTotal || 0)) / 100
            : Number(importDiscountTotal || 0)
          : 0;

      setImporting(true);
      const formData = new FormData();
      formData.append('file', importFile);
      if (importName.trim()) formData.append('nome', importName.trim());
      if (importProjectId) formData.append('projetoId', String(importProjectId));
      if (importCategoryId) formData.append('categoriaId', String(importCategoryId));
      formData.append('overwriteCurrent', String(overwriteCurrent));
      formData.append('descontoAplicadoEm', importDiscountMode);
      if (importSupplierId) formData.append('fornecedorId', String(importSupplierId));
      if (importDiscountMode === 'TOTAL') {
        formData.append('descontoTotal', String(Number(descontoTotalCalculado.toFixed(2)) || 0));
      }

      const { data } = await api.post<CuradoriaImportResult>('/curadoria/orcamentos/import-xlsx', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportProgress(100);
      toast.success('Orçamento importado com sucesso.');
      if (Array.isArray(data?.missingTitleIsbns) && data.missingTitleIsbns.length > 0) {
        const warningLines = [
          'ATENCAO: Os ISBNs abaixo nao retornaram titulo automaticamente durante a importacao.',
          'Revise esses itens e complete o titulo manualmente, se necessario.',
          '',
          ...data.missingTitleIsbns.map((isbn, index) => `${index + 1}. ${isbn}`),
        ];
        const reportBlob = new Blob([warningLines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const reportUrl = URL.createObjectURL(reportBlob);
        const link = document.createElement('a');
        link.href = reportUrl;
        link.download = `aviso-isbns-sem-titulo-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(reportUrl);
        toast.error(
          `Alguns ISBNs nao retornaram titulo (${data.missingTitleIsbns.length}). Baixamos um arquivo de aviso para revisao.`,
        );
      }
      setShowImportModal(false);
      setImportFile(null);
      setImportName('');
      setImportProjectId(undefined);
      setImportCategoryId(undefined);
      setImportSupplierId(undefined);
      setOverwriteCurrent(true);
      setImportDiscountMode('ITEM');
      setImportDiscountTotal(0);
      setImportDiscountTotalType('VALOR');
      setImportEstimatedTotalBruto(0);
      setImportEstimatedBooks(0);
      await loadData();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setImporting(false);
    }
  }

  function openEditBudgetModal(budget: CuradoriaBudget) {
    setEditingBudgetId(budget.id);
    setEditingBudgetTotalBruto(Number(budget.totalBruto || 0));
    setEditForm({
      nome: budget.nome ?? '',
      projetoId: budget.projeto?.id ?? undefined,
        setorId: budget.setor?.id ?? budget.setorId ?? undefined,
      fornecedorId: budget.fornecedor?.id ?? undefined,
      nfUrl: budget.nfUrl ?? '',
      formaPagamento: budget.formaPagamento ?? '',
      status: budget.status ?? 'PENDENTE',
      arquivoOrcamentoUrl: budget.arquivoOrcamentoUrl ?? '',
      comprovantePagamentoUrl: budget.comprovantePagamentoUrl ?? '',
      observacao: budget.observacao ?? '',
      descontoAplicadoEm: budget.descontoAplicadoEm ?? 'ITEM',
      descontoTotal: Number(budget.descontoTotal ?? 0),
    });
    setEditDiscountTotalType('VALOR');
    setShowEditModal(true);
  }

  async function handleEditBudget(event: FormEvent) {
    event.preventDefault();
    if (!editingBudgetId) return;
    if (!editForm.nome.trim()) {
      toast.error('Informe o nome do orçamento.');
      return;
    }
    if (editForm.descontoAplicadoEm === 'TOTAL' && editForm.descontoTotal < 0) {
      toast.error('Desconto total inválido.');
      return;
    }

    try {
      const descontoTotalCalculado =
        editForm.descontoAplicadoEm === 'TOTAL'
          ? editDiscountTotalType === 'PERCENTUAL'
            ? (editingBudgetTotalBruto * Number(editForm.descontoTotal || 0)) / 100
            : Number(editForm.descontoTotal || 0)
          : 0;
      setEditingBudgetSaving(true);
      await api.patch(`/curadoria/orcamentos/${editingBudgetId}`, {
        nome: editForm.nome.trim(),
        projetoId: editForm.projetoId || undefined,
        setorId: editForm.setorId || undefined,
        fornecedorId: editForm.fornecedorId || undefined,
        nfUrl: editForm.nfUrl.trim() || undefined,
        formaPagamento: editForm.formaPagamento.trim() || undefined,
        status: editForm.status,
        arquivoOrcamentoUrl: editForm.arquivoOrcamentoUrl.trim() || undefined,
        comprovantePagamentoUrl: editForm.comprovantePagamentoUrl.trim() || undefined,
        observacao: editForm.observacao.trim() || undefined,
        descontoAplicadoEm: editForm.descontoAplicadoEm,
        descontoTotal:
          editForm.descontoAplicadoEm === 'TOTAL'
            ? Number(descontoTotalCalculado.toFixed(2))
            : 0,
      });
      toast.success('Orçamento atualizado com sucesso.');
      setShowEditModal(false);
      setEditingBudgetId(null);
      await loadData();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setEditingBudgetSaving(false);
    }
  }

  async function handleDeleteBudget(budget: CuradoriaBudget) {
    if (!canEdit) {
      toast.error('Seu perfil não pode excluir orçamentos.');
      return;
    }
    setBudgetToDelete(budget);
    setDeleteConfirmName('');
    setDeleteBudgetAlsoStock(false);
    setDeleteError(null);
    setShowDeleteModal(true);
  }

  async function handleConfirmDeleteBudget() {
    if (!budgetToDelete) return;
    if (!namesMatchForDeleteConfirm(deleteConfirmName, budgetToDelete.nome)) {
      setDeleteError('O nome digitado não confere com o orçamento selecionado.');
      return;
    }

    try {
      setDeletingBudgetId(budgetToDelete.id);
      setDeleteError(null);
      await api.delete(`/curadoria/orcamentos/${budgetToDelete.id}`, {
        params: { deleteStock: deleteBudgetAlsoStock },
      });
      toast.success('Orçamento excluído com sucesso.');
      setShowDeleteModal(false);
      setBudgetToDelete(null);
      setDeleteConfirmName('');
      setDeleteBudgetAlsoStock(false);
      await Promise.all([loadData(), loadStock()]);
    } catch (err: any) {
      const message = formatApiError(err);
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeletingBudgetId(null);
    }
  }

  const renderBudgetTh = useCallback(
    (col: CuradoriaBudgetSortColumn, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: budgetSortCol,
        sortDirection: budgetSortDir,
        onSort: handleBudgetSort,
        align,
      }),
    [budgetSortCol, budgetSortDir, handleBudgetSort],
  );

  const columns: DataTableColumn<CuradoriaBudget>[] = useMemo(
    () => [
    {
      key: 'nome',
      label: '',
      renderTh: () => renderBudgetTh('nome', 'Orçamento'),
      render: (budget) => <span className="font-medium">{budget.nome}</span>,
    },
    {
      key: 'status',
      label: '',
      renderTh: () => renderBudgetTh('status', 'Status'),
      render: (budget) => <span className="text-xs text-white/80">{(budget.status ?? 'PENDENTE').replaceAll('_', ' ')}</span>,
    },
    {
      key: 'projeto',
      label: '',
      renderTh: () => renderBudgetTh('projeto', 'Projeto'),
      render: (budget) => <span>{budget.projeto?.nome ?? 'Sem projeto'}</span>,
    },
    {
      key: 'fornecedor',
      label: '',
      renderTh: () => renderBudgetTh('fornecedor', 'Fornecedor'),
      render: (budget) => <span>{budget.fornecedor?.nomeFantasia ?? budget.fornecedor?.razaoSocial ?? '-'}</span>,
    },
    {
      key: 'itens',
      label: '',
      align: 'right',
      renderTh: () => renderBudgetTh('totalItens', 'Itens', 'right'),
      render: (budget) => <span>{budget.totalItens}</span>,
    },
    {
      key: 'quantidade',
      label: '',
      align: 'right',
      renderTh: () => renderBudgetTh('totalQuantidade', 'Qtd total', 'right'),
      render: (budget) => <span>{budget.totalQuantidade}</span>,
    },
    {
      key: 'totais',
      label: '',
      align: 'right',
      renderTh: () => renderBudgetTh('totalLiquido', 'Totais', 'right'),
      render: (budget) => (
        <div className="text-right text-xs sm:text-sm leading-4 space-y-0.5">
          <div>
            <span className="text-white/60 mr-1">Bruto:</span>
            <span className="text-white/90">
              {budget.totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div>
            <span className="text-white/60 mr-1">Desc.:</span>
            <span className="text-amber-300">
              {budget.totalDesconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div>
            <span className="text-white/60 mr-1">Líquido:</span>
            <span className="text-emerald-300">
              {budget.totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'criado',
      label: '',
      renderTh: () => renderBudgetTh('dataCriacao', 'Criado em'),
      render: (budget) => (
        <span className="text-xs text-white/70">{new Date(budget.dataCriacao).toLocaleDateString('pt-BR')}</span>
      ),
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      stopRowClick: true,
      render: (budget) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openEditBudgetModal(budget)}
            className={btn.editSm}
            disabled={!canEdit}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteBudget(budget)}
            className={btn.dangerSm}
            disabled={!canEdit}
          >
            Excluir
          </button>
        </div>
      ),
    },
    ],
    [renderBudgetTh, canEdit, openEditBudgetModal, handleDeleteBudget],
  );

  const handleStockSort = useCallback(
    (column: string) => {
      const c = column as CuradoriaStockSortColumn;
      if (stockSortKey === c) {
        setStockSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setStockSortKey(c);
        setStockSortDir('asc');
      }
    },
    [stockSortKey],
  );

  const renderStockSortableHeader = useCallback(
    (column: CuradoriaStockSortColumn, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: column,
        label,
        activeColumn: stockSortKey,
        sortDirection: stockSortDir,
        onSort: handleStockSort,
        align,
      }),
    [stockSortKey, stockSortDir, handleStockSort],
  );

  const stockColumns: DataTableColumn<CuradoriaStockItem>[] = useMemo(
    () => [
      {
        key: 'selecionar',
        label: (
          <input
            type="checkbox"
            checked={allFilteredStockSelected}
            onChange={() => toggleAllFilteredStockItems()}
            className="accent-primary"
            aria-label="Selecionar todos os itens visíveis"
          />
        ),
        thClassName: 'w-10 text-center',
        tdClassName: 'w-10 text-center',
        render: (item) => {
          const itemKey = getStockItemKey(item);
          const checked = selectedStockItemKeySet.has(itemKey);

          return (
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                e.stopPropagation();
                toggleStockItemSelection(itemKey);
              }}
              className="accent-primary"
              aria-label={`Selecionar item ${item.isbn}`}
            />
          );
        },
        stopRowClick: true,
      },
      {
        key: 'isbn',
        label: '',
        renderTh: () => renderStockSortableHeader('isbn', 'ISBN'),
        render: (item) => <span className="font-mono text-xs sm:text-sm">{item.isbn}</span>,
      },
      {
        key: 'nome',
        label: '',
        renderTh: () => renderStockSortableHeader('nome', 'Título'),
        render: (item) => <span className="font-medium">{item.nome}</span>,
      },
      {
        key: 'categoria',
        label: '',
        renderTh: () => renderStockSortableHeader('categoria', 'Gênero literário'),
        render: (item) => <span>{item.categoriaNome ?? '-'}</span>,
      },
      {
        key: 'autor',
        label: '',
        renderTh: () => renderStockSortableHeader('autor', 'Autor'),
        render: (item) => <span className="text-xs sm:text-sm text-white/80">{item.autor ?? '-'}</span>,
      },
      {
        key: 'quantidadeTotal',
        label: '',
        align: 'right',
        renderTh: () => renderStockSortableHeader('quantidadeTotal', 'Qtd em estoque', 'right'),
        render: (item) => <span>{item.quantidadeTotal}</span>,
      },
      {
        key: 'alocada',
        label: '',
        align: 'right',
        renderTh: () => renderStockSortableHeader('quantidadeAlocada', 'Alocada', 'right'),
        render: (item) => <span className="text-white/90">{item.quantidadeAlocada ?? 0}</span>,
      },
      {
        key: 'disponivel',
        label: '',
        align: 'right',
        renderTh: () => renderStockSortableHeader('quantidadeDisponivel', 'Disponível', 'right'),
        render: (item) => (
          <span className="text-emerald-300/95 font-medium">{item.quantidadeDisponivel ?? 0}</span>
        ),
      },
      {
        key: 'avarias',
        label: '',
        align: 'right',
        renderTh: () => renderStockSortableHeader('quantidadeAvariadaTotal', 'Avarias', 'right'),
        stopRowClick: true,
        render: (item) => {
          const q = item.quantidadeAvariadaTotal ?? 0;
          return (
            <div className="flex flex-col items-end gap-1.5 min-w-[7rem]">
              <span className={q > 0 ? 'text-amber-300/95 font-medium' : 'text-white/45'}>{q}</span>
              {q > 0 && (
                <button
                  type="button"
                  className={btn.primarySoft}
                  onClick={() => void openStockLivroAvarias(item)}
                >
                  Ver motivos
                </button>
              )}
            </div>
          );
        },
      },
      {
        key: 'valor',
        label: '',
        align: 'right',
        renderTh: () => renderStockSortableHeader('valorTotal', 'Valores', 'right'),
        render: (item) => (
          <div className="text-right text-xs sm:text-sm leading-4 space-y-0.5">
            <div>
              <span className="text-white/60 mr-1">Médio:</span>
              <span className="text-white/90">
                {item.valorMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <div>
              <span className="text-white/60 mr-1">Total:</span>
              <span className="text-emerald-300">
                {item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: 'acoes',
        label: 'Ações',
        align: 'right',
        stopRowClick: true,
        render: (item) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={btn.primarySoft}
              onClick={() => {
                void openStockQuotes(item);
              }}
            >
              Ver cotações
            </button>
            <button
              type="button"
              className={btn.editSm}
              onClick={() => {
                void openStockItemEditor(item);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              className={btn.dangerSm}
              onClick={() => {
                setStockItemToDelete(item);
                setShowStockDeleteModal(true);
              }}
            >
              Excluir
            </button>
          </div>
        ),
      },
    ],
    [
      allFilteredStockSelected,
      renderStockSortableHeader,
      selectedStockItemKeySet,
      openStockLivroAvarias,
      openStockQuotes,
      openStockItemEditor,
    ],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Curadoria de Livros</h2>
          <p className="text-sm text-white/60">
            Orçamentos de livros e estoque específico da curadoria, separados do módulo de Compras.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {activeTab === 'orcamentos' && (
              <>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => {
                    setShowImportModal(true);
                  }}
                >
                  Importar XLSX
                </button>
                <button type="button" className={btn.primary} onClick={() => setShowCreateModal(true)}>
                  Novo orçamento
                </button>
              </>
            )}
            {activeTab === 'estoque' && (
              <>
                <button
                  type="button"
                  className={btn.primary}
                  onClick={() => {
                    setStockItemMode('add');
                    setStockItemForm(createEmptyItem());
                    setStockQuotesForm([createEmptyStockQuote()]);
                    setOriginalStockQuoteRefs([]);
                    setShowStockItemModal(true);
                  }}
                >
                  Adicionar item ao estoque
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="flex border-b border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('orcamentos')}
            className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
              activeTab === 'orcamentos'
                ? 'bg-primary text-white border-b-2 border-primary'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Orçamentos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('estoque')}
            className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
              activeTab === 'estoque'
                ? 'bg-primary text-white border-b-2 border-primary'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Estoque da curadoria
          </button>
        </div>
      </div>

      {activeTab === 'orcamentos' && (
        <>
          <CollapsibleFilters
            show={showOrcamentosFilters}
            setShow={setShowOrcamentosFilters}
            hasActiveFilters={
              search.trim().length > 0 ||
              budgetStatusFilter !== '' ||
              budgetProjectFilter !== 'all' ||
              budgetSetorFilter !== 'all' ||
              budgetSupplierFilter !== 'all'
            }
            onClear={() => {
              setSearch('');
              setBudgetStatusFilter('');
              setBudgetProjectFilter('all');
              setBudgetSetorFilter('all');
              setBudgetSupplierFilter('all');
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar orçamento por nome, observação ou projeto..."
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Status</label>
                <select
                  value={budgetStatusFilter}
                  onChange={(event) =>
                    setBudgetStatusFilter(
                      event.target.value as
                        | ''
                        | 'PENDENTE'
                        | 'COMPRADO_ACAMINHO'
                        | 'ENTREGUE'
                        | 'SOLICITADO'
                        | 'REPROVADO',
                    )
                  }
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">Todos os status</option>
                  {CURADORIA_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-neutral text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-white/90 mb-1">Projeto</label>
                <select
                  value={budgetProjectFilter === 'all' ? '' : budgetProjectFilter}
                  onChange={(event) =>
                    setBudgetProjectFilter(
                      event.target.value ? Number(event.target.value) : 'all',
                    )
                  }
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">Todos os projetos</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id} className="bg-neutral text-white">
                      {project.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Setor</label>
                <select
                  value={budgetSetorFilter === 'all' ? '' : budgetSetorFilter}
                  onChange={(event) =>
                    setBudgetSetorFilter(event.target.value ? Number(event.target.value) : 'all')
                  }
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">Todos os setores</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id} className="bg-neutral text-white">
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-white/90 mb-1">Fornecedor</label>
                <select
                  value={budgetSupplierFilter === 'all' ? '' : budgetSupplierFilter}
                  onChange={(event) =>
                    setBudgetSupplierFilter(event.target.value ? Number(event.target.value) : 'all')
                  }
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">Todos os fornecedores</option>
                  {suppliers.map((f) => (
                    <option key={f.id} value={f.id} className="bg-neutral text-white">
                      {f.nomeFantasia || f.razaoSocial}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CollapsibleFilters>

          {error && (
            <div className="bg-danger/15 border border-danger/40 text-danger px-4 py-3 rounded-md">{error}</div>
          )}

          <DataTable<CuradoriaBudget>
            data={filteredBudgets}
            columns={columns}
            keyExtractor={(budget) => budget.id}
            loading={loading}
            emptyMessage="Nenhum orçamento de curadoria encontrado."
            paginate
            initialPageSize={20}
            onRowClick={(budget) => navigate(`/curadoria/${budget.id}`)}
            renderMobileCard={(budget) => (
          <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="font-semibold">{budget.nome}</p>
            <p className="text-xs text-white/70">Status: {(budget.status ?? 'PENDENTE').replaceAll('_', ' ')}</p>
            <p className="text-xs text-white/60">Projeto: {budget.projeto?.nome ?? 'Sem projeto'}</p>
            <p className="text-xs text-white/60">
              Fornecedor: {budget.fornecedor?.nomeFantasia ?? budget.fornecedor?.razaoSocial ?? 'Não informado'}
            </p>
            <p className="text-xs text-white/60">
              Itens: {budget.totalItens} | Qtd total: {budget.totalQuantidade}
            </p>
            <p className="text-xs text-white/60">
              Bruto:{' '}
              {budget.totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Desconto:{' '}
              {budget.totalDesconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-emerald-300">
              Líquido:{' '}
              {budget.totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            {budget.arquivoOrcamentoUrl && (
              <UploadFileLink
                src={budget.arquivoOrcamentoUrl}
                className="text-xs text-primary hover:underline inline-block"
              >
                Arquivo original: {getDataUrlFileName(budget.arquivoOrcamentoUrl)}
              </UploadFileLink>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                className={btn.primarySoft}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/curadoria/${budget.id}`);
                }}
              >
                Detalhes
              </button>
              <button
                type="button"
                className={btn.editSm}
                disabled={!canEdit}
                onClick={(event) => {
                  event.stopPropagation();
                  openEditBudgetModal(budget);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className={btn.dangerSm}
                disabled={!canEdit}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDeleteBudget(budget);
                }}
              >
                Excluir
              </button>
            </div>
          </div>
            )}
          />
        </>
      )}

      {activeTab === 'estoque' && (
        <>
          <CollapsibleFilters
            show={showEstoqueFilters}
            setShow={setShowEstoqueFilters}
            hasActiveFilters={stockSearch.trim().length > 0 || stockCategoryId !== 'all'}
            onClear={() => {
              setStockSearch('');
              setStockCategoryId('all');
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(event) => setStockSearch(event.target.value)}
                  placeholder="Buscar por título, ISBN, gênero literário, autor ou editora..."
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Gênero</label>
                <select
                  value={stockCategoryId === 'all' ? '' : stockCategoryId}
                  onChange={(event) =>
                    setStockCategoryId(
                      event.target.value ? Number(event.target.value) : 'all',
                    )
                  }
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2rem',
                  }}
                >
                  <option value="" className="bg-neutral text-white">Todos os gêneros literários</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id} className="bg-neutral text-white">
                      {category.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CollapsibleFilters>

          {selectedStockItemKeys.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-white/70">
                {selectedStockItemKeys.length} item(ns) selecionado(s)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btn.success}
                  onClick={() => setShowStockReportModal(true)}
                >
                  Gerar Relatório ({selectedStockItemKeys.length})
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => setSelectedStockItemKeys([])}
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          )}

          <DataTable<CuradoriaStockItem>
            data={filteredStockItems}
            columns={stockColumns}
            keyExtractor={(item) => `${item.isbn}-${item.categoriaId ?? 'sem-categoria'}`}
            loading={stockLoading}
            emptyMessage="Nenhum item em estoque para orçamentos entregues."
            paginate
            initialPageSize={20}
            renderMobileCard={(item) => (
              <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-white/70">{item.isbn}</p>
                    <p className="font-semibold">{item.nome}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedStockItemKeySet.has(getStockItemKey(item))}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleStockItemSelection(getStockItemKey(item));
                    }}
                    className="accent-primary mt-1 shrink-0"
                    aria-label={`Selecionar item ${item.isbn}`}
                  />
                </div>
                <p className="text-xs text-white/60">
                  Gênero literário: {item.categoriaNome ?? 'Sem gênero literário'}
                </p>
                <p className="text-xs text-white/60">
                  Autor: {item.autor ?? '-'}
                </p>
                <p className="text-xs text-white/60">
                  Qtd em estoque: {item.quantidadeTotal} · Alocada: {item.quantidadeAlocada ?? 0} · Disponível:{' '}
                  <span className="text-emerald-300/90">{item.quantidadeDisponivel ?? 0}</span> · Avarias:{' '}
                  {item.quantidadeAvariadaTotal ?? 0}
                </p>
                {((item.quantidadeAvariadaTotal ?? 0) > 0) && (
                  <button
                    type="button"
                    className={`${btn.primarySoft} w-full justify-center`}
                    onClick={() => void openStockLivroAvarias(item)}
                  >
                    Ver motivos das avarias
                  </button>
                )}
                <p className="text-xs text-white/60">
                  Valor médio:{' '}
                  {item.valorMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-xs text-emerald-300">
                  Valor total:{' '}
                  {item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    className={btn.primarySoft}
                    onClick={() => {
                      void openStockQuotes(item);
                    }}
                  >
                    Ver cotações
                  </button>
                  <button
                    type="button"
                    className={btn.editSm}
                    onClick={() => {
                      void openStockItemEditor(item);
                    }}
                  >
                    Editar
                  </button>
                </div>
              </div>
            )}
          />
        </>
      )}

      {showStockItemModal && (
        <AppModal
          open={showStockItemModal}
          onClose={() => setShowStockItemModal(false)}
          title=""
          showHeader={false}
          size="lg"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {stockItemMode === 'add' ? 'Adicionar item ao estoque da curadoria' : 'Editar item do estoque da curadoria'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStockItemModal(false)}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveStockItem} className="p-6 space-y-5">
              {/* Seção de busca / identificação do livro */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Título (opcional)</label>
                    <input
                      type="text"
                      value={stockItemForm.nome}
                      onChange={(event) => updateStockItem('nome', event.target.value)}
                      placeholder="Ex.: O Alquimista"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ISBN (obrigatório)</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        value={stockItemForm.isbn}
                        onChange={(event) => updateStockItem('isbn', event.target.value)}
                        onBlur={() => {
                          void fetchIsbnForStock();
                        }}
                        placeholder="Ex.: 9788532530783"
                        className={fieldClass}
                        required
                      />
                      <button
                        type="button"
                        className={btn.primary}
                        onClick={() => {
                          void fetchIsbnForStock();
                        }}
                        disabled={stockIsbnLoading}
                      >
                        {stockIsbnLoading ? '...' : 'Buscar'}
                      </button>
                    </div>
                    {stockItemMode === 'edit' && stockItemForm.isbn && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-primary hover:underline"
                        onClick={() => {
                          void openStockQuotes({
                            isbn: stockItemForm.isbn,
                            nome: stockItemForm.nome,
                            categoriaId: stockQuotesForm[0]?.categoriaId ?? null,
                            categoriaNome:
                              categories.find((c) => c.id === stockQuotesForm[0]?.categoriaId)?.nome ?? null,
                            quantidadeTotal: stockQuotesForm[0]?.quantidade ?? 0,
                            quantidadeAlocada: 0,
                            quantidadeDisponivel: 0,
                            quantidadeAvariadaTotal: 0,
                            valorMedio: stockQuotesForm[0]?.valor ?? 0,
                            valorTotal: 0,
                            descontoMedio: 0,
                            autor: stockItemForm.autor ?? null,
                            editora: stockItemForm.editora ?? null,
                            anoPublicacao: stockItemForm.anoPublicacao ?? null,
                          });
                        }}
                      >
                        Ver cotações deste ISBN
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Autor (opcional)</label>
                    <input
                      type="text"
                      value={stockItemForm.autor ?? ''}
                      onChange={(event) => updateStockItem('autor', event.target.value)}
                      placeholder="Ex.: Machado de Assis"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Editora (opcional)</label>
                    <input
                      type="text"
                      value={stockItemForm.editora ?? ''}
                      onChange={(event) => updateStockItem('editora', event.target.value)}
                      placeholder="Ex.: Companhia das Letras"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ano/Data publicação (opcional)</label>
                    <input
                      type="text"
                      value={stockItemForm.anoPublicacao ?? ''}
                      onChange={(event) => updateStockItem('anoPublicacao', event.target.value)}
                      placeholder="Ex.: 2023 ou 2023-08-15"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Cotações</p>
                  <button
                    type="button"
                    className={btn.primarySoft}
                    onClick={addStockQuote}
                  >
                    + Adicionar cotação
                  </button>
                </div>
                <div className="space-y-3">
                  {stockQuotesForm.map((quote, quoteIndex) => (
                    <div key={`quote-${quoteIndex}`} className="bg-black/20 border border-white/10 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white/80">Cotação {quoteIndex + 1}</p>
                        {stockQuotesForm.length > 1 && (
                          <button
                            type="button"
                            className="text-xs text-red-300 hover:text-red-200"
                            onClick={() => removeStockQuote(quoteIndex)}
                          >
                            Remover
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-white/70 mb-1">Gênero literário</label>
                          <AppSelect
                            value={quote.categoriaId ?? ''}
                            onChange={(value) =>
                              updateStockQuote(
                                quoteIndex,
                                'categoriaId',
                                value ? Number(value) : undefined,
                              )
                            }
                            options={categories.map((category) => ({
                              value: category.id,
                              label: category.nome,
                            }))}
                            placeholder="Selecione"
                            selectClassName={fieldClass}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-white/70 mb-1">Quantidade</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={quote.quantidade ?? 1}
                            onChange={(event) =>
                              updateStockQuote(
                                quoteIndex,
                                'quantidade',
                                event.target.value === '' ? undefined : Number(event.target.value),
                              )
                            }
                            className={fieldClass}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-white/70 mb-1">Valor unitário (R$)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={quote.valor ?? 0}
                            onChange={(event) =>
                              updateStockQuote(
                                quoteIndex,
                                'valor',
                                event.target.value === '' ? undefined : Number(event.target.value),
                              )
                            }
                            className={fieldClass}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-white/70 mb-1">Tipo de desconto</label>
                          <div className="flex items-center gap-3 bg-neutral/70 border border-white/10 rounded-md px-3 py-1.5">
                            <label className="flex items-center gap-1 text-xs text-white/80 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-primary"
                                checked={quote.descontoTipo === 'VALOR'}
                                onChange={() => updateStockQuote(quoteIndex, 'descontoTipo', 'VALOR')}
                              />
                              <span>R$</span>
                            </label>
                            <label className="flex items-center gap-1 text-xs text-white/80 cursor-pointer">
                              <input
                                type="radio"
                                className="accent-primary"
                                checked={quote.descontoTipo === 'PERCENTUAL'}
                                onChange={() => updateStockQuote(quoteIndex, 'descontoTipo', 'PERCENTUAL')}
                              />
                              <span>%</span>
                            </label>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={quote.desconto ?? 0}
                            onChange={(event) =>
                              updateStockQuote(
                                quoteIndex,
                                'desconto',
                                event.target.value === '' ? undefined : Number(event.target.value),
                              )
                            }
                            className={`${fieldClass} mt-2`}
                            placeholder={quote.descontoTipo === 'VALOR' ? 'Ex.: 10.00' : 'Ex.: 10'}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-xs text-white/70 mb-1">Fornecedor (opcional)</label>
                          <AppSelect
                            value={quote.fornecedorId ?? ''}
                            onChange={(value) =>
                              updateStockQuote(
                                quoteIndex,
                                'fornecedorId',
                                value ? Number(value) : undefined,
                              )
                            }
                            options={suppliers.map((supplier) => ({
                              value: supplier.id,
                              label: supplier.nomeFantasia || supplier.razaoSocial,
                            }))}
                            placeholder="Selecione um fornecedor"
                            selectClassName={fieldClass}
                          />
                        </div>
                        <div className="flex justify-end items-end">
                          <div className="text-right w-full">
                            <p className="text-xs text-white/60">Valor líquido total estimado</p>
                            <p className="text-sm font-semibold text-emerald-300">
                              {(() => {
                                const valor = Number(quote.valor || 0);
                                const quantidade = Number(quote.quantidade || 1);
                                const rawDesc = Number(quote.desconto || 0);
                                const desconto =
                                  quote.descontoTipo === 'PERCENTUAL' ? (valor * rawDesc) / 100 : rawDesc;
                                const liquidoUnitario = Math.max(0, valor - desconto);
                                return Math.max(0, liquidoUnitario * quantidade).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                });
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className={btn.secondaryLg}
                  onClick={() => {
                    setShowStockItemModal(false);
                    setOriginalStockQuoteRefs([]);
                  }}
                  disabled={stockItemSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={stockItemSaving}>
                  {stockItemSaving ? 'Salvando...' : stockItemMode === 'add' ? 'Salvar item' : 'Salvar ajuste'}
                </button>
              </div>
            </form>
        </AppModal>
      )}

      {showStockQuotesModal && stockQuotesItem && (
        <AppModal
          open={showStockQuotesModal && !!stockQuotesItem}
          onClose={() => {
            setShowStockQuotesModal(false);
            setStockQuotes([]);
            setStockQuotesItem(null);
          }}
          title=""
          showHeader={false}
          size="xl"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Cotações do item</h3>
                <p className="text-xs text-white/70">
                  ISBN {stockQuotesItem.isbn} · {stockQuotesItem.nome}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowStockQuotesModal(false);
                  setStockQuotes([]);
                  setStockQuotesItem(null);
                }}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {stockQuotesLoading && <p className="text-sm text-white/80">Carregando cotações...</p>}
              {!stockQuotesLoading && stockQuotes.length === 0 && (
                <p className="text-sm text-white/70">
                  Nenhuma cotação encontrada para este ISBN em orçamentos entregues.
                </p>
              )}
              {!stockQuotesLoading && stockQuotes.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-white/60 border-b border-white/10">
                        <th className="py-2 pr-4">Orçamento</th>
                        <th className="py-2 pr-4">Projeto</th>
                        <th className="py-2 pr-4">Fornecedor</th>
                        <th className="py-2 pr-4">Gênero literário</th>
                        <th className="py-2 pr-4 text-right">Qtd</th>
                        <th className="py-2 pr-4 text-right">Valor (R$)</th>
                        <th className="py-2 pr-4 text-right">Desconto (R$)</th>
                        <th className="py-2 pr-4 text-right">V. líquido (R$)</th>
                        <th className="py-2 pr-0 text-right">Criado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockQuotes.map((quote) => (
                        <tr key={`${quote.orcamentoId}-${quote.categoriaId}-${quote.valor}-${quote.valorLiquido}`} className="border-b border-white/5">
                          <td className="py-2 pr-4">
                            <span className="text-white/90">{quote.orcamentoNome}</span>
                          </td>
                          <td className="py-2 pr-4">
                            <span className="text-white/80">{quote.projetoNome ?? '-'}</span>
                          </td>
                          <td className="py-2 pr-4">
                            <span className="text-white/80">
                              {quote.fornecedorNome ?? '-'}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <span className="text-white/80">{quote.categoriaNome ?? '-'}</span>
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {quote.quantidade}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {quote.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {quote.desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {quote.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="py-2 pr-0 text-right text-white/70 text-xs">
                            {new Date(quote.dataCriacao).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
        </AppModal>
      )}

      {showStockLivroAvariasModal && stockLivroAvariasItem && (
        <AppModal
          open={showStockLivroAvariasModal && !!stockLivroAvariasItem}
          onClose={() => {
            setShowStockLivroAvariasModal(false);
            setStockLivroAvariasItem(null);
            setStockLivroAvariasLinhas([]);
          }}
          title="Motivos das avarias (almoxarifado)"
          size="xl"
        >
          <p className="text-sm text-white/75 mb-4">
            <span className="font-medium text-white">{stockLivroAvariasItem.nome}</span> — ISBN{' '}
            <span className="font-mono">{stockLivroAvariasItem.isbn}</span>
            {stockLivroAvariasItem.categoriaNome ? ` · ${stockLivroAvariasItem.categoriaNome}` : ''}
          </p>
          {stockLivroAvariasLoading && <p className="text-sm text-white/80">Carregando...</p>}
          {!stockLivroAvariasLoading && stockLivroAvariasLinhas.length === 0 && (
            <p className="text-sm text-white/60">Nenhum registro de avaria encontrado para este título e gênero.</p>
          )}
          {!stockLivroAvariasLoading && stockLivroAvariasLinhas.length > 0 && (
            <div className="overflow-x-auto max-h-[min(60vh,480px)] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-neutral z-10">
                  <tr className="text-left text-xs text-white/60 border-b border-white/10">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3 text-right">Qtd</th>
                    <th className="py-2 pr-3 min-w-[200px]">Motivo / justificativa</th>
                    <th className="py-2 pr-3">Produto galpão</th>
                    <th className="py-2 pr-3">Projeto</th>
                    <th className="py-2 pr-0">Fornecedor</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLivroAvariasLinhas.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 align-top">
                      <td className="py-2 pr-3 text-white/80 text-xs whitespace-nowrap">
                        {new Date(row.dataCriacao).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">{row.quantidade}</td>
                      <td className="py-2 pr-3 text-white/90 break-words">{row.justificativa}</td>
                      <td className="py-2 pr-3 text-xs text-white/70">{row.galpaoProduto?.nome ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs text-white/70">{row.projeto?.nome ?? '—'}</td>
                      <td className="py-2 pr-0 text-xs text-white/70">
                        {row.fornecedor?.nomeFantasia ?? row.fornecedor?.razaoSocial ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AppModal>
      )}

      {showDeleteModal && budgetToDelete && (
        <ConfirmDeleteByNameModal
          open={showDeleteModal}
          title="Confirmar Exclusão"
          entityLabel="o orçamento"
          entityName={budgetToDelete.nome}
          confirmValue={deleteConfirmName}
          onConfirmValueChange={setDeleteConfirmName}
          onClose={() => {
            setShowDeleteModal(false);
            setBudgetToDelete(null);
            setDeleteConfirmName('');
            setDeleteBudgetAlsoStock(false);
            setDeleteError(null);
          }}
          onConfirm={() => void handleConfirmDeleteBudget()}
          loading={deletingBudgetId === budgetToDelete.id}
          errorMessage={deleteError}
          confirmButtonLabel="Confirmar Remoção"
          extraContent={
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={deleteBudgetAlsoStock}
                onChange={(e) => setDeleteBudgetAlsoStock(e.target.checked)}
                className="mt-0.5 accent-danger"
              />
              <span>Apagar também os itens deste orçamento que estão no estoque.</span>
            </label>
          }
        />
      )}

      {showStockDeleteModal && stockItemToDelete && (
        <AppModal
          open={showStockDeleteModal}
          onClose={() => {
            setShowStockDeleteModal(false);
            setStockItemToDelete(null);
          }}
          title="Remover item do estoque da curadoria"
          size="sm"
          stickyHeader={false}
          bodyClassName="p-8 space-y-4"
        >
              <p className="text-white/90">
                Tem certeza que deseja remover todo o estoque do título{' '}
                <span className="font-semibold">"{stockItemToDelete.nome}"</span> (ISBN{' '}
                <span className="font-mono">{stockItemToDelete.isbn}</span>) para o gênero{' '}
                <span className="font-semibold">
                  {stockItemToDelete.categoriaNome ?? 'Sem gênero literário'}
                </span>
                ?
              </p>
              <p className="text-sm text-white/70">
                Esta ação não pode ser desfeita. O estoque atual de{' '}
                <span className="font-semibold">{stockItemToDelete.quantidadeTotal}</span> itens será zerado
                para este ISBN + gênero literário.
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className={btn.secondaryLg}
                  disabled={stockDeleting}
                  onClick={() => {
                    setShowStockDeleteModal(false);
                    setStockItemToDelete(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={btn.dangerLg}
                  disabled={stockDeleting}
                  onClick={async () => {
                    if (!stockItemToDelete) return;
                    try {
                      setStockDeleting(true);
                      try {
                        await api.delete(
                          `/curadoria/estoque/${encodeURIComponent(stockItemToDelete.isbn)}`,
                          {
                            params:
                              stockItemToDelete.categoriaId != null
                                ? { categoriaId: stockItemToDelete.categoriaId }
                                : undefined,
                          },
                        );
                      } catch (firstErr: any) {
                        // Fallback: se a categoria não casar por algum motivo de dados antigos,
                        // tenta remover pelo ISBN para não bloquear a operação.
                        const isNotFound = Number(firstErr?.response?.status) === 404;
                        if (!isNotFound || stockItemToDelete.categoriaId == null) throw firstErr;
                        await api.delete(`/curadoria/estoque/${encodeURIComponent(stockItemToDelete.isbn)}`);
                      }
                      toast.success('Estoque do item removido com sucesso.');
                      await loadStock();
                      setShowStockDeleteModal(false);
                      setStockItemToDelete(null);
                    } catch (err: any) {
                      toast.error(formatApiError(err));
                    } finally {
                      setStockDeleting(false);
                    }
                  }}
                >
                  {stockDeleting ? 'Removendo...' : 'Remover do estoque'}
                </button>
              </div>
        </AppModal>
      )}

      {showStockReportModal && (
        <AppModal
          open={showStockReportModal}
          onClose={() => {
            setShowStockReportModal(false);
            setSelectedStockItemKeys([]);
          }}
          title="Relatório de Estoque (Curadoria)"
          size="xl"
          stickyHeader={false}
          bodyClassName="p-6 space-y-6"
        >
          {(() => {
            const reportData = calculateCuradoriaStockReportTotals();
            const exportDate = new Date().toISOString().split('T')[0];

            return (
              <>
                <div className="bg-white/5 rounded-lg p-5 border border-white/10 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="text-sm text-white/70 mb-1">Total de Itens</div>
                      <div className="text-2xl font-bold text-white">{reportData.totalItens}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="text-sm text-white/70 mb-1">Quantidade Total</div>
                      <div className="text-2xl font-bold text-white">{reportData.totalQuantidade}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="text-sm text-white/70 mb-1">Valor Total</div>
                      <div className="text-2xl font-bold text-primary">
                        {reportData.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    </div>
                  </div>

                  {reportData.byCategoria.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-white/90 mb-3">
                        Distribuição por gênero literário
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {reportData.byCategoria.slice(0, 9).map((c) => (
                          <div key={String(c.categoriaId ?? 'sem-categoria')} className="bg-white/5 rounded p-3 border border-white/10">
                            <div className="text-xs text-white/70">{c.categoriaNome}</div>
                            <div className="text-sm font-bold text-white">{c.count} item(ns)</div>
                            <div className="text-xs text-emerald-200">
                              Total: {c.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {reportData.byCategoria.length > 9 && (
                        <p className="text-xs text-white/60 mt-2">
                          Mostrando top 9 de {reportData.byCategoria.length}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/80 border-b border-white/20 bg-white/10">
                        <th className="px-4 py-2.5 font-medium">ISBN</th>
                        <th className="px-4 py-2.5 font-medium">Título</th>
                        <th className="px-4 py-2.5 font-medium">Gênero</th>
                        <th className="px-4 py-2.5 font-medium">Autor</th>
                        <th className="px-4 py-2.5 font-medium w-20 text-right">Qtd</th>
                        <th className="px-4 py-2.5 font-medium w-20 text-right">Aloc.</th>
                        <th className="px-4 py-2.5 font-medium w-20 text-right">Disp.</th>
                        <th className="px-4 py-2.5 font-medium w-20 text-right">Avar.</th>
                        <th className="px-4 py-2.5 font-medium w-32 text-right">Valor total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.items.map((item) => (
                        <tr
                          key={getStockItemKey(item)}
                          className="border-b border-white/10"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-white/90">{item.isbn}</td>
                          <td className="px-4 py-2.5 whitespace-normal break-words">{item.nome}</td>
                          <td className="px-4 py-2.5">{item.categoriaNome ?? 'Sem gênero literário'}</td>
                          <td className="px-4 py-2.5 whitespace-normal break-words">{item.autor ?? '-'}</td>
                          <td className="px-4 py-2.5 text-right">{item.quantidadeTotal}</td>
                          <td className="px-4 py-2.5 text-right">{item.quantidadeAlocada ?? 0}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-300/90">{item.quantidadeDisponivel ?? 0}</td>
                          <td className="px-4 py-2.5 text-right text-amber-300/90">{item.quantidadeAvariadaTotal ?? 0}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-300">
                            {item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    className={btn.secondaryLg}
                    onClick={() => {
                      setShowStockReportModal(false);
                      setSelectedStockItemKeys([]);
                    }}
                  >
                    Fechar
                  </button>

                  <ExcelDownloadButton
                    buildWorkbook={buildCuradoriaStockReportWorkbook}
                    fileName={`relatorio-estoque-curadoria-${exportDate}.xlsx`}
                    label="Exportar Excel"
                    className="px-6 py-2.5 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors flex items-center gap-2"
                    disabled={reportData.totalItens === 0}
                  />

                  <button
                    type="button"
                    className="px-6 py-2.5 rounded-md bg-primary hover:bg-primary/80 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={reportData.totalItens === 0}
                    onClick={() => {
                      exportCuradoriaStockReportPdf();
                    }}
                  >
                    Exportar PDF
                  </button>
                </div>
              </>
            );
          })()}
        </AppModal>
      )}

      {showEditModal && (
        <AppModal
          open={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingBudgetId(null);
          }}
          title=""
          showHeader={false}
          size="lg"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Editar orçamento de curadoria</h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingBudgetId(null);
                }}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditBudget} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Nome do orçamento</label>
                  <input
                    type="text"
                    value={editForm.nome}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, nome: event.target.value }))}
                    className={fieldClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Projeto</label>
                  <AppSelect
                    value={editForm.projetoId ?? ''}
                    onChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        projetoId: value ? Number(value) : undefined,
                      }))
                    }
                    placeholder="Sem projeto"
                    options={projects.map((project) => ({
                      value: project.id,
                      label: project.nome,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Setor</label>
                  <AppSelect
                    value={editForm.setorId ?? ''}
                    onChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        setorId: value ? Number(value) : undefined,
                      }))
                    }
                    placeholder="Sem setor"
                    options={setores.map((setor) => ({
                      value: setor.id,
                      label: setor.nome,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Fornecedor</label>
                  <AppSelect
                    value={editForm.fornecedorId ?? ''}
                    onChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        fornecedorId: value ? Number(value) : undefined,
                      }))
                    }
                    placeholder="Fornecedor (opcional)"
                    options={suppliers.map((supplier) => ({
                      value: supplier.id,
                      label: supplier.nomeFantasia || supplier.razaoSocial,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <AppSelect
                    value={editForm.status}
                    onChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        status: value as CuradoriaEditForm['status'],
                      }))
                    }
                    options={CURADORIA_STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    selectClassName={fieldClass}
                  />
                  {editForm.status === 'ENTREGUE' && (
                    <p className="mt-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-md px-3 py-2">
                      Ao salvar com status <span className="font-semibold">Entregue</span>, todos os itens deste orçamento
                      serão considerados no <span className="font-semibold">Estoque da curadoria</span>.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>Forma de pagamento</label>
                <input
                  type="text"
                  value={editForm.formaPagamento}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, formaPagamento: event.target.value }))}
                  placeholder="Pix, Boleto, Cartão..."
                  className={fieldClass}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={labelClass}>Nota Fiscal (NF)</label>
                  <FileDropInput
                    onFilesSelected={(files) => {
                      const file = files[0];
                      if (!file) return;
                      void fileToUploadedUrl(file)
                        .then((value) => setEditForm((prev) => ({ ...prev, nfUrl: value })))
                        .catch(() => toast.error('Não foi possível ler o arquivo da NF.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o arquivo NF aqui"
                  />
                  {editForm.nfUrl && (
                    <UploadFileLink src={editForm.nfUrl} className="text-xs text-primary hover:underline">
                      Abrir NF atual: {getDataUrlFileName(editForm.nfUrl)}
                    </UploadFileLink>
                  )}
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Arquivo do orçamento original</label>
                  <FileDropInput
                    onFilesSelected={(files) => {
                      const file = files[0];
                      if (!file) return;
                      void fileToUploadedUrl(file)
                        .then((value) => setEditForm((prev) => ({ ...prev, arquivoOrcamentoUrl: value })))
                        .catch(() => toast.error('Não foi possível ler o arquivo do orçamento.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o orçamento original aqui"
                  />
                  {editForm.arquivoOrcamentoUrl && (
                    <UploadFileLink src={editForm.arquivoOrcamentoUrl} className="text-xs text-primary hover:underline">
                      Abrir arquivo atual: {getDataUrlFileName(editForm.arquivoOrcamentoUrl)}
                    </UploadFileLink>
                  )}
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Comprovante de pagamento</label>
                  <FileDropInput
                    accept="image/*"
                    onFilesSelected={(files) => {
                      const file = files[0];
                      if (!file) return;
                      void fileToUploadedUrl(file)
                        .then((value) => setEditForm((prev) => ({ ...prev, comprovantePagamentoUrl: value })))
                        .catch(() => toast.error('Não foi possível ler a imagem de pagamento.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o comprovante aqui"
                  />
                  {editForm.comprovantePagamentoUrl && (
                    <UploadFileLink src={editForm.comprovantePagamentoUrl} className="text-xs text-primary hover:underline">
                      Abrir comprovante atual
                    </UploadFileLink>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <AppSelect
                  value={editForm.descontoAplicadoEm}
                  onChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      descontoAplicadoEm: value as 'ITEM' | 'TOTAL',
                    }))
                  }
                  options={[
                    { value: 'ITEM', label: 'Desconto por item' },
                    { value: 'TOTAL', label: 'Desconto no total' },
                  ]}
                  selectClassName="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {editForm.descontoAplicadoEm === 'TOTAL' && (
                  <div className="bg-black/20 border border-primary/30 rounded-md p-3 space-y-2">
                    <p className="text-xs text-white/80 font-medium">Tipo de desconto no total</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <AppSelect
                        value={editDiscountTotalType}
                        onChange={(value) => setEditDiscountTotalType(value as TotalDiscountInputType)}
                        options={[
                          { value: 'VALOR', label: 'Valor (R$)' },
                          { value: 'PERCENTUAL', label: 'Porcentagem (%)' },
                        ]}
                        selectClassName="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.descontoTotal}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            descontoTotal: Number(event.target.value) || 0,
                          }))
                        }
                        placeholder={editDiscountTotalType === 'VALOR' ? 'Ex.: 250.00' : 'Ex.: 10'}
                        className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="text-[11px] text-white/70">
                      {editDiscountTotalType === 'VALOR'
                        ? 'Desconto fixo em reais para esse orçamento.'
                        : `Aplicar ${Number(editForm.descontoTotal || 0).toFixed(2)}% sobre o total bruto atual de R$ ${Number(editingBudgetTotalBruto || 0).toFixed(2)}.`}
                    </p>
                  </div>
                )}
              </div>

              <textarea
                value={editForm.observacao}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, observacao: event.target.value }))
                }
                placeholder="Observações do orçamento"
                className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className={btn.secondaryLg}
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingBudgetId(null);
                  }}
                  disabled={editingBudgetSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={editingBudgetSaving}>
                  {editingBudgetSaving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
        </AppModal>
      )}

      {showCreateModal && (
        <AppModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title=""
          showHeader={false}
          size="xl"
          bodyClassName="p-0"
        >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Novo orçamento de curadoria</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-white/50 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Nome do orçamento</label>
                  <input
                    type="text"
                    value={createForm.nome}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, nome: event.target.value }))}
                    className={fieldClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Projeto</label>
                  <AppSelect
                    value={createForm.projetoId ?? ''}
                    onChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        projetoId: value ? Number(value) : undefined,
                      }))
                    }
                    placeholder="Sem projeto"
                    options={projects.map((project) => ({
                      value: project.id,
                      label: project.nome,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Setor</label>
                  <AppSelect
                    value={createForm.setorId ?? ''}
                    onChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        setorId: value ? Number(value) : undefined,
                      }))
                    }
                    placeholder="Sem setor"
                    options={setores.map((setor) => ({
                      value: setor.id,
                      label: setor.nome,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Fornecedor</label>
                  <AppSelect
                    value={createForm.fornecedorId ?? ''}
                    onChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        fornecedorId: value ? Number(value) : undefined,
                      }))
                    }
                    placeholder="Fornecedor (opcional)"
                    options={suppliers.map((supplier) => ({
                      value: supplier.id,
                      label: supplier.nomeFantasia || supplier.razaoSocial,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <AppSelect
                    value={createForm.status}
                    onChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        status: value as CuradoriaCreateForm['status'],
                      }))
                    }
                    options={CURADORIA_STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    selectClassName={fieldClass}
                  />
                  {createForm.status === 'ENTREGUE' && (
                    <p className="mt-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-md px-3 py-2">
                      Ao salvar com status <span className="font-semibold">Entregue</span>, todos os itens deste orçamento
                      serão considerados no <span className="font-semibold">Estoque da curadoria</span>.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>Forma de pagamento</label>
                <input
                  type="text"
                  value={createForm.formaPagamento}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, formaPagamento: event.target.value }))}
                  placeholder="Pix, Boleto, Cartão..."
                  className={fieldClass}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={labelClass}>Nota Fiscal (NF)</label>
                  <FileDropInput
                    onFilesSelected={(files) => {
                      const file = files[0];
                      if (!file) return;
                      void fileToUploadedUrl(file)
                        .then((value) => setCreateForm((prev) => ({ ...prev, nfUrl: value })))
                        .catch(() => toast.error('Não foi possível ler o arquivo da NF.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o arquivo NF aqui"
                  />
                  {createForm.nfUrl && (
                    <UploadFileLink src={createForm.nfUrl} className="text-xs text-primary hover:underline">
                      NF selecionada: {getDataUrlFileName(createForm.nfUrl)}
                    </UploadFileLink>
                  )}
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Arquivo do orçamento original</label>
                  <FileDropInput
                    onFilesSelected={(files) => {
                      const file = files[0];
                      if (!file) return;
                      void fileToUploadedUrl(file)
                        .then((value) => setCreateForm((prev) => ({ ...prev, arquivoOrcamentoUrl: value })))
                        .catch(() => toast.error('Não foi possível ler o arquivo do orçamento.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o orçamento original aqui"
                  />
                  {createForm.arquivoOrcamentoUrl && (
                    <UploadFileLink src={createForm.arquivoOrcamentoUrl} className="text-xs text-primary hover:underline">
                      Arquivo selecionado: {getDataUrlFileName(createForm.arquivoOrcamentoUrl)}
                    </UploadFileLink>
                  )}
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Comprovante de pagamento</label>
                  <FileDropInput
                    accept="image/*"
                    onFilesSelected={(files) => {
                      const file = files[0];
                      if (!file) return;
                      void fileToUploadedUrl(file)
                        .then((value) => setCreateForm((prev) => ({ ...prev, comprovantePagamentoUrl: value })))
                        .catch(() => toast.error('Não foi possível ler a imagem de pagamento.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o comprovante aqui"
                  />
                  {createForm.comprovantePagamentoUrl && (
                    <UploadFileLink src={createForm.comprovantePagamentoUrl} className="text-xs text-primary hover:underline">
                      Abrir comprovante selecionado
                    </UploadFileLink>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <AppSelect
                  value={createForm.descontoAplicadoEm}
                  onChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      descontoAplicadoEm: value as 'ITEM' | 'TOTAL',
                    }))
                  }
                  options={[
                    { value: 'ITEM', label: 'Desconto por item' },
                    { value: 'TOTAL', label: 'Desconto no total' },
                  ]}
                  selectClassName="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {createForm.descontoAplicadoEm === 'TOTAL' && (
                  <div className="bg-black/20 border border-primary/30 rounded-md p-3 space-y-2">
                    <p className="text-xs text-white/80 font-medium">Como deseja aplicar o desconto total?</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <AppSelect
                        value={createDiscountTotalType}
                        onChange={(value) => setCreateDiscountTotalType(value as TotalDiscountInputType)}
                        options={[
                          { value: 'VALOR', label: 'Valor (R$)' },
                          { value: 'PERCENTUAL', label: 'Porcentagem (%)' },
                        ]}
                        selectClassName="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={createDiscountTotalType === 'VALOR' ? 'Ex.: 250.00' : 'Ex.: 10'}
                        value={createForm.descontoTotal}
                        onChange={(event) =>
                          setCreateForm((prev) => ({ ...prev, descontoTotal: Number(event.target.value) || 0 }))
                        }
                        className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="text-[11px] text-white/70">
                      {createDiscountTotalType === 'VALOR'
                        ? 'Desconto fixo em reais aplicado ao total do orçamento.'
                        : 'Desconto percentual aplicado sobre o total bruto dos itens.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Itens do orçamento</p>
                  <button type="button" className={btn.secondary} onClick={addItem}>
                    Adicionar item
                  </button>
                </div>
                {createForm.itens.map((item, index) => (
                  <div key={`item-${index}`} className="bg-black/20 border border-white/10 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white/60">Item {index + 1}</p>
                      <button type="button" className={btn.dangerSm} onClick={() => removeItem(index)} disabled={createForm.itens.length <= 1}>
                        Remover
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Título (opcional)"
                        value={item.nome}
                        onChange={(event) => updateItem(index, 'nome', event.target.value)}
                        className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="ISBN (obrigatório)"
                          value={item.isbn}
                          onChange={(event) => updateItem(index, 'isbn', event.target.value)}
                          onBlur={() => {
                            void fetchIsbn(index);
                          }}
                          className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        <button
                          type="button"
                          className={btn.secondary}
                          onClick={() => {
                            void fetchIsbn(index);
                          }}
                          disabled={isbnLoadingByIndex[index]}
                        >
                          {isbnLoadingByIndex[index] ? '...' : 'Buscar'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Gênero literário</label>
                        <AppSelect
                          value={item.categoriaId ?? ''}
                          onChange={(value) =>
                            updateItem(index, 'categoriaId', value ? Number(value) : undefined)
                          }
                          placeholder="Selecione"
                          options={categories.map((category) => ({
                            value: category.id,
                            label: category.nome,
                          }))}
                          selectClassName="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Valor (R$)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ex.: 129.90"
                          value={item.valor ?? ''}
                          onChange={(event) =>
                            updateItem(
                              index,
                              'valor',
                              event.target.value === '' ? undefined : Number(event.target.value),
                            )
                          }
                          className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Quantidade</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Ex.: 3"
                          value={item.quantidade ?? ''}
                          onChange={(event) =>
                            updateItem(
                              index,
                              'quantidade',
                              event.target.value === '' ? undefined : Number(event.target.value),
                            )
                          }
                          className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          {createForm.descontoAplicadoEm === 'TOTAL'
                            ? 'Desconto por item (desativado)'
                            : 'Desconto (R$)'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ex.: 10.00"
                          value={item.desconto ?? ''}
                          onChange={(event) =>
                            updateItem(
                              index,
                              'desconto',
                              event.target.value === '' ? undefined : Number(event.target.value),
                            )
                          }
                          className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          disabled={createForm.descontoAplicadoEm === 'TOTAL'}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <textarea
                value={createForm.observacao}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, observacao: event.target.value }))}
                placeholder="Observações do orçamento"
                className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" className={btn.secondaryLg} onClick={() => setShowCreateModal(false)} disabled={creating}>
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={creating}>
                  {creating ? 'Salvando...' : 'Salvar orçamento'}
                </button>
              </div>
            </form>
        </AppModal>
      )}

      {showImportModal && (
        <AppModal
          open={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            setImportFile(null);
            setImportName('');
            setImportProjectId(undefined);
            setImportCategoryId(undefined);
            setImportSupplierId(undefined);
            setOverwriteCurrent(true);
            setImportDiscountMode('ITEM');
            setImportDiscountTotal(0);
            setImportDiscountTotalType('VALOR');
            setImportEstimatedTotalBruto(0);
            setImportEstimatedBooks(0);
          }}
          title=""
          showHeader={false}
          size="md"
          bodyClassName="p-0"
          overlayClassName="items-start sm:items-center overflow-y-auto"
        >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Importar orçamento (.xlsx)</h3>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportName('');
                  setImportProjectId(undefined);
                  setImportCategoryId(undefined);
                  setImportSupplierId(undefined);
                  setOverwriteCurrent(true);
                  setImportDiscountMode('ITEM');
                  setImportDiscountTotal(0);
                  setImportDiscountTotalType('VALOR');
                  setImportEstimatedTotalBruto(0);
                  setImportEstimatedBooks(0);
                }}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleImportXlsx} className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 bg-black/20 border border-white/10 rounded-md p-3">
                <p className="text-xs text-white/70">Baixe o modelo para importar orçamentos de livros.</p>
                <ExcelDownloadButton
                  buildWorkbook={buildCuradoriaTemplateWorkbook}
                  fileName="modelo-curadoria-livros.xlsx"
                  label="Baixar modelo XLSX"
                  className={btn.secondary}
                />
              </div>
              <input
                type="text"
                value={importName}
                onChange={(event) => setImportName(event.target.value)}
                placeholder="Nome do orçamento (opcional)"
                className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <FileDropInput
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onFilesSelected={(files) => {
                  void handleImportFileChange(files[0] ?? null);
                }}
                className="w-full text-sm text-white/80 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/80 file:text-white hover:file:bg-primary"
                dropMessage="Solte a planilha XLSX aqui"
              />
              {importFile && (
                <p className="text-xs text-white/70">
                  Arquivo selecionado: <span className="text-white">{importFile.name}</span>
                </p>
              )}
              <div className="bg-black/20 border border-white/10 rounded-md px-3 py-2 text-xs text-white/70">
                Colunas esperadas:{' '}
                <span className="text-white">
                  isbn(obrigatório), titulo(opcional), editora(opcional), genero_literario, quantidade, valor, desconto (R$),
                  desconto_percentual (%)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={importProjectId ?? ''}
                  onChange={(event) => setImportProjectId(event.target.value ? Number(event.target.value) : undefined)}
                  className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sem projeto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={importCategoryId ?? ''}
                  onChange={(event) => setImportCategoryId(event.target.value ? Number(event.target.value) : undefined)}
                  className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Gênero literário padrão (opcional)</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <select
                  value={importSupplierId ?? ''}
                  onChange={(event) => setImportSupplierId(event.target.value ? Number(event.target.value) : undefined)}
                  className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Fornecedor (opcional)</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.nomeFantasia || supplier.razaoSocial || supplier.cnpj || `Fornecedor #${supplier.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={importDiscountMode}
                  onChange={(event) => setImportDiscountMode(event.target.value as 'ITEM' | 'TOTAL')}
                  className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="ITEM">Desconto por item</option>
                  <option value="TOTAL">Desconto no total</option>
                </select>
                {importDiscountMode === 'TOTAL' && (
                  <div className="bg-black/20 border border-primary/30 rounded-md p-3 space-y-2">
                    <p className="text-xs text-white/80 font-medium">Tipo de desconto no total</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <select
                        value={importDiscountTotalType}
                        onChange={(event) => setImportDiscountTotalType(event.target.value as TotalDiscountInputType)}
                        className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="VALOR">Valor (R$)</option>
                        <option value="PERCENTUAL">Porcentagem (%)</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={importDiscountTotal}
                        onChange={(event) => setImportDiscountTotal(Number(event.target.value) || 0)}
                        placeholder={importDiscountTotalType === 'VALOR' ? 'Ex.: 250.00' : 'Ex.: 10'}
                        className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="text-[11px] text-white/70">
                      {importDiscountTotalType === 'VALOR'
                        ? 'Aplicar desconto fixo em reais ao total importado.'
                        : `Aplicar ${Number(importDiscountTotal || 0).toFixed(2)}% sobre total bruto estimado de R$ ${importEstimatedTotalBruto.toFixed(2)}.`}
                    </p>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={overwriteCurrent}
                  onChange={(event) => setOverwriteCurrent(event.target.checked)}
                  className="rounded border-white/20 bg-neutral/80"
                />
                Sobrescrever orçamentos atuais do projeto selecionado
              </label>

              {importing && (
                <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-300" />
                    <p className="text-sm font-medium text-amber-200">Importando planilha e consultando ISBNs...</p>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-900/40">
                    <div
                      className="h-full rounded-full bg-amber-300 transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-amber-100/80">Progresso estimado: {importProgress}%</p>
                  <p className="mt-1 text-xs text-amber-100/90">
                    Esse processo pode demorar porque o sistema busca dados de cada livro por ISBN para preencher informações
                    automaticamente.
                    {importEstimatedBooks > 0 ? ` Livros identificados na planilha: ${importEstimatedBooks}.` : ''}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className={btn.secondaryLg}
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportName('');
                    setImportProjectId(undefined);
                    setImportCategoryId(undefined);
                    setImportSupplierId(undefined);
                    setOverwriteCurrent(true);
                    setImportDiscountMode('ITEM');
                    setImportDiscountTotal(0);
                    setImportDiscountTotalType('VALOR');
                    setImportEstimatedTotalBruto(0);
                    setImportEstimatedBooks(0);
                  }}
                  disabled={importing}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={importing}>
                  {importing ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </form>
        </AppModal>
      )}
    </div>
  );
}

