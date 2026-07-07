import { useEffect, useState, FormEvent, useMemo, useRef, useCallback, type ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Cargo, Usuario } from '../types';
import { btn } from '../utils/buttonStyles';
import { useAuthStore } from '../store/auth';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { UserAvatar, ProfileInfoBox, CopyPlainTextButton } from '../components/users/UserDirectoryUi';
import { toast, formatApiError } from '../utils/toast';
import { useFormValidation, validators, errorMessages } from '../utils/validation';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppModal } from '../components/ui/AppModal';
import { ConfirmDeleteByNameModal } from '../components/ui/ConfirmDeleteByNameModal';
import { namesMatchForDeleteConfirm } from '../utils/deleteNameConfirm';
import { ProfilePhotoCropModal } from '../components/ProfilePhotoCropModal';
import { getCargoNome, userHasAnyPermission } from '../utils/projectAccess';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';
import { resolvePublicAssetUrl } from '../utils/assetUrl';
import { formatDateOnlyPtBr, toDateInputValue } from '../utils/dateInputValue';
import { formatCpfDisplay, isValidCpfDigits, maskCpfInput, onlyCpfDigits } from '../utils/cpf';
import { UPLOAD_LIMITS } from '../utils/uploadLimits';

interface CreateUserForm {
  nome: string;
  email: string;
  senha: string;
  cargoId: number;
  telefone?: string;
  cpf?: string;
  formacao?: string;
  funcao?: string;
  dataNascimento?: string;
}

type UsersSortCol = 'nome' | 'email' | 'cargo' | 'status';

/** Garante URL clicável quando o usuário omitir `https://`. */
function profileLinkHref(raw: string): string {
  const t = raw.trim();
  if (!t) return '#';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export default function Users() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const pendingEditUserIdRef = useRef<number | null>(null);
  const userModalPhotoInputRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  /** Atualização da lista em segundo plano (filtros), sem esconder a página. */
  const [listRefreshing, setListRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [showProfileViewModal, setShowProfileViewModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<Usuario | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Filtros de busca
  const [searchNome, setSearchNome] = useState('');
  const [filterCargo, setFilterCargo] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [modalCropSrc, setModalCropSrc] = useState<string | null>(null);
  const [stagedPhotoFile, setStagedPhotoFile] = useState<File | null>(null);
  const [photoMarkedForRemoval, setPhotoMarkedForRemoval] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const { sortColumn: userSortCol, sortDirection: userSortDir, handleSort: handleUserSort } =
    useClientTableSort<UsersSortCol>('nome');

  const [form, setForm] = useState<CreateUserForm>({
    nome: '',
    email: '',
    senha: '',
    cargoId: 0,
    telefone: '',
    cpf: '',
    formacao: '',
    funcao: '',
    dataNascimento: '',
  });

  const isGm = useMemo(() => userHasAnyPermission(user, 'usuarios:criar', 'usuarios:editar', 'usuarios:excluir'), [user]);

  const viewingCargoNome = viewingUser
    ? getCargoNome(viewingUser) || viewingUser.cargo?.nome || ''
    : '';
  const viewingResponsabilidade = viewingUser?.cargo?.descricao?.trim() || null;
  const viewingTelefone = viewingUser?.telefone?.trim() || '';
  const viewingCpf = viewingUser?.cpf?.trim() || '';
  const viewingCpfDisplay = viewingCpf ? formatCpfDisplay(viewingCpf) : '';
  const viewingFormacao = viewingUser?.formacao?.trim() || '';
  const viewingFuncao = viewingUser?.funcao?.trim() || '';
  const viewingBiografia = viewingUser?.biografiaResumo?.trim() || '';
  const viewingHabilidades = viewingUser?.habilidades?.trim() || '';
  const viewingDadosContato = viewingUser?.dadosContato?.trim() || '';
  const viewingPix = viewingUser?.pix?.trim() || '';
  const viewingEndereco = viewingUser?.endereco?.trim() || '';
  const viewingLinkLattes = viewingUser?.linkLattes?.trim() || '';
  const viewingLinkPortfolio = viewingUser?.linkPortfolio?.trim() || '';
  const viewingLinkLinkedin = viewingUser?.linkLinkedin?.trim() || '';

  const modalPhotoPreviewSrc = useMemo(() => {
    if (photoPreviewUrl) return photoPreviewUrl;
    if (photoMarkedForRemoval || !editingUser?.fotoUrl) return null;
    return resolvePublicAssetUrl(editingUser.fotoUrl);
  }, [photoPreviewUrl, photoMarkedForRemoval, editingUser?.fotoUrl]);

  const sortedUsers = useMemo(() => {
    const rows = [...users];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (userSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'email':
          cmp = a.email.localeCompare(b.email);
          break;
        case 'cargo':
          cmp = (a.cargo?.nome ?? '').localeCompare(b.cargo?.nome ?? '');
          break;
        case 'status':
          cmp = Number(a.ativo) - Number(b.ativo);
          if (cmp === 0) cmp = a.nome.localeCompare(b.nome);
          break;
        default:
          cmp = 0;
      }
      return userSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [users, userSortCol, userSortDir]);

  useEffect(() => {
    if (!stagedPhotoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(stagedPhotoFile);
    setPhotoPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [stagedPhotoFile]);

  function dismissUserModalCrop() {
    if (modalCropSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(modalCropSrc);
    }
    setModalCropSrc(null);
  }

  function resetUserModalPhotoFields() {
    dismissUserModalCrop();
    setStagedPhotoFile(null);
    setPhotoMarkedForRemoval(false);
  }

  function onPickUserModalPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > UPLOAD_LIMITS.generic.maxBytes) {
      toast.error(`Escolha uma imagem de até ${UPLOAD_LIMITS.generic.maxMb} MB.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    setModalCropSrc(URL.createObjectURL(file));
  }

  function handleRemovePhotoFromModal() {
    if (stagedPhotoFile) {
      setStagedPhotoFile(null);
      setPhotoMarkedForRemoval(false);
      return;
    }
    if (editingUser?.fotoUrl) {
      setPhotoMarkedForRemoval(true);
    }
  }

  const renderUserTh = useCallback(
    (col: UsersSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: userSortCol,
        sortDirection: userSortDir,
        onSort: handleUserSort,
        align: 'left',
      }),
    [userSortCol, userSortDir, handleUserSort],
  );

  // Regras de validação (memoizadas para evitar recriação)
  const validationRules = useMemo(() => ({
    nome: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(2), message: errorMessages.minLength(2) },
    ],
    email: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.email, message: errorMessages.email },
    ],
    senha: editingUser
      ? [] // Senha opcional na edição
      : [
          { validator: validators.required, message: errorMessages.required },
          { validator: validators.minLength(6), message: errorMessages.minLength(6) },
        ],
    cargoId: [{ validator: (v: number) => v > 0, message: 'Selecione um cargo' }],
    telefone: form.telefone && form.telefone.trim().length > 0
      ? [{ validator: validators.phone, message: errorMessages.phone }]
      : [],
    dataNascimento: form.dataNascimento && form.dataNascimento.trim().length > 0
      ? [{ validator: validators.date, message: errorMessages.date }]
      : [],
  }), [editingUser, form.telefone, form.dataNascimento]);

  // Validação de formulário
  const validation = useFormValidation<CreateUserForm>(validationRules);

  useEffect(() => {
    if (!isGm || pendingEditUserIdRef.current == null) return;
    const id = pendingEditUserIdRef.current;
    const found = users.find((u) => u.id === id);
    if (!found) return;
    pendingEditUserIdRef.current = null;
    setEditingUser(found);
    setForm({
      nome: found.nome,
      email: found.email,
      senha: '',
      cargoId: found.cargo.id,
      telefone: found.telefone || '',
      cpf: found.cpf ? formatCpfDisplay(found.cpf) : '',
      formacao: found.formacao || '',
      funcao: found.funcao || '',
      dataNascimento: toDateInputValue(found.dataNascimento),
    });
    validation.reset();
    setModalError(null);
    setShowModal(true);
    // validation.reset estável o suficiente; evitamos [validation] para não reabrir o modal em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, isGm]);

  async function loadCargos() {
    try {
      const { data } = await api.get<Cargo[]>('/cargos');
      setCargos(data);
      // Se não há cargo selecionado e há cargos disponíveis, selecionar o primeiro
      if (form.cargoId === 0 && data.length > 0) {
        setForm((prev) => ({ ...prev, cargoId: data[0].id }));
      }
    } catch (err) {
      console.error('Erro ao carregar cargos:', err);
    }
  }

  /**
   * silent: não usa o estado global `loading` (evita sumir a página inteira ao filtrar/buscar).
   */
  async function load(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setListRefreshing(true);
      }
      const params = new URLSearchParams();

      if (searchNome.trim()) {
        params.append('nome', searchNome.trim());
      }
      if (filterCargo !== 'all') {
        params.append('cargo', filterCargo);
      }
      if (filterStatus !== 'all') {
        params.append('ativo', filterStatus);
      }

      const queryString = params.toString();
      const url = queryString ? `/users?${queryString}` : '/users';
      const { data } = await api.get<Usuario[]>(url);
      setUsers(data);
      setError(null);
    } catch (err: unknown) {
      setError(formatApiError(err));
    } finally {
      if (!silent) {
        setLoading(false);
      } else {
        setListRefreshing(false);
      }
    }
  }

  useEffect(() => {
    loadCargos();
  }, []);

  /** Após a 1ª carga (tela cheia), mudanças de filtro só atualizam a lista em silêncio. */
  const filtrosJaDispararamCarga = useRef(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      load({ silent: filtrosJaDispararamCarga.current });
      filtrosJaDispararamCarga.current = true;
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchNome, filterCargo, filterStatus]);

  useEffect(() => {
    const st = location.state as { editUserId?: number } | undefined;
    if (typeof st?.editUserId === 'number') {
      pendingEditUserIdRef.current = st.editUserId;
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!viewingUser) return;
    const refreshed = users.find((u) => u.id === viewingUser.id);
    if (refreshed) {
      setViewingUser(refreshed);
    }
  }, [users, viewingUser]);

  async function toggleActive(user: Usuario) {
    try {
      if (user.ativo) {
        await api.patch(`/users/${user.id}/deactivate`);
      } else {
        await api.patch(`/users/${user.id}/activate`);
      }
      load({ silent: true });
      toast.success(`Usuário ${user.ativo ? 'desativado' : 'ativado'} com sucesso!`);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    }
  }

  async function changeRole(user: Usuario, cargoId: number) {
    try {
      setError(null);
      await api.patch(`/users/${user.id}/role`, { cargoId });
      await load({ silent: true });
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao alterar cargo');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setModalError(null);
    setError(null);

    // Validar todos os campos
    if (!validation.validateAll(form)) {
      setSubmitting(false);
      return;
    }

    try {

      const payload: any = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        cargoId: form.cargoId,
      };

      // Senha só é obrigatória na criação
      if (!editingUser) {
        payload.senha = form.senha;
      } else if (form.senha && form.senha.length > 0) {
        // Se estiver editando e forneceu senha, validar e atualizar
        if (!validation.validate('senha', form.senha)) {
          setSubmitting(false);
          return;
        }
        payload.senha = form.senha;
      }

      if (form.telefone && form.telefone.trim().length > 0) {
        payload.telefone = form.telefone.trim();
      } else if (editingUser) {
        payload.telefone = null;
      }

      if (form.formacao && form.formacao.trim().length > 0) {
        payload.formacao = form.formacao.trim();
      } else if (editingUser) {
        payload.formacao = null;
      }

      if (form.funcao && form.funcao.trim().length > 0) {
        payload.funcao = form.funcao.trim();
      } else if (editingUser) {
        payload.funcao = null;
      }

      if (form.dataNascimento && form.dataNascimento.trim().length > 0) {
        payload.dataNascimento = form.dataNascimento;
      } else if (editingUser) {
        payload.dataNascimento = null;
      }

      const cpfDigits = onlyCpfDigits(form.cpf ?? '');
      if (cpfDigits.length > 0) {
        if (!isValidCpfDigits(cpfDigits)) {
          setModalError('CPF inválido. Verifique os dígitos informados.');
          toast.error('CPF inválido.');
          setSubmitting(false);
          return;
        }
        payload.cpf = cpfDigits;
      } else if (editingUser) {
        payload.cpf = null;
      }

      const wasEditing = Boolean(editingUser);
      let createdUserId: number | null = null;

      if (editingUser) {
        await api.patch(`/users/${editingUser.id}`, payload);
      } else {
        const { data: created } = await api.post<Usuario>('/users', payload);
        createdUserId = created.id;
      }

      const targetUserId = editingUser?.id ?? createdUserId;
      let photoUploadFailed = false;
      if (targetUserId != null) {
        try {
          if (wasEditing && photoMarkedForRemoval && !stagedPhotoFile) {
            await api.delete(`/users/${targetUserId}/profile-photo`);
          }
          if (stagedPhotoFile) {
            const fd = new FormData();
            fd.append('file', stagedPhotoFile);
            await api.post(`/users/${targetUserId}/profile-photo`, fd);
          }
        } catch (photoErr: unknown) {
          photoUploadFailed = true;
          const photoMsg = formatApiError(photoErr);
          toast.error(
            wasEditing
              ? `Usuário salvo, mas a foto não pôde ser atualizada: ${photoMsg}`
              : `Usuário criado, mas a foto não pôde ser enviada: ${photoMsg}`,
          );
        }
      }

      resetUserModalPhotoFields();
      setShowModal(false);
      setEditingUser(null);
      setForm({
        nome: '',
        email: '',
        senha: '',
        cargoId: cargos.length > 0 ? cargos[0].id : 0,
        telefone: '',
        cpf: '',
        formacao: '',
        funcao: '',
        dataNascimento: '',
      });
      validation.reset();
      await load({ silent: true });
      if (!photoUploadFailed) {
        toast.success(wasEditing ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
      }
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setModalError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateModal() {
    resetUserModalPhotoFields();
    setEditingUser(null);
    setForm({
      nome: '',
      email: '',
      senha: '',
      cargoId: cargos.length > 0 ? cargos[0].id : 0,
      telefone: '',
      cpf: '',
      formacao: '',
      funcao: '',
      dataNascimento: '',
    });
    setModalError(null);
    setShowModal(true);
  }

  function openEditModal(user: Usuario) {
    resetUserModalPhotoFields();
    setEditingUser(user);
    setForm({
      nome: user.nome,
      email: user.email,
      senha: '', // Não preencher senha na edição
      cargoId: user.cargo.id,
      telefone: user.telefone || '',
      cpf: user.cpf ? formatCpfDisplay(user.cpf) : '',
      formacao: user.formacao || '',
      funcao: user.funcao || '',
      dataNascimento: toDateInputValue(user.dataNascimento),
    });
    validation.reset();
    setModalError(null);
    setShowModal(true);
  }

  function openProfileViewModal(targetUser: Usuario) {
    setViewingUser(targetUser);
    setShowProfileViewModal(true);
  }

  function openDeleteModal(user: Usuario) {
    setUserToDelete(user);
    setDeleteConfirmName('');
    setShowDeleteModal(true);
  }

  async function handleDeleteUser() {
    if (!userToDelete) return;

    if (!namesMatchForDeleteConfirm(deleteConfirmName, userToDelete.nome)) {
      setError('O nome não confere. Digite o nome exatamente como aparece.');
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await api.delete(`/users/${userToDelete.id}`);
      setShowDeleteModal(false);
      setUserToDelete(null);
      setDeleteConfirmName('');
      await load({ silent: true });
      toast.success('Usuário excluído com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-8">
        <p className="text-white/60">Carregando usuários…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Usuários</h2>
          <p className="text-sm text-white/55 mt-1">Administração de acesso e perfis</p>
        </div>
        {isGm && (
          <button
            type="button"
            onClick={openCreateModal}
            className={`${btn.primary} rounded-lg px-5 py-2.5 text-sm font-semibold shadow-lg shadow-primary/25`}
          >
            Novo usuário
          </button>
        )}
      </header>

      {error && !showModal && (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 text-red-200 px-4 py-3 text-sm">{error}</div>
      )}

      <CollapsibleFilters
        show={showFilters}
        setShow={setShowFilters}
        hasActiveFilters={searchNome.trim().length > 0 || filterCargo !== 'all' || filterStatus !== 'all'}
        onClear={() => {
          setSearchNome('');
          setFilterCargo('all');
          setFilterStatus('all');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Buscar (nome ou e-mail)
            </label>
            <input
              type="text"
              placeholder="Digite nome ou e-mail do usuário..."
              value={searchNome}
              onChange={(e) => setSearchNome(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Cargo
            </label>
            <select
              value={filterCargo}
              onChange={(e) => setFilterCargo(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                paddingRight: '2rem',
              }}
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              {cargos.map((cargo) => (
                <option key={cargo.id} value={cargo.nome} className="bg-neutral text-white">
                  {cargo.nome}
                </option>
              ))}
            </select>
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
        </div>
      </CollapsibleFilters>

      <DataTable<Usuario>
        data={sortedUsers}
        keyExtractor={(u) => u.id}
        loading={listRefreshing}
        emptyMessage="Nenhum usuário encontrado com os filtros atuais."
        paginate
        initialPageSize={20}
        onRowClick={(u) => openProfileViewModal(u)}
        rowClassName={(u) => (user?.id === u.id ? 'bg-primary/5' : '')}
        renderMobileCard={(u) => {
          const isSelf = user?.id === u.id;
          return (
            <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <UserAvatar nome={u.nome} fotoUrl={u.fotoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-white truncate">{u.nome}</p>
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
                        u.ativo
                          ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                          : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                      }`}
                    >
                      {u.ativo ? 'Ativo' : 'Pendente'}
                    </span>
                  </div>
                  {isSelf && (
                    <span className="inline-block mt-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/15">
                      Seu perfil
                    </span>
                  )}
                  <p className="text-xs text-white/50 truncate mt-1">{u.email}</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2 text-sm">
                <span className="text-xs text-white/50">Cargo: </span>
                <span className="text-white/90">{u?.cargo?.nome || 'Sem cargo'}</span>
              </div>
              {isGm && (
                <div className="space-y-2 pt-1 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={u.cargo.id}
                    onChange={(e) => {
                      e.stopPropagation();
                      changeRole(u, Number(e.target.value));
                    }}
                    className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {cargos.map((cargo) => (
                      <option key={cargo.id} value={cargo.id}>
                        {cargo.nome}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); openEditModal(u); }} className={btn.editSm}>
                      Editar
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleActive(u); }} className={u.ativo ? btn.warningSm : btn.successSm}>
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openDeleteModal(u); }} className={btn.dangerSm}>
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }}
        columns={[
          {
            key: 'foto',
            label: '',
            thClassName: 'w-14',
            renderTh: () => <span className="sr-only">Foto</span>,
            render: (u) => <UserAvatar nome={u.nome} fotoUrl={u.fotoUrl} size="sm" />,
          },
          {
            key: 'nome',
            label: '',
            renderTh: () => renderUserTh('nome', 'Nome'),
            render: (u) => (
              <div className="flex flex-col gap-0.5">
                <span className="block whitespace-normal break-words font-medium" title={u.nome}>
                  {u.nome}
                </span>
                {user?.id === u.id && (
                  <span className="text-[10px] uppercase tracking-wide text-white/45">Seu perfil</span>
                )}
              </div>
            ),
          },
          {
            key: 'email',
            label: '',
            renderTh: () => renderUserTh('email', 'E-mail'),
            render: (u) => (
              <span className="block whitespace-normal break-words text-white/80" title={u.email}>
                {u.email}
              </span>
            ),
          },
          {
            key: 'cargo',
            label: '',
            renderTh: () => renderUserTh('cargo', 'Cargo'),
            render: (u) => <span>{u?.cargo?.nome || 'Sem cargo'}</span>,
          },
          {
            key: 'status',
            label: '',
            renderTh: () => renderUserTh('status', 'Status'),
            render: (u) => (
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  u.ativo
                    ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                    : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                }`}
              >
                {u.ativo ? 'Ativo' : 'Pendente'}
              </span>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            stopRowClick: true,
            render: (u) => (
              <div className="flex items-center gap-1.5 flex-wrap">
                {isGm && (
                  <>
                    <select
                      value={u.cargo.id}
                      onChange={(e) => changeRole(u, Number(e.target.value))}
                      className="bg-neutral/60 border border-white/10 rounded-md px-2 py-1 text-xs max-w-[9rem]"
                    >
                      {cargos.map((cargo) => (
                        <option key={cargo.id} value={cargo.id}>
                          {cargo.nome}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => openEditModal(u)} className={btn.editSm}>
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      className={u.ativo ? btn.warningSm : btn.successSm}
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button type="button" onClick={() => openDeleteModal(u)} className={btn.dangerSm}>
                      Excluir
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ] satisfies DataTableColumn<Usuario>[]}
      />

      <AppModal
        open={showProfileViewModal}
        onClose={() => {
          setShowProfileViewModal(false);
          setViewingUser(null);
        }}
        title="Perfil do usuário"
        size="xl"
      >
        {viewingUser ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <div className="flex items-start gap-4">
                <UserAvatar nome={viewingUser.nome} fotoUrl={viewingUser.fotoUrl} size="lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-white">{viewingUser.nome}</h3>
                    {user?.id === viewingUser.id && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/15">
                        Seu perfil
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-white/70 break-all flex-1 min-w-0">{viewingUser.email}</p>
                    <CopyPlainTextButton text={viewingUser.email} title="Copiar e-mail" />
                  </div>
                  <p className="text-xs text-white/55">
                    {viewingCargoNome || '[Sem cargo]'} {viewingResponsabilidade ? `· ${viewingResponsabilidade}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <ProfileInfoBox label="Função / papel" copyText={viewingFuncao} />
              <ProfileInfoBox label="Formação" copyText={viewingFormacao}>
                <p className="whitespace-pre-wrap">{viewingFormacao || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="Telefone" copyText={viewingTelefone} />
              <ProfileInfoBox label="CPF" copyText={viewingCpf || undefined}>
                {viewingCpfDisplay || '[Não informado]'}
              </ProfileInfoBox>
              <ProfileInfoBox
                label="Data de nascimento"
                copyText={formatDateOnlyPtBr(viewingUser.dataNascimento) || undefined}
              />
              <ProfileInfoBox
                label="Data de entrada"
                copyText={formatDateOnlyPtBr(viewingUser.dataEntrada) || undefined}
              />
              <ProfileInfoBox label="Dados de contato" copyText={viewingDadosContato}>
                <p className="whitespace-pre-wrap">{viewingDadosContato || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="PIX" copyText={viewingPix} className="sm:col-span-2">
                <p className="whitespace-pre-wrap break-all">{viewingPix || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="Endereço" copyText={viewingEndereco} className="sm:col-span-2">
                <p className="whitespace-pre-wrap">{viewingEndereco || '[Não informado]'}</p>
              </ProfileInfoBox>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm">
              <ProfileInfoBox label="Resumo da biografia" copyText={viewingBiografia}>
                <p className="whitespace-pre-wrap">{viewingBiografia || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="Habilidades" copyText={viewingHabilidades}>
                <p className="whitespace-pre-wrap">{viewingHabilidades || '[Não informado]'}</p>
              </ProfileInfoBox>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <ProfileInfoBox label="Currículo Lattes" copyText={viewingLinkLattes}>
                {viewingLinkLattes ? (
                  <a
                    href={profileLinkHref(viewingLinkLattes)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {viewingLinkLattes}
                  </a>
                ) : (
                  '[Não informado]'
                )}
              </ProfileInfoBox>
              <ProfileInfoBox label="Portfólio" copyText={viewingLinkPortfolio}>
                {viewingLinkPortfolio ? (
                  <a
                    href={profileLinkHref(viewingLinkPortfolio)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {viewingLinkPortfolio}
                  </a>
                ) : (
                  '[Não informado]'
                )}
              </ProfileInfoBox>
              <ProfileInfoBox label="LinkedIn" copyText={viewingLinkLinkedin}>
                {viewingLinkLinkedin ? (
                  <a
                    href={profileLinkHref(viewingLinkLinkedin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {viewingLinkLinkedin}
                  </a>
                ) : (
                  '[Não informado]'
                )}
              </ProfileInfoBox>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className={btn.secondaryLg}
                onClick={() => {
                  setShowProfileViewModal(false);
                  setViewingUser(null);
                }}
              >
                Fechar
              </button>
              <button
                type="button"
                className={btn.primaryLg}
                onClick={() => {
                  const id = viewingUser.id;
                  setShowProfileViewModal(false);
                  setViewingUser(null);
                  navigate(`/perfil/${id}`);
                }}
              >
                Abrir perfil completo
              </button>
            </div>
          </div>
        ) : null}
      </AppModal>

      {/* Modal de Novo Usuário */}
      <AppModal
        open={showModal}
        onClose={() => {
          resetUserModalPhotoFields();
          setShowModal(false);
          setEditingUser(null);
          setError(null);
          setModalError(null);
        }}
        title={editingUser ? 'Editar Usuário' : 'Novo Usuário'}
        size="lg"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">
                    Nome <span className="text-danger">*</span>
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
                  />
                  {validation.hasError('nome') && (
                    <p className="text-red-500 text-xs mt-1">{validation.getFieldError('nome')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-1">
                    E-mail <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, email: e.target.value }));
                      validation.handleChange('email', e.target.value);
                    }}
                    onBlur={() => validation.handleBlur('email')}
                    className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      validation.hasError('email')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/10 focus:ring-primary'
                    }`}
                    required
                  />
                  {validation.hasError('email') && (
                    <p className="text-red-500 text-xs mt-1">{validation.getFieldError('email')}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-neutral/40 px-4 py-3 space-y-3">
                <label className="block text-sm text-white/70">Foto de perfil</label>
                <div className="flex flex-wrap items-center gap-4">
                  {modalPhotoPreviewSrc ? (
                    <img
                      src={modalPhotoPreviewSrc}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover border-2 border-primary/50 shadow-lg shadow-primary/20"
                    />
                  ) : (
                    <UserAvatar nome={form.nome.trim() || '?'} fotoUrl={null} size="lg" />
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={userModalPhotoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={onPickUserModalPhoto}
                    />
                    <button
                      type="button"
                      onClick={() => userModalPhotoInputRef.current?.click()}
                      className={`${btn.secondary} rounded-lg px-3 py-1.5 text-xs font-semibold w-fit`}
                    >
                      Escolher foto…
                    </button>
                    {(stagedPhotoFile || (editingUser?.fotoUrl && !photoMarkedForRemoval)) && (
                      <button
                        type="button"
                        onClick={handleRemovePhotoFromModal}
                        className={`${btn.modalDanger} rounded-lg px-3 py-1.5 text-xs font-medium w-fit`}
                      >
                        {stagedPhotoFile ? 'Descartar nova foto' : 'Remover foto'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-white/50">
                  Você poderá recortar a imagem em formato circular antes do envio (até 12 MB na escolha).
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">
                    Senha {!editingUser && <span className="text-danger">*</span>}
                  </label>
                  <input
                    type="password"
                    value={form.senha}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, senha: e.target.value }));
                      if (!editingUser || e.target.value.length > 0) {
                        validation.handleChange('senha', e.target.value);
                      }
                    }}
                    onBlur={() => {
                      if (!editingUser || form.senha.length > 0) {
                        validation.handleBlur('senha');
                      }
                    }}
                    className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      validation.hasError('senha')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/10 focus:ring-primary'
                    }`}
                    required={!editingUser}
                    minLength={form.senha.length > 0 ? 6 : undefined}
                    placeholder={editingUser ? 'Deixe em branco para não alterar' : ''}
                  />
                  {validation.hasError('senha') ? (
                    <p className="text-red-500 text-xs mt-1">{validation.getFieldError('senha')}</p>
                  ) : (
                    <p className="text-xs text-white/50 mt-1">
                      {editingUser ? 'Deixe em branco para não alterar a senha' : 'Mínimo de 6 caracteres'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-1">
                    Cargo <span className="text-danger">*</span>
                  </label>
                  <select
                    value={form.cargoId}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, cargoId: Number(e.target.value) }));
                      validation.handleChange('cargoId', Number(e.target.value));
                    }}
                    onBlur={() => validation.handleBlur('cargoId')}
                    className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      validation.hasError('cargoId')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/10 focus:ring-primary'
                    }`}
                    required
                  >
                    {cargos.length === 0 ? (
                      <option value="">Carregando cargos...</option>
                    ) : (
                      cargos.map((cargo) => (
                        <option key={cargo.id} value={cargo.id}>
                          {cargo.nome}
                        </option>
                      ))
                    )}
                  </select>
                  {validation.hasError('cargoId') && (
                    <p className="text-red-500 text-xs mt-1">{validation.getFieldError('cargoId')}</p>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">CPF</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.cpf}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, cpf: maskCpfInput(e.target.value) }))
                    }
                    placeholder="000.000.000-00"
                    className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={form.telefone}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, telefone: e.target.value }));
                      if (e.target.value.length > 0) {
                        validation.handleChange('telefone', e.target.value);
                      }
                    }}
                    onBlur={() => {
                      if (form.telefone && form.telefone.length > 0) {
                        validation.handleBlur('telefone');
                      }
                    }}
                    className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      validation.hasError('telefone')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/10 focus:ring-primary'
                    }`}
                  />
                  {validation.hasError('telefone') && (
                    <p className="text-red-500 text-xs mt-1">{validation.getFieldError('telefone')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-1">Data de Nascimento</label>
                  <input
                    type="date"
                    value={form.dataNascimento}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, dataNascimento: e.target.value }));
                      if (e.target.value.length > 0) {
                        validation.handleChange('dataNascimento', e.target.value);
                      }
                    }}
                    onBlur={() => {
                      if (form.dataNascimento && form.dataNascimento.length > 0) {
                        validation.handleBlur('dataNascimento');
                      }
                    }}
                    className={`w-full bg-neutral/60 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      validation.hasError('dataNascimento')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/10 focus:ring-primary'
                    }`}
                  />
                  {validation.hasError('dataNascimento') && (
                    <p className="text-red-500 text-xs mt-1">{validation.getFieldError('dataNascimento')}</p>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Formação</label>
                  <input
                    type="text"
                    value={form.formacao}
                    onChange={(e) => setForm((prev) => ({ ...prev, formacao: e.target.value }))}
                    className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-1">Função</label>
                  <input
                    type="text"
                    value={form.funcao}
                    onChange={(e) => setForm((prev) => ({ ...prev, funcao: e.target.value }))}
                    className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {modalError && (
                <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    resetUserModalPhotoFields();
                    setShowModal(false);
                    setEditingUser(null);
                    setError(null);
                    setModalError(null);
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
                  {submitting
                    ? editingUser
                      ? 'Salvando...'
                      : 'Criando...'
                    : editingUser
                      ? 'Salvar Alterações'
                      : 'Criar Usuário'}
                </button>
              </div>
            </form>
      </AppModal>

      <ProfilePhotoCropModal
        open={Boolean(modalCropSrc)}
        imageSrc={modalCropSrc ?? ''}
        onClose={dismissUserModalCrop}
        onConfirm={(file) => {
          setStagedPhotoFile(file);
          setPhotoMarkedForRemoval(false);
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteModal && userToDelete && (
        <ConfirmDeleteByNameModal
          open={showDeleteModal}
          title="Confirmar Exclusão"
          entityLabel="o usuário"
          entityName={userToDelete.nome}
          confirmValue={deleteConfirmName}
          onConfirmValueChange={setDeleteConfirmName}
          onClose={() => {
            setShowDeleteModal(false);
            setUserToDelete(null);
            setDeleteConfirmName('');
            setError(null);
          }}
          onConfirm={handleDeleteUser}
          loading={deleting}
          errorMessage={error}
          confirmButtonLabel="Excluir Usuário"
        />
      )}
    </div>
  );
}
