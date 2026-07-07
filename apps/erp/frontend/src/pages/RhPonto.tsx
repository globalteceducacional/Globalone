import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import {
  baterPonto,
  criarAjustePonto,
  editarPonto,
  exportarPontoCsv,
  getPontoHoje,
  listarMeusPontos,
  listarTodosPontos,
  removerPonto,
  type ListarPontoFiltros,
  type PontoHoje,
  type RegistroPonto,
  type TipoBatida,
} from '../services/rh';
import { useAuthStore } from '../store/auth';
import { userHasAnyPermission, userHasPermission } from '../utils/projectAccess';
import { toast, formatApiError } from '../utils/toast';
import { FilePreviewTrigger } from '../components/files/FilePreviewTrigger';
import { WebcamCapture } from '../components/rh/WebcamCapture';
import { PontoStatusCard } from '../components/rh/PontoStatusCard';
import { TabJornada } from '../components/rh/TabJornada';
import { TabFeriados } from '../components/rh/TabFeriados';
import { TabGeocerca } from '../components/rh/TabGeocerca';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { AppSectionTabs } from '../components/ui/AppSectionTabs';

interface SimpleUser {
  id: number;
  nome: string;
}

type Aba = 'meu' | 'equipe' | 'jornada' | 'feriados' | 'local';

const TIPO_LABEL: Record<TipoBatida, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
};

function formatDataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function inicioDoMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function fimDoMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/**
 * Promessa de geolocalização do navegador. Recusa explicitamente quando
 * o usuário nega ou o dispositivo não tem GPS, com mensagens claras.
 */
function obterGeolocalizacao(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Seu navegador não suporta geolocalização.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Permissão de localização negada. Habilite o GPS para registrar o ponto.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Localização indisponível. Verifique se o GPS está ligado.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Tempo esgotado ao tentar obter sua localização.'));
        } else {
          reject(new Error(`Falha ao obter localização: ${err.message}`));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export default function RhPonto() {
  const user = useAuthStore((state) => state.user);
  const podeVerTodos = userHasPermission(user, 'ponto:ver_todos');
  const podeAjustar = userHasPermission(user, 'ponto:ajustar');
  const podeExportar = userHasPermission(user, 'ponto:exportar');
  const podeConfigurarJornada = userHasPermission(user, 'jornada:configurar');
  // Admin global (sistema:administrar) também enxerga a aba — mesmo critério do backend RolesGuard.
  const podeGerenciarEmpregador = userHasAnyPermission(
    user,
    'rh:gerenciar_empregador',
    'sistema:administrar',
  );

  const abasDisponiveis = useMemo<Array<{ id: Aba; label: string; shortLabel?: string }>>(
    () => [
      { id: 'meu', label: 'Meu histórico', shortLabel: 'Histórico' },
      ...(podeVerTodos ? [{ id: 'equipe' as Aba, label: 'Equipe' }] : []),
      ...(podeConfigurarJornada ? [{ id: 'jornada' as Aba, label: 'Jornada' }] : []),
      ...(podeConfigurarJornada ? [{ id: 'feriados' as Aba, label: 'Feriados' }] : []),
      ...(podeGerenciarEmpregador
        ? [{ id: 'local' as Aba, label: 'Local da unidade', shortLabel: 'Local' }]
        : []),
    ],
    [podeVerTodos, podeConfigurarJornada, podeGerenciarEmpregador],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const abaInicial = (searchParams.get('aba') as Aba | null) ?? 'meu';
  const [aba, setAba] = useState<Aba>(
    abasDisponiveis.find((a) => a.id === abaInicial) ? abaInicial : 'meu',
  );

  useEffect(() => {
    if (!abasDisponiveis.find((a) => a.id === aba)) {
      setAba('meu');
    }
  }, [abasDisponiveis, aba]);

  function trocarAba(nova: Aba) {
    setAba(nova);
    if (nova === 'meu') {
      searchParams.delete('aba');
    } else {
      searchParams.set('aba', nova);
    }
    setSearchParams(searchParams, { replace: true });
  }

  const [hoje, setHoje] = useState<PontoHoje | null>(null);
  const [meusPontos, setMeusPontos] = useState<RegistroPonto[]>([]);
  const [loadingMeu, setLoadingMeu] = useState(false);
  const [erroBatida, setErroBatida] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; precisao?: number } | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** GPS em andamento ou modal de selfie aberto — evita segundo clique no botão principal. */
  const [preparandoBatida, setPreparandoBatida] = useState(false);
  const fluxoBatidaRef = useRef(false);
  const envioBatidaRef = useRef(false);

  const carregarMeu = useCallback(async () => {
    setLoadingMeu(true);
    try {
      const [statusHoje, hist] = await Promise.all([
        getPontoHoje(),
        listarMeusPontos({ inicio: inicioDoMes(), fim: fimDoMes() }),
      ]);
      setHoje(statusHoje);
      setMeusPontos(hist);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoadingMeu(false);
    }
  }, []);

  useEffect(() => {
    void carregarMeu();
  }, [carregarMeu]);

  const encerrarFluxoBatida = useCallback(() => {
    fluxoBatidaRef.current = false;
    setPreparandoBatida(false);
  }, []);

  const handleClickBater = useCallback(async () => {
    if (fluxoBatidaRef.current || envioBatidaRef.current) return;

    setErroBatida(null);
    const almocoAutomatico = hoje?.almoco?.automatico !== false;
    const diaConcluido =
      hoje?.concluido === true ||
      (hoje?.concluido == null &&
        (almocoAutomatico
          ? !!(hoje?.entrada && hoje?.saida)
          : (hoje?.batidasHoje?.length ?? 0) >= 4));
    if (diaConcluido) {
      setErroBatida(
        almocoAutomatico
          ? 'Você já registrou entrada e saída hoje.'
          : 'Você já registrou as quatro batidas de hoje.',
      );
      return;
    }

    fluxoBatidaRef.current = true;
    setPreparandoBatida(true);
    try {
      const pos = await obterGeolocalizacao();
      setCoords({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        precisao: pos.coords.accuracy,
      });
      setWebcamOpen(true);
    } catch (err) {
      encerrarFluxoBatida();
      const msg = err instanceof Error ? err.message : 'Falha ao obter localização.';
      setErroBatida(msg);
      toast.error(msg);
    }
  }, [hoje, encerrarFluxoBatida]);

  const handleCaptura = useCallback(
    async (blob: Blob) => {
      if (envioBatidaRef.current) return;
      if (!coords) {
        setErroBatida('Coordenadas indisponíveis. Tente novamente.');
        setWebcamOpen(false);
        encerrarFluxoBatida();
        return;
      }

      envioBatidaRef.current = true;
      setWebcamOpen(false);
      setEnviando(true);
      try {
        const reg = await baterPonto({
          fotoBlob: blob,
          latitude: coords.latitude,
          longitude: coords.longitude,
          precisaoGps: coords.precisao,
        });
        toast.success(`Ponto registrado: ${TIPO_LABEL[reg.tipo]} às ${formatDataHora(reg.dataHora)}.`);
        await carregarMeu();
      } catch (err) {
        const msg = formatApiError(err);
        setErroBatida(msg);
        toast.error(msg);
      } finally {
        envioBatidaRef.current = false;
        setEnviando(false);
        encerrarFluxoBatida();
      }
    },
    [coords, carregarMeu, encerrarFluxoBatida],
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Controle de Ponto</h1>
        <p className="text-sm text-white/60">
          Registre sua entrada e saída do dia (foto e localização). O intervalo de almoço (início, fim e
          desconto automático no espelho) é definido pelo RH na aba Jornada para cada colaborador — não é
          preciso bater ponto no almoço.
        </p>
      </header>

      {aba !== 'jornada' && aba !== 'local' ? (
        <>
          <PontoStatusCard
            status={hoje}
            loading={loadingMeu}
            baterEmAndamento={enviando || preparandoBatida}
            labelEmAndamento={
              enviando ? 'Registrando...' : preparandoBatida ? 'Obtendo localização...' : 'Registrando...'
            }
            onBater={handleClickBater}
            ultimoErro={erroBatida}
          />
        </>
      ) : null}

      {abasDisponiveis.length > 1 ? (
        <AppSectionTabs
          tabs={abasDisponiveis.map((a) => ({
            id: a.id,
            label: a.label,
            shortLabel: a.shortLabel,
          }))}
          activeId={aba}
          onChange={(id) => trocarAba(id as Aba)}
          ariaLabel="Abas do controle de ponto"
        />
      ) : null}

      {aba === 'meu' ? (
        <MeuHistorico registros={meusPontos} loading={loadingMeu} onRefresh={carregarMeu} />
      ) : aba === 'equipe' ? (
        <EquipeView podeAjustar={podeAjustar} podeExportar={podeExportar} />
      ) : aba === 'jornada' ? (
        <TabJornada />
      ) : aba === 'feriados' ? (
        <TabFeriados />
      ) : (
        <TabGeocerca />
      )}

      <WebcamCapture
        open={webcamOpen}
        onClose={() => {
          setWebcamOpen(false);
          encerrarFluxoBatida();
        }}
        onCapture={(blob) => {
          void handleCaptura(blob);
        }}
      />
    </div>
  );
}

// ─── Histórico do próprio usuário ────────────────────────────────────────────

function MeuHistorico({
  registros,
  loading,
  onRefresh,
}: {
  registros: RegistroPonto[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-base font-semibold">Meu histórico — mês corrente</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="text-sm text-white/70 hover:text-white px-2 py-1 rounded hover:bg-white/10"
        >
          Atualizar
        </button>
      </header>
      <div className="p-4">
        <PontoTable registros={registros} loading={loading} mostrarUsuario={false} />
      </div>
    </section>
  );
}

// ─── Aba "Equipe" para RH/admin ──────────────────────────────────────────────

function EquipeView({ podeAjustar, podeExportar }: { podeAjustar: boolean; podeExportar: boolean }) {
  const [filtros, setFiltros] = useState<ListarPontoFiltros>({
    inicio: inicioDoMes(),
    fim: fimDoMes(),
  });
  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<RegistroPonto[]>([]);
  const [usuarios, setUsuarios] = useState<SimpleUser[]>([]);
  const [editando, setEditando] = useState<RegistroPonto | null>(null);
  const [removendo, setRemovendo] = useState<RegistroPonto | null>(null);
  const [criandoAjuste, setCriandoAjuste] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarTodosPontos(filtros);
      setRegistros(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get<SimpleUser[]>('/users/options');
        if (!cancelled) setUsuarios(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setUsuarios([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExportar() {
    try {
      await exportarPontoCsv(filtros);
      toast.success('CSV gerado com sucesso.');
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="px-4 py-3 border-b border-white/10 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-white/60 block mb-1">Início</label>
          <input
            type="date"
            value={filtros.inicio ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, inicio: e.target.value || undefined }))}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-white/60 block mb-1">Fim</label>
          <input
            type="date"
            value={filtros.fim ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, fim: e.target.value || undefined }))}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-white/60 block mb-1">Usuário</label>
          <select
            value={filtros.usuarioId ?? ''}
            onChange={(e) =>
              setFiltros((f) => ({
                ...f,
                usuarioId: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {podeAjustar ? (
            <button
              type="button"
              onClick={() => setCriandoAjuste(true)}
              className="bg-primary text-neutral text-sm font-semibold px-3 py-2 rounded hover:opacity-90"
            >
              Novo ajuste
            </button>
          ) : null}
          {podeExportar ? (
            <button
              type="button"
              onClick={handleExportar}
              className="bg-white/10 hover:bg-white/20 text-sm px-3 py-2 rounded"
            >
              Exportar CSV
            </button>
          ) : null}
          <button
            type="button"
            onClick={carregar}
            className="bg-white/10 hover:bg-white/20 text-sm px-3 py-2 rounded"
          >
            Atualizar
          </button>
        </div>
      </header>

      <div className="p-4">
        <PontoTable
          registros={registros}
          loading={loading}
          mostrarUsuario
          onEditar={podeAjustar ? (r) => setEditando(r) : undefined}
          onRemover={podeAjustar ? (r) => setRemovendo(r) : undefined}
        />
      </div>

      {editando ? (
        <EditarPontoModal
          registro={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            void carregar();
          }}
        />
      ) : null}

      {removendo ? (
        <RemoverPontoModal
          registro={removendo}
          onClose={() => setRemovendo(null)}
          onRemoved={() => {
            setRemovendo(null);
            void carregar();
          }}
        />
      ) : null}

      {criandoAjuste ? (
        <CriarAjusteModal
          usuarios={usuarios}
          onClose={() => setCriandoAjuste(false)}
          onCreated={() => {
            setCriandoAjuste(false);
            void carregar();
          }}
        />
      ) : null}
    </section>
  );
}

// ─── Tabela de registros ─────────────────────────────────────────────────────

function PontoTable({
  registros,
  loading,
  mostrarUsuario,
  onEditar,
  onRemover,
}: {
  registros: RegistroPonto[];
  loading: boolean;
  mostrarUsuario: boolean;
  onEditar?: (r: RegistroPonto) => void;
  onRemover?: (r: RegistroPonto) => void;
}) {
  const acoes = !!(onEditar || onRemover);

  const columns = useMemo((): DataTableColumn<RegistroPonto>[] => {
    const cols: DataTableColumn<RegistroPonto>[] = [
      { key: 'quando', label: 'Data/hora', render: (r) => formatDataHora(r.dataHora) },
    ];
    if (mostrarUsuario) {
      cols.push({
        key: 'usuario',
        label: 'Usuário',
        render: (r) => <span className="text-sm">{r.usuario?.nome ?? `#${r.usuarioId}`}</span>,
      });
    }
    cols.push(
      {
        key: 'tipo',
        label: 'Tipo',
        render: (r) => (
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              r.tipo === 'ENTRADA'
                ? 'bg-green-500/20 text-green-200 border border-green-400/30'
                : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
            }`}
          >
            {TIPO_LABEL[r.tipo]}
          </span>
        ),
      },
      {
        key: 'origem',
        label: 'Origem',
        render: (r) =>
          r.origem === 'AJUSTE_RH' ? (
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-200 border border-blue-400/30">
              Ajuste RH
            </span>
          ) : (
            <span className="text-white/60 text-xs">Normal</span>
          ),
      },
      {
        key: 'selfie',
        label: 'Selfie',
        stopRowClick: true,
        render: (r) =>
          r.fotoUrl ? (
            <FilePreviewTrigger
              src={r.fotoUrl}
              name="Selfie do ponto"
              variant="link"
              className="text-primary hover:underline text-sm"
            >
              Foto
            </FilePreviewTrigger>
          ) : (
            <span className="text-white/40">—</span>
          ),
      },
      {
        key: 'local',
        label: 'Local',
        stopRowClick: true,
        render: (r) =>
          r.latitude != null && r.longitude != null ? (
            <a
              href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
              title={`Precisão: ${r.precisaoGps ?? '?'} m`}
            >
              Mapa
            </a>
          ) : (
            <span className="text-white/40">—</span>
          ),
      },
    );
    if (acoes) {
      cols.push({
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (r) => (
          <span className="text-sm">
            {onEditar ? (
              <button
                type="button"
                onClick={() => onEditar(r)}
                className="text-blue-300 hover:text-blue-200 mr-3"
              >
                Editar
              </button>
            ) : null}
            {onRemover ? (
              <button
                type="button"
                onClick={() => onRemover(r)}
                className="text-red-300 hover:text-red-200"
              >
                Remover
              </button>
            ) : null}
          </span>
        ),
      });
    }
    return cols;
  }, [mostrarUsuario, acoes, onEditar, onRemover]);

  return (
    <DataTable<RegistroPonto>
      columns={columns}
      data={registros}
      keyExtractor={(r) => r.id}
      loading={loading}
      emptyMessage="Nenhum registro no período."
      renderMobileCard={(r) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
          <p className="text-white/75 text-xs">{formatDataHora(r.dataHora)}</p>
          {mostrarUsuario ? (
            <p className="font-medium text-white/95">{r.usuario?.nome ?? `#${r.usuarioId}`}</p>
          ) : null}
          <div>
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                r.tipo === 'ENTRADA'
                  ? 'bg-green-500/20 text-green-200 border border-green-400/30'
                  : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
              }`}
            >
              {TIPO_LABEL[r.tipo]}
            </span>
            {r.origem === 'AJUSTE_RH' ? (
              <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-200 border border-blue-400/30">
                Ajuste RH
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {r.fotoUrl ? (
              <FilePreviewTrigger
                src={r.fotoUrl}
                name="Selfie do ponto"
                variant="link"
                className="text-primary hover:underline"
              >
                Foto
              </FilePreviewTrigger>
            ) : null}
            {r.latitude != null && r.longitude != null ? (
              <a
                href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Mapa
              </a>
            ) : null}
          </div>
          {acoes ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {onEditar ? (
                <button
                  type="button"
                  onClick={() => onEditar(r)}
                  className="text-blue-300 hover:text-blue-200 text-sm"
                >
                  Editar
                </button>
              ) : null}
              {onRemover ? (
                <button
                  type="button"
                  onClick={() => onRemover(r)}
                  className="text-red-300 hover:text-red-200 text-sm"
                >
                  Remover
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    />
  );
}

// ─── Modais ──────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-neutral text-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-white/10">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t border-white/10 flex justify-end gap-2 bg-white/5">{footer}</div>
      </div>
    </div>
  );
}

function isoLocalNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function isoLocal(d: string): string {
  const date = new Date(d);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function CriarAjusteModal({
  usuarios,
  onClose,
  onCreated,
}: {
  usuarios: SimpleUser[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [usuarioId, setUsuarioId] = useState<number | ''>('');
  const [tipo, setTipo] = useState<TipoBatida>('ENTRADA');
  const [dataHora, setDataHora] = useState<string>(isoLocalNow());
  const [justificativa, setJustificativa] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!usuarioId) {
      toast.error('Selecione um usuário.');
      return;
    }
    if (justificativa.trim().length < 5) {
      toast.error('Informe uma justificativa com pelo menos 5 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      await criarAjustePonto({
        usuarioId: Number(usuarioId),
        tipo,
        dataHora: new Date(dataHora).toISOString(),
        justificativa: justificativa.trim(),
        observacao: observacao.trim() || undefined,
      });
      toast.success('Ajuste registrado.');
      onCreated();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalShell
      title="Novo ajuste de ponto"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <Field label="Usuário">
        <select
          value={usuarioId}
          onChange={(e) => setUsuarioId(e.target.value ? Number(e.target.value) : '')}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        >
          <option value="">Selecione...</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tipo">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoBatida)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        >
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
        </select>
      </Field>
      <Field label="Data/Hora">
        <input
          type="datetime-local"
          value={dataHora}
          onChange={(e) => setDataHora(e.target.value)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Justificativa (obrigatória)">
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Observação (opcional)">
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
    </ModalShell>
  );
}

function EditarPontoModal({
  registro,
  onClose,
  onSaved,
}: {
  registro: RegistroPonto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoBatida>(registro.tipo);
  const [dataHora, setDataHora] = useState<string>(isoLocal(registro.dataHora));
  const [justificativa, setJustificativa] = useState('');
  const [observacao, setObservacao] = useState(registro.observacao ?? '');
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (justificativa.trim().length < 5) {
      toast.error('Informe uma justificativa com pelo menos 5 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      await editarPonto(registro.id, {
        tipo,
        dataHora: new Date(dataHora).toISOString(),
        justificativa: justificativa.trim(),
        observacao: observacao.trim() || undefined,
      });
      toast.success('Registro atualizado.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalShell
      title={`Editar ponto #${registro.id}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <Field label="Usuário">
        <input
          value={registro.usuario?.nome ?? `#${registro.usuarioId}`}
          disabled
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm opacity-70"
        />
      </Field>
      <Field label="Tipo">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoBatida)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        >
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
        </select>
      </Field>
      <Field label="Data/Hora">
        <input
          type="datetime-local"
          value={dataHora}
          onChange={(e) => setDataHora(e.target.value)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Justificativa (obrigatória)">
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Observação">
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
    </ModalShell>
  );
}

function RemoverPontoModal({
  registro,
  onClose,
  onRemoved,
}: {
  registro: RegistroPonto;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function handleRemover() {
    if (justificativa.trim().length < 5) {
      toast.error('Informe uma justificativa com pelo menos 5 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      await removerPonto(registro.id, justificativa.trim());
      toast.success('Registro removido.');
      onRemoved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalShell
      title={`Remover ponto #${registro.id}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleRemover}
            disabled={salvando}
            className="px-3 py-2 rounded bg-red-500 text-white font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Removendo...' : 'Confirmar remoção'}
          </button>
        </>
      }
    >
      <p className="text-sm text-white/70">
        {registro.usuario?.nome ?? `#${registro.usuarioId}`} — {TIPO_LABEL[registro.tipo]} em{' '}
        {formatDataHora(registro.dataHora)}
      </p>
      <Field label="Justificativa (obrigatória)">
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          rows={3}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-white/60 block mb-1">{label}</label>
      {children}
    </div>
  );
}
