import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../DataTable';
import {
  abrirFerias,
  aprovarFerias,
  getResumoFerias,
  listarFerias,
  reprovarFerias,
  type FeriasSolicitacao,
  type PeriodoAquisitivo,
  type SolicitacaoStatus,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { Card, Field, Modal, StatusBadge, formatData } from './rhUi';

type StatusFiltro = 'all' | SolicitacaoStatus;

const STATUS_OPCOES: { value: StatusFiltro; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'APROVADO', label: 'Aprovado' },
  { value: 'REPROVADO', label: 'Reprovado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

/** Faz a comparação YYYY-MM-DD considerando que o backend já entrega ISO/ISO-date. */
function dentroIntervalo(
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

export function TabFerias() {
  const user = useAuthStore((s) => s.user);
  const podeAprovar = userHasPermission(user, 'ferias:aprovar');
  const podeSolicitar = userHasPermission(user, 'ferias:solicitar');

  const [resumo, setResumo] = useState<{
    saldoDias: number;
    periodos: PeriodoAquisitivo[];
    solicitacoes: FeriasSolicitacao[];
  } | null>(null);
  const [fila, setFila] = useState<FeriasSolicitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);
  const [decidindo, setDecidindo] = useState<{ id: number; acao: 'aprovar' | 'reprovar' } | null>(null);

  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('all');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [diasMin, setDiasMin] = useState('');
  const [diasMax, setDiasMax] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, f] = await Promise.all([
        getResumoFerias().catch(() => null),
        podeAprovar ? listarFerias() : Promise.resolve([]),
      ]);
      setResumo(r);
      setFila(f);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [podeAprovar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const colunasMinhasFerias = useMemo((): DataTableColumn<FeriasSolicitacao>[] => {
    return [
      {
        key: 'periodo',
        label: 'Período',
        render: (s) => (
          <>
            {formatData(s.dataInicio)} → {formatData(s.dataFim)}
          </>
        ),
      },
      { key: 'dias', label: 'Dias', render: (s) => s.diasSolicitados },
      { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
      {
        key: 'comentario',
        label: 'Comentário',
        render: (s) => <span className="text-xs text-white/70">{s.comentarioRevisor ?? '—'}</span>,
      },
    ];
  }, []);

  const colunasFilaFerias = useMemo((): DataTableColumn<FeriasSolicitacao>[] => {
    return [
      {
        key: 'colaborador',
        label: 'Colaborador',
        render: (s) => s.usuario?.nome ?? `#${s.usuarioId}`,
      },
      {
        key: 'periodo',
        label: 'Período',
        render: (s) => (
          <>
            {formatData(s.dataInicio)} → {formatData(s.dataFim)}
          </>
        ),
      },
      { key: 'dias', label: 'Dias', render: (s) => s.diasSolicitados },
      { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
      {
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        thClassName: 'whitespace-nowrap',
        tdClassName: 'whitespace-nowrap',
        render: (s) =>
          s.status === 'PENDENTE' ? (
            <>
              <button
                type="button"
                onClick={() => setDecidindo({ id: s.id, acao: 'aprovar' })}
                className="text-green-300 hover:text-green-200 mr-3"
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => setDecidindo({ id: s.id, acao: 'reprovar' })}
                className="text-red-300 hover:text-red-200"
              >
                Reprovar
              </button>
            </>
          ) : (
            <span className="text-white/50 text-xs">Decidido</span>
          ),
      },
    ];
  }, []);

  const filtrarSolicitacao = useCallback(
    (s: FeriasSolicitacao, aplicarBusca: boolean): boolean => {
      if (statusFiltro !== 'all' && s.status !== statusFiltro) return false;
      if (!dentroIntervalo(s.dataInicio, s.dataFim, dataDe, dataAte)) return false;

      const min = diasMin.trim() ? Number.parseInt(diasMin, 10) : null;
      const max = diasMax.trim() ? Number.parseInt(diasMax, 10) : null;
      if (min !== null && Number.isFinite(min) && s.diasSolicitados < min) return false;
      if (max !== null && Number.isFinite(max) && s.diasSolicitados > max) return false;

      if (aplicarBusca) {
        const termo = busca.trim().toLowerCase();
        if (termo) {
          const alvo = `${s.usuario?.nome ?? ''} ${s.usuario?.email ?? ''}`.toLowerCase();
          if (!alvo.includes(termo)) return false;
        }
      }
      return true;
    },
    [statusFiltro, dataDe, dataAte, diasMin, diasMax, busca],
  );

  const minhasFiltradas = useMemo(
    () => (resumo?.solicitacoes ?? []).filter((s) => filtrarSolicitacao(s, false)),
    [resumo, filtrarSolicitacao],
  );

  const filaFiltrada = useMemo(
    () => fila.filter((s) => filtrarSolicitacao(s, true)),
    [fila, filtrarSolicitacao],
  );

  const filtrosAtivos =
    busca.trim().length > 0 ||
    statusFiltro !== 'all' ||
    dataDe !== '' ||
    dataAte !== '' ||
    diasMin.trim() !== '' ||
    diasMax.trim() !== '';

  const limparFiltros = () => {
    setBusca('');
    setStatusFiltro('all');
    setDataDe('');
    setDataAte('');
    setDiasMin('');
    setDiasMax('');
  };

  return (
    <div className="space-y-4">
      {resumo || podeAprovar ? (
        <CollapsibleFilters
          show={showFiltros}
          setShow={setShowFiltros}
          hasActiveFilters={filtrosAtivos}
          onClear={limparFiltros}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {podeAprovar ? (
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Buscar colaborador</label>
                <input
                  type="text"
                  placeholder="Nome ou e-mail (fila de aprovação)…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Status</label>
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value as StatusFiltro)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              >
                {STATUS_OPCOES.map((o) => (
                  <option key={o.value} value={o.value} className="bg-neutral text-white">
                    {o.label}
                  </option>
                ))}
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
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Dias mínimos</label>
              <input
                type="number"
                min={1}
                value={diasMin}
                onChange={(e) => setDiasMin(e.target.value)}
                placeholder="Ex.: 5"
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Dias máximos</label>
              <input
                type="number"
                min={1}
                value={diasMax}
                onChange={(e) => setDiasMax(e.target.value)}
                placeholder="Ex.: 30"
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </CollapsibleFilters>
      ) : null}

      {resumo ? (
        <Card
          title="Minhas férias"
          actions={
            podeSolicitar ? (
              <button
                onClick={() => setCriando(true)}
                className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold"
              >
                Solicitar férias
              </button>
            ) : null
          }
        >
          <div className="flex flex-wrap gap-3 mb-3">
            <Box label="Saldo total" valor={`${resumo.saldoDias} dias`} />
            <Box label="Períodos aquisitivos" valor={String(resumo.periodos.length)} />
            <Box label="Solicitações" valor={String(resumo.solicitacoes.length)} />
          </div>
          <DataTable<FeriasSolicitacao>
            columns={colunasMinhasFerias}
            data={minhasFiltradas}
            keyExtractor={(s) => s.id}
            loading={loading}
            emptyMessage={
              filtrosAtivos
                ? 'Nenhuma solicitação atende aos filtros aplicados.'
                : 'Nenhuma solicitação.'
            }
            renderMobileCard={(s) => (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
                <p className="text-white/85">
                  {formatData(s.dataInicio)} → {formatData(s.dataFim)}
                </p>
                <p className="text-white/60 text-xs">{s.diasSolicitados} dias</p>
                <StatusBadge status={s.status} />
                <p className="text-white/55 text-xs">{s.comentarioRevisor ?? '—'}</p>
              </div>
            )}
          />
        </Card>
      ) : null}

      {podeAprovar ? (
        <Card title="Fila de aprovação">
          <DataTable<FeriasSolicitacao>
            columns={colunasFilaFerias}
            data={filaFiltrada}
            keyExtractor={(s) => s.id}
            emptyMessage={
              filtrosAtivos
                ? 'Nenhuma solicitação atende aos filtros aplicados.'
                : 'Sem solicitações na fila.'
            }
            renderMobileCard={(s) => (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
                <p className="font-medium text-white/95">{s.usuario?.nome ?? `#${s.usuarioId}`}</p>
                <p className="text-white/75 text-xs">
                  {formatData(s.dataInicio)} → {formatData(s.dataFim)} · {s.diasSolicitados} dias
                </p>
                <StatusBadge status={s.status} />
                {s.status === 'PENDENTE' ? (
                  <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setDecidindo({ id: s.id, acao: 'aprovar' })}
                      className="text-green-300 hover:text-green-200 text-sm"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecidindo({ id: s.id, acao: 'reprovar' })}
                      className="text-red-300 hover:text-red-200 text-sm"
                    >
                      Reprovar
                    </button>
                  </div>
                ) : (
                  <p className="text-white/45 text-xs">Decidido</p>
                )}
              </div>
            )}
          />
        </Card>
      ) : null}

      {criando ? (
        <CriarFeriasModal
          periodos={resumo?.periodos ?? []}
          onClose={() => setCriando(false)}
          onSaved={() => {
            setCriando(false);
            void carregar();
          }}
        />
      ) : null}

      {decidindo ? (
        <DecidirFeriasModal
          id={decidindo.id}
          acao={decidindo.acao}
          onClose={() => setDecidindo(null)}
          onSaved={() => {
            setDecidindo(null);
            void carregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Box({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 min-w-[140px]">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className="text-xl font-semibold">{valor}</p>
    </div>
  );
}

function CriarFeriasModal({
  periodos,
  onClose,
  onSaved,
}: {
  periodos: PeriodoAquisitivo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [periodoAquisitivoId, setPeriodoAquisitivoId] = useState<number | ''>('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!dataInicio || !dataFim) {
      toast.error('Informe datas de início e fim.');
      return;
    }
    setSalvando(true);
    try {
      await abrirFerias({
        dataInicio,
        dataFim,
        observacao: observacao.trim() || undefined,
        periodoAquisitivoId: periodoAquisitivoId || undefined,
      });
      toast.success('Solicitação enviada.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Solicitar férias"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50">
            {salvando ? 'Enviando...' : 'Enviar'}
          </button>
        </>
      }
    >
      <Field label="Data de início">
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
      </Field>
      <Field label="Data de fim">
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
      </Field>
      {periodos.length > 0 ? (
        <Field label="Período aquisitivo (opcional)">
          <select
            value={periodoAquisitivoId}
            onChange={(e) => setPeriodoAquisitivoId(e.target.value ? Number(e.target.value) : '')}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          >
            <option value="">Selecione...</option>
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {formatData(p.inicio)} → {formatData(p.fim)} (saldo {p.diasDireito - p.diasUsados})
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Observação">
        <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
      </Field>
    </Modal>
  );
}

function DecidirFeriasModal({
  id,
  acao,
  onClose,
  onSaved,
}: {
  id: number;
  acao: 'aprovar' | 'reprovar';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function decidir() {
    setSalvando(true);
    try {
      if (acao === 'aprovar') await aprovarFerias(id, comentario.trim() || undefined);
      else await reprovarFerias(id, comentario.trim() || undefined);
      toast.success(acao === 'aprovar' ? 'Aprovado.' : 'Reprovado.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={acao === 'aprovar' ? 'Aprovar férias' : 'Reprovar férias'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">Cancelar</button>
          <button onClick={decidir} disabled={salvando} className={`px-3 py-2 rounded font-semibold text-sm disabled:opacity-50 ${acao === 'aprovar' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {salvando ? 'Processando...' : 'Confirmar'}
          </button>
        </>
      }
    >
      <Field label="Comentário (opcional)">
        <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm" />
      </Field>
    </Modal>
  );
}
