import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Usuario } from '../types';
import { btn } from '../utils/buttonStyles';
import { formatApiError, toast } from '../utils/toast';
import { useAuthStore } from '../store/auth';
import { getCargoNome, userHasPermission, userHasAnyPermission } from '../utils/projectAccess';
import { formatDateOnlyPtBr, toDateInputValue } from '../utils/dateInputValue';
import { formatCpfDisplay } from '../utils/cpf';
import { AppModal } from '../components/ui/AppModal';
import { UserAvatar, ProfileInfoBox, CopyPlainTextButton } from '../components/users/UserDirectoryUi';

type CargoMini = { id: number; nome: string };
type UsuarioMini = { id: number; nome: string; email: string; cargo?: CargoMini | null };

interface PatrimonioMaterialRow {
  id: number;
  categoria: 'INSUMO' | 'EQUIPAMENTO' | 'FERRAMENTA';
  nome: string;
  quantidade: number | null;
  unidade: string | null;
  especificacao: string | null;
  localizacao: string | null;
  usuarioAtribuidoId: number | null;
  usuarioAtribuido?: { id: number; nome: string; email: string } | null;
}

interface PatrimonioImaterialRow {
  id: number;
  tipo: 'LICENCA' | 'SOFTWARE' | 'CONTEUDO_IMATERIAL';
  nome: string;
  descricao: string | null;
  fornecedor: string | null;
  dataValidade: string | null;
  observacoes: string | null;
}

interface SetorDetalhe {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  chefeId: number | null;
  chefe: UsuarioMini | null;
  membros: Array<{ usuario: UsuarioMini }>;
  patrimonioMaterial: PatrimonioMaterialRow[];
  patrimonioImaterial: PatrimonioImaterialRow[];
  _count?: { membros: number; projetos: number; compras: number; curadoriaOrcamentos: number };
}

interface EstoqueAlocacaoRow {
  id: number;
  quantidade: number;
  dataAlocacao: string;
  projetoId?: number | null;
  usuarioId?: number | null;
  setorId?: number | null;
  estoque?: { id: number; item: string };
  usuario?: { id: number; nome: string } | null;
  setor?: { id: number; nome: string } | null;
}

interface StockItemMini {
  id: number;
  item: string;
  quantidade: number;
  quantidadeDisponivel?: number;
  categoria?: { permiteAlocacao?: boolean | null; isAssinatura?: boolean | null } | null;
}

const OPT_MATERIAL = [
  { value: 'INSUMO', label: 'Insumo' },
  { value: 'EQUIPAMENTO', label: 'Equipamento' },
  { value: 'FERRAMENTA', label: 'Ferramenta' },
];

const OPT_IMATERIAL = [
  { value: 'LICENCA', label: 'Licença' },
  { value: 'SOFTWARE', label: 'Software' },
  { value: 'CONTEUDO_IMATERIAL', label: 'Conteúdo imaterial' },
];

const tableWrap = 'overflow-x-auto rounded-xl border border-white/10';
const th = 'px-3 py-2 text-left text-xs font-semibold text-white/50 uppercase tracking-wide border-b border-white/10';
const td = 'px-3 py-2 align-top border-b border-white/5';

/** Garante URL clicável quando o usuário omitir `https://`. */
function profileLinkHref(raw: string): string {
  const t = raw.trim();
  if (!t) return '#';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export default function SetorDetails() {
  const { id: idParam } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const id = idParam ? Number.parseInt(idParam, 10) : NaN;

  const canEdit = useMemo(
    () => userHasPermission(user, 'setores:editar') || userHasPermission(user, 'setores:gerenciar'),
    [user],
  );

  const canVerRetiradasEstoque = useMemo(
    () =>
      userHasAnyPermission(
        user,
        'estoque:visualizar',
        'estoque:movimentar',
        'setores:visualizar',
        'setores:editar',
        'setores:gerenciar',
      ),
    [user],
  );

  const canMovimentarRetiradasEstoque = useMemo(
    () => userHasAnyPermission(user, 'estoque:movimentar', 'setores:editar', 'setores:gerenciar'),
    [user],
  );

  const [stockAlocacoes, setStockAlocacoes] = useState<EstoqueAlocacaoRow[]>([]);
  const [stockItems, setStockItems] = useState<StockItemMini[]>([]);
  const [loadingEstoqueAloc, setLoadingEstoqueAloc] = useState(false);
  const [novaRetiradaOpen, setNovaRetiradaOpen] = useState(false);
  const [novoItemId, setNovoItemId] = useState<number | ''>('');
  const [novaQtd, setNovaQtd] = useState(1);
  const [destinoRetirada, setDestinoRetirada] = useState<'setor' | 'usuario'>('usuario');
  const [destinoUsuarioId, setDestinoUsuarioId] = useState<number | ''>('');
  const [salvandoRetirada, setSalvandoRetirada] = useState(false);

  const [transferRow, setTransferRow] = useState<EstoqueAlocacaoRow | null>(null);
  const [transferDestino, setTransferDestino] = useState<'setor' | 'usuario'>('usuario');
  const [transferUsuarioId, setTransferUsuarioId] = useState<number | ''>('');
  const [salvandoTransfer, setSalvandoTransfer] = useState(false);

  const [setor, setSetor] = useState<SetorDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Usuario | null>(null);

  const reload = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1) return;
    const { data } = await api.get<SetorDetalhe>(`/setores/${id}`);
    setSetor(data);
  }, [id]);

  const reloadStockAllocations = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1 || !canVerRetiradasEstoque) return;
    setLoadingEstoqueAloc(true);
    try {
      const alRes = await api.get<EstoqueAlocacaoRow[]>(`/stock/alocacoes?contextSetorId=${id}`);
      setStockAlocacoes(Array.isArray(alRes.data) ? alRes.data : []);
      if (canMovimentarRetiradasEstoque) {
        const itRes = await api.get<StockItemMini[]>('/stock/items');
        setStockItems(Array.isArray(itRes.data) ? itRes.data : []);
      } else {
        setStockItems([]);
      }
    } catch {
      setStockAlocacoes([]);
      setStockItems([]);
    } finally {
      setLoadingEstoqueAloc(false);
    }
  }, [id, canVerRetiradasEstoque, canMovimentarRetiradasEstoque]);

  async function openProfileModal(userId: number) {
    setShowProfileModal(true);
    setProfileLoading(true);
    setProfileError(null);
    try {
      const { data } = await api.get<Usuario>(`/users/${userId}`);
      setSelectedProfile(data);
    } catch (e: unknown) {
      setSelectedProfile(null);
      setProfileError(formatApiError(e));
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await reload();
      } catch (e: unknown) {
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  useEffect(() => {
    void reloadStockAllocations();
  }, [reloadStockAllocations]);

  async function addMaterial() {
    if (!canEdit || !setor) return;
    try {
      await api.post(`/setores/${setor.id}/patrimonio-material`, {
        categoria: 'INSUMO',
        nome: 'Novo item',
      });
      await reload();
      toast.success('Linha adicionada. Edite e salve os dados.');
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  async function saveMaterial(row: PatrimonioMaterialRow, draft: MaterialDraft) {
    if (!canEdit || !setor) return;
    try {
      const q = draft.quantidade.trim();
      let quantidade: number | null = null;
      if (q !== '') {
        const n = Number.parseInt(q, 10);
        if (Number.isNaN(n) || n < 0) {
          toast.error('Informe uma quantidade válida (número inteiro ≥ 0) ou deixe em branco.');
          return;
        }
        quantidade = n;
      }
      await api.patch(`/setores/${setor.id}/patrimonio-material/${row.id}`, {
        categoria: draft.categoria,
        nome: draft.nome.trim(),
        quantidade,
        unidade: draft.unidade.trim() === '' ? null : draft.unidade.trim(),
        especificacao: draft.especificacao.trim() === '' ? null : draft.especificacao.trim(),
        localizacao: draft.localizacao.trim() === '' ? null : draft.localizacao.trim(),
        usuarioAtribuidoId: draft.usuarioAtribuidoId === '' ? null : Number(draft.usuarioAtribuidoId),
      });
      await reload();
      toast.success('Patrimônio material salvo.');
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  async function removeMaterial(rowId: number) {
    if (!canEdit || !setor) return;
    if (!window.confirm('Remover esta linha do patrimônio material?')) return;
    try {
      await api.delete(`/setores/${setor.id}/patrimonio-material/${rowId}`);
      await reload();
      toast.success('Item removido.');
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  async function addImaterial() {
    if (!canEdit || !setor) return;
    try {
      await api.post(`/setores/${setor.id}/patrimonio-imaterial`, {
        tipo: 'LICENCA',
        nome: 'Novo registro',
      });
      await reload();
      toast.success('Linha adicionada.');
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  async function saveImaterial(row: PatrimonioImaterialRow, draft: ImaterialDraft) {
    if (!canEdit || !setor) return;
    try {
      await api.patch(`/setores/${setor.id}/patrimonio-imaterial/${row.id}`, {
        tipo: draft.tipo,
        nome: draft.nome.trim(),
        descricao: draft.descricao.trim() === '' ? null : draft.descricao.trim(),
        fornecedor: draft.fornecedor.trim() === '' ? null : draft.fornecedor.trim(),
        dataValidade: draft.dataValidade.trim() === '' ? null : draft.dataValidade.trim(),
        observacoes: draft.observacoes.trim() === '' ? null : draft.observacoes.trim(),
      });
      await reload();
      toast.success('Patrimônio imaterial salvo.');
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  async function removeImaterial(rowId: number) {
    if (!canEdit || !setor) return;
    if (!window.confirm('Remover este registro de patrimônio imaterial?')) return;
    try {
      await api.delete(`/setores/${setor.id}/patrimonio-imaterial/${rowId}`);
      await reload();
      toast.success('Registro removido.');
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  const integrantesOptions = useMemo(() => {
    if (!setor?.membros) return [];
    return setor.membros
      .map((m) => m.usuario)
      .filter(Boolean)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [setor]);

  const atribuidoOptions = useMemo(
    () => [{ value: '', label: '— Não atribuído —' }, ...integrantesOptions.map((u) => ({ value: String(u.id), label: u.nome }))],
    [integrantesOptions],
  );
  const integrantesVisualizacao = useMemo(() => {
    if (!setor?.chefeId) return integrantesOptions;
    return integrantesOptions.filter((u) => u.id !== setor.chefeId);
  }, [integrantesOptions, setor?.chefeId]);

  const membrosParaRetirada = useMemo(() => {
    if (!setor) return [];
    const list: UsuarioMini[] = setor.membros.map((m) => m.usuario).filter(Boolean) as UsuarioMini[];
    const chefe = setor.chefe;
    if (chefe && !list.some((u) => u.id === chefe.id)) {
      list.push(chefe);
    }
    return list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [setor]);

  const alocacoesSemProjeto = useMemo(
    () => stockAlocacoes.filter((a) => a.projetoId == null),
    [stockAlocacoes],
  );

  const itensDisponiveisAlocacao = useMemo(() => {
    return stockItems.filter((it) => {
      const disp = it.quantidadeDisponivel ?? it.quantidade ?? 0;
      if (disp <= 0) return false;
      const c = it.categoria;
      if (c?.isAssinatura || c?.permiteAlocacao === false) return false;
      return true;
    });
  }, [stockItems]);

  async function submitNovaRetirada() {
    if (!setor || !canMovimentarRetiradasEstoque) return;
    if (novoItemId === '') {
      toast.error('Selecione o item do estoque.');
      return;
    }
    if (novaQtd < 1) {
      toast.error('Informe uma quantidade válida (≥ 1).');
      return;
    }
    if (destinoRetirada === 'usuario' && destinoUsuarioId === '') {
      toast.error('Selecione o integrante.');
      return;
    }
    setSalvandoRetirada(true);
    try {
      await api.post('/stock/alocacoes', {
        estoqueId: Number(novoItemId),
        quantidade: novaQtd,
        ...(destinoRetirada === 'setor'
          ? { setorId: setor.id }
          : { usuarioId: Number(destinoUsuarioId), validarUsuarioNoSetorId: setor.id }),
      });
      toast.success('Retirada registrada. A quantidade permanece alocada até baixa ou transferência.');
      setNovaRetiradaOpen(false);
      setNovoItemId('');
      setNovaQtd(1);
      setDestinoRetirada('usuario');
      setDestinoUsuarioId(membrosParaRetirada[0]?.id ?? '');
      await reloadStockAllocations();
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    } finally {
      setSalvandoRetirada(false);
    }
  }

  async function baixaAlocacao(row: EstoqueAlocacaoRow) {
    if (!canMovimentarRetiradasEstoque) return;
    if (row.projetoId != null) {
      toast.error('Esta linha está vinculada a um projeto; gerencie em Compras & Estoque.');
      return;
    }
    if (
      !window.confirm(
        `Dar baixa e devolver ${row.quantidade} unidade(s) de «${row.estoque?.item ?? 'item'}» ao estoque disponível?`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/stock/alocacoes/${row.id}`);
      toast.success('Baixa registrada.');
      await reloadStockAllocations();
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    }
  }

  function openTransferModal(row: EstoqueAlocacaoRow) {
    if (row.projetoId != null) {
      toast.error('Transferência por aqui só vale para retiradas sem projeto.');
      return;
    }
    setTransferRow(row);
    setTransferDestino('usuario');
    setTransferUsuarioId('');
  }

  async function submitTransferencia() {
    if (!setor || !transferRow || !canMovimentarRetiradasEstoque) return;
    if (transferDestino === 'usuario' && transferUsuarioId === '') {
      toast.error('Selecione o integrante de destino.');
      return;
    }
    if (
      transferDestino === 'usuario' &&
      transferRow.usuarioId != null &&
      Number(transferUsuarioId) === Number(transferRow.usuarioId)
    ) {
      toast.error('Escolha outro integrante.');
      return;
    }
    if (
      transferDestino === 'setor' &&
      transferRow.setorId === setor.id &&
      transferRow.usuarioId == null
    ) {
      toast.error('Esta carga já está no pool do setor.');
      return;
    }
    setSalvandoTransfer(true);
    try {
      await api.patch(`/stock/alocacoes/${transferRow.id}/reassign`, {
        ...(transferDestino === 'setor'
          ? { setorId: setor.id }
          : { usuarioId: Number(transferUsuarioId), validarUsuarioNoSetorId: setor.id }),
      });
      toast.success('Carga transferida.');
      setTransferRow(null);
      await reloadStockAllocations();
    } catch (e: unknown) {
      toast.error(formatApiError(e));
    } finally {
      setSalvandoTransfer(false);
    }
  }

  const profileCargoNome = selectedProfile ? getCargoNome(selectedProfile) || selectedProfile.cargo?.nome || '' : '';
  const profileResponsabilidade = selectedProfile?.cargo?.descricao?.trim() || null;
  const profileTelefone = selectedProfile?.telefone?.trim() || '';
  const profileCpf = selectedProfile?.cpf?.trim() || '';
  const profileCpfDisplay = profileCpf ? formatCpfDisplay(profileCpf) : '';
  const profileFormacao = selectedProfile?.formacao?.trim() || '';
  const profileFuncao = selectedProfile?.funcao?.trim() || '';
  const profileBiografia = selectedProfile?.biografiaResumo?.trim() || '';
  const profileHabilidades = selectedProfile?.habilidades?.trim() || '';
  const profileDadosContato = selectedProfile?.dadosContato?.trim() || '';
  const profilePix = selectedProfile?.pix?.trim() || '';
  const profileEndereco = selectedProfile?.endereco?.trim() || '';
  const profileLattes = selectedProfile?.linkLattes?.trim() || '';
  const profilePortfolio = selectedProfile?.linkPortfolio?.trim() || '';
  const profileLinkedin = selectedProfile?.linkLinkedin?.trim() || '';

  if (!Number.isFinite(id) || id < 1) {
    return <Navigate to="/setores" replace />;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-sm">Carregando setor…</p>
      </div>
    );
  }

  if (error || !setor) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Link to="/setores" className={`${btn.secondary} inline-flex text-sm`}>
          ← Voltar aos setores
        </Link>
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error || 'Setor não encontrado.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/setores" className="text-sm text-primary hover:underline mb-2 inline-block">
            ← Voltar aos setores
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{setor.nome}</h1>
          <p className="text-sm text-white/55 mt-1">
            Integrantes, descrição e patrimônio (material e imaterial).
            {setor._count ? (
              <span className="ml-2 text-white/40">
                · {setor._count.projetos} projeto(s) · {setor._count.compras} compra(s) · {setor._count.curadoriaOrcamentos}{' '}
                curadoria
              </span>
            ) : null}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium border shrink-0 ${
            setor.ativo
              ? 'bg-green-500/15 text-green-300 border-green-500/30'
              : 'bg-white/5 text-white/60 border-white/10'
          }`}
        >
          {setor.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[rgb(15_23_42_/_0.55)] p-5 sm:p-6 space-y-4">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">Descrição do setor</h2>
        <p className="text-sm text-white/80 whitespace-pre-wrap">{setor.descricao?.trim() || '— Sem descrição —'}</p>
        <p className="text-xs text-white/45">
          Para editar descrição e chefe do setor, use a tela `Setores` &gt; botão <strong>Editar</strong>.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[rgb(15_23_42_/_0.55)] p-5 sm:p-6 space-y-4">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">Chefe do setor</h2>
        <p className="text-xs text-white/45">Apenas integrantes cadastrados no setor podem ser chefes.</p>
        {setor.chefe ? (
          <ul className="flex flex-wrap gap-2">
            <li>
              <button
                type="button"
                onClick={() => openProfileModal(setor.chefe!.id)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10 hover:border-primary/40 transition-colors"
              >
                <span>{setor.chefe.nome}</span>
                {setor.chefe.cargo?.nome ? (
                  <span className="text-[10px] text-white/40 uppercase">{setor.chefe.cargo.nome}</span>
                ) : null}
              </button>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-white/90">— Não definido —</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[rgb(15_23_42_/_0.55)] p-5 sm:p-6 space-y-4">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">Integrantes</h2>
        {integrantesVisualizacao.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum integrante adicional além do chefe.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {integrantesVisualizacao.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => openProfileModal(u.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10 hover:border-primary/40 transition-colors"
                >
                  <span>{u.nome}</span>
                  {u.cargo?.nome ? <span className="text-[10px] text-white/40 uppercase">{u.cargo.nome}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canVerRetiradasEstoque ? (
        <section className="rounded-2xl border border-emerald-500/25 bg-[rgb(15_23_42_/_0.55)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.12em] text-emerald-400/90 uppercase">
                Retiradas do estoque (carga)
              </h2>
              <p className="text-xs text-white/45 mt-1 max-w-3xl leading-relaxed">
                Cada retirada registra alocação no estoque corporativo: a quantidade fica sob responsabilidade do{' '}
                <strong className="text-white/70">pool do setor</strong> ou de um{' '}
                <strong className="text-white/70">integrante</strong> até você registrar{' '}
                <strong className="text-white/70">baixa</strong> (devolução ao disponível) ou{' '}
                <strong className="text-white/70">transferência</strong> para outra pessoa ou para o pool. Retiradas
                vinculadas a projetos aparecem apenas em Compras & Estoque.
              </p>
            </div>
            {canMovimentarRetiradasEstoque ? (
              <button
                type="button"
                onClick={() => {
                  setNovaRetiradaOpen(true);
                  setNovoItemId('');
                  setNovaQtd(1);
                  setDestinoRetirada('usuario');
                  setDestinoUsuarioId(membrosParaRetirada[0]?.id ?? '');
                }}
                className={`${btn.primarySoft} text-xs px-3 py-1.5 rounded-lg border border-emerald-500/35`}
              >
                + Nova retirada
              </button>
            ) : null}
          </div>

          {loadingEstoqueAloc ? (
            <p className="text-sm text-white/50 py-4">Carregando alocações…</p>
          ) : alocacoesSemProjeto.length === 0 ? (
            <p className="text-sm text-white/45 py-2">
              Nenhuma carga ativa sem projeto neste setor. Com permissão de movimentação, use «Nova retirada» para lotar
              equipamentos ou insumos a partir do estoque.
            </p>
          ) : (
            <div className={tableWrap}>
              <table className="w-full min-w-[800px] text-sm text-white/90">
                <thead className="bg-white/5">
                  <tr>
                    <th className={th}>Item (estoque)</th>
                    <th className={`${th} w-24`}>Qtd</th>
                    <th className={th}>Titular / destino</th>
                    <th className={`${th} w-40`}>Retirada em</th>
                    {canMovimentarRetiradasEstoque ? (
                      <th className={`${th} w-52 text-right`}>Ações</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {alocacoesSemProjeto.map((row) => {
                    const titular =
                      row.usuarioId != null
                        ? `Colaborador: ${row.usuario?.nome ?? `#${row.usuarioId}`}`
                        : row.setorId != null
                          ? row.setorId === setor.id
                            ? `Pool do setor «${setor.nome}»`
                            : `Setor: ${row.setor?.nome ?? `#${row.setorId}`}`
                          : '—';
                    return (
                      <tr key={row.id}>
                        <td className={td}>{row.estoque?.item ?? `Estoque #${row.estoque?.id ?? '?'}`}</td>
                        <td className={td}>{row.quantidade}</td>
                        <td className={`${td} whitespace-pre-wrap`}>{titular}</td>
                        <td className={td}>
                          {row.dataAlocacao ? new Date(row.dataAlocacao).toLocaleString('pt-BR') : '—'}
                        </td>
                        {canMovimentarRetiradasEstoque ? (
                          <td className={`${td} text-right space-x-1 whitespace-nowrap`}>
                            <button
                              type="button"
                              className={`${btn.secondary} text-[11px] px-2 py-1 rounded`}
                              onClick={() => openTransferModal(row)}
                            >
                              Transferir
                            </button>
                            <button
                              type="button"
                              className={`${btn.dangerSm} text-[11px] px-2 py-1 rounded`}
                              onClick={() => void baixaAlocacao(row)}
                            >
                              Baixa
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-[rgb(15_23_42_/_0.55)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">
              Patrimônio material
            </h2>
            <p className="text-xs text-white/45 mt-1">
              Insumos, equipamentos e ferramentas. A coluna “Atribuído a” indica responsabilidade por pessoa.
            </p>
          </div>
          {canEdit ? (
            <button type="button" onClick={addMaterial} className={`${btn.primarySoft} text-xs px-3 py-1.5 rounded-lg`}>
              + Adicionar linha
            </button>
          ) : null}
        </div>
        <div className={tableWrap}>
          <table className="w-full min-w-[920px] text-sm text-white/90">
            <thead className="bg-white/5">
              <tr>
                <th className={th}>Categoria</th>
                <th className={th}>Nome</th>
                <th className={`${th} w-20`}>Qtd</th>
                <th className={`${th} w-24`}>Unid.</th>
                <th className={th}>Especificação</th>
                <th className={th}>Localização</th>
                <th className={`${th} min-w-[9rem]`}>Atribuído a</th>
                {canEdit ? <th className={`${th} w-36 text-right`}>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {setor.patrimonioMaterial.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className={`${td} text-center text-white/45 py-8`}>
                    Nenhum item cadastrado.
                  </td>
                </tr>
              ) : (
                setor.patrimonioMaterial.map((row) => (
                  <MaterialTableRow
                    key={row.id}
                    row={row}
                    canEdit={canEdit}
                    atribuidoOptions={atribuidoOptions}
                    onSave={(draft) => saveMaterial(row, draft)}
                    onRemove={() => removeMaterial(row.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[rgb(15_23_42_/_0.55)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">
              Licenças e patrimônio imaterial
            </h2>
            <p className="text-xs text-white/45 mt-1">Licenças, softwares e conteúdo imaterial (contratos, domínios, etc.).</p>
          </div>
          {canEdit ? (
            <button type="button" onClick={addImaterial} className={`${btn.primarySoft} text-xs px-3 py-1.5 rounded-lg`}>
              + Adicionar linha
            </button>
          ) : null}
        </div>
        <div className={tableWrap}>
          <table className="w-full min-w-[860px] text-sm text-white/90">
            <thead className="bg-white/5">
              <tr>
                <th className={th}>Tipo</th>
                <th className={th}>Nome</th>
                <th className={th}>Descrição</th>
                <th className={th}>Fornecedor</th>
                <th className={`${th} w-32`}>Validade</th>
                <th className={th}>Observações</th>
                {canEdit ? <th className={`${th} w-36 text-right`}>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {setor.patrimonioImaterial.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className={`${td} text-center text-white/45 py-8`}>
                    Nenhum registro cadastrado.
                  </td>
                </tr>
              ) : (
                setor.patrimonioImaterial.map((row) => (
                  <ImaterialTableRow
                    key={row.id}
                    row={row}
                    canEdit={canEdit}
                    onSave={(draft) => saveImaterial(row, draft)}
                    onRemove={() => removeImaterial(row.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!canEdit ? (
        <p className="text-xs text-white/40 text-center">
          Você tem permissão apenas para visualizar. Peça a um gestor de setores para alterar dados.
        </p>
      ) : null}

      <AppModal
        open={novaRetiradaOpen}
        onClose={() => setNovaRetiradaOpen(false)}
        title="Nova retirada do estoque"
        size="md"
        bodyClassName="p-5 sm:p-6 space-y-4"
      >
        <div className="space-y-4 text-sm text-white/85">
          <p className="text-xs text-white/50 leading-relaxed">
            Escolha um item com saldo disponível. Informe um único destino: integrante (inclui o chefe) ou pool do setor.
          </p>
          <div>
            <label className="block text-xs text-white/60 mb-1">Item</label>
            <select
              value={novoItemId === '' ? '' : String(novoItemId)}
              onChange={(e) => setNovoItemId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-neutral border border-white/25 rounded-md px-3 py-2 text-white text-sm"
            >
              <option value="">Selecione…</option>
              {itensDisponiveisAlocacao.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.item} (disp.: {it.quantidadeDisponivel ?? it.quantidade})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Quantidade</label>
            <input
              type="number"
              min={1}
              value={novaQtd}
              onChange={(e) => setNovaQtd(Math.max(1, Number(e.target.value) || 1))}
              className="w-full bg-neutral border border-white/25 rounded-md px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <span className="block text-xs text-white/60 mb-2">Destino da carga</span>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="destRet"
                  checked={destinoRetirada === 'usuario'}
                  onChange={() => setDestinoRetirada('usuario')}
                />
                Integrante
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="destRet"
                  checked={destinoRetirada === 'setor'}
                  onChange={() => setDestinoRetirada('setor')}
                />
                Pool do setor (sem pessoa)
              </label>
            </div>
          </div>
          {destinoRetirada === 'usuario' ? (
            <div>
              <label className="block text-xs text-white/60 mb-1">Integrante</label>
              <select
                value={destinoUsuarioId === '' ? '' : String(destinoUsuarioId)}
                onChange={(e) => setDestinoUsuarioId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-neutral border border-white/25 rounded-md px-3 py-2 text-white text-sm"
              >
                <option value="">Selecione…</option>
                {membrosParaRetirada.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btn.secondary} onClick={() => setNovaRetiradaOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={salvandoRetirada || itensDisponiveisAlocacao.length === 0}
              onClick={() => void submitNovaRetirada()}
            >
              {salvandoRetirada ? 'Salvando…' : 'Confirmar retirada'}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={transferRow != null}
        onClose={() => setTransferRow(null)}
        title="Transferir carga"
        size="md"
        bodyClassName="p-5 sm:p-6 space-y-4"
      >
        {transferRow ? (
          <div className="space-y-4 text-sm text-white/85">
            <p className="text-xs text-white/55 leading-relaxed">
              Item: <strong className="text-white">{transferRow.estoque?.item}</strong> · Qtd:{' '}
              <strong className="text-white">{transferRow.quantidade}</strong>
            </p>
            <div>
              <span className="block text-xs text-white/60 mb-2">Novo destino</span>
              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="destTr"
                    checked={transferDestino === 'usuario'}
                    onChange={() => setTransferDestino('usuario')}
                  />
                  Outro integrante
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="destTr"
                    checked={transferDestino === 'setor'}
                    onChange={() => setTransferDestino('setor')}
                  />
                  Pool do setor
                </label>
              </div>
            </div>
            {transferDestino === 'usuario' ? (
              <div>
                <label className="block text-xs text-white/60 mb-1">Integrante</label>
                <select
                  value={transferUsuarioId === '' ? '' : String(transferUsuarioId)}
                  onChange={(e) => setTransferUsuarioId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-neutral border border-white/25 rounded-md px-3 py-2 text-white text-sm"
                >
                  <option value="">Selecione…</option>
                  {membrosParaRetirada.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btn.secondary} onClick={() => setTransferRow(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={btn.primary}
                disabled={salvandoTransfer}
                onClick={() => void submitTransferencia()}
              >
                {salvandoTransfer ? 'Salvando…' : 'Confirmar transferência'}
              </button>
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          setSelectedProfile(null);
          setProfileError(null);
        }}
        title="Perfil do integrante"
        size="xl"
      >
        {profileLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-white/60">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-4 text-sm">Carregando perfil…</p>
          </div>
        ) : profileError ? (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {profileError}
          </div>
        ) : selectedProfile ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <div className="flex items-start gap-4">
                <UserAvatar nome={selectedProfile.nome} fotoUrl={selectedProfile.fotoUrl} size="lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-xl font-semibold text-white">{selectedProfile.nome}</h3>
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-white/70 break-all flex-1 min-w-0">{selectedProfile.email}</p>
                    <CopyPlainTextButton text={selectedProfile.email} title="Copiar e-mail" />
                  </div>
                  <p className="text-xs text-white/55">
                    {profileCargoNome || '[Sem cargo]'} {profileResponsabilidade ? `· ${profileResponsabilidade}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <ProfileInfoBox label="Função / papel" copyText={profileFuncao} />
              <ProfileInfoBox label="Formação" copyText={profileFormacao}>
                <p className="whitespace-pre-wrap">{profileFormacao || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="Telefone" copyText={profileTelefone} />
              <ProfileInfoBox label="CPF" copyText={profileCpf || undefined}>
                {profileCpfDisplay || '[Não informado]'}
              </ProfileInfoBox>
              <ProfileInfoBox
                label="Data de nascimento"
                copyText={formatDateOnlyPtBr(selectedProfile.dataNascimento) || undefined}
              >
                {formatDateOnlyPtBr(selectedProfile.dataNascimento) || '—'}
              </ProfileInfoBox>
              <ProfileInfoBox
                label="Data de entrada"
                copyText={formatDateOnlyPtBr(selectedProfile.dataEntrada) || undefined}
              >
                {formatDateOnlyPtBr(selectedProfile.dataEntrada) || '—'}
              </ProfileInfoBox>
              <ProfileInfoBox label="Dados de contato" copyText={profileDadosContato}>
                <p className="whitespace-pre-wrap">{profileDadosContato || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="PIX" copyText={profilePix} className="sm:col-span-2">
                <p className="whitespace-pre-wrap break-all">{profilePix || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="Endereço" copyText={profileEndereco} className="sm:col-span-2">
                <p className="whitespace-pre-wrap">{profileEndereco || '[Não informado]'}</p>
              </ProfileInfoBox>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm">
              <ProfileInfoBox label="Resumo da biografia" copyText={profileBiografia}>
                <p className="whitespace-pre-wrap">{profileBiografia || '[Não informado]'}</p>
              </ProfileInfoBox>
              <ProfileInfoBox label="Habilidades" copyText={profileHabilidades}>
                <p className="whitespace-pre-wrap">{profileHabilidades || '[Não informado]'}</p>
              </ProfileInfoBox>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <ProfileInfoBox label="Currículo Lattes" copyText={profileLattes}>
                {profileLattes ? (
                  <a
                    href={profileLinkHref(profileLattes)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {profileLattes}
                  </a>
                ) : (
                  '[Não informado]'
                )}
              </ProfileInfoBox>
              <ProfileInfoBox label="Portfólio" copyText={profilePortfolio}>
                {profilePortfolio ? (
                  <a
                    href={profileLinkHref(profilePortfolio)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {profilePortfolio}
                  </a>
                ) : (
                  '[Não informado]'
                )}
              </ProfileInfoBox>
              <ProfileInfoBox label="LinkedIn" copyText={profileLinkedin}>
                {profileLinkedin ? (
                  <a
                    href={profileLinkHref(profileLinkedin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {profileLinkedin}
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
                  setShowProfileModal(false);
                  setSelectedProfile(null);
                  setProfileError(null);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}

interface MaterialDraft {
  categoria: PatrimonioMaterialRow['categoria'];
  nome: string;
  quantidade: string;
  unidade: string;
  especificacao: string;
  localizacao: string;
  usuarioAtribuidoId: string;
}

function MaterialTableRow({
  row,
  canEdit,
  atribuidoOptions,
  onSave,
  onRemove,
}: {
  row: PatrimonioMaterialRow;
  canEdit: boolean;
  atribuidoOptions: { value: string; label: string }[];
  onSave: (d: MaterialDraft) => void;
  onRemove: () => void;
}) {
  const [categoria, setCategoria] = useState(row.categoria);
  const [nome, setNome] = useState(row.nome);
  const [quantidade, setQuantidade] = useState(row.quantidade != null ? String(row.quantidade) : '');
  const [unidade, setUnidade] = useState(row.unidade ?? '');
  const [especificacao, setEspecificacao] = useState(row.especificacao ?? '');
  const [localizacao, setLocalizacao] = useState(row.localizacao ?? '');
  const [usuarioAtribuidoId, setUsuarioAtribuidoId] = useState(
    row.usuarioAtribuidoId != null ? String(row.usuarioAtribuidoId) : '',
  );

  useEffect(() => {
    setCategoria(row.categoria);
    setNome(row.nome);
    setQuantidade(row.quantidade != null ? String(row.quantidade) : '');
    setUnidade(row.unidade ?? '');
    setEspecificacao(row.especificacao ?? '');
    setLocalizacao(row.localizacao ?? '');
    setUsuarioAtribuidoId(row.usuarioAtribuidoId != null ? String(row.usuarioAtribuidoId) : '');
  }, [row]);

  if (!canEdit) {
    return (
      <tr>
        <td className={td}>{OPT_MATERIAL.find((o) => o.value === row.categoria)?.label ?? row.categoria}</td>
        <td className={td}>{row.nome}</td>
        <td className={td}>{row.quantidade ?? '—'}</td>
        <td className={td}>{row.unidade ?? '—'}</td>
        <td className={`${td} whitespace-pre-wrap max-w-[14rem]`}>{row.especificacao ?? '—'}</td>
        <td className={`${td} whitespace-pre-wrap max-w-[12rem]`}>{row.localizacao ?? '—'}</td>
        <td className={td}>{row.usuarioAtribuido?.nome ?? '—'}</td>
      </tr>
    );
  }

  return (
    <tr>
      <td className={td}>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as PatrimonioMaterialRow['categoria'])}
          className="w-full bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        >
          {OPT_MATERIAL.map((o) => (
            <option key={o.value} value={o.value} className="bg-neutral">
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full min-w-[8rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        />
      </td>
      <td className={td}>
        <input
          type="number"
          min={0}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          className="w-full bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        />
      </td>
      <td className={td}>
        <input
          value={unidade}
          onChange={(e) => setUnidade(e.target.value)}
          className="w-full bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        />
      </td>
      <td className={td}>
        <textarea
          value={especificacao}
          onChange={(e) => setEspecificacao(e.target.value)}
          rows={2}
          className="w-full min-w-[10rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white resize-y"
        />
      </td>
      <td className={td}>
        <textarea
          value={localizacao}
          onChange={(e) => setLocalizacao(e.target.value)}
          rows={2}
          className="w-full min-w-[8rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white resize-y"
        />
      </td>
      <td className={td}>
        <select
          value={usuarioAtribuidoId}
          onChange={(e) => setUsuarioAtribuidoId(e.target.value)}
          className="w-full bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        >
          {atribuidoOptions.map((o) => (
            <option key={o.value === '' ? '_none' : o.value} value={o.value} className="bg-neutral">
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className={`${td} text-right space-x-1 whitespace-nowrap`}>
        <button
          type="button"
          onClick={() =>
            onSave({
              categoria,
              nome,
              quantidade,
              unidade,
              especificacao,
              localizacao,
              usuarioAtribuidoId,
            })
          }
          className={`${btn.primarySoft} text-[11px] px-2 py-1 rounded`}
        >
          Salvar
        </button>
        <button type="button" onClick={onRemove} className={`${btn.dangerSm} text-[11px] px-2 py-1 rounded`}>
          Excluir
        </button>
      </td>
    </tr>
  );
}

interface ImaterialDraft {
  tipo: PatrimonioImaterialRow['tipo'];
  nome: string;
  descricao: string;
  fornecedor: string;
  dataValidade: string;
  observacoes: string;
}

function ImaterialTableRow({
  row,
  canEdit,
  onSave,
  onRemove,
}: {
  row: PatrimonioImaterialRow;
  canEdit: boolean;
  onSave: (d: ImaterialDraft) => void;
  onRemove: () => void;
}) {
  const [tipo, setTipo] = useState(row.tipo);
  const [nome, setNome] = useState(row.nome);
  const [descricao, setDescricao] = useState(row.descricao ?? '');
  const [fornecedor, setFornecedor] = useState(row.fornecedor ?? '');
  const [dataValidade, setDataValidade] = useState(toDateInputValue(row.dataValidade));
  const [observacoes, setObservacoes] = useState(row.observacoes ?? '');

  useEffect(() => {
    setTipo(row.tipo);
    setNome(row.nome);
    setDescricao(row.descricao ?? '');
    setFornecedor(row.fornecedor ?? '');
    setDataValidade(toDateInputValue(row.dataValidade));
    setObservacoes(row.observacoes ?? '');
  }, [row]);

  if (!canEdit) {
    return (
      <tr>
        <td className={td}>{OPT_IMATERIAL.find((o) => o.value === row.tipo)?.label ?? row.tipo}</td>
        <td className={td}>{row.nome}</td>
        <td className={`${td} whitespace-pre-wrap max-w-[12rem]`}>{row.descricao ?? '—'}</td>
        <td className={td}>{row.fornecedor ?? '—'}</td>
        <td className={td}>{formatDateOnlyPtBr(row.dataValidade) || '—'}</td>
        <td className={`${td} whitespace-pre-wrap max-w-[12rem]`}>{row.observacoes ?? '—'}</td>
      </tr>
    );
  }

  return (
    <tr>
      <td className={td}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as PatrimonioImaterialRow['tipo'])}
          className="w-full bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        >
          {OPT_IMATERIAL.map((o) => (
            <option key={o.value} value={o.value} className="bg-neutral">
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full min-w-[8rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        />
      </td>
      <td className={td}>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={2}
          className="w-full min-w-[10rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white resize-y"
        />
      </td>
      <td className={td}>
        <input
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
          className="w-full min-w-[7rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        />
      </td>
      <td className={td}>
        <input
          type="date"
          value={dataValidade}
          onChange={(e) => setDataValidade(e.target.value)}
          className="w-full bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white"
        />
      </td>
      <td className={td}>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          className="w-full min-w-[8rem] bg-neutral border border-white/30 rounded-md px-2 py-1.5 text-xs text-white resize-y"
        />
      </td>
      <td className={`${td} text-right space-x-1 whitespace-nowrap`}>
        <button
          type="button"
          onClick={() =>
            onSave({
              tipo,
              nome,
              descricao,
              fornecedor,
              dataValidade,
              observacoes,
            })
          }
          className={`${btn.primarySoft} text-[11px] px-2 py-1 rounded`}
        >
          Salvar
        </button>
        <button type="button" onClick={onRemove} className={`${btn.dangerSm} text-[11px] px-2 py-1 rounded`}>
          Excluir
        </button>
      </td>
    </tr>
  );
}
