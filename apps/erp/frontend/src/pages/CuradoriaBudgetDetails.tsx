import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { btn } from '../utils/buttonStyles';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { formatApiError, toast } from '../utils/toast';
import { Category, Projeto, Supplier } from '../types/stock';
import { FileDropInput } from '../components/FileDropInput';
import { UploadFileLink } from '../components/files/UploadFileLink';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppModal } from '../components/ui/AppModal';
import { AppSelect } from '../components/ui/AppSelect';
import { HTML_NUMBER_DECIMAL_HINT } from '../utils/numberInputHint';
import { NumericInput } from '../components/ui/NumericInput';

interface CuradoriaItem {
  id: number;
  nome: string;
  isbn: string;
  quantidade: number;
  valor: number;
  desconto: number;
  valorLiquido: number;
  autor?: string | null;
  editora?: string | null;
  anoPublicacao?: string | null;
  categoria?: { id: number; nome: string } | null;
}

interface CuradoriaOrcamentoDetails {
  id: number;
  nome: string;
  projetoId?: number | null;
  setorId?: number | null;
  fornecedorId?: number | null;
  fornecedor?: { id: number; nomeFantasia: string; razaoSocial: string; cnpj: string } | null;
  nfUrl?: string | null;
  formaPagamento?: string | null;
  arquivoOrcamentoUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  status?: 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO';
  observacao?: string | null;
  projeto?: { id: number; nome: string } | null;
  setor?: { id: number; nome: string } | null;
  descontoAplicadoEm: 'ITEM' | 'TOTAL';
  descontoTotal: number;
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  itens: CuradoriaItem[];
  dataCriacao: string;
}

interface CuradoriaEditBudgetForm {
  nome: string;
  projetoId?: number;
  setorId?: number;
  fornecedorId?: number;
  nfUrl: string;
  formaPagamento: string;
  arquivoOrcamentoUrl: string;
  comprovantePagamentoUrl: string;
  status: 'PENDENTE' | 'COMPRADO_ACAMINHO' | 'ENTREGUE' | 'SOLICITADO' | 'REPROVADO';
  observacao: string;
  descontoAplicadoEm: 'ITEM' | 'TOTAL';
  /** `null` = campo vazio no formulário */
  descontoTotal: number | null;
}

interface SimpleSetor {
  id: number;
  nome: string;
}

interface CuradoriaEditItemForm {
  nome: string;
  isbn: string;
  categoriaId?: number;
  quantidade: number | null;
  valor: number | null;
  desconto: number | null;
  autor: string;
  editora: string;
  anoPublicacao: string;
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

export default function CuradoriaBudgetDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orcamento, setOrcamento] = useState<CuradoriaOrcamentoDetails | null>(null);
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [setores, setSetores] = useState<SimpleSetor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showEditBudgetModal, setShowEditBudgetModal] = useState(false);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CuradoriaItem | null>(null);
  const [savingEditBudget, setSavingEditBudget] = useState(false);
  const [savingEditItem, setSavingEditItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [editBudgetDiscountType, setEditBudgetDiscountType] = useState<TotalDiscountInputType>('VALOR');
  const [editBudgetForm, setEditBudgetForm] = useState<CuradoriaEditBudgetForm>({
    nome: '',
    projetoId: undefined,
    setorId: undefined,
    fornecedorId: undefined,
    nfUrl: '',
    formaPagamento: '',
    arquivoOrcamentoUrl: '',
    comprovantePagamentoUrl: '',
    status: 'PENDENTE',
    observacao: '',
    descontoAplicadoEm: 'ITEM',
    descontoTotal: 0,
  });
  const [editItemForm, setEditItemForm] = useState<CuradoriaEditItemForm>({
    nome: '',
    isbn: '',
    categoriaId: undefined,
    quantidade: 1,
    valor: 0,
    desconto: 0,
    autor: '',
    editora: '',
    anoPublicacao: '',
  });
  const [isbnLoading, setIsbnLoading] = useState(false);
  const [itemsSearch, setItemsSearch] = useState('');
  const [itemsSortKey, setItemsSortKey] = useState<'nome' | 'valor' | 'desconto' | 'liquido'>(
    'nome',
  );
  const [itemsSortDir, setItemsSortDir] = useState<'asc' | 'desc'>('asc');
  const [showItemsFilters, setShowItemsFilters] = useState(false);
  const fieldClass =
    'w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';
  const fileFieldClass =
    'w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30';
  const labelClass = 'block text-sm font-medium text-white/90 mb-2';

  function normalizeTextSpacing(value: string): string {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([,;:.!?])\s*/g, '$1 ')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
  }

  function normalizeIsbn(value: string): string {
    return String(value ?? '')
      .toUpperCase()
      .replace(/[^0-9X]/g, '');
  }

  async function loadBudget(budgetId: string) {
    const { data } = await api.get<CuradoriaOrcamentoDetails>(`/curadoria/orcamentos/${budgetId}`);
    setOrcamento(data);
    return data;
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

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const [budgetData, projectsRes, setoresRes, categoriesRes, suppliersRes] = await Promise.all([
          loadBudget(id),
          api.get<Projeto[]>('/projects/options'),
          api.get<SimpleSetor[]>('/setores/options').catch(() => ({ data: [] as SimpleSetor[] })),
          api.get<Category[]>('/categories/all?tipo=LIVRO').catch(() => ({ data: [] as Category[] })),
          api.get<Supplier[]>('/suppliers').catch(() => ({ data: [] as Supplier[] })),
        ]);
        setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
        setSetores(Array.isArray(setoresRes.data) ? setoresRes.data : []);
        setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
        setSuppliers(Array.isArray(suppliersRes.data) ? suppliersRes.data : []);
        setEditBudgetForm({
          nome: budgetData.nome ?? '',
          projetoId: budgetData.projeto?.id ?? undefined,
          setorId: budgetData.setor?.id ?? budgetData.setorId ?? undefined,
          fornecedorId: budgetData.fornecedor?.id ?? undefined,
          nfUrl: budgetData.nfUrl ?? '',
          formaPagamento: budgetData.formaPagamento ?? '',
          arquivoOrcamentoUrl: budgetData.arquivoOrcamentoUrl ?? '',
          comprovantePagamentoUrl: budgetData.comprovantePagamentoUrl ?? '',
          status: budgetData.status ?? 'PENDENTE',
          observacao: budgetData.observacao ?? '',
          descontoAplicadoEm: budgetData.descontoAplicadoEm ?? 'ITEM',
          descontoTotal: Number(budgetData.descontoTotal ?? 0),
        });
      } catch (err: any) {
        const message = formatApiError(err);
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const filteredAndSortedItems = useMemo(() => {
    if (!orcamento?.itens) return [];
    const search = itemsSearch.trim().toLowerCase();
    let result = orcamento.itens as CuradoriaItem[];

    if (search) {
      result = result.filter((item) => {
        return (
          item.nome.toLowerCase().includes(search) ||
          item.isbn.toLowerCase().includes(search) ||
          (item.categoria?.nome ?? '').toLowerCase().includes(search)
        );
      });
    }

    const key = itemsSortKey;
    const dir = itemsSortDir === 'asc' ? 1 : -1;

    result = [...result].sort((a, b) => {
      if (key === 'nome') {
        return a.nome.localeCompare(b.nome, 'pt-BR') * dir;
      }
      if (key === 'valor') {
        return (a.valor - b.valor) * dir;
      }
      if (key === 'desconto') {
        return (a.desconto - b.desconto) * dir;
      }
      if (key === 'liquido') {
        return (a.valorLiquido - b.valorLiquido) * dir;
      }
      return 0;
    });

    return result;
  }, [orcamento?.itens, itemsSearch, itemsSortKey, itemsSortDir]);

  const columns = useMemo<DataTableColumn<CuradoriaItem>[]>(
    () => [
      { key: 'nome', label: 'Título', render: (item) => <span className="font-medium">{item.nome}</span> },
      { key: 'isbn', label: 'ISBN', render: (item) => <span className="font-mono text-xs">{item.isbn}</span> },
      {
        key: 'categoria',
        label: 'Gênero literário',
        render: (item) => <span>{item.categoria?.nome ?? 'Sem gênero literário'}</span>,
      },
      { key: 'qtd', label: 'Qtd', align: 'right', render: (item) => <span>{item.quantidade}</span> },
      {
        key: 'valor',
        label: 'Valor',
        align: 'right',
        render: (item) => (
          <span>
            {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        ),
      },
      {
        key: 'desconto',
        label: 'Desconto',
        align: 'right',
        render: (item) => (
          <span>
            {item.desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        ),
      },
      {
        key: 'liquido',
        label: 'Líquido',
        align: 'right',
        render: (item) => (
          <span className="text-emerald-300">
            {item.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
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
              className={btn.editSm}
              onClick={() => {
                setIsCreatingItem(false);
                setEditingItemId(item.id);
                setEditItemForm({
                  nome: normalizeTextSpacing(item.nome),
                  isbn: normalizeIsbn(item.isbn),
                  categoriaId: item.categoria?.id,
                  quantidade: item.quantidade,
                  valor: item.valor,
                  desconto: item.desconto,
                  autor: normalizeTextSpacing(item.autor ?? ''),
                  editora: normalizeTextSpacing(item.editora ?? ''),
                  anoPublicacao: item.anoPublicacao ?? '',
                });
                setShowEditItemModal(true);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              className={btn.dangerSm}
              onClick={() => {
                setItemToDelete(item);
                setShowDeleteItemModal(true);
              }}
            >
              Remover
            </button>
          </div>
        ),
      },
    ],
    [categories],
  );

  async function handleEditBudget(event: FormEvent) {
    event.preventDefault();
    if (!orcamento || !id) return;
    if (!editBudgetForm.nome.trim()) {
      toast.error('Informe o nome do orçamento.');
      return;
    }

    try {
      const descontoTotalCalculado =
        editBudgetForm.descontoAplicadoEm === 'TOTAL'
          ? editBudgetDiscountType === 'PERCENTUAL'
            ? (Number(orcamento.totalBruto || 0) * Number(editBudgetForm.descontoTotal || 0)) / 100
            : Number(editBudgetForm.descontoTotal || 0)
          : 0;
      setSavingEditBudget(true);
      await api.patch(`/curadoria/orcamentos/${orcamento.id}`, {
        nome: editBudgetForm.nome.trim(),
        projetoId: editBudgetForm.projetoId || undefined,
        setorId: editBudgetForm.setorId || undefined,
        fornecedorId: editBudgetForm.fornecedorId || undefined,
        nfUrl: editBudgetForm.nfUrl.trim() || undefined,
        formaPagamento: editBudgetForm.formaPagamento.trim() || undefined,
        arquivoOrcamentoUrl: editBudgetForm.arquivoOrcamentoUrl.trim() || undefined,
        comprovantePagamentoUrl: editBudgetForm.comprovantePagamentoUrl.trim() || undefined,
        status: editBudgetForm.status,
        observacao: editBudgetForm.observacao.trim() || undefined,
        descontoAplicadoEm: editBudgetForm.descontoAplicadoEm,
        descontoTotal:
          editBudgetForm.descontoAplicadoEm === 'TOTAL'
            ? Number(descontoTotalCalculado.toFixed(2))
            : 0,
      });
      const updated = await loadBudget(id);
      setEditBudgetForm({
        nome: updated.nome ?? '',
        projetoId: updated.projeto?.id ?? undefined,
        fornecedorId: updated.fornecedor?.id ?? undefined,
        nfUrl: updated.nfUrl ?? '',
        formaPagamento: updated.formaPagamento ?? '',
        arquivoOrcamentoUrl: updated.arquivoOrcamentoUrl ?? '',
        comprovantePagamentoUrl: updated.comprovantePagamentoUrl ?? '',
        status: updated.status ?? 'PENDENTE',
        observacao: updated.observacao ?? '',
        descontoAplicadoEm: updated.descontoAplicadoEm ?? 'ITEM',
        descontoTotal: Number(updated.descontoTotal ?? 0),
      });
      setShowEditBudgetModal(false);
      toast.success('Orçamento atualizado com sucesso.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setSavingEditBudget(false);
    }
  }

  async function handleEditItem(event: FormEvent) {
    event.preventDefault();
    if (!orcamento || !id) return;

    if (!editItemForm.isbn.trim()) {
      toast.error('Informe o ISBN do item.');
      return;
    }
    if (!editItemForm.categoriaId) {
      toast.error('Selecione o gênero literário.');
      return;
    }
    if (
      editItemForm.quantidade == null ||
      editItemForm.valor == null ||
      editItemForm.desconto == null ||
      editItemForm.quantidade <= 0 ||
      editItemForm.valor < 0 ||
      editItemForm.desconto < 0
    ) {
      toast.error('Quantidade, valor e desconto devem ser válidos.');
      return;
    }

    try {
      setSavingEditItem(true);
      const payload = {
        nome: normalizeTextSpacing(editItemForm.nome),
        isbn: normalizeIsbn(editItemForm.isbn),
        categoriaId: Number(editItemForm.categoriaId),
        quantidade: editItemForm.quantidade,
        valor: editItemForm.valor,
        desconto: editItemForm.desconto,
        autor: normalizeTextSpacing(editItemForm.autor) || undefined,
        editora: normalizeTextSpacing(editItemForm.editora) || undefined,
        anoPublicacao: editItemForm.anoPublicacao.trim() || undefined,
      };

      if (isCreatingItem) {
        await api.post(`/curadoria/orcamentos/${orcamento.id}/itens`, payload);
      } else if (editingItemId) {
        await api.patch(`/curadoria/orcamentos/${orcamento.id}/itens/${editingItemId}`, payload);
      } else {
        throw new Error('Item inválido para edição.');
      }
      await loadBudget(id);
      setShowEditItemModal(false);
      setEditingItemId(null);
      setIsCreatingItem(false);
      toast.success(isCreatingItem ? 'Item adicionado com sucesso.' : 'Item atualizado com sucesso.');
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setSavingEditItem(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btn.secondary} onClick={() => navigate('/curadoria')}>
          Voltar para orçamentos
        </button>
        {orcamento && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btn.primary}
              onClick={() => {
                setIsCreatingItem(true);
                setEditingItemId(null);
                setEditItemForm({
                  nome: '',
                  isbn: '',
                  categoriaId: undefined,
                  quantidade: 1,
                  valor: 0,
                  desconto: 0,
                  autor: '',
                  editora: '',
                  anoPublicacao: '',
              });
              setShowEditItemModal(true);
            }}
          >
            + Adicionar item
          </button>
            <button
              type="button"
              className={btn.edit}
              onClick={() => {
                setEditBudgetForm({
                  nome: orcamento.nome ?? '',
                  projetoId: orcamento.projeto?.id ?? undefined,
                  fornecedorId: orcamento.fornecedor?.id ?? undefined,
                  nfUrl: orcamento.nfUrl ?? '',
                  formaPagamento: orcamento.formaPagamento ?? '',
                  arquivoOrcamentoUrl: orcamento.arquivoOrcamentoUrl ?? '',
                  comprovantePagamentoUrl: orcamento.comprovantePagamentoUrl ?? '',
                  status: orcamento.status ?? 'PENDENTE',
                  observacao: orcamento.observacao ?? '',
                  descontoAplicadoEm: orcamento.descontoAplicadoEm ?? 'ITEM',
                  descontoTotal: Number(orcamento.descontoTotal ?? 0),
                });
                setEditBudgetDiscountType('VALOR');
                setShowEditBudgetModal(true);
              }}
            >
              Editar orçamento
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-danger/15 border border-danger/40 text-danger px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {orcamento && (
        <div className="bg-neutral/70 border border-white/10 rounded-xl p-4 space-y-2">
          <h2 className="text-xl font-semibold">{orcamento.nome}</h2>
          <p className="text-sm text-white/70">
            Projeto: {orcamento.projeto?.nome ?? 'Sem projeto'} | Criado em{' '}
            {new Date(orcamento.dataCriacao).toLocaleString('pt-BR')}
          </p>
          <p className="text-sm text-white/70">
            Status: {(orcamento.status ?? 'PENDENTE').replaceAll('_', ' ')} | Fornecedor:{' '}
            {orcamento.fornecedor?.nomeFantasia ?? orcamento.fornecedor?.razaoSocial ?? 'Não informado'}
          </p>
          {(orcamento.nfUrl || orcamento.formaPagamento) && (
            <p className="text-sm text-white/70">
              NF: {orcamento.nfUrl ? 'Arquivo anexado' : '-'} | Pagamento: {orcamento.formaPagamento || '-'}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {orcamento.arquivoOrcamentoUrl && (
              <UploadFileLink src={orcamento.arquivoOrcamentoUrl} className="text-xs text-primary hover:underline">
                Arquivo original: {getDataUrlFileName(orcamento.arquivoOrcamentoUrl)}
              </UploadFileLink>
            )}
            {orcamento.nfUrl && (
              <UploadFileLink src={orcamento.nfUrl} className="text-xs text-primary hover:underline">
                Abrir NF: {getDataUrlFileName(orcamento.nfUrl)}
              </UploadFileLink>
            )}
            {orcamento.comprovantePagamentoUrl && (
              <UploadFileLink src={orcamento.comprovantePagamentoUrl} className="text-xs text-primary hover:underline">
                Abrir comprovante de pagamento
              </UploadFileLink>
            )}
          </div>
          {orcamento.observacao && <p className="text-sm text-white/80">{orcamento.observacao}</p>}
          <p className="text-xs text-white/60">
            Itens distintos: {orcamento.itens.length} | Quantidade total:{' '}
            {orcamento.itens.reduce((sum, item) => sum + item.quantidade, 0)}
          </p>
          <div className="mt-3">
            <CollapsibleFilters
              show={showItemsFilters}
              setShow={setShowItemsFilters}
              hasActiveFilters={itemsSearch.trim().length > 0 || itemsSortKey !== 'nome' || itemsSortDir !== 'asc'}
              onClear={() => {
                setItemsSearch('');
                setItemsSortKey('nome');
                setItemsSortDir('asc');
              }}
              title="Busca e ordenação dos itens"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
                  <input
                    type="text"
                    value={itemsSearch}
                    onChange={(event) => setItemsSearch(event.target.value)}
                    placeholder="Buscar item por título, ISBN ou gênero literário..."
                    className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/90 mb-1">Ordenar</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={itemsSortKey}
                      onChange={(event) =>
                        setItemsSortKey(event.target.value as 'nome' | 'valor' | 'desconto' | 'liquido')
                      }
                      className="flex-1 bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.75rem center',
                        paddingRight: '2rem',
                      }}
                    >
                      <option value="nome" className="bg-neutral text-white">Ordenar por título</option>
                      <option value="valor" className="bg-neutral text-white">Ordenar por valor</option>
                      <option value="desconto" className="bg-neutral text-white">Ordenar por desconto</option>
                      <option value="liquido" className="bg-neutral text-white">Ordenar por líquido</option>
                    </select>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs bg-neutral border border-white/30 rounded-md hover:bg-neutral/60"
                      onClick={() => setItemsSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    >
                      {itemsSortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
                    </button>
                  </div>
                </div>
              </div>
            </CollapsibleFilters>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <p className="text-xs text-white/60">Total bruto</p>
              <p className="font-semibold">
                {orcamento.totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <p className="text-xs text-white/60">Desconto</p>
              <p className="font-semibold text-amber-300">
                {orcamento.totalDesconto.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <p className="text-xs text-white/60">Total líquido</p>
              <p className="font-semibold text-emerald-300">
                {orcamento.totalLiquido.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      <DataTable<CuradoriaItem>
        data={filteredAndSortedItems}
        columns={columns}
        loading={loading}
        keyExtractor={(item) => item.id}
        emptyMessage="Nenhum item neste orçamento."
        paginate
        initialPageSize={20}
        renderMobileCard={(item) => (
          <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="font-semibold">{item.nome}</p>
            <p className="text-xs text-white/60">ISBN: {item.isbn}</p>
            <p className="text-xs text-white/60">Gênero literário: {item.categoria?.nome ?? 'Sem gênero literário'}</p>
            <p className="text-xs text-white/70">
              Qtd: {item.quantidade} | Valor un.:{' '}
              {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Desconto
              un.:{' '}
              {item.desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-white/70">
              Total item:{' '}
              {(item.valor * item.quantidade).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}{' '}
              | Total líquido item:{' '}
              {(item.valorLiquido * item.quantidade).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </p>
          </div>
        )}
      />

      {showEditBudgetModal && (
        <AppModal
          open={showEditBudgetModal}
          onClose={() => setShowEditBudgetModal(false)}
          title="Editar orçamento"
          size="lg"
        >
            <form onSubmit={handleEditBudget} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Nome do orçamento</label>
                  <input
                    type="text"
                    value={editBudgetForm.nome}
                    onChange={(event) =>
                      setEditBudgetForm((prev) => ({ ...prev, nome: event.target.value }))
                    }
                    className={fieldClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Projeto</label>
                  <AppSelect
                    value={editBudgetForm.projetoId ?? ''}
                    onChange={(value) =>
                      setEditBudgetForm((prev) => ({
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
                    value={editBudgetForm.setorId ?? ''}
                    onChange={(value) =>
                      setEditBudgetForm((prev) => ({
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
                    value={editBudgetForm.fornecedorId ?? ''}
                    onChange={(value) =>
                      setEditBudgetForm((prev) => ({
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
                    value={editBudgetForm.status}
                    onChange={(value) =>
                      setEditBudgetForm((prev) => ({
                        ...prev,
                        status: value as CuradoriaEditBudgetForm['status'],
                      }))
                    }
                    options={CURADORIA_STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    selectClassName={fieldClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Forma de pagamento</label>
                <input
                  type="text"
                  value={editBudgetForm.formaPagamento}
                  onChange={(event) =>
                    setEditBudgetForm((prev) => ({ ...prev, formaPagamento: event.target.value }))
                  }
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
                        .then((value) =>
                          setEditBudgetForm((prev) => ({ ...prev, nfUrl: value })),
                        )
                        .catch(() => toast.error('Não foi possível ler o arquivo da NF.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o arquivo NF aqui"
                  />
                  {editBudgetForm.nfUrl && (
                    <UploadFileLink src={editBudgetForm.nfUrl} className="text-xs text-primary hover:underline">
                      NF atual: {getDataUrlFileName(editBudgetForm.nfUrl)}
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
                        .then((value) =>
                          setEditBudgetForm((prev) => ({ ...prev, arquivoOrcamentoUrl: value })),
                        )
                        .catch(() => toast.error('Não foi possível ler o arquivo do orçamento.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o orçamento original aqui"
                  />
                  {editBudgetForm.arquivoOrcamentoUrl && (
                    <UploadFileLink src={editBudgetForm.arquivoOrcamentoUrl} className="text-xs text-primary hover:underline">
                      Arquivo atual: {getDataUrlFileName(editBudgetForm.arquivoOrcamentoUrl)}
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
                        .then((value) =>
                          setEditBudgetForm((prev) => ({ ...prev, comprovantePagamentoUrl: value })),
                        )
                        .catch(() => toast.error('Não foi possível ler a imagem de pagamento.'));
                    }}
                    className={fileFieldClass}
                    dropMessage="Solte o comprovante aqui"
                  />
                  {editBudgetForm.comprovantePagamentoUrl && (
                    <UploadFileLink src={editBudgetForm.comprovantePagamentoUrl} className="text-xs text-primary hover:underline">
                      Abrir comprovante atual
                    </UploadFileLink>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={editBudgetForm.descontoAplicadoEm}
                  onChange={(event) =>
                    setEditBudgetForm((prev) => ({
                      ...prev,
                      descontoAplicadoEm: event.target.value as 'ITEM' | 'TOTAL',
                    }))
                  }
                  className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="ITEM">Desconto por item</option>
                  <option value="TOTAL">Desconto no total</option>
                </select>
                {editBudgetForm.descontoAplicadoEm === 'TOTAL' && (
                  <div className="bg-black/20 border border-primary/30 rounded-md p-3 space-y-2">
                    <p className="text-xs text-white/80 font-medium">Tipo de desconto no total</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <AppSelect
                        value={editBudgetDiscountType}
                        onChange={(value) => setEditBudgetDiscountType(value as TotalDiscountInputType)}
                        options={[
                          { value: 'VALOR', label: 'Valor (R$)' },
                          { value: 'PERCENTUAL', label: 'Porcentagem (%)' },
                        ]}
                        selectClassName="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <NumericInput
                        min={0}
                        step={0.01}
                        value={editBudgetForm.descontoTotal}
                        onValueChange={(v) =>
                          setEditBudgetForm((prev) => ({
                            ...prev,
                            descontoTotal: v,
                          }))
                        }
                        placeholder={editBudgetDiscountType === 'VALOR' ? 'Ex.: 250.00' : 'Ex.: 10'}
                        className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <p className="text-[11px] text-white/70">
                      {editBudgetDiscountType === 'VALOR'
                        ? 'Desconto fixo em reais aplicado no total do orçamento.'
                        : `Aplicar ${Number(editBudgetForm.descontoTotal || 0).toFixed(2)}% sobre total bruto de R$ ${Number(orcamento?.totalBruto || 0).toFixed(2)}.`}
                    </p>
                    <p className="text-[11px] text-white/50">{HTML_NUMBER_DECIMAL_HINT}</p>
                  </div>
                )}
              </div>
              <textarea
                value={editBudgetForm.observacao}
                onChange={(event) =>
                  setEditBudgetForm((prev) => ({ ...prev, observacao: event.target.value }))
                }
                placeholder="Observações"
                className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowEditBudgetModal(false)}
                  className={btn.secondaryLg}
                  disabled={savingEditBudget}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={savingEditBudget}>
                  {savingEditBudget ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
        </AppModal>
      )}

      {showEditItemModal && (
        <AppModal
          open={showEditItemModal}
          onClose={() => {
            setShowEditItemModal(false);
            setEditingItemId(null);
          }}
          title={isCreatingItem ? 'Adicionar item ao orçamento' : 'Editar item do orçamento'}
          size="lg"
        >
            <form onSubmit={handleEditItem} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Título (opcional)</label>
                  <input
                    type="text"
                    value={editItemForm.nome}
                    onChange={(event) =>
                      setEditItemForm((prev) => ({ ...prev, nome: event.target.value }))
                    }
                    placeholder="Ex.: O Alquimista"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">ISBN (obrigatório)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editItemForm.isbn}
                      onChange={(event) =>
                        setEditItemForm((prev) => ({ ...prev, isbn: event.target.value }))
                      }
                      placeholder="Ex.: 9788532530783"
                      className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                    <button
                      type="button"
                      className={btn.secondary}
                      disabled={isbnLoading}
                      onClick={async () => {
                        const raw = editItemForm.isbn ?? '';
                        const isbn = raw.toUpperCase().replace(/[^0-9X]/g, '');
                        if (!(isbn.length === 10 || isbn.length === 13)) {
                          toast.error('Informe um ISBN com 10 ou 13 dígitos.');
                          return;
                        }
                        try {
                          setIsbnLoading(true);
                          const { data } = await api.get<any>(`/curadoria/books/isbn/${isbn}`);
                          setEditItemForm((prev) => {
                            const matchingCategory = categories.find((category) =>
                              (data.categorias ?? []).some(
                                (bookCategory: string) =>
                                  bookCategory.toLowerCase().includes(category.nome.toLowerCase()) ||
                                  category.nome.toLowerCase().includes(bookCategory.toLowerCase()),
                              ),
                            );
                            return {
                              ...prev,
                              isbn: data.isbn || prev.isbn,
                              nome: data.titulo || prev.nome,
                              autor:
                                (data.autores && data.autores.join(', ')) || prev.autor,
                              editora: data.editora || prev.editora,
                              anoPublicacao: data.anoPublicacao || prev.anoPublicacao,
                              categoriaId: prev.categoriaId || matchingCategory?.id,
                            };
                          });
                        } catch (err: any) {
                          toast.error(
                            formatApiError(err) ||
                              'Não foi possível buscar dados para este ISBN.',
                          );
                        } finally {
                          setIsbnLoading(false);
                        }
                      }}
                    >
                      {isbnLoading ? '...' : 'Buscar'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Gênero literário</label>
                  <select
                    value={editItemForm.categoriaId ?? ''}
                    onChange={(event) =>
                      setEditItemForm((prev) => ({
                        ...prev,
                        categoriaId: event.target.value ? Number(event.target.value) : undefined,
                      }))
                    }
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="">Selecione</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Quantidade</label>
                  <NumericInput
                    required
                    min={1}
                    integer
                    value={editItemForm.quantidade}
                    onValueChange={(v) => setEditItemForm((prev) => ({ ...prev, quantidade: v }))}
                    placeholder="Ex.: 10"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Valor unitário (R$)</label>
                  <NumericInput
                    required
                    min={0}
                    step={0.01}
                    value={editItemForm.valor}
                    onValueChange={(v) => setEditItemForm((prev) => ({ ...prev, valor: v }))}
                    placeholder="Ex.: 39.90"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Desconto (R$)</label>
                  <NumericInput
                    min={0}
                    step={0.01}
                    value={editItemForm.desconto}
                    onValueChange={(v) => setEditItemForm((prev) => ({ ...prev, desconto: v }))}
                    placeholder="Ex.: 5.00"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <p className="text-[11px] text-white/50">{HTML_NUMBER_DECIMAL_HINT}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Autor (opcional)</label>
                  <input
                    type="text"
                    value={editItemForm.autor}
                    onChange={(event) =>
                      setEditItemForm((prev) => ({ ...prev, autor: event.target.value }))
                    }
                    placeholder="Ex.: Machado de Assis"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Editora (opcional)</label>
                  <input
                    type="text"
                    value={editItemForm.editora}
                    onChange={(event) =>
                      setEditItemForm((prev) => ({ ...prev, editora: event.target.value }))
                    }
                    placeholder="Ex.: Companhia das Letras"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">Ano/Data publicação (opcional)</label>
                  <input
                    type="text"
                    value={editItemForm.anoPublicacao}
                    onChange={(event) =>
                      setEditItemForm((prev) => ({ ...prev, anoPublicacao: event.target.value }))
                    }
                    placeholder="Ex.: 2023 ou 2023-08-15"
                    className="w-full bg-neutral/70 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditItemModal(false);
                    setEditingItemId(null);
                  }}
                  className={btn.secondaryLg}
                  disabled={savingEditItem}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={savingEditItem}>
                  {savingEditItem ? 'Salvando...' : 'Salvar item'}
                </button>
              </div>
            </form>
        </AppModal>
      )}

      {showDeleteItemModal && orcamento && itemToDelete && (
        <AppModal
          open={showDeleteItemModal && !!orcamento && !!itemToDelete}
          onClose={() => {
            setShowDeleteItemModal(false);
            setItemToDelete(null);
          }}
          title="Remover item do orçamento"
          size="sm"
          bodyClassName="p-6 space-y-4"
        >
              <p className="text-sm text-white/80">
                Tem certeza que deseja remover o item{' '}
                <span className="font-semibold">"{itemToDelete.nome}"</span> deste orçamento?
              </p>
              <p className="text-xs text-white/60">
                ISBN: <span className="font-mono">{itemToDelete.isbn}</span> • Quantidade:{' '}
                {itemToDelete.quantidade} • Valor unitário:{' '}
                {itemToDelete.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteItemModal(false);
                    setItemToDelete(null);
                  }}
                  className={btn.secondary}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={btn.danger}
                  onClick={async () => {
                    if (!orcamento || !itemToDelete) return;
                    try {
                      await api.delete(
                        `/curadoria/orcamentos/${orcamento.id}/itens/${itemToDelete.id}`,
                      );
                      await loadBudget(String(orcamento.id));
                      toast.success('Item removido com sucesso.');
                    } catch (err: any) {
                      toast.error(formatApiError(err));
                    } finally {
                      setShowDeleteItemModal(false);
                      setItemToDelete(null);
                    }
                  }}
                >
                  Remover item
                </button>
              </div>
        </AppModal>
      )}
    </div>
  );
}

