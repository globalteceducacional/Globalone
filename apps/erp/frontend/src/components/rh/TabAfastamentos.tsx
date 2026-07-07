import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../DataTable';
import { FilePreviewTrigger } from '../files/FilePreviewTrigger';
import { api } from '../../services/api';
import {
  criarAfastamento,
  listarAfastamentos,
  listarMeusAfastamentos,
  removerAfastamento,
  type Afastamento,
  type AfastamentoTipo,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { Card, Field, Modal, formatData } from './rhUi';

interface SimpleUser {
  id: number;
  nome: string;
}

const TIPOS: { id: AfastamentoTipo; label: string }[] = [
  { id: 'ATESTADO', label: 'Atestado' },
  { id: 'LICENCA', label: 'Licença' },
  { id: 'FALTA_ABONADA', label: 'Falta abonada' },
  { id: 'HOME_OFFICE', label: 'Home office' },
  { id: 'OUTRO', label: 'Outro' },
];

type TipoFiltro = 'all' | AfastamentoTipo;
type AnexoFiltro = 'all' | 'com' | 'sem';

function dataDentro(
  dataInicio: string,
  dataFim: string,
  filtroDe: string,
  filtroAte: string,
): boolean {
  const ini = dataInicio.slice(0, 10);
  const fim = dataFim.slice(0, 10);
  if (filtroDe && fim < filtroDe) return false;
  if (filtroAte && ini > filtroAte) return false;
  return true;
}

export function TabAfastamentos() {
  const user = useAuthStore((s) => s.user);
  const podeRegistrar = userHasPermission(user, 'afastamentos:registrar');
  const podeVerTodos = userHasPermission(user, 'afastamentos:ver_todos');

  const [meus, setMeus] = useState<Afastamento[]>([]);
  const [todos, setTodos] = useState<Afastamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);
  const [usuarios, setUsuarios] = useState<SimpleUser[]>([]);

  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('all');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [anexoFiltro, setAnexoFiltro] = useState<AnexoFiltro>('all');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t] = await Promise.all([
        listarMeusAfastamentos().catch(() => []),
        podeVerTodos ? listarAfastamentos() : Promise.resolve([]),
      ]);
      setMeus(m);
      setTodos(t);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [podeVerTodos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!podeRegistrar) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<SimpleUser[]>('/users/options');
        if (!cancelled) setUsuarios(Array.isArray(data) ? data : []);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podeRegistrar]);

  const filtrar = useCallback(
    (a: Afastamento, aplicarBusca: boolean): boolean => {
      if (tipoFiltro !== 'all' && a.tipo !== tipoFiltro) return false;
      if (!dataDentro(a.dataInicio, a.dataFim, dataDe, dataAte)) return false;
      if (anexoFiltro === 'com' && !a.anexoUrl) return false;
      if (anexoFiltro === 'sem' && a.anexoUrl) return false;

      if (aplicarBusca) {
        const termo = busca.trim().toLowerCase();
        if (termo) {
          const alvo = `${a.usuario?.nome ?? ''} ${a.motivo ?? ''}`.toLowerCase();
          if (!alvo.includes(termo)) return false;
        }
      } else if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const alvo = (a.motivo ?? '').toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    },
    [tipoFiltro, dataDe, dataAte, anexoFiltro, busca],
  );

  const meusFiltrados = useMemo(() => meus.filter((a) => filtrar(a, false)), [meus, filtrar]);
  const todosFiltrados = useMemo(() => todos.filter((a) => filtrar(a, true)), [todos, filtrar]);

  const filtrosAtivos =
    busca.trim().length > 0 ||
    tipoFiltro !== 'all' ||
    dataDe !== '' ||
    dataAte !== '' ||
    anexoFiltro !== 'all';

  const limparFiltros = () => {
    setBusca('');
    setTipoFiltro('all');
    setDataDe('');
    setDataAte('');
    setAnexoFiltro('all');
  };

  return (
    <div className="space-y-4">
      <CollapsibleFilters
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={limparFiltros}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Buscar {podeVerTodos ? '(colaborador / motivo)' : '(motivo)'}
            </label>
            <input
              type="text"
              placeholder={podeVerTodos ? 'Nome ou texto do motivo…' : 'Texto do motivo…'}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Tipo</label>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
            >
              <option value="all" className="bg-neutral text-white">Todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id} className="bg-neutral text-white">
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Anexo</label>
            <select
              value={anexoFiltro}
              onChange={(e) => setAnexoFiltro(e.target.value as AnexoFiltro)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              <option value="com" className="bg-neutral text-white">Com anexo</option>
              <option value="sem" className="bg-neutral text-white">Sem anexo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Início (a partir de)</label>
            <input
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Fim (até)</label>
            <input
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>
      </CollapsibleFilters>

      <Card
        title="Meus afastamentos"
        actions={podeRegistrar ? (
          <button onClick={() => setCriando(true)} className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold">Novo</button>
        ) : null}
      >
        <Tabela
          registros={meusFiltrados}
          loading={loading}
          mostrarUsuario={false}
          emptyMessage={
            filtrosAtivos
              ? 'Nenhum afastamento atende aos filtros aplicados.'
              : 'Sem afastamentos.'
          }
          onRemover={podeRegistrar ? async (id) => {
            try {
              await removerAfastamento(id);
              toast.success('Removido.');
              void carregar();
            } catch (err) {
              toast.error(formatApiError(err));
            }
          } : undefined}
        />
      </Card>

      {podeVerTodos ? (
        <Card title="Todos os afastamentos">
          <Tabela
            registros={todosFiltrados}
            loading={loading}
            mostrarUsuario
            emptyMessage={
              filtrosAtivos
                ? 'Nenhum afastamento atende aos filtros aplicados.'
                : 'Sem afastamentos.'
            }
          />
        </Card>
      ) : null}

      {criando ? (
        <CriarAfastamentoModal
          usuarios={usuarios}
          onClose={() => setCriando(false)}
          onSaved={() => {
            setCriando(false);
            void carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Tabela({
  registros,
  loading,
  mostrarUsuario,
  onRemover,
  emptyMessage = 'Sem afastamentos.',
}: {
  registros: Afastamento[];
  loading: boolean;
  mostrarUsuario: boolean;
  onRemover?: (id: number) => Promise<void>;
  emptyMessage?: string;
}) {
  const columns = useMemo((): DataTableColumn<Afastamento>[] => {
    const cols: DataTableColumn<Afastamento>[] = [
      {
        key: 'periodo',
        label: 'Período',
        render: (a) => (
          <>
            {formatData(a.dataInicio)} → {formatData(a.dataFim)}
          </>
        ),
      },
    ];
    if (mostrarUsuario) {
      cols.push({
        key: 'usuario',
        label: 'Colaborador',
        render: (a) => a.usuario?.nome ?? `#${a.usuarioId}`,
      });
    }
    cols.push(
      { key: 'tipo', label: 'Tipo', render: (a) => a.tipo },
      {
        key: 'motivo',
        label: 'Motivo',
        render: (a) => (
          <span className="max-w-[260px] truncate block" title={a.motivo ?? ''}>
            {a.motivo ?? '—'}
          </span>
        ),
      },
      {
        key: 'anexo',
        label: 'Anexo',
        stopRowClick: true,
        render: (a) =>
          a.anexoUrl ? (
            <FilePreviewTrigger src={a.anexoUrl} className="text-primary hover:underline text-sm">
              Abrir
            </FilePreviewTrigger>
          ) : (
            <span className="text-white/40">—</span>
          ),
      },
    );
    if (onRemover) {
      cols.push({
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        render: (a) => (
          <button
            type="button"
            onClick={() => void onRemover(a.id)}
            className="text-red-300 hover:text-red-200"
          >
            Remover
          </button>
        ),
      });
    }
    return cols;
  }, [mostrarUsuario, onRemover]);

  return (
    <DataTable<Afastamento>
      columns={columns}
      data={registros}
      keyExtractor={(a) => a.id}
      loading={loading}
      emptyMessage={emptyMessage}
      renderMobileCard={(a) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
          <p className="text-white/85">
            {formatData(a.dataInicio)} → {formatData(a.dataFim)}
          </p>
          {mostrarUsuario ? (
            <p className="text-white/65 text-xs">{a.usuario?.nome ?? `#${a.usuarioId}`}</p>
          ) : null}
          <p className="text-white/55 text-xs font-medium">{a.tipo}</p>
          <p className="text-white/70 text-xs leading-snug">{a.motivo ?? '—'}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            {a.anexoUrl ? (
              <FilePreviewTrigger src={a.anexoUrl} className="text-primary hover:underline text-sm">
                Abrir anexo
              </FilePreviewTrigger>
            ) : null}
            {onRemover ? (
              <button
                type="button"
                onClick={() => void onRemover(a.id)}
                className="text-red-300 hover:text-red-200 text-sm"
              >
                Remover
              </button>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}

function CriarAfastamentoModal({ usuarios, onClose, onSaved }: { usuarios: SimpleUser[]; onClose: () => void; onSaved: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [usuarioId, setUsuarioId] = useState<number | ''>(user?.id ?? '');
  const [tipo, setTipo] = useState<AfastamentoTipo>('ATESTADO');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [motivo, setMotivo] = useState('');
  const [anexo, setAnexo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!usuarioId || !dataInicio || !dataFim) {
      toast.error('Informe usuário e datas.');
      return;
    }
    setSalvando(true);
    try {
      await criarAfastamento({
        usuarioId: Number(usuarioId),
        tipo,
        dataInicio,
        dataFim,
        motivo: motivo.trim() || undefined,
        anexo: anexo ?? undefined,
      });
      toast.success('Afastamento registrado.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo afastamento"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <Field label="Colaborador">
        <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value ? Number(e.target.value) : '')} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm">
          <option value="">Selecione...</option>
          {usuarios.map((u) => (<option key={u.id} value={u.id}>{u.nome}</option>))}
        </select>
      </Field>
      <Field label="Tipo">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as AfastamentoTipo)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm">
          {TIPOS.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início">
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
        </Field>
        <Field label="Fim">
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
        </Field>
      </div>
      <Field label="Motivo">
        <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
      </Field>
      <Field label="Anexo (PDF ou imagem)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setAnexo(e.target.files?.[0] ?? null)} className="w-full text-sm" />
      </Field>
    </Modal>
  );
}
