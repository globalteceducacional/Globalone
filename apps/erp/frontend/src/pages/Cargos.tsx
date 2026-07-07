import { useEffect, useMemo, useState, FormEvent, useCallback } from 'react';
import { userHasAnyPermission } from '../utils/projectAccess';
import { api } from '../services/api';
import { Cargo, CargoPermission } from '../types';
import { btn } from '../utils/buttonStyles';
import { useAuthStore } from '../store/auth';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { toast, formatApiError } from '../utils/toast';
import { useFormValidation, validators, errorMessages } from '../utils/validation';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppModal } from '../components/ui/AppModal';
import { CargoAccessEditor } from '../components/cargos/CargoAccessEditor';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';

interface CreateCargoForm {
  nome: string;
  descricao?: string;
  ativo: boolean;
  paginasPermitidas: string[];
  permissions: string[];
}

// Catálogo estático de permissões — garante que todas apareçam mesmo sem seed no banco
const PERMISSIONS_CATALOG: CargoPermission[] = [
  // projetos
  { id: 0, modulo: 'projetos',  acao: 'visualizar',   chave: 'projetos:visualizar',  descricao: 'Visualizar projetos' },
  { id: 0, modulo: 'projetos',  acao: 'criar',        chave: 'projetos:criar',       descricao: 'Criar novos projetos' },
  { id: 0, modulo: 'projetos',  acao: 'editar',       chave: 'projetos:editar',      descricao: 'Editar projetos existentes' },
  { id: 0, modulo: 'projetos',  acao: 'excluir',      chave: 'projetos:excluir',     descricao: 'Excluir projetos' },
  { id: 0, modulo: 'projetos',  acao: 'importar',     chave: 'projetos:importar',    descricao: 'Importar projetos via Excel' },
  { id: 0, modulo: 'projetos',  acao: 'aprovar',      chave: 'projetos:aprovar',     descricao: 'Aprovar etapas e finalizar projetos' },
  {
    id: 0,
    modulo: 'projetos',
    acao: 'aprovar_entrega_terceiros',
    chave: 'projetos:aprovar_entrega_terceiros',
    descricao: 'Aprovar ou reprovar entregas de outras pessoas no projeto (não a própria)',
  },
  // trabalhos
  { id: 0, modulo: 'trabalhos', acao: 'visualizar',   chave: 'trabalhos:visualizar', descricao: 'Visualizar tarefas atribuídas' },
  { id: 0, modulo: 'trabalhos', acao: 'registrar',    chave: 'trabalhos:registrar',  descricao: 'Registrar progresso e anexos das tarefas' },
  { id: 0, modulo: 'trabalhos', acao: 'avaliar',      chave: 'trabalhos:avaliar',    descricao: 'Avaliar entregas e aprovar objetivos' },
  // compras
  { id: 0, modulo: 'compras',   acao: 'visualizar',   chave: 'compras:visualizar',   descricao: 'Visualizar compras e orçamentos' },
  { id: 0, modulo: 'compras',   acao: 'solicitar',    chave: 'compras:solicitar',    descricao: 'Solicitar compras e orçamentos' },
  { id: 0, modulo: 'compras',   acao: 'aprovar',      chave: 'compras:aprovar',      descricao: 'Aprovar solicitações de compras' },
  { id: 0, modulo: 'compras',   acao: 'excluir',      chave: 'compras:excluir',      descricao: 'Excluir solicitações de compras' },
  // estoque
  { id: 0, modulo: 'estoque',   acao: 'visualizar',   chave: 'estoque:visualizar',   descricao: 'Visualizar itens de estoque' },
  { id: 0, modulo: 'estoque',   acao: 'criar',        chave: 'estoque:criar',        descricao: 'Criar itens de estoque' },
  { id: 0, modulo: 'estoque',   acao: 'movimentar',   chave: 'estoque:movimentar',   descricao: 'Registrar movimentações de estoque' },
  { id: 0, modulo: 'estoque',   acao: 'excluir',      chave: 'estoque:excluir',      descricao: 'Excluir itens de estoque' },
  // almoxarifado
  { id: 0, modulo: 'almoxarifado', acao: 'visualizar', chave: 'almoxarifado:visualizar', descricao: 'Visualizar almoxarifado (listagens e relatórios)' },
  { id: 0, modulo: 'almoxarifado', acao: 'movimentar', chave: 'almoxarifado:movimentar', descricao: 'Registrar entradas, alocações e baixas no almoxarifado' },
  // curadoria
  { id: 0, modulo: 'curadoria', acao: 'visualizar',   chave: 'curadoria:visualizar', descricao: 'Visualizar orçamentos e estoque de curadoria' },
  { id: 0, modulo: 'curadoria', acao: 'criar',        chave: 'curadoria:criar',      descricao: 'Criar orçamentos e importar planilhas' },
  { id: 0, modulo: 'curadoria', acao: 'editar',       chave: 'curadoria:editar',     descricao: 'Editar orçamentos e itens de curadoria' },
  { id: 0, modulo: 'curadoria', acao: 'excluir',      chave: 'curadoria:excluir',    descricao: 'Excluir orçamentos e itens de curadoria' },
  {
    id: 0,
    modulo: 'curadoria',
    acao: 'gerenciar',
    chave: 'curadoria:gerenciar',
    descricao: 'Criar, editar, importar e ajustar curadoria (legado)',
  },
  // financeiro / planejamento (por aba)
  {
    id: 0,
    modulo: 'financeiro',
    acao: 'visualizar',
    chave: 'financeiro:visualizar',
    descricao: 'Acesso completo a todas as abas do Financeiro e Planejamento',
  },
  { id: 0, modulo: 'financeiro', acao: 'visao', chave: 'financeiro:visao', descricao: 'Financeiro — aba Visão geral' },
  { id: 0, modulo: 'financeiro', acao: 'ponto', chave: 'financeiro:ponto', descricao: 'Financeiro — aba Horas e valores' },
  {
    id: 0,
    modulo: 'financeiro',
    acao: 'pagamentos',
    chave: 'financeiro:pagamentos',
    descricao: 'Financeiro — aba Pagamentos do mês',
  },
  { id: 0, modulo: 'financeiro', acao: 'projetos', chave: 'financeiro:projetos', descricao: 'Financeiro — aba Projetos' },
  { id: 0, modulo: 'financeiro', acao: 'curadoria', chave: 'financeiro:curadoria', descricao: 'Financeiro — aba Curadoria' },
  { id: 0, modulo: 'financeiro', acao: 'compras', chave: 'financeiro:compras', descricao: 'Financeiro — aba Compras' },
  // setores
  { id: 0, modulo: 'setores',   acao: 'visualizar',   chave: 'setores:visualizar',   descricao: 'Visualizar setores e equipes' },
  { id: 0, modulo: 'setores',   acao: 'criar',        chave: 'setores:criar',        descricao: 'Criar setores' },
  { id: 0, modulo: 'setores',   acao: 'editar',       chave: 'setores:editar',       descricao: 'Editar setores e membros' },
  { id: 0, modulo: 'setores',   acao: 'excluir',      chave: 'setores:excluir',      descricao: 'Excluir setores' },
  {
    id: 0,
    modulo: 'setores',
    acao: 'gerenciar',
    chave: 'setores:gerenciar',
    descricao: 'Criar e gerenciar setores e membros (legado)',
  },
  // usuarios
  { id: 0, modulo: 'usuarios',  acao: 'visualizar',   chave: 'usuarios:visualizar',  descricao: 'Visualizar lista de usuários' },
  { id: 0, modulo: 'usuarios',  acao: 'criar',        chave: 'usuarios:criar',       descricao: 'Criar usuários' },
  { id: 0, modulo: 'usuarios',  acao: 'editar',       chave: 'usuarios:editar',      descricao: 'Editar usuários e atribuir cargos' },
  { id: 0, modulo: 'usuarios',  acao: 'excluir',      chave: 'usuarios:excluir',     descricao: 'Excluir ou desativar usuários' },
  {
    id: 0,
    modulo: 'usuarios',
    acao: 'gerenciar',
    chave: 'usuarios:gerenciar',
    descricao: 'Gerenciar usuários e cargos (legado)',
  },
  // notificacoes
  { id: 0, modulo: 'notificacoes', acao: 'enviar',    chave: 'notificacoes:enviar',  descricao: 'Enviar notificações para usuários' },
  // dashboard
  { id: 0, modulo: 'dashboard', acao: 'gerenciar',    chave: 'dashboard:gerenciar',  descricao: 'Visão administrativa do dashboard (filtro por usuário, ranking, KPIs globais)' },
  // projetos extras
  { id: 0, modulo: 'projetos',  acao: 'ver_todos',    chave: 'projetos:ver_todos',   descricao: 'Visualizar todos os projetos (sem restrição por participação)' },
  { id: 0, modulo: 'projetos',  acao: 'pontos',       chave: 'projetos:pontos',      descricao: 'Definir e alterar pontos de tarefas no checklist' },
  // calendario
  { id: 0, modulo: 'calendario', acao: 'visualizar', chave: 'calendario:visualizar', descricao: 'Visualizar calendário de etapas' },
  { id: 0, modulo: 'calendario', acao: 'ver_todos',  chave: 'calendario:ver_todos',  descricao: 'Ver todas as etapas de todos os projetos no calendário' },
  { id: 0, modulo: 'calendario', acao: 'eventos',    chave: 'calendario:eventos',    descricao: 'Criar e gerenciar eventos de calendário (datas, participantes e notificações)' },
  // sistema
  { id: 0, modulo: 'sistema',   acao: 'administrar',  chave: 'sistema:administrar',  descricao: 'Administrar configurações avançadas do sistema' },
  // ponto
  { id: 0, modulo: 'ponto', acao: 'bater', chave: 'ponto:bater', descricao: 'Bater o próprio ponto (entrada/saída)' },
  { id: 0, modulo: 'ponto', acao: 'ver_proprios', chave: 'ponto:ver_proprios', descricao: 'Visualizar o próprio histórico de ponto' },
  { id: 0, modulo: 'ponto', acao: 'ver_todos', chave: 'ponto:ver_todos', descricao: 'Visualizar registros de ponto de todos os colaboradores' },
  { id: 0, modulo: 'ponto', acao: 'ajustar', chave: 'ponto:ajustar', descricao: 'Criar, editar ou remover registros de ponto com justificativa' },
  { id: 0, modulo: 'ponto', acao: 'exportar', chave: 'ponto:exportar', descricao: 'Exportar relatório de ponto em CSV' },
  {
    id: 0,
    modulo: 'ponto',
    acao: 'exportar_afd',
    chave: 'ponto:exportar_afd',
    descricao: 'Exportar Arquivo Fonte de Dados (AFD - Portaria MTE 671/2021)',
  },
  {
    id: 0,
    modulo: 'rh',
    acao: 'gerenciar_empregador',
    chave: 'rh:gerenciar_empregador',
    descricao: 'Gerenciar dados do empregador (CNPJ/CEI/CAEPF) usado em AFD/comprovantes',
  },
  // jornada
  { id: 0, modulo: 'jornada', acao: 'configurar', chave: 'jornada:configurar', descricao: 'Definir e atualizar jornada de trabalho dos colaboradores' },
  { id: 0, modulo: 'jornada', acao: 'ver_propria', chave: 'jornada:ver_propria', descricao: 'Visualizar a própria jornada' },
  // espelho
  { id: 0, modulo: 'espelho', acao: 'ver_proprio', chave: 'espelho:ver_proprio', descricao: 'Visualizar o próprio espelho de ponto' },
  { id: 0, modulo: 'espelho', acao: 'ver_todos', chave: 'espelho:ver_todos', descricao: 'Visualizar espelho de ponto de todos os colaboradores' },
  { id: 0, modulo: 'espelho', acao: 'exportar', chave: 'espelho:exportar', descricao: 'Exportar espelho de ponto' },
  // solicitacoes de ajuste de ponto
  { id: 0, modulo: 'solicitacoes_ponto', acao: 'abrir', chave: 'solicitacoes_ponto:abrir', descricao: 'Abrir solicitações de ajuste de ponto' },
  { id: 0, modulo: 'solicitacoes_ponto', acao: 'revisar', chave: 'solicitacoes_ponto:revisar', descricao: 'Aprovar ou reprovar solicitações de ajuste de ponto' },
  // banco de horas
  { id: 0, modulo: 'banco_horas', acao: 'ver_proprio', chave: 'banco_horas:ver_proprio', descricao: 'Visualizar próprio banco de horas' },
  { id: 0, modulo: 'banco_horas', acao: 'ver_todos', chave: 'banco_horas:ver_todos', descricao: 'Visualizar banco de horas de todos os colaboradores' },
  { id: 0, modulo: 'banco_horas', acao: 'fechar', chave: 'banco_horas:fechar', descricao: 'Fechar mensalmente o banco de horas' },
  {
    id: 0,
    modulo: 'banco_horas',
    acao: 'aprovar_uso_extras',
    chave: 'banco_horas:aprovar_uso_extras',
    descricao: 'Aprovar/reprovar solicitação de uso de horas extras pelo colaborador',
  },
  // ferias
  { id: 0, modulo: 'ferias', acao: 'solicitar', chave: 'ferias:solicitar', descricao: 'Solicitar férias' },
  { id: 0, modulo: 'ferias', acao: 'aprovar', chave: 'ferias:aprovar', descricao: 'Aprovar ou reprovar férias' },
  // afastamentos
  { id: 0, modulo: 'afastamentos', acao: 'registrar', chave: 'afastamentos:registrar', descricao: 'Registrar atestados, licenças e afastamentos' },
  { id: 0, modulo: 'afastamentos', acao: 'ver_todos', chave: 'afastamentos:ver_todos', descricao: 'Visualizar afastamentos de todos os colaboradores' },
  // documentos RH
  { id: 0, modulo: 'documentos_rh', acao: 'gerenciar', chave: 'documentos_rh:gerenciar', descricao: 'Gerenciar documentos do colaborador' },
  { id: 0, modulo: 'documentos_rh', acao: 'ver_proprios', chave: 'documentos_rh:ver_proprios', descricao: 'Visualizar próprios documentos' },
  // avaliacoes
  { id: 0, modulo: 'avaliacoes', acao: 'gerenciar', chave: 'avaliacoes:gerenciar', descricao: 'Criar e gerenciar ciclos e avaliações de desempenho' },
  { id: 0, modulo: 'avaliacoes', acao: 'responder', chave: 'avaliacoes:responder', descricao: 'Responder avaliações de desempenho' },
  // treinamentos
  { id: 0, modulo: 'treinamentos', acao: 'gerenciar', chave: 'treinamentos:gerenciar', descricao: 'Cadastrar e gerenciar treinamentos' },
  { id: 0, modulo: 'treinamentos', acao: 'participar', chave: 'treinamentos:participar', descricao: 'Participar e concluir treinamentos' },
  // dashboard RH e folha
  { id: 0, modulo: 'rh_dashboard', acao: 'ver', chave: 'rh_dashboard:ver', descricao: 'Visualizar dashboard de RH (KPIs e indicadores)' },
  { id: 0, modulo: 'folha', acao: 'exportar', chave: 'folha:exportar', descricao: 'Exportar dados mensais para folha de pagamento' },
];

// Lista de todas as páginas disponíveis no sistema
const todasPaginas = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/financeiro', label: 'Financeiro e planejamento' },
  { value: '/projects', label: 'Projetos' },
  { value: '/tasks', label: 'Meu Trabalho' },
  { value: '/curadoria', label: 'Curadoria' },
  { value: '/stock', label: 'Compras & Estoque' },
  { value: '/galpao', label: 'Almoxarifado' },
  { value: '/suppliers', label: 'Fornecedores' },
  { value: '/categories', label: 'Categorias' },
  { value: '/communications', label: 'Requerimentos' },
  { value: '/rh', label: 'RH' },
  { value: '/rh/ponto', label: 'Ponto' },
  { value: '/users', label: 'Usuários' },
  { value: '/cargos', label: 'Cargos' },
  { value: '/setores', label: 'Setores' },
  { value: '/calendario', label: 'Calendário' },
  { value: '/documentos', label: 'Documentos oficiais' },
  { value: '/patentes-documentos', label: 'Patentes e aplicações' },
];

type CargosSortCol = 'nome' | 'descricao' | 'usuarios' | 'status';

export default function Cargos() {
  const user = useAuthStore((state) => state.user);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Filtros de busca
  const [searchNome, setSearchNome] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const { sortColumn: cargoSortCol, sortDirection: cargoSortDir, handleSort: handleCargoSort } =
    useClientTableSort<CargosSortCol>('nome');
  const [form, setForm] = useState<CreateCargoForm>({
    nome: '',
    descricao: '',
    ativo: true,
    paginasPermitidas: [],
    permissions: [],
  });
  const [permissionsCatalog, setPermissionsCatalog] = useState<CargoPermission[]>([]);

  // Hook de validação
  const validation = useFormValidation<CreateCargoForm>({
    nome: [
      { validator: validators.required, message: errorMessages.required },
      { validator: validators.minLength(2), message: errorMessages.minLength(2) },
      { validator: validators.maxLength(50), message: errorMessages.maxLength(50) },
    ],
  });

  const isGm = useMemo(() => userHasAnyPermission(user, 'usuarios:editar', 'usuarios:gerenciar', 'sistema:administrar'), [user]);

  async function load() {
    try {
      const { data } = await api.get<Cargo[]>('/cargos/all');
      const normalized = data.map((cargo) => ({
        ...cargo,
        permissions: (cargo.permissions ?? []).map((permission) => ({
          ...permission,
          chave: permission.chave ?? `${permission.modulo}:${permission.acao}`,
        })),
      }));
      setCargos(normalized);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao carregar cargos');
    } finally {
      setLoading(false);
    }
  }

  async function loadPermissions() {
    // Começa com o catálogo estático para garantir que todas as permissões apareçam
    setPermissionsCatalog(PERMISSIONS_CATALOG);
    try {
      const { data } = await api.get<Array<{ id: number; modulo: string; acao: string; descricao?: string | null }>>('/cargos/permissions');
      // Mescla: API sobrepõe id real; itens do catálogo estático não presentes na API são mantidos
      const apiMap = new Map(data.map((p) => [`${p.modulo}:${p.acao}`, p]));
      const catalogKeys = new Set(PERMISSIONS_CATALOG.map((item) => item.chave));
      const merged = PERMISSIONS_CATALOG.map((item) => {
        const fromApi = apiMap.get(item.chave);
        return fromApi
          ? { ...item, id: fromApi.id, descricao: item.descricao || (fromApi.descricao ?? undefined) }
          : item;
      });
      const extras = data
        .filter((p) => !catalogKeys.has(`${p.modulo}:${p.acao}`))
        .map((p) => ({
          id: p.id,
          modulo: p.modulo,
          acao: p.acao,
          chave: `${p.modulo}:${p.acao}`,
          descricao: p.descricao ?? `${p.modulo}:${p.acao}`,
        }));
      setPermissionsCatalog([...merged, ...extras]);
    } catch (err) {
      console.error('Erro ao carregar permissões da API, usando catálogo local', err);
    }
  }

  useEffect(() => {
    load();
    loadPermissions();
  }, []);

  const permissionsByModule = useMemo(() => {
    const grouped = permissionsCatalog.reduce<Record<string, CargoPermission[]>>((acc, permission) => {
      if (!acc[permission.modulo]) {
        acc[permission.modulo] = [];
      }
      acc[permission.modulo].push(permission);
      return acc;
    }, {});

    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => (a.descricao || a.acao).localeCompare(b.descricao || b.acao));
    });

    return grouped;
  }, [permissionsCatalog]);

  // Filtro local dos cargos
  const filteredCargos = useMemo(() => {
    return cargos.filter((cargo) => {
      // Busca por nome
      if (searchNome.trim()) {
        const nomeMatch = cargo.nome.toLowerCase().includes(searchNome.toLowerCase());
        const descricaoMatch = cargo.descricao?.toLowerCase().includes(searchNome.toLowerCase());
        if (!nomeMatch && !descricaoMatch) {
          return false;
        }
      }

      // Filtro por status
      if (filterStatus !== 'all') {
        const isAtivo = filterStatus === 'true';
        if (cargo.ativo !== isAtivo) {
          return false;
        }
      }

      return true;
    });
  }, [cargos, searchNome, filterStatus]);

  const sortedCargos = useMemo(() => {
    const rows = [...filteredCargos];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (cargoSortCol) {
        case 'nome':
          cmp = a.nome.localeCompare(b.nome);
          break;
        case 'descricao':
          cmp = (a.descricao ?? '').localeCompare(b.descricao ?? '');
          break;
        case 'usuarios':
          cmp = (a._count?.usuarios ?? 0) - (b._count?.usuarios ?? 0);
          break;
        case 'status': {
          cmp = Number(a.ativo) - Number(b.ativo);
          if (cmp === 0) cmp = a.nome.localeCompare(b.nome);
          break;
        }
        default:
          cmp = 0;
      }
      return cargoSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredCargos, cargoSortCol, cargoSortDir]);

  const renderCargoTh = useCallback(
    (col: CargosSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: cargoSortCol,
        sortDirection: cargoSortDir,
        onSort: handleCargoSort,
        align: 'left',
      }),
    [cargoSortCol, cargoSortDir, handleCargoSort],
  );

  async function toggleActive(cargo: Cargo) {
    try {
      setError(null);
      await api.patch(`/cargos/${cargo.id}`, { ativo: !cargo.ativo });
      await load();
      toast.success(`Cargo ${!cargo.ativo ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
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
        ativo: form.ativo,
        paginasPermitidas: form.paginasPermitidas,
        permissions: form.permissions,
      };

      if (form.descricao && form.descricao.trim().length > 0) {
        payload.descricao = form.descricao.trim();
      }

      if (editingCargo) {
        await api.patch(`/cargos/${editingCargo.id}`, payload);
      } else {
        await api.post('/cargos', payload);
      }

      setShowModal(false);
      setEditingCargo(null);
      setForm({
        nome: '',
        descricao: '',
        ativo: true,
        paginasPermitidas: [],
        permissions: [],
      });
      validation.reset();
      await load();
      toast.success(editingCargo ? 'Cargo atualizado com sucesso!' : 'Cargo criado com sucesso!');
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setModalError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateModal() {
    setEditingCargo(null);
    setForm({
      nome: '',
      descricao: '',
      ativo: true,
      paginasPermitidas: [],
      permissions: [],
    });
    validation.reset();
    setModalError(null);
    setShowModal(true);
  }

  function openEditModal(cargo: Cargo) {
    setEditingCargo(cargo);
    setForm({
      nome: cargo.nome,
      descricao: cargo.descricao || '',
      ativo: cargo.ativo,
      paginasPermitidas: (cargo.paginasPermitidas as string[]) || [],
      permissions: (cargo.permissions ?? []).map((perm) => perm.chave),
    });
    validation.reset();
    setModalError(null);
    setShowModal(true);
  }

  function togglePagina(value: string) {
    setForm((prev) => {
      const current = prev.paginasPermitidas;
      if (current.includes(value)) {
        return { ...prev, paginasPermitidas: current.filter((p) => p !== value) };
      } else {
        return { ...prev, paginasPermitidas: [...current, value] };
      }
    });
  }

  function togglePermissao(value: string) {
    setForm((prev) => {
      const current = prev.permissions;
      if (current.includes(value)) {
        return { ...prev, permissions: current.filter((p) => p !== value) };
      }
      return { ...prev, permissions: [...current, value] };
    });
  }

  function setPaginas(values: string[]) {
    setForm((prev) => ({ ...prev, paginasPermitidas: values }));
  }

  function setModuloPermissoes(chaves: string[], ativar: boolean) {
    setForm((prev) => {
      const set = new Set(prev.permissions);
      for (const chave of chaves) {
        if (ativar) set.add(chave);
        else set.delete(chave);
      }
      return { ...prev, permissions: Array.from(set) };
    });
  }

  async function handleDelete(cargo: Cargo) {
    if (!confirm(`Tem certeza que deseja excluir o cargo "${cargo.nome}"?`)) {
      return;
    }

    try {
      setError(null);
      await api.delete(`/cargos/${cargo.id}`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao excluir cargo');
    }
  }

  if (loading) {
    return <p>Carregando cargos...</p>;
  }

  if (!isGm) {
    return (
      <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
        Você não tem permissão para acessar esta página.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Cargos</h3>
        <button onClick={openCreateModal} className={btn.primary}>
          Novo Cargo
        </button>
      </div>

      {error && !showModal && (
        <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <CollapsibleFilters
        show={showFilters}
        setShow={setShowFilters}
        hasActiveFilters={searchNome.trim().length > 0 || filterStatus !== 'all'}
        onClear={() => {
          setSearchNome('');
          setFilterStatus('all');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Buscar
            </label>
            <input
              type="text"
              placeholder="Nome ou descrição do cargo..."
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
        </div>
        <div className="mt-3 text-xs text-white/50">
          {filteredCargos.length} {filteredCargos.length === 1 ? 'cargo' : 'cargos'}
        </div>
      </CollapsibleFilters>

      <DataTable<Cargo>
        data={sortedCargos}
        keyExtractor={(c) => c.id}
        emptyMessage="Nenhum cargo encontrado"
        paginate
        initialPageSize={20}
        renderMobileCard={(c) => (
          <div className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3">
            {/* Cabeçalho: nome + status */}
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white truncate flex-1">{c.nome}</p>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
                c.ativo
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
              }`}>
                {c.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            {/* Descrição */}
            {c.descricao && (
              <p className="text-xs text-white/60 line-clamp-2">{c.descricao}</p>
            )}
            {/* Info: usuários */}
            <div className="bg-white/5 rounded-lg p-3 text-sm">
              <p className="text-xs text-white/50 mb-0.5">Usuários</p>
              <p className="text-white/80 font-semibold">{c._count?.usuarios || 0}</p>
            </div>
            {/* Ações */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <button onClick={() => openEditModal(c)} className={btn.editSm}>Editar</button>
              <button onClick={() => toggleActive(c)} className={c.ativo ? btn.warningSm : btn.successSm}>
                {c.ativo ? 'Desativar' : 'Ativar'}
              </button>
              {c._count?.usuarios === 0 && (
                <button onClick={() => handleDelete(c)} className={btn.dangerSm}>Excluir</button>
              )}
            </div>
          </div>
        )}
        columns={[
          {
            key: 'nome',
            label: '',
            renderTh: () => renderCargoTh('nome', 'Nome'),
            render: (c) => <span className="font-medium">{c.nome}</span>,
          },
          {
            key: 'descricao',
            label: '',
            renderTh: () => renderCargoTh('descricao', 'Descrição'),
            render: (c) => (
              <span className="block max-w-[220px] truncate text-white/70" title={c.descricao || undefined}>
                {c.descricao || '-'}
              </span>
            ),
          },
          {
            key: 'usuarios',
            label: '',
            renderTh: () => renderCargoTh('usuarios', 'Usuários'),
            render: (c) => <span>{c._count?.usuarios || 0}</span>,
          },
          {
            key: 'status',
            label: '',
            renderTh: () => renderCargoTh('status', 'Status'),
            render: (c) => (
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                c.ativo
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
              }`}>
                {c.ativo ? 'Ativo' : 'Inativo'}
              </span>
            ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            stopRowClick: true,
            render: (c) => (
              <div className="flex items-center gap-1.5 flex-nowrap">
                <button onClick={() => openEditModal(c)} className={btn.editSm}>
                  Editar
                </button>
                <button
                  onClick={() => toggleActive(c)}
                  className={c.ativo ? btn.warningSm : btn.successSm}
                >
                  {c.ativo ? 'Desativar' : 'Ativar'}
                </button>
                {c._count?.usuarios === 0 && (
                  <button onClick={() => handleDelete(c)} className={btn.dangerSm}>
                    Excluir
                  </button>
                )}
              </div>
            ),
          },
        ] satisfies DataTableColumn<Cargo>[]}
      />

      {/* Modal de Criar/Editar Cargo */}
      <AppModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCargo(null);
          setError(null);
          setModalError(null);
        }}
        title={editingCargo ? 'Editar Cargo' : 'Novo Cargo'}
        size="2xl"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="Ex: GERENTE, ANALISTA, etc."
                />
                {validation.hasError('nome') && (
                  <p className="text-red-500 text-xs mt-1">{validation.getFieldError('nome')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
                  className="w-full bg-neutral/60 border border-white/10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  placeholder="Descreva as responsabilidades deste cargo..."
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Acesso do cargo</label>
                <CargoAccessEditor
                  paginasPermitidas={form.paginasPermitidas}
                  permissions={form.permissions}
                  todasPaginas={todasPaginas}
                  permissionsByModule={permissionsByModule}
                  onTogglePagina={togglePagina}
                  onTogglePermissao={togglePermissao}
                  onSetPaginas={setPaginas}
                  onSetModuloPermissoes={setModuloPermissoes}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm text-white/70">Configurações</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))}
                    className="w-4 h-4 rounded border-white/10 bg-neutral/60 text-primary focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-sm text-white/70">Cargo ativo</span>
                </label>
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
                    setShowModal(false);
                    setEditingCargo(null);
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
                    ? editingCargo
                      ? 'Salvando...'
                      : 'Criando...'
                    : editingCargo
                      ? 'Salvar Alterações'
                      : 'Criar Cargo'}
                </button>
              </div>
            </form>
      </AppModal>
    </div>
  );
}

