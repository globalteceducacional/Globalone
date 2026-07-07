import { useEffect, useState, FormEvent, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { toast, formatApiError } from '../utils/toast';
import { useFormValidation, validators, errorMessages } from '../utils/validation';
import { btn } from '../utils/buttonStyles';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppModal } from '../components/ui/AppModal';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';

interface Supplier {
  id: number;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco?: string | null;
  contato?: string | null;
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

interface CreateSupplierForm {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  contato: string;
  ativo: boolean;
}

// Função para formatar CNPJ
function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length <= 14) {
    return cleaned
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cleaned;
}

// Função para validar CNPJ básico
function validateCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.length === 14;
}

type SuppliersSortCol = 'razaoSocial' | 'nomeFantasia' | 'cnpj' | 'endereco' | 'contato' | 'status';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [searchNome, setSearchNome] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const { sortColumn: supSortCol, sortDirection: supSortDir, handleSort: handleSupSort } =
    useClientTableSort<SuppliersSortCol>('razaoSocial');
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const [form, setForm] = useState<CreateSupplierForm>({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    endereco: '',
    contato: '',
    ativo: true,
  });

  // Hook de validação
  const validation = useFormValidation<CreateSupplierForm>({
    razaoSocial: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(3), message: errorMessages.minLength(3) },
    ],
    nomeFantasia: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(3), message: errorMessages.minLength(3) },
    ],
    cnpj: [
      { validator: validators.required, message: errorMessages.required },
      {
        validator: (value: string) => validateCNPJ(value),
        message: 'CNPJ inválido. Deve conter 14 dígitos.',
      },
    ],
  });

  async function load() {
    try {
      setLoading(true);
      const endpoint = showInactive ? '/suppliers/all' : '/suppliers';
      const { data } = await api.get<Supplier[]>(endpoint);
      setSuppliers(data);
    } catch (err: any) {
      setError(formatApiError(err));
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [showInactive]);

  function openCreateModal() {
    setEditingSupplier(null);
    setForm({
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      endereco: '',
      contato: '',
      ativo: true,
    });
    setModalError(null);
    validation.reset();
    setShowModal(true);
  }

  function openEditModal(supplier: Supplier) {
    setEditingSupplier(supplier);
    setForm({
      razaoSocial: supplier.razaoSocial,
      nomeFantasia: supplier.nomeFantasia,
      cnpj: supplier.cnpj,
      endereco: supplier.endereco || '',
      contato: supplier.contato || '',
      ativo: supplier.ativo,
    });
    setModalError(null);
    validation.reset();
    setShowModal(true);
  }

  /** Busca dados do fornecedor pela API de CNPJ (mesma do sistema de compras). Só em modo criação. */
  async function fetchCNPJData(cnpj: string) {
    const cleaned = cnpj.replace(/\D/g, '');
    if (cleaned.length !== 14 || editingSupplier) return;

    setLoadingCNPJ(true);
    setModalError(null);

    try {
      const { data } = await api.get<{ razaoSocial?: string; nomeFantasia?: string; endereco?: string; contato?: string }>(`/suppliers/cnpj/${cleaned}`);
      setForm((prev) => ({
        ...prev,
        razaoSocial: data.razaoSocial ?? prev.razaoSocial,
        nomeFantasia: data.nomeFantasia ?? prev.nomeFantasia,
        endereco: data.endereco ?? prev.endereco,
        contato: data.contato ?? prev.contato,
      }));
      if (data.razaoSocial) validation.handleChange('razaoSocial', data.razaoSocial);
      if (data.nomeFantasia) validation.handleChange('nomeFantasia', data.nomeFantasia);
      toast.success('Dados do CNPJ carregados com sucesso!');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Erro ao buscar dados do CNPJ';
      setModalError(msg);
      toast.error(msg);
    } finally {
      setLoadingCNPJ(false);
    }
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
      const cleanedCNPJ = form.cnpj.replace(/\D/g, '');
      const payload: any = {
        razaoSocial: form.razaoSocial.trim(),
        nomeFantasia: form.nomeFantasia.trim(),
        cnpj: cleanedCNPJ,
        ativo: form.ativo,
      };

      // Adicionar campos opcionais apenas se não estiverem vazios
      if (form.endereco && form.endereco.trim()) {
        payload.endereco = form.endereco.trim();
      }
      if (form.contato && form.contato.trim()) {
        payload.contato = form.contato.trim();
      }

      if (editingSupplier) {
        await api.patch(`/suppliers/${editingSupplier.id}`, payload);
        toast.success('Fornecedor atualizado com sucesso!');
      } else {
        await api.post('/suppliers', payload);
        toast.success('Fornecedor criado com sucesso!');
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

  async function handleToggleActive(supplier: Supplier) {
    try {
      await api.patch(`/suppliers/${supplier.id}/toggle-active`);
      toast.success(`Fornecedor ${supplier.ativo ? 'desativado' : 'ativado'} com sucesso!`);
      await load();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  async function handleDelete(supplier: Supplier) {
    if (!confirm(`Tem certeza que deseja excluir o fornecedor "${supplier.razaoSocial}"?`)) {
      return;
    }

    try {
      await api.delete(`/suppliers/${supplier.id}`);
      toast.success('Fornecedor excluído com sucesso!');
      await load();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  const filteredSuppliers = useMemo(() => {
    let list = suppliers;
    if (!showInactive) {
      list = list.filter((s) => s.ativo);
    }
    if (filterStatus === 'true') {
      list = list.filter((s) => s.ativo);
    } else if (filterStatus === 'false') {
      list = list.filter((s) => !s.ativo);
    }
    if (searchNome.trim()) {
      const term = searchNome.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.razaoSocial.toLowerCase().includes(term) ||
          s.nomeFantasia.toLowerCase().includes(term) ||
          (s.cnpj && s.cnpj.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
      );
    }
    return list;
  }, [suppliers, showInactive, filterStatus, searchNome]);

  const sortedSuppliers = useMemo(() => {
    const rows = [...filteredSuppliers];
    const digits = (s: string) => s.replace(/\D/g, '');
    rows.sort((a, b) => {
      let cmp = 0;
      switch (supSortCol) {
        case 'razaoSocial':
          cmp = a.razaoSocial.localeCompare(b.razaoSocial);
          break;
        case 'nomeFantasia':
          cmp = a.nomeFantasia.localeCompare(b.nomeFantasia);
          break;
        case 'cnpj':
          cmp = digits(a.cnpj).localeCompare(digits(b.cnpj));
          break;
        case 'endereco':
          cmp = (a.endereco ?? '').localeCompare(b.endereco ?? '');
          break;
        case 'contato':
          cmp = (a.contato ?? '').localeCompare(b.contato ?? '');
          break;
        case 'status':
          cmp = Number(a.ativo) - Number(b.ativo);
          if (cmp === 0) cmp = a.razaoSocial.localeCompare(b.razaoSocial);
          break;
        default:
          cmp = 0;
      }
      return supSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredSuppliers, supSortCol, supSortDir]);

  const renderSupTh = useCallback(
    (col: SuppliersSortCol, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: supSortCol,
        sortDirection: supSortDir,
        onSort: handleSupSort,
        align,
      }),
    [supSortCol, supSortDir, handleSupSort],
  );

  const hasActiveFilters = searchNome.trim().length > 0 || filterStatus !== 'all' || showInactive;

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
        <h3 className="text-xl font-semibold">Fornecedores</h3>
        <button onClick={openCreateModal} className={btn.primary}>
          + Novo Fornecedor
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
        onClear={() => {
          setSearchNome('');
          setFilterStatus('all');
          setShowInactive(false);
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-white/90 mb-1">
              Buscar
            </label>
            <input
              type="text"
              placeholder="Razão social, nome fantasia ou CNPJ..."
              value={searchNome}
              onChange={(e) => setSearchNome(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                paddingRight: '2rem',
              }}
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              <option value="true" className="bg-neutral text-white">Ativos</option>
              <option value="false" className="bg-neutral text-white">Inativos</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
              />
              <span className="text-sm text-white/80">Incluir inativos na lista</span>
            </label>
          </div>
        </div>
      </CollapsibleFilters>

      <DataTable<Supplier>
        data={sortedSuppliers}
        keyExtractor={(s) => s.id}
        emptyMessage="Nenhum fornecedor encontrado"
        paginate
        initialPageSize={20}
        renderMobileCard={(s) => (
          <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3">
            {/* Cabeçalho: nome fantasia + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white truncate">{s.nomeFantasia || s.razaoSocial}</p>
                {s.nomeFantasia && s.razaoSocial !== s.nomeFantasia && (
                  <p className="text-xs text-white/50 truncate mt-0.5">{s.razaoSocial}</p>
                )}
              </div>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
                s.ativo
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
              }`}>
                {s.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            {/* Info */}
            <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-lg p-3 text-sm">
              <div>
                <p className="text-xs text-white/50 mb-0.5">CNPJ</p>
                <p className="text-white/80 text-xs font-mono">{formatCNPJ(s.cnpj)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-0.5">Contato</p>
                <p className="text-white/80 text-xs truncate">{s.contato || '—'}</p>
              </div>
              {s.endereco && (
                <div className="col-span-2">
                  <p className="text-xs text-white/50 mb-0.5">Endereço</p>
                  <p className="text-white/80 text-xs truncate">{s.endereco}</p>
                </div>
              )}
            </div>
            {/* Ações */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <button onClick={() => openEditModal(s)} className={btn.editSm}>Editar</button>
              <button onClick={() => handleToggleActive(s)} className={s.ativo ? btn.warningSm : btn.successSm}>
                {s.ativo ? 'Desativar' : 'Ativar'}
              </button>
              <button onClick={() => handleDelete(s)} className={btn.dangerSm}>Excluir</button>
            </div>
          </div>
        )}
        columns={[
          {
            key: 'razaoSocial',
            label: '',
            renderTh: () => renderSupTh('razaoSocial', 'Razão Social'),
            render: (s) => (
              <span className="text-white/90 block whitespace-normal break-words" title={s.razaoSocial}>
                {s.razaoSocial}
              </span>
            ),
          },
          {
            key: 'nomeFantasia',
            label: '',
            renderTh: () => renderSupTh('nomeFantasia', 'Nome Fantasia'),
            render: (s) => (
              <span className="text-white/90 block whitespace-normal break-words" title={s.nomeFantasia}>
                {s.nomeFantasia}
              </span>
            ),
          },
          {
            key: 'cnpj',
            label: '',
            renderTh: () => renderSupTh('cnpj', 'CNPJ'),
            thClassName: 'whitespace-nowrap',
            render: (s) => (
              <span className="text-white/90 whitespace-nowrap">{formatCNPJ(s.cnpj)}</span>
            ),
          },
          {
            key: 'endereco',
            label: '',
            renderTh: () => renderSupTh('endereco', 'Endereço'),
            render: (s) => (
              <span className="block max-w-[220px] whitespace-normal break-words text-white/70" title={s.endereco || undefined}>
                {s.endereco || '-'}
              </span>
            ),
          },
          {
            key: 'contato',
            label: '',
            renderTh: () => renderSupTh('contato', 'Contato'),
            render: (s) => (
              <span className="block max-w-[160px] whitespace-normal break-words text-white/70" title={s.contato || undefined}>
                {s.contato || '-'}
              </span>
            ),
          },
          {
            key: 'status',
            label: '',
            renderTh: () => renderSupTh('status', 'Status'),
            render: (s) => (
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                s.ativo
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
              }`}>
                {s.ativo ? 'Ativo' : 'Inativo'}
              </span>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right',
            stopRowClick: true,
            render: (s) => (
              <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                <button onClick={() => openEditModal(s)} className={btn.editSm}>
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActive(s)}
                  className={s.ativo ? btn.warningSm : btn.successSm}
                >
                  {s.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => handleDelete(s)} className={btn.dangerSm}>
                  Excluir
                </button>
              </div>
            ),
          },
        ] satisfies DataTableColumn<Supplier>[]}
      />

      {/* Modal Criar/Editar Fornecedor */}
      <AppModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setModalError(null);
          validation.reset();
        }}
        title={editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        size="lg"
        bodyClassName="p-8"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  CNPJ *
                  {loadingCNPJ && (
                    <span className="ml-2 text-xs text-primary">Buscando dados...</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={form.cnpj}
                    onChange={(e) => {
                      const formatted = formatCNPJ(e.target.value);
                      setForm((prev) => ({ ...prev, cnpj: formatted }));
                      validation.handleChange('cnpj', formatted);
                      const cleaned = formatted.replace(/\D/g, '');
                      if (cleaned.length === 14 && !loadingCNPJ && !editingSupplier) {
                        fetchCNPJData(formatted);
                      }
                    }}
                    onBlur={() => {
                      validation.handleBlur('cnpj');
                      const cleaned = form.cnpj.replace(/\D/g, '');
                      if (cleaned.length === 14 && !loadingCNPJ && !editingSupplier && !form.razaoSocial) {
                        fetchCNPJData(form.cnpj);
                      }
                    }}
                    className="flex-1 bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    disabled={loadingCNPJ}
                  />
                  {!editingSupplier && (
                    <button
                      type="button"
                      onClick={() => fetchCNPJData(form.cnpj)}
                      disabled={loadingCNPJ || !validateCNPJ(form.cnpj)}
                      className={`${btn.primaryLg} whitespace-nowrap`}
                      title="Buscar dados do CNPJ"
                    >
                      {loadingCNPJ ? 'Buscando...' : 'Buscar'}
                    </button>
                  )}
                </div>
                {validation.errors.cnpj && (
                  <p className="mt-1 text-sm text-red-400">{validation.errors.cnpj}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Razão Social *
                </label>
                <input
                  type="text"
                  required
                  value={form.razaoSocial}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, razaoSocial: e.target.value }));
                    validation.handleChange('razaoSocial', e.target.value);
                  }}
                  onBlur={() => validation.handleBlur('razaoSocial')}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Digite a razão social"
                />
                {validation.errors.razaoSocial && (
                  <p className="mt-1 text-sm text-red-400">{validation.errors.razaoSocial}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Nome Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={form.nomeFantasia}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, nomeFantasia: e.target.value }));
                    validation.handleChange('nomeFantasia', e.target.value);
                  }}
                  onBlur={() => validation.handleBlur('nomeFantasia')}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Digite o nome fantasia"
                />
                {validation.errors.nomeFantasia && (
                  <p className="mt-1 text-sm text-red-400">{validation.errors.nomeFantasia}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Endereço</label>
                <input
                  type="text"
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Digite o endereço"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Contato</label>
                <input
                  type="text"
                  value={form.contato}
                  onChange={(e) => setForm({ ...form, contato: e.target.value })}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Telefone, email ou outro contato"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
                  />
                  <span className="text-white/90">Ativo</span>
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
                  {submitting ? 'Salvando...' : editingSupplier ? 'Salvar Alterações' : 'Criar Fornecedor'}
                </button>
              </div>
            </form>
      </AppModal>
    </div>
  );
}
