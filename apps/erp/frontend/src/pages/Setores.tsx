import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { btn } from '../utils/buttonStyles';
import { formatApiError, toast } from '../utils/toast';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { useTextFilter } from '../hooks/useTextFilter';
import { AppInput } from '../components/ui/AppInput';
import { AppSelect } from '../components/ui/AppSelect';
import { AppModal } from '../components/ui/AppModal';
import { ConfirmDeleteByNameModal } from '../components/ui/ConfirmDeleteByNameModal';
import { namesMatchForDeleteConfirm } from '../utils/deleteNameConfirm';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';

interface SimpleUser {
  id: number;
  nome: string;
  email?: string;
  cargo?: { nome: string } | null;
}

interface SetorRow {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  chefe?: { id: number; nome: string; email?: string } | null;
  membros?: Array<{ usuario: SimpleUser }>;
  _count?: {
    membros: number;
    projetos: number;
    compras: number;
    curadoriaOrcamentos: number;
  };
}

interface CreateSetorForm {
  nome: string;
  descricao: string;
  ativo: boolean;
  userIds: number[];
  chefeId: string;
}

type SetoresSortCol = 'nome' | 'membros' | 'projetos' | 'compras' | 'curadoria' | 'ativo';

export default function Setores() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setores, setSetores] = useState<SetorRow[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { sortColumn: setorSortCol, sortDirection: setorSortDir, handleSort: handleSetorSort } =
    useClientTableSort<SetoresSortCol>('nome');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativos' | 'inativos'>('all');
  const [minMembros, setMinMembros] = useState<string>('');

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<SetorRow | null>(null);
  const [form, setForm] = useState<CreateSetorForm>({
    nome: '',
    descricao: '',
    ativo: true,
    userIds: [],
    chefeId: '',
  });
  const membersSelectRef = useRef<HTMLSelectElement | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [setorToDelete, setSetorToDelete] = useState<SetorRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [setoresRes, usersRes] = await Promise.all([
        api.get<SetorRow[]>('/setores?includeInactive=true'),
        api.get<SimpleUser[]>('/users/options').catch(() => ({ data: [] as SimpleUser[] })),
      ]);
      setSetores(Array.isArray(setoresRes.data) ? setoresRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch (err: any) {
      const message = formatApiError(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const textFilteredSetores = useTextFilter(setores, searchTerm, (s) => [
    s.nome,
    s.descricao,
    ...(Array.isArray(s.membros) ? s.membros.map((m) => m.usuario?.nome) : []),
  ]);

  const filteredSetores = useMemo(() => {
    return textFilteredSetores.filter((s) => {
      if (statusFilter === 'ativos' && !s.ativo) return false;
      if (statusFilter === 'inativos' && s.ativo) return false;
      if (minMembros.trim()) {
        const min = Number(minMembros);
        const count = s._count?.membros ?? (s.membros?.length ?? 0);
        if (!Number.isNaN(min) && count < min) return false;
      }
      return true;
    });
  }, [textFilteredSetores, statusFilter, minMembros]);

  const sortedSetores = useMemo(() => {
    const rows = [...filteredSetores];
    const membrosCount = (s: SetorRow) => s._count?.membros ?? (s.membros?.length ?? 0);
    rows.sort((a, b) => {
      let cmp = 0;
      switch (setorSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'membros':
          cmp = membrosCount(a) - membrosCount(b);
          break;
        case 'projetos':
          cmp = (a._count?.projetos ?? 0) - (b._count?.projetos ?? 0);
          break;
        case 'compras':
          cmp = (a._count?.compras ?? 0) - (b._count?.compras ?? 0);
          break;
        case 'curadoria':
          cmp = (a._count?.curadoriaOrcamentos ?? 0) - (b._count?.curadoriaOrcamentos ?? 0);
          break;
        case 'ativo':
          cmp = Number(a.ativo) - Number(b.ativo);
          if (cmp === 0) cmp = a.nome.localeCompare(b.nome);
          break;
        default:
          cmp = 0;
      }
      return setorSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredSetores, setorSortCol, setorSortDir]);

  const renderSetorTh = useCallback(
    (col: SetoresSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: setorSortCol,
        sortDirection: setorSortDir,
        onSort: handleSetorSort,
        align: 'left',
      }),
    [setorSortCol, setorSortDir, handleSetorSort],
  );

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== 'all' ||
    minMembros.trim().length > 0;

  function openCreate() {
    setEditing(null);
    setForm({ nome: '', descricao: '', ativo: true, userIds: [], chefeId: '' });
    setError(null);
    setShowModal(true);
  }

  function openEdit(row: SetorRow) {
    const membros = Array.isArray(row.membros) ? row.membros.map((m) => m.usuario.id) : [];
    const chefeId = row.chefe?.id;
    const userIds =
      chefeId && !membros.includes(chefeId) ? [...membros, chefeId] : membros;
    setEditing(row);
    setForm({
      nome: row.nome ?? '',
      descricao: row.descricao ?? '',
      ativo: row.ativo !== false,
      userIds,
      chefeId: chefeId ? String(chefeId) : '',
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error('Informe o nome do setor.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);

      const chefeNumero =
        form.chefeId.trim() !== '' && form.userIds.includes(Number(form.chefeId))
          ? Number(form.chefeId)
          : null;

      if (editing) {
        await api.patch(`/setores/${editing.id}`, {
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || undefined,
          ativo: form.ativo,
        });
        await api.patch(`/setores/${editing.id}/members`, {
          userIds: form.userIds,
        });
        await api.patch(`/setores/${editing.id}`, {
          chefeId: chefeNumero,
        });
        toast.success('Setor atualizado com sucesso!');
      } else {
        const { data } = await api.post<SetorRow>('/setores', {
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || undefined,
          ativo: form.ativo,
        });
        await api.patch(`/setores/${data.id}/members`, {
          userIds: form.userIds,
        });
        await api.patch(`/setores/${data.id}`, {
          chefeId: chefeNumero,
        });
        toast.success('Setor criado com sucesso!');
      }

      setShowModal(false);
      setEditing(null);
      setForm({ nome: '', descricao: '', ativo: true, userIds: [], chefeId: '' });
      await load();
    } catch (err: any) {
      const message = formatApiError(err);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function openDelete(row: SetorRow) {
    setSetorToDelete(row);
    setDeleteConfirmName('');
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!setorToDelete) return;
    if (!namesMatchForDeleteConfirm(deleteConfirmName, setorToDelete.nome)) {
      toast.error('O nome digitado não corresponde ao nome do setor.');
      return;
    }
    try {
      setDeleting(true);
      await api.delete(`/setores/${setorToDelete.id}`);
      setShowDeleteModal(false);
      setSetorToDelete(null);
      setDeleteConfirmName('');
      toast.success('Setor removido com sucesso!');
      await load();
    } catch (err: any) {
      const message = formatApiError(err);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  const userOptions = useMemo(() => {
    return users.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  }, [users]);

  const chefeOptions = useMemo(() => {
    const integrantes = userOptions.filter((u) => form.userIds.includes(u.id));
    return [
      { value: '', label: 'Sem chefe definido' },
      ...integrantes.map((u) => ({ value: String(u.id), label: u.nome })),
    ];
  }, [userOptions, form.userIds]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold sm:text-xl">Setores</h3>
        <button onClick={openCreate} className={btn.primary}>
          Novo Setor
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
          setSearchTerm('');
          setStatusFilter('all');
          setMinMembros('');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AppInput
            label="Buscar"
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Setor, descrição ou integrante..."
          />

          <AppSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as any)}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'ativos', label: 'Ativos' },
              { value: 'inativos', label: 'Inativos' },
            ]}
          />

          <AppInput
            label="Mín. integrantes"
            type="number"
            min={0}
            value={minMembros}
            onChange={setMinMembros}
            placeholder="Ex.: 1"
          />
        </div>
      </CollapsibleFilters>

      <DataTable<SetorRow>
        data={sortedSetores}
        loading={loading}
        keyExtractor={(s) => s.id}
        emptyMessage="Nenhum setor cadastrado"
        paginate
        initialPageSize={20}
        onRowClick={(s) => navigate(`/setores/${s.id}`)}
        columns={[
          {
            key: 'nome',
            label: '',
            renderTh: () => renderSetorTh('nome', 'Nome'),
            tdClassName: 'max-w-[22rem] align-top',
            render: (s) => (
              <span className="block whitespace-normal break-words font-medium" title={s.nome}>
                {s.nome}
              </span>
            ),
          },
          {
            key: 'membros',
            label: '',
            renderTh: () => renderSetorTh('membros', 'Integrantes'),
            thClassName: 'w-24',
            tdClassName: 'w-24 whitespace-nowrap',
            render: (s) => <span>{s._count?.membros ?? (s.membros?.length ?? 0)}</span>,
          },
          {
            key: 'projetos',
            label: '',
            renderTh: () => renderSetorTh('projetos', 'Projetos'),
            thClassName: 'w-24',
            tdClassName: 'w-24 whitespace-nowrap',
            render: (s) => <span>{s._count?.projetos ?? 0}</span>,
          },
          {
            key: 'compras',
            label: '',
            renderTh: () => renderSetorTh('compras', 'Compras'),
            thClassName: 'w-24',
            tdClassName: 'w-24 whitespace-nowrap',
            render: (s) => <span>{s._count?.compras ?? 0}</span>,
          },
          {
            key: 'curadoria',
            label: '',
            renderTh: () => renderSetorTh('curadoria', 'Curadoria'),
            thClassName: 'w-24',
            tdClassName: 'w-24 whitespace-nowrap',
            render: (s) => <span>{s._count?.curadoriaOrcamentos ?? 0}</span>,
          },
          {
            key: 'ativo',
            label: '',
            renderTh: () => renderSetorTh('ativo', 'Status'),
            thClassName: 'w-32',
            tdClassName: 'w-32 whitespace-nowrap',
            render: (s) => (
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  s.ativo
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'bg-white/5 text-white/60 border border-white/10'
                }`}
              >
                {s.ativo ? 'Ativo' : 'Inativo'}
              </span>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            align: 'right',
            thClassName: 'w-44',
            tdClassName: 'w-44',
            stopRowClick: true,
            render: (s) => (
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => openEdit(s)} className={btn.editSm}>
                  Editar
                </button>
                <button onClick={() => openDelete(s)} className={btn.dangerSm}>
                  Excluir
                </button>
              </div>
            ),
          },
        ] satisfies DataTableColumn<SetorRow>[]}
      />

      <AppModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Setor' : 'Novo Setor'}
        size="lg"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Nome <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  maxLength={120}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
                  className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  rows={3}
                  maxLength={8000}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="setor-ativo"
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/40 bg-neutral/60 text-primary focus:ring-primary"
                />
                <label htmlFor="setor-ativo" className="text-sm text-white/80">
                  Setor ativo
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">Integrantes</label>
                <select
                  ref={membersSelectRef}
                  value=""
                  onChange={(e) => {
                    const selectedUserId = Number(e.target.value);
                    if (!selectedUserId) return;
                    setForm((prev) => {
                      if (prev.userIds.includes(selectedUserId)) return prev;
                      return { ...prev, userIds: [...prev.userIds, selectedUserId] };
                    });
                    if (membersSelectRef.current) {
                      membersSelectRef.current.value = '';
                    }
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
                    Selecione um integrante...
                  </option>
                  {userOptions
                    .filter((u) => !form.userIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id} className="bg-neutral text-white">
                        {u.nome}
                      </option>
                    ))}
                </select>

                {form.userIds.length > 0 ? (
                  <div className="mt-3 space-y-2 max-h-56 overflow-y-auto bg-white/5 border border-white/10 rounded-lg p-3">
                    {form.userIds.map((id) => {
                      const member = userOptions.find((u) => u.id === id);
                      if (!member) return null;
                      return (
                        <div key={id} className="flex items-center justify-between gap-3 text-sm text-white/80">
                          <span className="min-w-0 whitespace-normal break-words" title={member.nome}>
                            {member.nome}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                chefeId: prev.chefeId === String(id) ? '' : prev.chefeId,
                                userIds: prev.userIds.filter((uid) => uid !== id),
                              }))
                            }
                            className="inline-flex items-center px-2 py-0.5 rounded border border-danger/60 text-[11px] text-danger hover:bg-danger/10 transition-colors shrink-0"
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-white/50 mt-2">Nenhum integrante adicionado ainda.</p>
                )}
              </div>

              <div>
                <AppSelect
                  label="Chefe do setor"
                  value={form.chefeId}
                  onChange={(value) => setForm((prev) => ({ ...prev, chefeId: value }))}
                  options={chefeOptions}
                />
                <p className="text-xs text-white/50 mt-2">
                  O chefe precisa estar na lista de integrantes.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={btn.secondaryLg}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button type="submit" className={btn.primaryLg} disabled={submitting}>
                  {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar setor'}
                </button>
              </div>
            </form>
      </AppModal>

      {showDeleteModal && setorToDelete && (
        <ConfirmDeleteByNameModal
          open={showDeleteModal}
          title="Confirmar exclusão"
          entityLabel="o setor"
          entityName={setorToDelete.nome}
          confirmValue={deleteConfirmName}
          onConfirmValueChange={setDeleteConfirmName}
          onClose={() => {
            setShowDeleteModal(false);
            setSetorToDelete(null);
            setDeleteConfirmName('');
          }}
          onConfirm={handleConfirmDelete}
          loading={deleting}
          confirmButtonLabel="Excluir"
          dangerNote="Esta ação não pode ser desfeita. Se o setor estiver vinculado a projetos/compras/curadoria, a API pode bloquear a exclusão."
        />
      )}
    </div>
  );
}

