import { useEffect, useState, FormEvent, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { toast, formatApiError } from '../utils/toast';
import { useFormValidation, validators, errorMessages } from '../utils/validation';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { btn } from '../utils/buttonStyles';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { useTextFilter } from '../hooks/useTextFilter';
import { AppModal } from '../components/ui/AppModal';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';

interface Category {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  tipo: 'ITEM' | 'LIVRO';
  isAssinatura?: boolean;
  isDespesa?: boolean;
  recorrenciaMensal?: boolean;
  entraNoEstoque?: boolean;
  permiteAlocacao?: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}
  
interface CreateCategoryForm {
  nome: string;
  descricao: string;
  ativo: boolean;
  tipo: 'ITEM' | 'LIVRO';
  isAssinatura: boolean;
  isDespesa: boolean;
}

type CategoriesSortCol = 'nome' | 'descricao' | 'tipo' | 'status';

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [tipoFilter, setTipoFilter] = useState<'ITEM' | 'LIVRO'>('ITEM');
  const [showFilters, setShowFilters] = useState(false);
  const { sortColumn: catSortCol, sortDirection: catSortDir, handleSort: handleCatSort } =
    useClientTableSort<CategoriesSortCol>('nome');
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState<CreateCategoryForm>({
    nome: '',
    descricao: '',
    ativo: true,
    tipo: 'ITEM',
    isAssinatura: false,
    isDespesa: false,
  });

  // Hook de validação
  const validation = useFormValidation<CreateCategoryForm>({
    nome: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(2), message: errorMessages.minLength(2) },
      { validator: validators.maxLength(100), message: errorMessages.maxLength(100) },
    ],
  });

  async function load() {
    try {
      setLoading(true);
      const tipoQuery = `?tipo=${tipoFilter}`;
      const endpoint = showInactive ? `/categories/all${tipoQuery}` : `/categories${tipoQuery}`;
      const { data } = await api.get<Category[]>(endpoint);
      setCategories(data);
    } catch (err: any) {
      setError(formatApiError(err));
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [showInactive, tipoFilter]);

  function openCreateModal() {
    setEditingCategory(null);
    setForm({
      nome: '',
      descricao: '',
      ativo: true,
      tipo: 'ITEM',
      isAssinatura: false,
      isDespesa: false,
    });
    setModalError(null);
    validation.reset();
    setShowModal(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setForm({
      nome: category.nome,
      descricao: category.descricao || '',
      ativo: category.ativo,
      tipo: category.tipo || 'ITEM',
      isAssinatura: Boolean(category.isAssinatura),
      isDespesa: Boolean(category.isDespesa),
    });
    setModalError(null);
    validation.reset();
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!validation.validateAll(form)) {
      setModalError('Por favor, corrija os erros no formulário');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const payload: any = {
        nome: form.nome.trim(),
        ativo: form.ativo,
        tipo: form.tipo,
        isAssinatura: form.tipo === 'ITEM' ? form.isAssinatura : false,
        isDespesa: form.tipo === 'ITEM' ? form.isDespesa : false,
      };

      if (form.descricao && form.descricao.trim()) {
        payload.descricao = form.descricao.trim();
      }

      if (editingCategory) {
        await api.patch(`/categories/${editingCategory.id}`, payload);
        toast.success('Categoria atualizada com sucesso!');
      } else {
        await api.post('/categories', payload);
        toast.success('Categoria criada com sucesso!');
      }

      await load();
      setShowModal(false);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setModalError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(category: Category) {
    try {
      await api.patch(`/categories/${category.id}/toggle-active`);
      toast.success(`Categoria ${category.ativo ? 'desativada' : 'ativada'} com sucesso!`);
      await load();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Tem certeza que deseja excluir a categoria "${category.nome}"?`)) {
      return;
    }

    try {
      await api.delete(`/categories/${category.id}`);
      toast.success('Categoria excluída com sucesso!');
      await load();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  const categoriesWithActive = showInactive
    ? categories
    : categories.filter((c) => c.ativo);

  const filteredCategories = useTextFilter(categoriesWithActive, searchTerm, (c) => [c.nome, c.descricao]);

  const sortedCategories = useMemo(() => {
    const rows = [...filteredCategories];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (catSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'descricao':
          cmp = (a.descricao ?? '').localeCompare(b.descricao ?? '');
          break;
        case 'tipo':
          cmp = a.tipo.localeCompare(b.tipo);
          break;
        case 'status':
          cmp = Number(a.ativo) - Number(b.ativo);
          if (cmp === 0) cmp = a.nome.localeCompare(b.nome);
          break;
        default:
          cmp = 0;
      }
      return catSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredCategories, catSortCol, catSortDir]);

  const renderCatTh = useCallback(
    (col: CategoriesSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: catSortCol,
        sortDirection: catSortDir,
        onSort: handleCatSort,
        align: 'left',
      }),
    [catSortCol, catSortDir, handleCatSort],
  );

  const hasActiveFilters = searchTerm.trim().length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">Categorias</h3>
          <p className="text-sm text-white/60">Gerenciamento de categorias de compras</p>
        </div>
        <button
          onClick={openCreateModal}
          className={btn.primary}
        >
          + Nova Categoria
        </button>
      </div>

      {error && (
        <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <CollapsibleFilters
        show={showFilters}
        setShow={setShowFilters}
        hasActiveFilters={hasActiveFilters}
        onClear={() => setSearchTerm('')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nome ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>
      </CollapsibleFilters>

      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setTipoFilter('ITEM')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tipoFilter === 'ITEM'
                ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Aba Itens
          </button>
          <button
            type="button"
            onClick={() => setTipoFilter('LIVRO')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tipoFilter === 'LIVRO'
                ? 'bg-blue-500/25 text-blue-200 border border-blue-400/40'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Aba Livros
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
              />
              <span className="text-sm text-white/80">Mostrar inativas</span>
            </label>
          </div>
          <span className="text-xs text-white/50">
            {sortedCategories.length}{' '}
            {sortedCategories.length === 1 ? 'categoria' : 'categorias'}
          </span>
        </div>
      </div>

      <DataTable<Category>
        data={sortedCategories}
        keyExtractor={(c) => c.id}
        emptyMessage="Nenhuma categoria encontrada"
        paginate
        initialPageSize={20}
        renderMobileCard={(c) => (
          <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3">
            {/* Cabeçalho: nome + status */}
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white truncate flex-1">{c.nome}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  c.tipo === 'LIVRO'
                    ? 'bg-blue-500/20 text-blue-200 border border-blue-400/40'
                    : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                }`}>
                  {c.tipo === 'LIVRO' ? 'Livro' : 'Item'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  c.ativo
                    ? 'bg-success/20 text-success border border-success/40'
                    : 'bg-danger/20 text-danger border border-danger/40'
                }`}>
                  {c.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </div>
            </div>
            {/* Descrição */}
            {c.descricao && (
              <p className="text-sm text-white/60 line-clamp-2">{c.descricao}</p>
            )}
            {/* Ações */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <button onClick={() => openEditModal(c)} className={btn.editSm}>Editar</button>
              <button onClick={() => handleToggleActive(c)} className={c.ativo ? btn.warningSm : btn.successSm}>
                {c.ativo ? 'Desativar' : 'Ativar'}
              </button>
              <button onClick={() => handleDelete(c)} className={btn.dangerSm}>Excluir</button>
            </div>
          </div>
        )}
        columns={[
          {
            key: 'nome',
            label: '',
            renderTh: () => renderCatTh('nome', 'Nome'),
            render: (c) => (
              <span className="font-medium text-white/90 block whitespace-normal break-words" title={c.nome}>
                {c.nome}
              </span>
            ),
          },
          {
            key: 'descricao',
            label: '',
            renderTh: () => renderCatTh('descricao', 'Descrição'),
            render: (c) => (
              <span className="block max-w-[220px] whitespace-normal break-words text-white/70" title={c.descricao || undefined}>
                {c.descricao || '-'}
              </span>
            ),
          },
          {
            key: 'tipo',
            label: '',
            renderTh: () => renderCatTh('tipo', 'Tipo'),
            render: (c) => (
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                c.tipo === 'LIVRO'
                  ? 'bg-blue-500/20 text-blue-200 border border-blue-400/40'
                  : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
              }`}>
                {c.tipo === 'LIVRO' ? 'Livro' : 'Item'}
              </span>
            ),
          },
          {
            key: 'status',
            label: '',
            renderTh: () => renderCatTh('status', 'Status'),
            render: (c) => (
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                c.ativo
                  ? 'bg-success/20 text-success border border-success/40'
                  : 'bg-danger/20 text-danger border border-danger/40'
              }`}>
                {c.ativo ? 'Ativa' : 'Inativa'}
              </span>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right',
            stopRowClick: true,
            render: (c) => (
              <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                <button
                  onClick={() => openEditModal(c)}
                  className={btn.editSm}
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActive(c)}
                  className={c.ativo ? btn.warningSm : btn.successSm}
                >
                  {c.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className={btn.dangerSm}
                >
                  Excluir
                </button>
              </div>
            ),
          },
        ] satisfies DataTableColumn<Category>[]}
      />

      {/* Modal Criar/Editar Categoria */}
      <AppModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setModalError(null);
          validation.reset();
        }}
        title={editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
        size="md"
        bodyClassName="p-8"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Nome da Categoria *
                </label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={(e) => {
                    setForm({ ...form, nome: e.target.value });
                    validation.handleChange('nome', e.target.value);
                  }}
                  onBlur={() => validation.handleBlur('nome')}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ex: Impressão 3D, Eletrônica, TI..."
                />
                {validation.hasError('nome') && (
                  <p className="mt-1 text-sm text-red-400">{validation.getFieldError('nome')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Descrição opcional da categoria"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Tipo da Categoria *</label>
                <select
                  value={form.tipo}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      tipo: e.target.value as 'ITEM' | 'LIVRO',
                      isAssinatura:
                        e.target.value === 'ITEM' ? prev.isAssinatura : false,
                      isDespesa: e.target.value === 'ITEM' ? prev.isDespesa : false,
                    }))
                  }
                  className="w-full bg-neutral/80 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="ITEM">Item (Compras/Estoque)</option>
                  <option value="LIVRO">Livro (Curadoria de Livros)</option>
                </select>
              </div>

              {form.tipo === 'ITEM' && (
                <div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isAssinatura}
                      onChange={(e) => setForm({ ...form, isAssinatura: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
                    />
                    <span className="text-white/90">
                      Categoria de assinatura mensal (recorrência). Compras e despesas usam as mesmas categorias.
                    </span>
                  </label>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
                  />
                  <span className="text-white/90">Ativa</span>
                </label>
              </div>

              {modalError && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-md text-sm">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end space-x-4 pt-4 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setModalError(null);
                    validation.reset();
                  }}
                  className={btn.secondaryLg}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={btn.primaryLg}
                >
                  {submitting ? 'Salvando...' : editingCategory ? 'Salvar Alterações' : 'Criar Categoria'}
                </button>
              </div>
            </form>
      </AppModal>
    </div>
  );
}
