import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { exportarFolhaCsv, getIndicadoresRh, type IndicadoresRh } from '../../services/rh';
import type { SimpleUser } from '../../types/stock';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { DataTable, type DataTableColumn } from '../DataTable';
import { Card, Field, competenciaCorrente, formatHoras } from './rhUi';

type LinhaCargo = { cargoId: number; nome: string; total: number };

const colunasPorCargo: DataTableColumn<LinhaCargo>[] = [
  {
    key: 'nome',
    label: 'Nome do cargo',
    render: (c) => <span className="font-medium text-white/90">{c.nome}</span>,
  },
  {
    key: 'qtd',
    label: 'Qtd.',
    align: 'right',
    thClassName: 'w-24',
    render: (c) => <span className="tabular-nums text-white/80">{c.total}</span>,
  },
];

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 1º dia do mês até o último dia do mês ou hoje (o que for menor) — alinhado ao corte de faltas no backend. */
function rangePadraoParaMes(mes: string): { dataInicio: string; dataFim: string } {
  const [y, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ini = `${y}-${pad(m)}-01`;
  const ultimoStr = `${y}-${pad(m)}-${pad(ultimoDia)}`;
  const hoje = ymdLocal(new Date());
  if (hoje < ini) {
    return { dataInicio: ini, dataFim: ini };
  }
  if (hoje > ultimoStr) {
    return { dataInicio: ini, dataFim: ultimoStr };
  }
  return { dataInicio: ini, dataFim: hoje };
}

function formatPeriodoBr(ini: string, fim: string): string {
  try {
    const a = new Date(`${ini}T12:00:00`);
    const b = new Date(`${fim}T12:00:00`);
    return `${a.toLocaleDateString('pt-BR')} – ${b.toLocaleDateString('pt-BR')}`;
  } catch {
    return `${ini} – ${fim}`;
  }
}

const inputFiltroClass =
  'w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50';

export function TabDashboardRh() {
  const user = useAuthStore((s) => s.user);
  const podeExportar = userHasPermission(user, 'folha:exportar');

  const mesInicial = competenciaCorrente();
  const rangeInicial = rangePadraoParaMes(mesInicial);
  const [mes, setMes] = useState<string>(mesInicial);
  const [dataInicio, setDataInicio] = useState<string>(rangeInicial.dataInicio);
  const [dataFim, setDataFim] = useState<string>(rangeInicial.dataFim);
  const [colaboradores, setColaboradores] = useState<SimpleUser[]>([]);
  const [usuarioId, setUsuarioId] = useState<number | ''>('');
  const [data, setData] = useState<IndicadoresRh | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: opts } = await api.get<SimpleUser[]>('/users/options');
        if (!cancelled) {
          setColaboradores([...opts].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
        }
      } catch (err) {
        toast.error(formatApiError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const carregar = useCallback(async () => {
    if (usuarioId === '') {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const r = await getIndicadoresRh(mes, usuarioId, dataInicio, dataFim);
      setData(r);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [mes, usuarioId, dataInicio, dataFim]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const temSelecao = usuarioId !== '';

  const nomeColaboradorSelecionado = useMemo(() => {
    if (usuarioId === '') return '';
    return colaboradores.find((c) => c.id === usuarioId)?.nome ?? '—';
  }, [colaboradores, usuarioId]);

  const linhaPeriodo = data?.periodoDescricao ?? formatPeriodoBr(dataInicio, dataFim);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20 overflow-hidden">
        <header className="px-4 sm:px-5 py-4 border-b border-white/10 bg-gradient-to-r from-white/[0.06] to-transparent">
          <h2 className="text-lg font-semibold tracking-tight text-white">Indicadores</h2>
          <p className="text-sm text-white/55 mt-1">
            Período analisado: <span className="text-white/90 tabular-nums">{linhaPeriodo}</span>
          </p>
        </header>

        <div className="p-4 sm:p-5 space-y-5">
          <div className="rounded-lg border border-white/10 bg-black/25 p-4 sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45 mb-3">Filtros</p>
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 lg:items-end min-w-0">
              <div className={`sm:col-span-2 ${podeExportar ? 'lg:col-span-4' : 'lg:col-span-6'}`}>
                <Field label="Colaborador">
                  <select
                    value={usuarioId === '' ? '' : String(usuarioId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsuarioId(v === '' ? '' : Number(v));
                    }}
                    className={inputFiltroClass}
                  >
                    <option value="">Selecione um colaborador…</option>
                    {colaboradores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="lg:col-span-2">
                <Field label="Mês de referência">
                  <input
                    type="month"
                    value={mes}
                    onChange={(e) => {
                      const nv = e.target.value || competenciaCorrente();
                      setMes(nv);
                      const r = rangePadraoParaMes(nv);
                      setDataInicio(r.dataInicio);
                      setDataFim(r.dataFim);
                    }}
                    className={inputFiltroClass}
                  />
                </Field>
              </div>
              <div className="lg:col-span-2">
                <Field label="Data inicial">
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setDataInicio(v);
                      if (dataFim < v) setDataFim(v);
                      const ym = v.slice(0, 7);
                      if (/^\d{4}-\d{2}$/.test(ym)) setMes(ym);
                    }}
                    className={inputFiltroClass}
                  />
                </Field>
              </div>
              <div className="lg:col-span-2">
                <Field label="Data final">
                  <input
                    type="date"
                    value={dataFim}
                    min={dataInicio}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setDataFim(v);
                    }}
                    className={inputFiltroClass}
                  />
                </Field>
              </div>
              {podeExportar ? (
                <div className="sm:col-span-2 lg:col-span-2 min-w-0">
                  <Field label="Folha">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await exportarFolhaCsv(mes);
                          toast.success('Folha exportada.');
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                      className="w-full min-h-[2.25rem] rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 active:bg-white/20 transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4 shrink-0 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      <span className="truncate">Exportar CSV</span>
                    </button>
                  </Field>
                </div>
              ) : null}
            </div>
          </div>

          {!temSelecao ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border border-dashed border-white/20 bg-white/[0.02]">
              <div className="rounded-full bg-white/5 p-4 mb-4 ring-1 ring-white/10">
                <svg
                  className="w-10 h-10 text-white/35"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-white/90 text-center">Selecione um colaborador</p>
              <p className="text-sm text-white/60 text-center mt-2 max-w-md leading-relaxed">
                Escolha alguém na lista acima para ver horas, faltas, absenteísmo e demais indicadores do período
                configurado.
              </p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-9 w-9 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
              <p className="text-sm text-white/65">Carregando indicadores…</p>
            </div>
          ) : !data ? (
            <p className="text-center text-white/65 py-12">Nenhum dado para exibir.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <KpiBox label="Colaborador" valor={nomeColaboradorSelecionado} />
              <KpiBox label="Dias úteis no período" valor={String(data.diasUteis)} />
              <KpiBox label="Horas trabalhadas" valor={formatHoras(data.trabalhadoMin)} />
              <KpiBox label="Horas extras" valor={formatHoras(data.extraMin)} accent="text-green-300" />
              <KpiBox label="Atrasos" valor={formatHoras(data.atrasoMin)} accent="text-amber-300" />
              <KpiBox label="Faltas" valor={String(data.faltas)} accent="text-red-300" />
              <KpiBox label="Absenteísmo" valor={`${data.absenteismoPct}%`} />
              <KpiBox label="Afastamentos no período" valor={String(data.afastamentosNoMes)} />
              <KpiBox label="Férias pendentes" valor={String(data.feriasPendentes)} />
              <KpiBox label="Documentos a vencer" valor={String(data.documentosVencendo)} />
            </div>
          )}
        </div>
      </section>

      {temSelecao && data && data.porCargo.length > 0 ? (
        <Card title="Cargo">
          <div className="-m-1">
            <DataTable<LinhaCargo>
              columns={colunasPorCargo}
              data={data.porCargo}
              keyExtractor={(c) => c.cargoId}
              renderMobileCard={(c) => (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm flex items-center justify-between gap-3">
                  <span className="font-medium text-white/90">{c.nome}</span>
                  <span className="tabular-nums text-white/80">{c.total}</span>
                </div>
              )}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function KpiBox({ label, valor, accent }: { label: string; valor: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-4 py-3.5 min-h-[5.25rem] flex flex-col justify-center transition-colors hover:border-white/15">
      <p className="text-[11px] uppercase tracking-wide text-white/55 leading-tight">{label}</p>
      <p className={`text-lg sm:text-xl font-semibold tabular-nums mt-1.5 leading-snug break-words ${accent ?? 'text-white'}`}>
        {valor}
      </p>
    </div>
  );
}
