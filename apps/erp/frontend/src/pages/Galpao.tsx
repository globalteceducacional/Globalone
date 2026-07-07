import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx-js-style';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { toast, formatApiError } from '../utils/toast';
import { btn } from '../utils/buttonStyles';
import { AppModal } from '../components/ui/AppModal';
import { ConfirmDeleteByNameModal } from '../components/ui/ConfirmDeleteByNameModal';
import { AppSelect } from '../components/ui/AppSelect';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import type {
  CuradoriaOrcamentoACaminhoRow,
  GalpaoProduto,
  LivroAlocadoReport,
  LivroAvariaReport,
  LivroDisponivel,
  LivroDisponivelPorFornecedor,
} from '../types/galpao';
import { userCanEditAlmoxarifado } from '../utils/almoxarifadoAccess';
import type { Category } from '../types/stock';
import GalpaoProdutoDetails from './GalpaoProdutoDetails';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';
import { almoxarifadoMobileCardCls } from '../components/almoxarifado/almoxarifadoUi';
import { AppSectionTabs } from '../components/ui/AppSectionTabs';

interface LivroAvariaRegistro {
  id: number;
  galpaoProdutoId: number | null;
  quantidade: number;
  justificativa: string;
  dataCriacao: string;
  galpaoProduto?: { id: number; nome: string } | null;
  fornecedor?: { id: number; nomeFantasia: string; razaoSocial: string } | null;
  projeto?: { id: number; nome: string } | null;
}

type RelatorioLivroTipo = 'disponiveis' | 'alocados' | 'avarias';
type RelatorioLivroFormato = 'pdf' | 'excel';

type GalpaoLivrosSortCol =
  | 'isbn'
  | 'nome'
  | 'categoria'
  | 'autor'
  | 'editora'
  | 'qtd'
  | 'alocados'
  | 'avarias';

type GalpaoProdutoSortCol = 'nome' | 'ativo';

type OrcamentosACaminhoSortCol = 'nome' | 'projeto' | 'fornecedor' | 'quantidadeItens' | 'dataCriacao';

type MainTabKey = 'produto' | 'livros' | 'itens' | 'recebimento';

const MAIN_TABS: { id: MainTabKey; label: string; shortLabel: string }[] = [
  { id: 'produto', label: 'Produto', shortLabel: 'Produto' },
  { id: 'livros', label: 'Estoque de livros', shortLabel: 'Livros' },
  { id: 'itens', label: 'Estoque de itens', shortLabel: 'Itens' },
  { id: 'recebimento', label: 'Recebimento curadoria', shortLabel: 'Recebimento' },
];

export default function Galpao() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [produtos, setProdutos] = useState<GalpaoProduto[]>([]);
  const [activeMainTab, setActiveMainTab] = useState<MainTabKey>('produto');

  const [orcamentosACaminho, setOrcamentosACaminho] = useState<CuradoriaOrcamentoACaminhoRow[]>([]);
  const [orcamentosACaminhoLoading, setOrcamentosACaminhoLoading] = useState(false);
  const [orcamentoEntregaModal, setOrcamentoEntregaModal] = useState<CuradoriaOrcamentoACaminhoRow | null>(null);
  const [marcandoOrcamentoEntrega, setMarcandoOrcamentoEntrega] = useState(false);

  // Usado para alimentar as telas de estoque (livros/itens), que dependem
  // do `galpaoProdutoId` no backend.
  const [produtosAllForTabs, setProdutosAllForTabs] = useState<GalpaoProduto[]>([]);
  const [selectedProdutoId, setSelectedProdutoId] = useState<number | null>(null);

  const [livrosSearch, setLivrosSearch] = useState('');
  const [livrosCategoriaId, setLivrosCategoriaId] = useState<number | 'all'>('all');
  const [livrosEditoraFilter, setLivrosEditoraFilter] = useState('');
  const [livrosAvariasFilter, setLivrosAvariasFilter] = useState<'all' | 'com' | 'sem'>('all');
  const [categoriesLivros, setCategoriesLivros] = useState<Category[]>([]);
  const [livrosDisponiveis, setLivrosDisponiveis] = useState<LivroDisponivel[]>([]);
  const [livrosLoading, setLivrosLoading] = useState(false);
  const { sortColumn: livrosSortCol, sortDirection: livrosSortDir, handleSort: handleLivrosSort } =
    useClientTableSort<GalpaoLivrosSortCol>('nome');
  const { sortColumn: produtoSortCol, sortDirection: produtoSortDir, handleSort: handleProdutoSort } =
    useClientTableSort<GalpaoProdutoSortCol>('nome');
  const { sortColumn: orcACaminhoSortCol, sortDirection: orcACaminhoSortDir, handleSort: handleOrcACaminhoSort } =
    useClientTableSort<OrcamentosACaminhoSortCol>('nome');

  const [showAlocarLivroModal, setShowAlocarLivroModal] = useState(false);
  const [livroToAlocar, setLivroToAlocar] = useState<LivroDisponivel | null>(null);
  const [livroAlocarProdutoId, setLivroAlocarProdutoId] = useState<number | null>(null);
  const [livroAlocarQuantidade, setLivroAlocarQuantidade] = useState(1);
  const [alocandoLivro, setAlocandoLivro] = useState(false);

  const [livroAlocarFornecedorId, setLivroAlocarFornecedorId] = useState<number | null>(null);
  const [livroAlocarFornecedorOptions, setLivroAlocarFornecedorOptions] = useState<
    Array<{ value: number; label: string; quantidadeDisponivel: number }>
  >([]);
  const [livroAlocarOrigemLoading, setLivroAlocarOrigemLoading] = useState(false);

  const [showAvariaLivroModal, setShowAvariaLivroModal] = useState(false);
  const [livroToAvariar, setLivroToAvariar] = useState<LivroDisponivel | null>(null);
  const [livroAvariaQuantidade, setLivroAvariaQuantidade] = useState(1);
  const [livroAvariaJustificativa, setLivroAvariaJustificativa] = useState('');
  const [avariandoLivro, setAvariandoLivro] = useState(false);
  const [livroAvarias, setLivroAvarias] = useState<LivroAvariaRegistro[]>([]);
  const [livroAvariasLoading, setLivroAvariasLoading] = useState(false);
  const [livroAvariaEditRow, setLivroAvariaEditRow] = useState<LivroAvariaRegistro | null>(null);
  const [livroAvariaEditJustificativa, setLivroAvariaEditJustificativa] = useState('');
  const [livroAvariaSavingJustificativa, setLivroAvariaSavingJustificativa] = useState(false);
  const [livroAvariaDeleteRow, setLivroAvariaDeleteRow] = useState<LivroAvariaRegistro | null>(null);
  const [livroAvariaDeleting, setLivroAvariaDeleting] = useState(false);

  const [livroAvariaFornecedorId, setLivroAvariaFornecedorId] = useState<number | null>(null);
  const [livroAvariaProjetoId, setLivroAvariaProjetoId] = useState<number | null>(null);
  const [livroAvariaFornecedorOptions, setLivroAvariaFornecedorOptions] = useState<
    Array<{ value: number; label: string; quantidadeDisponivel: number }>
  >([]);
  const [livroAvariaProjetoOptions, setLivroAvariaProjetoOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [livroAvariaOrigemLoading, setLivroAvariaOrigemLoading] = useState(false);
  const [showAddLivroModal, setShowAddLivroModal] = useState(false);
  const [addingLivro, setAddingLivro] = useState(false);
  const [addLivroForm, setAddLivroForm] = useState({
    isbn: '',
    nome: '',
    categoriaId: '' as number | '',
    quantidade: 1,
    valor: 1,
    desconto: 0,
    autor: '',
    editora: '',
    anoPublicacao: '',
  });

  const [showCreateEditModal, setShowCreateEditModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProduto, setEditingProduto] = useState<GalpaoProduto | null>(null);

  const [form, setForm] = useState<{ nome: string; descricao?: string; ativo: boolean }>({
    nome: '',
    descricao: '',
    ativo: true,
  });

  const [produtoToDelete, setProdutoToDelete] = useState<GalpaoProduto | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showProdutoFilters, setShowProdutoFilters] = useState(false);
  const [showLivrosFilters, setShowLivrosFilters] = useState(false);
  const [showRelatorioLivrosModal, setShowRelatorioLivrosModal] = useState(false);
  const [relatorioLivroTipo, setRelatorioLivroTipo] = useState<RelatorioLivroTipo>('disponiveis');
  const [relatorioLivroFormato, setRelatorioLivroFormato] = useState<RelatorioLivroFormato>('pdf');
  const [relatorioLivroGeneroId, setRelatorioLivroGeneroId] = useState<number | 'all'>('all');
  const [relatorioLivroProdutoId, setRelatorioLivroProdutoId] = useState<number | null>(null);
  const [gerandoRelatorioLivros, setGerandoRelatorioLivros] = useState(false);

  const permissionKeys = useMemo(() => {
    if (!user?.cargo || typeof user.cargo === 'string') return new Set<string>();
    const permissions = Array.isArray(user.cargo.permissions) ? user.cargo.permissions : [];
    return new Set(
      permissions.map((p) => p.chave ?? `${p.modulo}:${p.acao}`),
    );
  }, [user]);

  const canEdit = userCanEditAlmoxarifado(permissionKeys);

  async function loadProdutos() {
    setLoading(true);
    try {
      const { data } = await api.get<GalpaoProduto[]>('/galpao/produtos', {
        params: search.trim() ? { search: search.trim() } : undefined,
      });
      setProdutos(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const message = formatApiError(err);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega 1x a lista completa apenas para as abas
  useEffect(() => {
    async function loadProdutosAllForTabs() {
      try {
        const { data } = await api.get<GalpaoProduto[]>('/galpao/produtos');
        const list = Array.isArray(data) ? data : [];
        setProdutosAllForTabs(list);
        setSelectedProdutoId(list[0]?.id ?? null);
      } catch {
        setProdutosAllForTabs([]);
        setSelectedProdutoId(null);
      }
    }
    void loadProdutosAllForTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadLivrosDisponiveis() {
    setLivrosLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (livrosSearch.trim()) params.search = livrosSearch.trim();
      if (livrosCategoriaId !== 'all') params.categoriaId = livrosCategoriaId;
      const { data } = await api.get<LivroDisponivel[]>('/galpao/livros-disponiveis', { params });
      setLivrosDisponiveis(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivrosLoading(false);
    }
  }

  async function loadCategoriasLivros() {
    try {
      const { data } = await api.get<Category[]>('/categories/all?tipo=LIVRO');
      setCategoriesLivros(Array.isArray(data) ? data : []);
    } catch {
      setCategoriesLivros([]);
    }
  }

  useEffect(() => {
    if (activeMainTab === 'livros') {
      void loadCategoriasLivros();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainTab]);

  useEffect(() => {
    if (activeMainTab !== 'livros') return;
    const timeoutId = window.setTimeout(() => {
      void loadLivrosDisponiveis();
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainTab, livrosSearch, livrosCategoriaId]);

  async function loadOrcamentosACaminho() {
    setOrcamentosACaminhoLoading(true);
    try {
      const { data } = await api.get<CuradoriaOrcamentoACaminhoRow[]>('/galpao/curadoria-orcamentos/a-caminho');
      setOrcamentosACaminho(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(formatApiError(err));
      setOrcamentosACaminho([]);
    } finally {
      setOrcamentosACaminhoLoading(false);
    }
  }

  async function handleMarcarOrcamentoEntregue() {
    if (!orcamentoEntregaModal) return;
    setMarcandoOrcamentoEntrega(true);
    try {
      await api.post(`/galpao/curadoria-orcamentos/${orcamentoEntregaModal.id}/marcar-entregue`);
      toast.success('Orçamento marcado como entregue. Os itens passam ao estoque disponível.');
      setOrcamentoEntregaModal(null);
      await loadOrcamentosACaminho();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setMarcandoOrcamentoEntrega(false);
    }
  }

  useEffect(() => {
    if (activeMainTab === 'recebimento') {
      void loadOrcamentosACaminho();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainTab]);

  const sortedProdutos = useMemo(() => {
    const rows = [...produtos];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (produtoSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'ativo':
          cmp = Number(a.ativo) - Number(b.ativo);
          if (cmp === 0) cmp = a.nome.localeCompare(b.nome);
          break;
        default:
          cmp = 0;
      }
      return produtoSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [produtos, produtoSortCol, produtoSortDir]);

  const renderProdutoTh = useCallback(
    (col: GalpaoProdutoSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: produtoSortCol,
        sortDirection: produtoSortDir,
        onSort: handleProdutoSort,
        align: 'left',
      }),
    [produtoSortCol, produtoSortDir, handleProdutoSort],
  );

  const sortedOrcamentosACaminho = useMemo(() => {
    const rows = [...orcamentosACaminho];
    rows.sort((a, b) => {
      let cmp = 0;
      const fornLabel = (row: CuradoriaOrcamentoACaminhoRow) =>
        row.fornecedor?.nomeFantasia?.trim() || row.fornecedor?.razaoSocial?.trim() || '';
      switch (orcACaminhoSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'projeto':
          cmp = (a.projeto?.nome ?? '').localeCompare(b.projeto?.nome ?? '');
          break;
        case 'fornecedor':
          cmp = fornLabel(a).localeCompare(fornLabel(b));
          break;
        case 'quantidadeItens':
          cmp = a.quantidadeItens - b.quantidadeItens;
          break;
        case 'dataCriacao':
          cmp = new Date(a.dataCriacao).getTime() - new Date(b.dataCriacao).getTime();
          break;
        default:
          cmp = 0;
      }
      return orcACaminhoSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [orcamentosACaminho, orcACaminhoSortCol, orcACaminhoSortDir]);

  const renderOrcACaminhoTh = useCallback(
    (col: OrcamentosACaminhoSortCol, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: orcACaminhoSortCol,
        sortDirection: orcACaminhoSortDir,
        onSort: handleOrcACaminhoSort,
        align,
      }),
    [orcACaminhoSortCol, orcACaminhoSortDir, handleOrcACaminhoSort],
  );

  const columnsOrcamentosACaminho: DataTableColumn<CuradoriaOrcamentoACaminhoRow>[] = useMemo(
    () => [
    {
      key: 'nome',
        label: '',
        renderTh: () => renderOrcACaminhoTh('nome', 'Orçamento'),
        render: (row) => (
          <span className="font-medium block max-w-[200px] truncate" title={row.nome}>
            {row.nome}
          </span>
        ),
      },
      {
        key: 'projeto',
        label: '',
        renderTh: () => renderOrcACaminhoTh('projeto', 'Projeto'),
        render: (row) => <span className="text-sm">{row.projeto?.nome ?? '—'}</span>,
      },
      {
        key: 'fornecedor',
        label: '',
        renderTh: () => renderOrcACaminhoTh('fornecedor', 'Fornecedor'),
        render: (row) => (
          <span className="text-sm">
            {row.fornecedor?.nomeFantasia?.trim() || row.fornecedor?.razaoSocial?.trim() || '—'}
          </span>
        ),
      },
      {
        key: 'quantidadeItens',
        label: '',
        renderTh: () => renderOrcACaminhoTh('quantidadeItens', 'Itens', 'right'),
        align: 'right',
        render: (row) => <span>{row.quantidadeItens}</span>,
      },
      {
        key: 'dataCriacao',
        label: '',
        renderTh: () => renderOrcACaminhoTh('dataCriacao', 'Criado em'),
        render: (row) => (
          <span className="text-xs text-white/70">{new Date(row.dataCriacao).toLocaleString('pt-BR')}</span>
        ),
      },
      {
        key: 'acao',
        label: 'Recebimento',
        render: (row) =>
          canEdit ? (
            <button type="button" className={btn.primarySoft} onClick={() => setOrcamentoEntregaModal(row)}>
              Marcar entregue
            </button>
          ) : (
            <span className="text-xs text-white/40">Apenas visualização</span>
          ),
      },
    ],
    [canEdit, renderOrcACaminhoTh],
  );

  const columns: DataTableColumn<GalpaoProduto>[] = useMemo(
    () => [
    {
      key: 'nome',
      label: '',
      renderTh: () => renderProdutoTh('nome', 'Produto'),
      render: (p) => <span className="font-medium">{p.nome}</span>,
    },
    {
      key: 'ativo',
      label: '',
      renderTh: () => renderProdutoTh('ativo', 'Status'),
      render: (p) => (
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold border ${
            p.ativo ? 'bg-success/20 text-success border-success/30' : 'bg-danger/20 text-danger border-danger/30'
          }`}
        >
          {p.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      stopRowClick: true,
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={btn.primarySoft} onClick={() => navigate(`/galpao/${p.id}`)}>
            Detalhes
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                className={btn.editSm}
                onClick={() => {
                  setModalMode('edit');
                  setEditingProduto(p);
                  setForm({ nome: p.nome, descricao: p.descricao ?? '', ativo: p.ativo });
                  setShowCreateEditModal(true);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className={btn.dangerSm}
                onClick={() => {
                  setProdutoToDelete(p);
                  setDeleteConfirmName('');
                  setDeleteError(null);
                }}
              >
                Excluir
              </button>
            </>
          )}
        </div>
      ),
    },
    ],
    [renderProdutoTh, canEdit, navigate],
  );

  const filteredLivrosDisponiveis = useMemo(() => {
    const editoraTerm = livrosEditoraFilter.trim().toLowerCase();
    return livrosDisponiveis.filter((r) => {
      const matchesEditora =
        !editoraTerm || (r.editora ?? '').toLowerCase().includes(editoraTerm);
      const avarias = r.quantidadeAvariasTotal ?? 0;
      const matchesAvarias =
        livrosAvariasFilter === 'all' ||
        (livrosAvariasFilter === 'com' ? avarias > 0 : avarias === 0);
      return matchesEditora && matchesAvarias;
    });
  }, [livrosDisponiveis, livrosEditoraFilter, livrosAvariasFilter]);

  const sortedLivrosDisponiveis = useMemo(() => {
    const rows = [...filteredLivrosDisponiveis];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (livrosSortCol) {
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
        case 'editora':
          cmp = (a.editora ?? '').localeCompare(b.editora ?? '');
          break;
        case 'qtd':
          cmp = a.quantidadeDisponivel - b.quantidadeDisponivel;
          break;
        case 'alocados':
          cmp = (a.quantidadeReservadaTotal ?? 0) - (b.quantidadeReservadaTotal ?? 0);
          break;
        case 'avarias':
          cmp = (a.quantidadeAvariasTotal ?? 0) - (b.quantidadeAvariasTotal ?? 0);
          break;
        default:
          cmp = 0;
      }
      return livrosSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredLivrosDisponiveis, livrosSortCol, livrosSortDir]);

  const renderLivrosTh = useCallback(
    (col: GalpaoLivrosSortCol, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: livrosSortCol,
        sortDirection: livrosSortDir,
        onSort: handleLivrosSort,
        align,
      }),
    [livrosSortCol, livrosSortDir, handleLivrosSort],
  );

  const livrosColumns: DataTableColumn<LivroDisponivel>[] = useMemo(
    () => [
      {
        key: 'isbn',
        label: '',
        renderTh: () => renderLivrosTh('isbn', 'ISBN'),
        render: (r) => <span className="font-mono text-xs">{r.isbn}</span>,
      },
      {
        key: 'nome',
        label: '',
        renderTh: () => renderLivrosTh('nome', 'Título'),
        render: (r) => (
          <span className="font-medium block max-w-[200px] line-clamp-2" title={r.nome}>
            {r.nome}
          </span>
        ),
      },
      {
        key: 'categoria',
        label: '',
        renderTh: () => renderLivrosTh('categoria', 'Gênero'),
        render: (r) => <span>{r.categoriaNome ?? '-'}</span>,
      },
      {
        key: 'autor',
        label: '',
        renderTh: () => renderLivrosTh('autor', 'Autor'),
        render: (r) => <span className="text-xs text-white/80">{r.autor ?? '-'}</span>,
      },
      {
        key: 'editora',
        label: '',
        renderTh: () => renderLivrosTh('editora', 'Editora'),
        render: (r) => <span className="text-xs text-white/80">{r.editora ?? '-'}</span>,
      },
      {
        key: 'qtd',
        label: '',
        align: 'right',
        renderTh: () => renderLivrosTh('qtd', 'Qtd disponível', 'right'),
        tdClassName: 'text-right',
        render: (r) => <span className="font-semibold">{r.quantidadeDisponivel}</span>,
      },
      {
        key: 'alocados',
        label: '',
        align: 'right',
        renderTh: () => renderLivrosTh('alocados', 'Alocados', 'right'),
        tdClassName: 'text-right',
        render: (r) => <span className="font-semibold text-sky-300">{r.quantidadeReservadaTotal ?? 0}</span>,
      },
      {
        key: 'avarias',
        label: '',
        align: 'right',
        renderTh: () => renderLivrosTh('avarias', 'Avarias', 'right'),
        tdClassName: 'text-right',
        render: (r) => <span className="font-semibold text-amber-300">{r.quantidadeAvariasTotal ?? 0}</span>,
      },
      {
        key: 'acoes',
        label: 'Ações',
        align: 'right',
        stopRowClick: true,
        render: (r) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={btn.primarySm}
              disabled={!canEdit}
              onClick={() => {
                setLivroToAlocar(r);
                setLivroAlocarProdutoId(selectedProdutoId ?? produtosAllForTabs[0]?.id ?? null);
                setLivroAlocarQuantidade(1);
                setLivroAlocarFornecedorId(null);
                setLivroAlocarFornecedorOptions([]);
                setShowAlocarLivroModal(true);
                void loadAlocarLivroFornecedorOptions(r);
              }}
            >
              Alocar
            </button>
            <button
              type="button"
              className={btn.warningSm}
              disabled={!canEdit}
              onClick={() => {
                setLivroToAvariar(r);
                setLivroAvariaQuantidade(1);
                setLivroAvariaJustificativa('');
                setLivroAvariaFornecedorId(null);
                setLivroAvariaProjetoId(null);
                setLivroAvariaFornecedorOptions([]);
                setLivroAvariaProjetoOptions([]);
                setShowAvariaLivroModal(true);
                void loadAvariasLivro(r);
                void loadAvariaLivroOrigemOptions(r);
              }}
            >
              Avarias
            </button>
            <button
              type="button"
              className={btn.dangerSm}
              disabled={!canEdit}
              onClick={() => void handleDeleteLivroCadastro(r)}
            >
              Excluir
            </button>
          </div>
        ),
      },
    ],
    [renderLivrosTh, canEdit, selectedProdutoId, produtosAllForTabs],
  );

  async function handleDeleteLivroCadastro(row: LivroDisponivel) {
    if (!canEdit) return;
    const ok = window.confirm(`Excluir do estoque o livro "${row.nome}" (ISBN ${row.isbn})?`);
    if (!ok) return;
    try {
      await api.delete(`/galpao/livros-disponiveis/${encodeURIComponent(row.isbn)}`, {
        params: row.categoriaId != null ? { categoriaId: row.categoriaId } : undefined,
      });
      toast.success('Cadastro de livro removido do estoque.');
      await loadLivrosDisponiveis();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  async function handleAddLivroToStock() {
    if (!canEdit) return;
    if (!selectedProdutoId) {
      toast.error('Selecione um produto do galpão para registrar a entrada do livro.');
      return;
    }
    if (!addLivroForm.isbn.trim()) {
      toast.error('Informe o ISBN.');
      return;
    }
    if (addLivroForm.quantidade < 1) {
      toast.error('Quantidade inválida.');
      return;
    }
    if (addLivroForm.valor < 0) {
      toast.error('Valor inválido.');
      return;
    }
    setAddingLivro(true);
    try {
      await api.post(`/galpao/produtos/${selectedProdutoId}/livros/entrada`, {
        isbn: addLivroForm.isbn.trim(),
        nome: addLivroForm.nome.trim() || undefined,
        categoriaId: addLivroForm.categoriaId || undefined,
        quantidade: addLivroForm.quantidade,
        valor: addLivroForm.valor,
        desconto: addLivroForm.desconto > 0 ? addLivroForm.desconto : undefined,
        autor: addLivroForm.autor.trim() || undefined,
        editora: addLivroForm.editora.trim() || undefined,
        anoPublicacao: addLivroForm.anoPublicacao.trim() || undefined,
      });
      toast.success('Livro adicionado ao estoque com sucesso!');
      setShowAddLivroModal(false);
      setAddLivroForm({
        isbn: '',
        nome: '',
        categoriaId: '',
        quantidade: 1,
        valor: 1,
        desconto: 0,
        autor: '',
        editora: '',
        anoPublicacao: '',
      });
      await loadLivrosDisponiveis();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setAddingLivro(false);
    }
  }

  async function handleSubmit() {
    if (!canEdit) return;
    const nome = form.nome.trim();
    if (!nome) {
      toast.error('Informe o nome do produto.');
      return;
    }

    try {
      if (modalMode === 'create') {
        await api.post('/galpao/produtos', { nome, descricao: form.descricao?.trim() || undefined, ativo: form.ativo });
        toast.success('Produto criado com sucesso!');
      } else if (modalMode === 'edit' && editingProduto) {
        await api.patch(`/galpao/produtos/${editingProduto.id}`, {
          nome,
          descricao: form.descricao?.trim() || undefined,
          ativo: form.ativo,
        });
        toast.success('Produto atualizado com sucesso!');
      }
      setShowCreateEditModal(false);
      setEditingProduto(null);
      setForm({ nome: '', descricao: '', ativo: true });
      await loadProdutos();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  async function handleConfirmAlocarLivro() {
    if (!livroToAlocar || !livroAlocarProdutoId) return;
    if (livroAlocarQuantidade < 1) {
      toast.error('Quantidade inválida.');
      return;
    }

    if (livroAlocarFornecedorId == null) {
      toast.error('Selecione o fornecedor do estoque.');
      return;
    }

    const maxPorFornecedor =
      livroAlocarFornecedorOptions.find((o) => o.value === livroAlocarFornecedorId)?.quantidadeDisponivel ?? 0;

    if (livroAlocarQuantidade > maxPorFornecedor) {
      toast.error('Quantidade excede o disponível para o fornecedor selecionado.');
      return;
    }

    setAlocandoLivro(true);
    try {
      await api.post(`/galpao/produtos/${livroAlocarProdutoId}/livros/alocar`, {
        isbn: livroToAlocar.isbn,
        categoriaId: livroToAlocar.categoriaId ?? undefined,
        quantidade: livroAlocarQuantidade,
        fornecedorId: livroAlocarFornecedorId,
      });
      toast.success('Livro alocado com sucesso!');
      setSelectedProdutoId(livroAlocarProdutoId);
      setShowAlocarLivroModal(false);
      setLivroToAlocar(null);
      setLivroAlocarFornecedorId(null);
      setLivroAlocarFornecedorOptions([]);
      await loadLivrosDisponiveis();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setAlocandoLivro(false);
    }
  }

  async function loadAlocarLivroFornecedorOptions(livro: LivroDisponivel) {
    setLivroAlocarOrigemLoading(true);
    try {
      const params: Record<string, string | number> = {
        isbn: livro.isbn,
      };
      if (livro.categoriaId != null) params.categoriaId = livro.categoriaId;

      const { data } = await api.get<LivroDisponivelPorFornecedor[]>(
        '/galpao/livros-disponiveis-por-fornecedor',
        { params },
      );

      const supplierOptions = Array.isArray(data) ? data : [];

      setLivroAlocarFornecedorOptions(
        supplierOptions.map((s) => ({
          value: s.fornecedorId,
          label: `${s.fornecedorNome} (disponível: ${s.quantidadeDisponivel})`,
          quantidadeDisponivel: s.quantidadeDisponivel,
        })),
      );

      setLivroAlocarFornecedorId(supplierOptions.length === 1 ? supplierOptions[0].fornecedorId : null);
    } catch (err: any) {
      toast.error(formatApiError(err));
      setLivroAlocarFornecedorOptions([]);
      setLivroAlocarFornecedorId(null);
    } finally {
      setLivroAlocarOrigemLoading(false);
    }
  }

  async function loadAvariasLivro(livro: LivroDisponivel) {
    setLivroAvariasLoading(true);
    try {
      const params: Record<string, string | number> = {
        isbn: livro.isbn,
      };
      if (livro.categoriaId != null) {
        params.categoriaId = livro.categoriaId;
      }
      const { data } = await api.get<LivroAvariaRegistro[]>('/galpao/livros/avarias', { params });
      setLivroAvarias(Array.isArray(data) ? data : []);
    } catch {
      setLivroAvarias([]);
    } finally {
      setLivroAvariasLoading(false);
    }
  }

  async function loadAvariaLivroOrigemOptions(livro: LivroDisponivel) {
    setLivroAvariaOrigemLoading(true);
    try {
      const categoriaId = livro.categoriaId ?? null;

      // 1) Fornecedores com quantidade disponível (respeitando reservas atuais)
      const supplierParams: Record<string, string | number> = { isbn: livro.isbn };
      if (categoriaId !== null) supplierParams.categoriaId = categoriaId;

      const { data: suppliersData } = await api.get<LivroDisponivelPorFornecedor[]>(
        `/galpao/livros-disponiveis-por-fornecedor`,
        { params: supplierParams },
      );

      const supplierOptions = Array.isArray(suppliersData) ? suppliersData : [];

      // 2) Projetos: a partir das cotações (pra mostrar o "projeto alocado")
      type CotacaoOrigem = {
        projetoId: number | null;
        projetoNome: string | null;
        categoriaId: number | null;
      };

      const { data: cotacoesData } = await api.get<CotacaoOrigem[]>(
        `/curadoria/estoque/${encodeURIComponent(livro.isbn)}/cotacoes`,
      );

      const cotacoes = Array.isArray(cotacoesData) ? cotacoesData : [];
      const filtered = cotacoes.filter((q) => (q.categoriaId ?? null) === (categoriaId ?? null));

      const projetoMap = new Map<number, string>();
      for (const q of filtered) {
        if (q.projetoId != null) projetoMap.set(q.projetoId, q.projetoNome ?? 'Projeto');
      }

      const projetoOptions = Array.from(projetoMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label }));

      setLivroAvariaFornecedorOptions(
        supplierOptions.map((s) => ({
          value: s.fornecedorId,
          label: `${s.fornecedorNome} (disponível: ${s.quantidadeDisponivel})`,
          quantidadeDisponivel: s.quantidadeDisponivel,
        })),
      );
      setLivroAvariaProjetoOptions(projetoOptions);

      setLivroAvariaFornecedorId(supplierOptions.length === 1 ? supplierOptions[0].fornecedorId : null);
      setLivroAvariaProjetoId(projetoOptions.length === 1 ? projetoOptions[0].value : null);
    } catch (err: any) {
      toast.error(formatApiError(err));
      setLivroAvariaFornecedorOptions([]);
      setLivroAvariaProjetoOptions([]);
      setLivroAvariaFornecedorId(null);
      setLivroAvariaProjetoId(null);
    } finally {
      setLivroAvariaOrigemLoading(false);
    }
  }

  async function handleSaveLivroAvariaJustificativa() {
    if (!livroToAvariar || !livroAvariaEditRow) return;
    const t = livroAvariaEditJustificativa.trim();
    if (!t) {
      toast.error('Informe a justificativa.');
      return;
    }
    setLivroAvariaSavingJustificativa(true);
    try {
      await api.patch(`/galpao/livros/avarias/${livroAvariaEditRow.id}`, { justificativa: t });
      toast.success('Justificativa atualizada.');
      setLivroAvariaEditRow(null);
      await loadAvariasLivro(livroToAvariar);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivroAvariaSavingJustificativa(false);
    }
  }

  async function handleDeleteLivroAvaria() {
    if (!livroToAvariar || !livroAvariaDeleteRow) return;
    setLivroAvariaDeleting(true);
    try {
      await api.delete(`/galpao/livros/avarias/${livroAvariaDeleteRow.id}`);
      toast.success('Avaria removida e quantidade recolocada no estoque.');
      setLivroAvariaDeleteRow(null);
      await loadLivrosDisponiveis();
      await loadAvariasLivro(livroToAvariar);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivroAvariaDeleting(false);
    }
  }

  async function handleConfirmAvariaLivro() {
    if (!livroToAvariar) return;
    if (livroAvariaQuantidade < 1) {
      toast.error('Quantidade inválida.');
      return;
    }

    const maxPorFornecedor =
      livroAvariaFornecedorId != null
        ? livroAvariaFornecedorOptions.find((o) => o.value === livroAvariaFornecedorId)?.quantidadeDisponivel ?? 0
        : 0;
    if (!livroAvariaJustificativa.trim()) {
      toast.error('Informe a justificativa da avaria.');
      return;
    }

    if (livroAvariaFornecedorOptions.length > 0 && livroAvariaFornecedorId == null) {
      toast.error('Selecione o fornecedor da avaria.');
      return;
    }

    if (livroAvariaProjetoOptions.length > 0 && livroAvariaProjetoId == null) {
      toast.error('Selecione o projeto da avaria.');
      return;
    }

    if (livroAvariaFornecedorId != null && livroAvariaQuantidade > maxPorFornecedor) {
      toast.error('Quantidade excede o disponível para o fornecedor selecionado.');
      return;
    }

    setAvariandoLivro(true);
    try {
      await api.post(`/galpao/livros/avaria`, {
        isbn: livroToAvariar.isbn,
        categoriaId: livroToAvariar.categoriaId ?? undefined,
        quantidade: livroAvariaQuantidade,
        justificativa: livroAvariaJustificativa.trim(),
        fornecedorId: livroAvariaFornecedorId ?? undefined,
        projetoId: livroAvariaProjetoId ?? undefined,
      });
      toast.success('Avaria de livro registrada com sucesso!');
      await loadLivrosDisponiveis();
      await loadAvariasLivro(livroToAvariar);
      setLivroAvariaQuantidade(1);
      setLivroAvariaJustificativa('');
      setLivroAvariaFornecedorId(null);
      setLivroAvariaProjetoId(null);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setAvariandoLivro(false);
    }
  }

  async function getRelatorioLivrosLinhas() {
    const params: Record<string, string | number> = {};
    if (relatorioLivroGeneroId !== 'all') params.categoriaId = relatorioLivroGeneroId;
    if (relatorioLivroProdutoId != null) params.produtoId = relatorioLivroProdutoId;

    if (relatorioLivroTipo === 'disponiveis') {
      const { data } = await api.get<LivroDisponivel[]>('/galpao/livros-disponiveis', { params });
      const rows = Array.isArray(data) ? data : [];
      const withFornecedores = await Promise.all(
        rows.map(async (r) => {
          try {
            const fornecedorParams: Record<string, string | number> = { isbn: r.isbn };
            if (r.categoriaId != null) fornecedorParams.categoriaId = r.categoriaId;
            const { data: fornecedoresData } = await api.get<LivroDisponivelPorFornecedor[]>(
              '/galpao/livros-disponiveis-por-fornecedor',
              { params: fornecedorParams },
            );
            const fornecedores = Array.isArray(fornecedoresData) ? fornecedoresData : [];
            const fornecedorTexto = fornecedores.length
              ? fornecedores
                  .map((f) => `${f.fornecedorNome} (${f.quantidadeDisponivel})`)
                  .join(' | ')
              : '-';
            return {
              ...r,
              fornecedorTexto,
            };
          } catch {
            return {
              ...r,
              fornecedorTexto: '-',
            };
          }
        }),
      );

      return withFornecedores.map((r) => ({
        isbn: r.isbn,
        titulo: r.nome,
        autor: r.autor ?? '',
        editora: r.editora ?? '',
        quantidade: r.quantidadeDisponivel ?? 0,
        tipo: 'disponivel',
        produto: '',
        fornecedor: r.fornecedorTexto,
        justificativa: '',
      }));
    }

    if (relatorioLivroTipo === 'alocados') {
      const { data } = await api.get<LivroAlocadoReport[]>('/galpao/livros-alocados', { params });
      return (Array.isArray(data) ? data : []).map((r) => ({
        isbn: r.isbn,
        titulo: r.titulo,
        autor: r.autor ?? '',
        editora: r.editora ?? '',
        quantidade: r.quantidade ?? 0,
        tipo: 'alocado',
        produto: r.produto?.nome ?? '',
        fornecedor: r.fornecedor?.nome ?? '',
        justificativa: '',
      }));
    }

    const { data } = await api.get<LivroAvariaReport[]>('/galpao/livros/avarias-relatorio', { params });
    return (Array.isArray(data) ? data : []).map((r) => ({
      isbn: r.isbn,
      titulo: r.titulo,
      autor: r.autor ?? '',
      editora: r.editora ?? '',
      quantidade: r.quantidade ?? 0,
      tipo: 'avaria',
      produto: r.produto?.nome ?? '',
      fornecedor: r.fornecedor?.nome ?? '',
      justificativa: r.justificativa ?? '',
    }));
  }

  function exportRelatorioLivrosExcel(rows: Array<Record<string, string | number>>) {
    const tipoNome =
      relatorioLivroTipo === 'disponiveis'
        ? 'livros-disponiveis'
        : relatorioLivroTipo === 'alocados'
          ? 'livros-alocados'
          : 'livros-avarias';

    const data =
      relatorioLivroTipo === 'disponiveis'
        ? rows.map((row) => ({
            ISBN: String(row.isbn ?? ''),
            TITULO: String(row.titulo ?? ''),
            AUTOR: String(row.autor ?? ''),
            EDITORA: String(row.editora ?? ''),
            FORNECEDOR: String(row.fornecedor ?? ''),
            QTD: Number(row.quantidade ?? 0),
          }))
        : relatorioLivroTipo === 'alocados'
          ? rows.map((row) => {
              const base = {
                ISBN: String(row.isbn ?? ''),
                TITULO: String(row.titulo ?? ''),
                AUTOR: String(row.autor ?? ''),
                EDITORA: String(row.editora ?? ''),
                FORNECEDOR: String(row.fornecedor ?? ''),
                QTD: Number(row.quantidade ?? 0),
              };
              // Se o filtro de produto estiver em "todos", mantém a coluna de produto.
              if (relatorioLivroProdutoId == null) {
                return {
                  ...base,
                  PRODUTO: String(row.produto ?? ''),
                };
              }
              return base;
            })
          : rows.map((row) => ({
              ISBN: String(row.isbn ?? ''),
              TITULO: String(row.titulo ?? ''),
              AUTOR: String(row.autor ?? ''),
              EDITORA: String(row.editora ?? ''),
              QTD: Number(row.quantidade ?? 0),
              FORNECEDOR: String(row.fornecedor ?? ''),
              JUSTIFICATIVA: String(row.justificativa ?? ''),
            }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    const borderStyle = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    } as const;

    const ref = worksheet['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellRef];
          if (!cell) continue;

          const isHeader = row === range.s.r;
          cell.s = {
            border: borderStyle,
            alignment: { vertical: 'center', horizontal: isHeader ? 'center' : 'left', wrapText: true },
            fill: isHeader ? { patternType: 'solid', fgColor: { rgb: '8BC34A' } } : undefined,
            font: isHeader ? { bold: true, color: { rgb: 'FFFFFF' } } : undefined,
          };
        }
      }
    }

    worksheet['!cols'] =
      relatorioLivroTipo === 'disponiveis'
        ? [
            { wch: 18 }, // ISBN
            { wch: 42 }, // TITULO
            { wch: 24 }, // AUTOR
            { wch: 22 }, // EDITORA
            { wch: 48 }, // FORNECEDOR
            { wch: 10 }, // QTD
          ]
        : relatorioLivroTipo === 'alocados'
          ? relatorioLivroProdutoId == null
            ? [
                { wch: 18 }, // ISBN
                { wch: 34 }, // TITULO
                { wch: 22 }, // AUTOR
                { wch: 22 }, // EDITORA
                { wch: 26 }, // FORNECEDOR
                { wch: 10 }, // QTD
                { wch: 26 }, // PRODUTO
              ]
            : [
                { wch: 18 }, // ISBN
                { wch: 40 }, // TITULO
                { wch: 24 }, // AUTOR
                { wch: 24 }, // EDITORA
                { wch: 34 }, // FORNECEDOR
                { wch: 10 }, // QTD
              ]
          : [
              { wch: 18 },
              { wch: 32 },
              { wch: 20 },
              { wch: 20 },
              { wch: 10 },
              { wch: 30 },
              { wch: 38 },
            ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatorio');
    XLSX.writeFile(workbook, `relatorio-galpao-${tipoNome}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportRelatorioLivrosPdf(rows: Array<Record<string, string | number>>) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const headerColor: [number, number, number] = [139, 195, 74];

    const tipoLabel =
      relatorioLivroTipo === 'disponiveis'
        ? 'Livros Disponiveis'
        : relatorioLivroTipo === 'alocados'
          ? 'Livros Alocados'
          : 'Livros com Avarias';

    const columnsBase =
      relatorioLivroTipo === 'avarias'
        ? [
            { key: 'n', label: 'N°', w: 10 },
            { key: 'isbn', label: 'ISBN', w: 34 },
            { key: 'titulo', label: 'TITULO', w: 74 },
            { key: 'autor', label: 'AUTOR', w: 42 },
            { key: 'editora', label: 'EDITORA', w: 34 },
            { key: 'justificativa', label: 'JUSTIFICATIVA', w: 72 },
            { key: 'quantidade', label: 'QTD', w: 14 },
          ]
        : relatorioLivroTipo === 'alocados'
          ? [
              { key: 'n', label: 'N°', w: 10 },
              { key: 'isbn', label: 'ISBN', w: 34 },
              { key: 'titulo', label: 'TITULO', w: 60 },
              { key: 'autor', label: 'AUTOR', w: 36 },
              { key: 'editora', label: 'EDITORA', w: 32 },
              { key: 'produto', label: 'PRODUTO', w: 50 },
              { key: 'fornecedor', label: 'FORNECEDOR', w: 48 },
              { key: 'quantidade', label: 'QTD', w: 14 },
            ]
          : [
              { key: 'n', label: 'N°', w: 10 },
              { key: 'isbn', label: 'ISBN', w: 36 },
              { key: 'titulo', label: 'TITULO', w: 90 },
              { key: 'autor', label: 'AUTOR', w: 44 },
              { key: 'editora', label: 'EDITORA', w: 66 },
              { key: 'quantidade', label: 'QTD', w: 14 },
            ];

    const availableWidth = pageWidth - margin * 2;
    const totalBaseWidth = columnsBase.reduce((sum, col) => sum + col.w, 0);
    const widthRatio = totalBaseWidth > availableWidth ? availableWidth / totalBaseWidth : 1;
    const columns = columnsBase.map((col) => ({
      ...col,
      w: Number((col.w * widthRatio).toFixed(2)),
    }));

    const lineHeight = 5;
    let y = margin;

    const drawHeader = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`RELATORIO GALPAO - ${tipoLabel.toUpperCase()}`, margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
      y += 5;

      let x = margin;
      doc.setDrawColor(0, 0, 0);
      columns.forEach((col) => {
        // Pinta cada celula do cabecalho individualmente para evitar
        // inconsistencias de render em alguns viewers de PDF.
        doc.setFillColor(139, 195, 74);
        doc.rect(x, y, col.w, 8, 'F');
        doc.rect(x, y, col.w, 8, 'S');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(col.label, x + col.w / 2, y + 5.5, { align: 'center' });
        x += col.w;
      });
      y += 8;
    };

    drawHeader();

    rows.forEach((row, index) => {
      const values: Record<string, string> = {
        n: `${index + 1}.`,
        isbn: String(row.isbn ?? ''),
        titulo: String(row.titulo ?? ''),
        autor: String(row.autor ?? ''),
        editora: String(row.editora ?? ''),
        produto: String(row.produto ?? ''),
        fornecedor: String(row.fornecedor ?? ''),
        justificativa: String(row.justificativa ?? ''),
        quantidade: String(row.quantidade ?? 0),
      };

      let maxLines = 1;
      const wrappedPerCol = columns.map((col) => {
        const wrapped = doc.splitTextToSize(values[col.key] ?? '', col.w - 2);
        maxLines = Math.max(maxLines, wrapped.length || 1);
        return wrapped;
      });

      const rowHeight = Math.max(7, maxLines * lineHeight);
      if (y + rowHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        drawHeader();
      }

      let x = margin;
      columns.forEach((col, colIndex) => {
        doc.setDrawColor(0, 0, 0);
        doc.rect(x, y, col.w, rowHeight);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        const textLines = wrappedPerCol[colIndex];
        doc.text(textLines, x + 1, y + 4.5);
        x += col.w;
      });

      y += rowHeight;
    });

    const tipoArquivo =
      relatorioLivroTipo === 'disponiveis'
        ? 'livros-disponiveis'
        : relatorioLivroTipo === 'alocados'
          ? 'livros-alocados'
          : 'livros-avarias';
    doc.save(`relatorio-galpao-${tipoArquivo}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function handleExportRelatorioLivros() {
    setGerandoRelatorioLivros(true);
    try {
      const rows = await getRelatorioLivrosLinhas();
      if (!rows.length) {
        toast.error('Nenhum registro encontrado para gerar o relatório.');
        return;
      }

      if (relatorioLivroFormato === 'pdf') {
        exportRelatorioLivrosPdf(rows as Array<Record<string, string | number>>);
      } else {
        exportRelatorioLivrosExcel(rows as Array<Record<string, string | number>>);
      }
      toast.success('Relatório gerado com sucesso.');
      setShowRelatorioLivrosModal(false);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setGerandoRelatorioLivros(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {canEdit && activeMainTab === 'produto' && (
          <button
            type="button"
            className={btn.primary}
            onClick={() => {
              setModalMode('create');
              setEditingProduto(null);
              setForm({ nome: '', descricao: '', ativo: true });
              setShowCreateEditModal(true);
            }}
          >
            Novo produto
          </button>
        )}
      </div>

      <AppSectionTabs
        tabs={MAIN_TABS}
        activeId={activeMainTab}
        onChange={(id) => setActiveMainTab(id as MainTabKey)}
        ariaLabel="Seções do almoxarifado"
      />

      {activeMainTab === 'produto' && (
        <>
          <CollapsibleFilters
            show={showProdutoFilters}
            setShow={setShowProdutoFilters}
            hasActiveFilters={search.trim().length > 0}
            title="Busca e filtros"
            badgeText="Ativo"
            onClear={() => setSearch('')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
          <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto por nome ou descrição..."
            className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
              <div className="text-xs text-white/60 flex items-end">
          {loading ? 'Carregando...' : `${produtos.length} produto(s)`}
        </div>
      </div>
          </CollapsibleFilters>

      <DataTable<GalpaoProduto>
        data={sortedProdutos}
        columns={columns}
        keyExtractor={(p) => p.id}
        loading={loading}
        emptyMessage="Nenhum produto encontrado."
            paginate
            initialPageSize={20}
            responsiveFrom="md"
            renderMobileCard={(p) => (
              <div className={almoxarifadoMobileCardCls}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{p.nome}</p>
                    {p.descricao && <p className="text-xs text-white/60 mt-0.5">{p.descricao}</p>}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                      p.ativo ? 'bg-success/20 text-success border-success/30' : 'bg-danger/20 text-danger border-danger/30'
                    }`}
                  >
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button type="button" className={btn.primarySoft} onClick={() => navigate(`/galpao/${p.id}`)}>
                    Detalhes
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className={btn.editSm}
                        onClick={() => {
                          setModalMode('edit');
                          setEditingProduto(p);
                          setForm({ nome: p.nome, descricao: p.descricao ?? '', ativo: p.ativo });
                          setShowCreateEditModal(true);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={btn.dangerSm}
                        onClick={() => {
                          setProdutoToDelete(p);
                          setDeleteConfirmName('');
                          setDeleteError(null);
                        }}
                      >
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          />
        </>
      )}

      {activeMainTab === 'livros' && (
        <div className="pt-1 space-y-4">
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.secondary} onClick={() => setShowRelatorioLivrosModal(true)}>
              Gerar relatório
            </button>
            {canEdit && (
              <button type="button" className={btn.primary} onClick={() => setShowAddLivroModal(true)}>
                Adicionar livro
              </button>
            )}
          </div>

          <CollapsibleFilters
            show={showLivrosFilters}
            setShow={setShowLivrosFilters}
            hasActiveFilters={
              livrosSearch.trim().length > 0 ||
              livrosCategoriaId !== 'all' ||
              selectedProdutoId != null ||
              livrosEditoraFilter.trim().length > 0 ||
              livrosAvariasFilter !== 'all'
            }
            title="Busca e filtros"
            badgeText="Ativo"
            onClear={() => {
              setSelectedProdutoId(null);
              setLivrosSearch('');
              setLivrosCategoriaId('all');
              setLivrosEditoraFilter('');
              setLivrosAvariasFilter('all');
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <AppSelect
                label="Produto do galpão (destino)"
                value={selectedProdutoId ?? ''}
                onChange={(value) => setSelectedProdutoId(value ? Number(value) : null)}
                placeholder="Selecionar"
                options={produtosAllForTabs.map((p) => ({ value: p.id, label: p.nome }))}
                selectClassName="w-full"
              />
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
                <input
                  type="text"
                  value={livrosSearch}
                  onChange={(e) => setLivrosSearch(e.target.value)}
                  placeholder="ISBN, título, gênero, autor..."
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <AppSelect
                label="Gênero"
                value={livrosCategoriaId === 'all' ? '' : livrosCategoriaId}
                onChange={(value) => setLivrosCategoriaId(value ? Number(value) : 'all')}
                placeholder="Todos"
                options={categoriesLivros.map((c) => ({ value: c.id, label: c.nome }))}
                selectClassName="w-full"
              />
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Editora</label>
                <input
                  type="text"
                  value={livrosEditoraFilter}
                  onChange={(e) => setLivrosEditoraFilter(e.target.value)}
                  placeholder="Filtrar por editora..."
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <AppSelect
                label="Avarias"
                value={livrosAvariasFilter}
                onChange={(value) => setLivrosAvariasFilter((value as 'all' | 'com' | 'sem') || 'all')}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'com', label: 'Com avarias' },
                  { value: 'sem', label: 'Sem avarias' },
                ]}
                selectClassName="w-full"
              />
            </div>
          </CollapsibleFilters>

          <DataTable<LivroDisponivel>
            data={sortedLivrosDisponiveis}
            columns={livrosColumns}
            keyExtractor={(r) => `${r.isbn}::${r.categoriaId ?? 'null'}`}
            loading={livrosLoading}
            emptyMessage="Nenhum livro disponível."
            paginate
            initialPageSize={20}
            responsiveFrom="md"
            renderMobileCard={(r) => (
              <div className={almoxarifadoMobileCardCls}>
                <div>
                  <p className="font-semibold text-white">{r.nome}</p>
                  <p className="text-xs text-white/60 mt-0.5">{r.isbn}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-white/50">Gênero:</span> <span className="text-white/80">{r.categoriaNome ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/50">Autor:</span> <span className="text-white/80">{r.autor ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/50">Editora:</span> <span className="text-white/80">{r.editora ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-white/50">Disponível:</span> <span className="font-semibold text-white">{r.quantidadeDisponivel}</span>
                  </div>
                  <div>
                    <span className="text-white/50">Alocados:</span>{' '}
                    <span className="font-semibold text-sky-300">{r.quantidadeReservadaTotal ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-white/50">Avarias:</span> <span className="font-semibold text-amber-300">{r.quantidadeAvariasTotal ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    className={btn.primarySm}
                    disabled={!canEdit}
                    onClick={() => {
                      setLivroToAlocar(r);
                      setLivroAlocarProdutoId(selectedProdutoId ?? produtosAllForTabs[0]?.id ?? null);
                      setLivroAlocarQuantidade(1);
                      setLivroAlocarFornecedorId(null);
                      setLivroAlocarFornecedorOptions([]);
                      setShowAlocarLivroModal(true);
                      void loadAlocarLivroFornecedorOptions(r);
                    }}
                  >
                    Alocar
                  </button>
                  <button
                    type="button"
                    className={btn.warningSm}
                    disabled={!canEdit}
                    onClick={() => {
                      setLivroToAvariar(r);
                      setLivroAvariaQuantidade(1);
                      setLivroAvariaJustificativa('');
                      setLivroAvariaFornecedorId(null);
                      setLivroAvariaProjetoId(null);
                      setLivroAvariaFornecedorOptions([]);
                      setLivroAvariaProjetoOptions([]);
                      setShowAvariaLivroModal(true);
                      void loadAvariasLivro(r);
                      void loadAvariaLivroOrigemOptions(r);
                    }}
                  >
                    Avarias
                  </button>
                  <button
                    type="button"
                    className={btn.dangerSm}
                    disabled={!canEdit}
                    onClick={() => void handleDeleteLivroCadastro(r)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          />
        </div>
      )}

      {activeMainTab === 'itens' && (
        <div className="pt-1 space-y-4">
          <div className="text-sm text-white/60">
            Estoque de itens global do galpão. O produto é selecionado apenas no momento de alocar.
          </div>

          <GalpaoProdutoDetails
            produtoIdOverride={null}
            showBackButton={false}
            initialFiltersOpen={false}
            showLivroValorTotal={false}
            forcedTab="outros"
            showSubTabs={false}
          />
        </div>
      )}

      {activeMainTab === 'recebimento' && (
        <div className="pt-1 space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            <p className="font-medium text-white">Orçamentos de curadoria &quot;Comprado / A caminho&quot;</p>
            <p className="mt-1 text-white/65">
              Ao marcar como <span className="text-success font-medium">Entregue</span>, os livros desse orçamento entram no
              estoque compartilhado e aparecem na aba <span className="text-white/90">Estoque de livros</span> — sem abrir a
              tela de curadoria.
            </p>
          </div>

          <DataTable<CuradoriaOrcamentoACaminhoRow>
            data={sortedOrcamentosACaminho}
            columns={columnsOrcamentosACaminho}
            keyExtractor={(row) => row.id}
            loading={orcamentosACaminhoLoading}
            emptyMessage="Nenhum orçamento a caminho no momento."
            paginate
            initialPageSize={15}
            responsiveFrom="md"
            renderMobileCard={(row) => (
              <div className={almoxarifadoMobileCardCls}>
                <div>
                  <p className="font-semibold text-white">{row.nome}</p>
                  <p className="text-xs text-white/60 mt-0.5">{row.projeto?.nome ?? 'Sem projeto'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-white/50">Fornecedor:</span>{' '}
                    <span className="text-white/80">
                      {row.fornecedor?.nomeFantasia?.trim() || row.fornecedor?.razaoSocial?.trim() || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/50">Itens:</span>{' '}
                    <span className="font-semibold text-white">{row.quantidadeItens}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-white/50">Criado em:</span>{' '}
                    <span className="text-white/80">{new Date(row.dataCriacao).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-white/10">
                  {canEdit ? (
                    <button type="button" className={btn.primarySoft} onClick={() => setOrcamentoEntregaModal(row)}>
                      Marcar entregue
                    </button>
                  ) : (
                    <span className="text-xs text-white/40">Apenas visualização</span>
                  )}
                </div>
              </div>
            )}
          />
        </div>
      )}

      <AppModal
        open={!!orcamentoEntregaModal}
        onClose={() => {
          if (!marcandoOrcamentoEntrega) setOrcamentoEntregaModal(null);
        }}
        title="Confirmar recebimento"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/85">
            Marcar o orçamento{' '}
            <span className="font-semibold text-white">&quot;{orcamentoEntregaModal?.nome}&quot;</span> como{' '}
            <span className="text-success font-medium">Entregue</span>? Os itens passam a integrar o estoque disponível para
            alocação neste módulo.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              className={btn.secondary}
              disabled={marcandoOrcamentoEntrega}
              onClick={() => setOrcamentoEntregaModal(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={marcandoOrcamentoEntrega}
              onClick={() => void handleMarcarOrcamentoEntregue()}
            >
              {marcandoOrcamentoEntrega ? 'Salvando...' : 'Confirmar entrega'}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={showRelatorioLivrosModal}
        onClose={() => setShowRelatorioLivrosModal(false)}
        title="Gerar relatório de livros"
        size="md"
      >
        <div className="space-y-4">
          <AppSelect
            label="Tipo de relatório"
            value={relatorioLivroTipo}
            onChange={(value) => setRelatorioLivroTipo((value as RelatorioLivroTipo) || 'disponiveis')}
            options={[
              { value: 'disponiveis', label: 'Livros disponíveis' },
              { value: 'alocados', label: 'Livros alocados' },
              { value: 'avarias', label: 'Livros com avarias' },
            ]}
            selectClassName="w-full"
          />

          <AppSelect
            label="Formato"
            value={relatorioLivroFormato}
            onChange={(value) => setRelatorioLivroFormato((value as RelatorioLivroFormato) || 'pdf')}
            options={[
              { value: 'pdf', label: 'PDF' },
              { value: 'excel', label: 'Excel (.xlsx)' },
            ]}
            selectClassName="w-full"
          />

          <AppSelect
            label="Gênero"
            value={relatorioLivroGeneroId === 'all' ? '' : relatorioLivroGeneroId}
            onChange={(value) => setRelatorioLivroGeneroId(value ? Number(value) : 'all')}
            placeholder="Todos os gêneros"
            options={categoriesLivros.map((c) => ({ value: c.id, label: c.nome }))}
            selectClassName="w-full"
          />

          <AppSelect
            label="Produto do galpão"
            value={relatorioLivroProdutoId ?? ''}
            onChange={(value) => setRelatorioLivroProdutoId(value ? Number(value) : null)}
            placeholder="Todos os produtos"
            options={produtosAllForTabs.map((p) => ({ value: p.id, label: p.nome }))}
            selectClassName="w-full"
          />

          <p className="text-xs text-white/60">
            Os filtros abaixo sao exclusivos do relatorio e nao dependem da barra de filtros da listagem.
          </p>

          <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => setShowRelatorioLivrosModal(false)}
              disabled={gerandoRelatorioLivros}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.primaryLg}
              onClick={() => void handleExportRelatorioLivros()}
              disabled={gerandoRelatorioLivros}
            >
              {gerandoRelatorioLivros ? 'Gerando...' : 'Gerar'}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={showAddLivroModal}
        onClose={() => setShowAddLivroModal(false)}
        title="Adicionar livro ao estoque"
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddLivroToStock();
          }}
          className="space-y-4"
        >
          <AppSelect
            label="Produto do galpão (destino da entrada)"
            value={selectedProdutoId ?? ''}
            onChange={(value) => setSelectedProdutoId(value ? Number(value) : null)}
            placeholder="Selecionar"
            options={produtosAllForTabs.map((p) => ({ value: p.id, label: p.nome }))}
            selectClassName="w-full"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">ISBN</label>
              <input
                value={addLivroForm.isbn}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, isbn: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Título (opcional)</label>
              <input
                value={addLivroForm.nome}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, nome: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <AppSelect
              label="Gênero (opcional)"
              value={addLivroForm.categoriaId}
              onChange={(value) => setAddLivroForm((prev) => ({ ...prev, categoriaId: value ? Number(value) : '' }))}
              placeholder="Sem gênero"
              options={categoriesLivros.map((c) => ({ value: c.id, label: c.nome }))}
              selectClassName="w-full"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Quantidade</label>
              <input
                type="number"
                min={1}
                value={addLivroForm.quantidade}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, quantidade: Number(e.target.value) || 1 }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Valor unitário (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={addLivroForm.valor}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, valor: Number(e.target.value) || 0 }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Desconto (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={addLivroForm.desconto}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, desconto: Number(e.target.value) || 0 }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Autor</label>
              <input
                value={addLivroForm.autor}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, autor: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Editora</label>
              <input
                value={addLivroForm.editora}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, editora: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Ano</label>
              <input
                value={addLivroForm.anoPublicacao}
                onChange={(e) => setAddLivroForm((prev) => ({ ...prev, anoPublicacao: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button type="button" className={btn.secondaryLg} onClick={() => setShowAddLivroModal(false)} disabled={addingLivro}>
              Cancelar
            </button>
            <button type="submit" className={btn.primaryLg} disabled={addingLivro}>
              {addingLivro ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={showAlocarLivroModal}
        onClose={() => {
          setShowAlocarLivroModal(false);
          setLivroToAlocar(null);
          setLivroAlocarQuantidade(1);
          setLivroAlocarFornecedorId(null);
          setLivroAlocarFornecedorOptions([]);
        }}
        title="Alocar livro"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirmAlocarLivro();
          }}
          className="space-y-4"
        >
          <div className="text-sm text-white/70">
            {livroToAlocar ? (
              <>
                Livro: <span className="text-white">{livroToAlocar.nome}</span> ({livroToAlocar.isbn})
              </>
            ) : (
              'Selecione um livro'
            )}
          </div>
          <AppSelect
            label="Produto do galpão"
            value={livroAlocarProdutoId ?? ''}
            onChange={(value) => setLivroAlocarProdutoId(value ? Number(value) : null)}
            placeholder="Selecionar"
            options={produtosAllForTabs.map((p) => ({ value: p.id, label: p.nome }))}
            selectClassName="w-full"
          />

          <AppSelect
            label="Fornecedor (origem do estoque)"
            value={livroAlocarFornecedorId ?? ''}
            onChange={(value) => setLivroAlocarFornecedorId(value ? Number(value) : null)}
            placeholder={livroAlocarFornecedorOptions.length ? 'Selecionar' : 'Sem opções'}
            options={livroAlocarFornecedorOptions}
            disabled={alocandoLivro || livroAlocarOrigemLoading}
            selectClassName="w-full"
          />
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs">
            <p className="text-white/70 mb-2">Disponível por fornecedor</p>
            {livroAlocarFornecedorOptions.length === 0 ? (
              <p className="text-white/50">Nenhum fornecedor com saldo disponível para este livro.</p>
            ) : (
              <div className="space-y-1">
                {livroAlocarFornecedorOptions.map((opt) => (
                  <div key={opt.value} className="flex items-center justify-between gap-2">
                    <span className="text-white/80 truncate">{opt.label.split(' (disponível:')[0]}</span>
                    <span className="font-semibold text-emerald-300">{opt.quantidadeDisponivel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Quantidade</label>
            <input
              type="number"
              min={1}
              max={
                livroAlocarFornecedorId != null
                  ? livroAlocarFornecedorOptions.find((o) => o.value === livroAlocarFornecedorId)
                      ?.quantidadeDisponivel ?? undefined
                  : livroToAlocar?.quantidadeDisponivel ?? undefined
              }
              value={livroAlocarQuantidade}
              onChange={(e) => setLivroAlocarQuantidade(Number(e.target.value) || 1)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={alocandoLivro}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button type="button" className={btn.secondaryLg} onClick={() => setShowAlocarLivroModal(false)} disabled={alocandoLivro}>
              Cancelar
            </button>
            <button
              type="submit"
              className={btn.primaryLg}
              disabled={
                alocandoLivro || livroAlocarOrigemLoading || !livroAlocarProdutoId || !livroToAlocar || livroAlocarFornecedorId == null
              }
            >
              {alocandoLivro ? 'Alocando...' : 'Alocar'}
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={showAvariaLivroModal}
        onClose={() => {
          setShowAvariaLivroModal(false);
          setLivroToAvariar(null);
          setLivroAvariaQuantidade(1);
          setLivroAvariaJustificativa('');
          setLivroAvarias([]);
          setLivroAvariaFornecedorId(null);
          setLivroAvariaProjetoId(null);
          setLivroAvariaFornecedorOptions([]);
          setLivroAvariaProjetoOptions([]);
          setLivroAvariaOrigemLoading(false);
          setLivroAvariaEditRow(null);
          setLivroAvariaEditJustificativa('');
          setLivroAvariaDeleteRow(null);
        }}
        title="Avaria de livro"
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirmAvariaLivro();
          }}
          className="space-y-4"
        >
          <div className="text-sm text-white/70">
            {livroToAvariar ? (
              <>
                Livro: <span className="text-white">{livroToAvariar.nome}</span> ({livroToAvariar.isbn})
              </>
            ) : (
              'Selecione um livro'
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Quantidade</label>
              <input
                type="number"
                min={1}
                max={
                  livroAvariaFornecedorId != null
                    ? livroAvariaFornecedorOptions.find((o) => o.value === livroAvariaFornecedorId)
                        ?.quantidadeDisponivel ?? undefined
                    : livroToAvariar?.quantidadeDisponivel ?? undefined
                }
                value={livroAvariaQuantidade}
                onChange={(e) => setLivroAvariaQuantidade(Number(e.target.value) || 1)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                disabled={avariandoLivro}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Justificativa</label>
            <textarea
              rows={3}
              value={livroAvariaJustificativa}
              onChange={(e) => setLivroAvariaJustificativa(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              placeholder="Descreva o motivo da avaria"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AppSelect
              label="Fornecedor (origem da avaria)"
              value={livroAvariaFornecedorId ?? ''}
              onChange={(value) => setLivroAvariaFornecedorId(value ? Number(value) : null)}
              placeholder={livroAvariaFornecedorOptions.length ? 'Selecionar' : 'Sem opções'}
              options={livroAvariaFornecedorOptions}
              disabled={avariandoLivro || livroAvariaOrigemLoading}
              selectClassName="w-full"
            />
            <AppSelect
              label="Projeto (alocação)"
              value={livroAvariaProjetoId ?? ''}
              onChange={(value) => setLivroAvariaProjetoId(value ? Number(value) : null)}
              placeholder={livroAvariaProjetoOptions.length ? 'Selecionar' : 'Sem opções'}
              options={livroAvariaProjetoOptions}
              disabled={avariandoLivro || livroAvariaOrigemLoading}
              selectClassName="w-full"
            />
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs">
            <p className="text-white/70 mb-2">Saldo por fornecedor (base para avaria/alocação)</p>
            {livroAvariaFornecedorOptions.length === 0 ? (
              <p className="text-white/50">Nenhum fornecedor com saldo disponível para este livro.</p>
            ) : (
              <div className="space-y-1">
                {livroAvariaFornecedorOptions.map((opt) => (
                  <div key={opt.value} className="flex items-center justify-between gap-2">
                    <span className="text-white/80 truncate">{opt.label.split(' (disponível:')[0]}</span>
                    <span className="font-semibold text-emerald-300">{opt.quantidadeDisponivel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button type="button" className={btn.secondaryLg} onClick={() => setShowAvariaLivroModal(false)} disabled={avariandoLivro}>
              Cancelar
            </button>
            <button type="submit" className={btn.primaryLg} disabled={avariandoLivro || livroAvariaOrigemLoading || !livroToAvariar}>
              {avariandoLivro ? 'Registrando...' : 'Registrar avaria'}
            </button>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-2">
            <h4 className="text-sm font-semibold text-white/90">Histórico de avarias</h4>
            <DataTable<LivroAvariaRegistro>
              data={livroAvarias}
              keyExtractor={(a) => a.id}
              loading={livroAvariasLoading}
              emptyMessage="Nenhuma avaria registrada para este livro."
              paginate
              initialPageSize={10}
              columns={[
                {
                  key: 'data',
                  label: 'Data',
                  render: (a) => <span className="text-xs text-white/70">{new Date(a.dataCriacao).toLocaleString('pt-BR')}</span>,
                },
                { key: 'qtd', label: 'Qtd', align: 'right', tdClassName: 'text-right', render: (a) => <span className="font-semibold">{a.quantidade}</span> },
                { key: 'produto', label: 'Produto', render: (a) => <span className="text-xs">{a.galpaoProduto?.nome ?? '-'}</span> },
                {
                  key: 'projeto',
                  label: 'Projeto',
                  render: (a) => <span className="text-xs">{a.projeto?.nome ?? '-'}</span>,
                },
                {
                  key: 'fornecedor',
                  label: 'Fornecedor',
                  render: (a) => (
                    <span className="text-xs">
                      {a.fornecedor?.nomeFantasia ?? a.fornecedor?.razaoSocial ?? '-'}
                    </span>
                  ),
                },
                { key: 'just', label: 'Justificativa', render: (a) => <span className="text-xs break-words">{a.justificativa}</span> },
                {
                  key: 'acoes',
                  label: 'Ações',
                  render: (a) =>
                    canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={btn.editSm}
                          onClick={() => {
                            setLivroAvariaEditRow(a);
                            setLivroAvariaEditJustificativa(a.justificativa);
                          }}
                        >
                          Editar motivo
                        </button>
                        <button type="button" className={btn.dangerSm} onClick={() => setLivroAvariaDeleteRow(a)}>
                          Excluir
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-white/40">—</span>
                    ),
                },
              ]}
              responsiveFrom="md"
              renderMobileCard={(a) => (
                <div className={`${almoxarifadoMobileCardCls} !p-3 space-y-2`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70">{new Date(a.dataCriacao).toLocaleString('pt-BR')}</span>
                    <span className="font-semibold text-white">Qtd: {a.quantidade}</span>
                  </div>
                  <div className="text-xs text-white/80">Produto: {a.galpaoProduto?.nome ?? '-'}</div>
                  <div className="text-xs text-white/80">Projeto: {a.projeto?.nome ?? '-'}</div>
                  <div className="text-xs text-white/80">
                    Fornecedor: {a.fornecedor?.nomeFantasia ?? a.fornecedor?.razaoSocial ?? '-'}
                  </div>
                  <div className="text-xs text-white/80 break-words">Justificativa: {a.justificativa}</div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        className={btn.editSm}
                        onClick={() => {
                          setLivroAvariaEditRow(a);
                          setLivroAvariaEditJustificativa(a.justificativa);
                        }}
                      >
                        Editar motivo
                      </button>
                      <button type="button" className={btn.dangerSm} onClick={() => setLivroAvariaDeleteRow(a)}>
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        </form>
      </AppModal>

      <AppModal
        open={!!livroAvariaEditRow}
        onClose={() => {
          if (!livroAvariaSavingJustificativa) {
            setLivroAvariaEditRow(null);
            setLivroAvariaEditJustificativa('');
          }
        }}
        title="Editar motivo da avaria"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Justificativa</label>
            <textarea
              rows={4}
              value={livroAvariaEditJustificativa}
              onChange={(e) => setLivroAvariaEditJustificativa(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              disabled={livroAvariaSavingJustificativa}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btn.secondary}
              disabled={livroAvariaSavingJustificativa}
              onClick={() => {
                setLivroAvariaEditRow(null);
                setLivroAvariaEditJustificativa('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={livroAvariaSavingJustificativa}
              onClick={() => void handleSaveLivroAvariaJustificativa()}
            >
              {livroAvariaSavingJustificativa ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={!!livroAvariaDeleteRow}
        onClose={() => {
          if (!livroAvariaDeleting) setLivroAvariaDeleteRow(null);
        }}
        title="Excluir registro de avaria"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/85">
            Excluir esta avaria de <span className="font-semibold text-white">{livroAvariaDeleteRow?.quantidade}</span>{' '}
            unidade(s)? A quantidade será recolocada no estoque de curadoria e o motivo será removido do histórico.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btn.secondary}
              disabled={livroAvariaDeleting}
              onClick={() => setLivroAvariaDeleteRow(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.danger}
              disabled={livroAvariaDeleting}
              onClick={() => void handleDeleteLivroAvaria()}
            >
              {livroAvariaDeleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </AppModal>

      {showCreateEditModal && (
        <AppModal
          open={showCreateEditModal}
          onClose={() => setShowCreateEditModal(false)}
          title={modalMode === 'create' ? 'Novo produto do galpão' : 'Editar produto do galpão'}
          size="lg"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">Nome</label>
              <input
                required
                type="text"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">Descrição (opcional)</label>
              <textarea
                value={form.descricao ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
                rows={3}
                className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))}
                className="accent-primary"
                id="ativo"
              />
              <label htmlFor="ativo" className="text-sm text-white/80">
                Produto ativo
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                className={btn.secondaryLg}
                onClick={() => setShowCreateEditModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className={btn.primaryLg} disabled={!canEdit}>
                {modalMode === 'create' ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </form>
        </AppModal>
      )}

      {produtoToDelete && (
        <ConfirmDeleteByNameModal
          open={!!produtoToDelete}
          title="Excluir produto do galpão"
          entityLabel="o produto"
          entityName={produtoToDelete.nome}
          confirmValue={deleteConfirmName}
          onConfirmValueChange={setDeleteConfirmName}
          onClose={() => setProdutoToDelete(null)}
          onConfirm={async () => {
            if (!produtoToDelete) return;
            try {
              setDeleting(true);
              setDeleteError(null);
              await api.delete(`/galpao/produtos/${produtoToDelete.id}`);
              toast.success('Produto excluído com sucesso!');
              setProdutoToDelete(null);
              await loadProdutos();
            } catch (err: any) {
              setDeleteError(formatApiError(err));
              toast.error(formatApiError(err));
            } finally {
              setDeleting(false);
            }
          }}
          loading={deleting}
          errorMessage={deleteError}
          confirmButtonLabel="Excluir produto"
        />
      )}
    </div>
  );
}

