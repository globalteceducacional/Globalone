import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  aceitarMeuRecibo,
  exportarEspelhoCsv,
  getEspelho,
  getMeuRecibo,
  getReciboPorUsuario,
  type EspelhoMes,
  type EspelhoStatus,
  type ReciboFechamento,
} from '../services/rh';
import { useAuthStore } from '../store/auth';
import { userHasPermission } from '../utils/projectAccess';
import { toast, formatApiError } from '../utils/toast';

/**
 * Tela de Espelho de Ponto visual do colaborador.
 *
 * - Grid mensal por dia (status colorido: presente, falta, atestado, férias, etc.).
 * - Totais (esperado, trabalhado, saldo, atrasos, extras).
 * - Botão de baixar recibo (se a competência estiver fechada).
 * - Botão de aceitar recibo (uma única vez por competência).
 *
 * Acesso:
 *  - `/rh/espelho` mostra o espelho do próprio usuário logado.
 *  - `/rh/espelho/:usuarioId` permite ao RH ver o espelho de qualquer colaborador.
 */

type Aba = 'espelho' | 'recibo';

const STATUS_LABEL: Record<EspelhoStatus, string> = {
  PRESENTE: 'Presente',
  INCOMPLETO: 'Incompleto',
  FALTA: 'Falta',
  NAO_UTIL: 'Não útil',
  ATESTADO: 'Atestado',
  LICENCA: 'Licença',
  FERIAS: 'Férias',
  FERIADO: 'Feriado',
  FALTA_ABONADA: 'Falta abonada',
  HOME_OFFICE: 'Home office',
};

const STATUS_COR: Record<EspelhoStatus, string> = {
  PRESENTE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  INCOMPLETO: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  FALTA: 'bg-red-500/20 text-red-300 border-red-500/40',
  NAO_UTIL: 'bg-zinc-700/40 text-zinc-400 border-zinc-700/60',
  ATESTADO: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  LICENCA: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  FERIAS: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  FERIADO: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
  FALTA_ABONADA: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  HOME_OFFICE: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
};

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMin(min: number): string {
  if (Number.isNaN(min)) return '0min';
  const sinal = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sinal}${m}min`;
  return `${sinal}${h}h${String(m).padStart(2, '0')}`;
}

function formatHora(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default function RhEspelho() {
  const params = useParams<{ usuarioId?: string }>();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const usuarioIdParam = params.usuarioId ? Number(params.usuarioId) : null;
  const visaoOutroUsuario = usuarioIdParam !== null && usuarioIdParam !== user?.id;
  const podeVerTodos = userHasPermission(user, 'banco_horas:ver_todos') || userHasPermission(user, 'ponto:ver_todos');

  const [aba, setAba] = useState<Aba>(() => (search.get('aba') as Aba) || 'espelho');
  const [mes, setMes] = useState<string>(() => search.get('mes') || mesAtual());
  const [espelho, setEspelho] = useState<EspelhoMes | null>(null);
  const [recibo, setRecibo] = useState<ReciboFechamento | null>(null);
  const [loading, setLoading] = useState(false);
  const [reciboLoading, setReciboLoading] = useState(false);
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mes', mes);
      next.set('aba', aba);
      return next;
    }, { replace: true });
  }, [mes, aba, setSearch]);

  const carregarEspelho = useCallback(async () => {
    setLoading(true);
    try {
      const usuarioId = visaoOutroUsuario ? usuarioIdParam! : undefined;
      const data = await getEspelho({ mes, usuarioId });
      setEspelho(data);
    } catch (err) {
      toast.error(`Não foi possível carregar o espelho. ${formatApiError(err)}`);
      setEspelho(null);
    } finally {
      setLoading(false);
    }
  }, [mes, usuarioIdParam, visaoOutroUsuario]);

  const carregarRecibo = useCallback(async () => {
    setReciboLoading(true);
    try {
      const data = visaoOutroUsuario
        ? await getReciboPorUsuario(usuarioIdParam!, mes)
        : await getMeuRecibo(mes);
      setRecibo(data);
    } catch {
      // Se a competência não foi fechada, o backend retorna 404 — silencioso.
      setRecibo(null);
    } finally {
      setReciboLoading(false);
    }
  }, [mes, usuarioIdParam, visaoOutroUsuario]);

  useEffect(() => {
    void carregarEspelho();
  }, [carregarEspelho]);

  useEffect(() => {
    void carregarRecibo();
  }, [carregarRecibo]);

  const aceitarRecibo = async () => {
    if (visaoOutroUsuario) return;
    setAceitando(true);
    try {
      await aceitarMeuRecibo(mes);
      toast.success('Recibo aceito com sucesso.');
      await carregarRecibo();
    } catch (err) {
      toast.error(`Não foi possível aceitar o recibo. ${formatApiError(err)}`);
    } finally {
      setAceitando(false);
    }
  };

  const exportar = async () => {
    try {
      const usuarioId = visaoOutroUsuario ? usuarioIdParam! : undefined;
      await exportarEspelhoCsv({ mes, usuarioId });
      toast.success('CSV exportado.');
    } catch (err) {
      toast.error(`Falha ao exportar CSV. ${formatApiError(err)}`);
    }
  };

  const totais = espelho?.totais;
  const colaboradorNome = recibo?.fechamento.usuario.nome ?? user?.nome ?? '—';

  const linhasMes = useMemo(() => espelho?.dias ?? [], [espelho]);

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Espelho de Ponto</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm"
          />
          <button
            onClick={exportar}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            Exportar CSV
          </button>
          {podeVerTodos && (
            <button
              onClick={() => navigate('/rh')}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Voltar ao RH
            </button>
          )}
        </div>
      </div>
      <p className="mb-4 text-sm text-white/60">
        Colaborador: <span className="font-medium text-white">{colaboradorNome}</span>
      </p>

      <div className="mb-4 flex gap-2 border-b border-white/10">
        <button
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === 'espelho' ? 'border-emerald-500 text-white' : 'border-transparent text-white/60'}`}
          onClick={() => setAba('espelho')}
        >
          Espelho
        </button>
        <button
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === 'recibo' ? 'border-emerald-500 text-white' : 'border-transparent text-white/60'}`}
          onClick={() => setAba('recibo')}
        >
          Recibo do mês
        </button>
      </div>

      {aba === 'espelho' && (
        <div>
          {totais && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <KPI label="Dias úteis" value={totais.diasUteis} />
              <KPI label="Trabalhado" value={formatMin(totais.trabalhadoMin)} />
              <KPI label="Esperado" value={formatMin(totais.esperadoMin)} />
              <KPI
                label="Saldo"
                value={formatMin(totais.saldoMin)}
                tone={totais.saldoMin >= 0 ? 'pos' : 'neg'}
              />
              <KPI label="Atrasos" value={formatMin(totais.atrasoMin)} tone={totais.atrasoMin > 0 ? 'neg' : undefined} />
              <KPI label="Extras" value={formatMin(totais.extraMin)} tone={totais.extraMin > 0 ? 'pos' : undefined} />
              <KPI label="Faltas / Incompletos" value={`${totais.faltas} / ${totais.incompletos}`} />
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase text-white/60">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Entrada</th>
                  <th className="px-3 py-2 text-right">Saída</th>
                  <th className="px-3 py-2 text-right">Trabalhado</th>
                  <th className="px-3 py-2 text-right">Esperado</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2 text-right">Atraso</th>
                  <th className="px-3 py-2 text-right">Extra</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-white/60">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loading && linhasMes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-white/60">
                      Sem registros no período.
                    </td>
                  </tr>
                )}
                {linhasMes.map((d) => (
                  <tr key={d.data} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium">{d.data.split('-').reverse().join('/')}</div>
                      <div className="text-xs text-white/50">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.diaSemana]}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_COR[d.status]}`}
                        title={d.coberturaMotivo ?? undefined}
                      >
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatHora(d.entrada)}</td>
                    <td className="px-3 py-2 text-right">{formatHora(d.saida)}</td>
                    <td className="px-3 py-2 text-right">{formatMin(d.trabalhadoMin)}</td>
                    <td className="px-3 py-2 text-right">{formatMin(d.esperadoMin)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${d.saldoMin > 0 ? 'text-emerald-300' : d.saldoMin < 0 ? 'text-red-300' : ''}`}
                    >
                      {formatMin(d.saldoMin)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatMin(d.atrasoMin)}</td>
                    <td className="px-3 py-2 text-right">{formatMin(d.extraMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === 'recibo' && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          {reciboLoading && <p className="text-white/60">Carregando recibo…</p>}
          {!reciboLoading && !recibo && (
            <div>
              <p className="text-white/70">
                A competência <strong>{mes}</strong> ainda não foi fechada. O recibo é gerado quando o RH
                fecha o mês.
              </p>
            </div>
          )}
          {!reciboLoading && recibo && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <KPI label="Saldo anterior" value={formatMin(recibo.fechamento.saldoAnteriorMin)} />
                <KPI label="Crédito do mês" value={formatMin(recibo.fechamento.creditoMin)} tone="pos" />
                <KPI label="Débito do mês" value={formatMin(recibo.fechamento.debitoMin)} tone="neg" />
                <KPI
                  label="Saldo final"
                  value={formatMin(recibo.fechamento.saldoFinalMin)}
                  tone={recibo.fechamento.saldoFinalMin >= 0 ? 'pos' : 'neg'}
                />
                <KPI
                  label="Faixa NSR"
                  value={
                    recibo.fechamento.nsrInicial != null
                      ? `${recibo.fechamento.nsrInicial} – ${recibo.fechamento.nsrFinal}`
                      : '—'
                  }
                />
                <KPI
                  label="Aceite"
                  value={
                    recibo.fechamento.aceiteEm
                      ? new Date(recibo.fechamento.aceiteEm).toLocaleString('pt-BR')
                      : 'Pendente'
                  }
                  tone={recibo.fechamento.aceiteEm ? 'pos' : undefined}
                />
              </div>

              {recibo.empregador && (
                <div className="rounded border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="text-white/60">Empregador</div>
                  <div className="font-medium">{recibo.empregador.razaoSocial}</div>
                  <div className="text-xs text-white/60">
                    Identificador: {recibo.empregador.identificador}
                    {recibo.empregador.cei ? ` · CEI ${recibo.empregador.cei}` : ''}
                  </div>
                </div>
              )}

              <div className="rounded border border-white/10 bg-white/5 p-3 text-xs">
                <div className="text-white/60">Hash do recibo (integridade)</div>
                <div className="break-all font-mono">{recibo.fechamento.reciboHash ?? '—'}</div>
              </div>

              {!visaoOutroUsuario && (
                <div className="flex items-center justify-end gap-3">
                  {recibo.fechamento.aceiteEm ? (
                    <span className="text-sm text-emerald-300">
                      Recibo aceito em {new Date(recibo.fechamento.aceiteEm).toLocaleString('pt-BR')}.
                    </span>
                  ) : (
                    <button
                      onClick={aceitarRecibo}
                      disabled={aceitando}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {aceitando ? 'Aceitando…' : 'Aceitar recibo'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'pos' | 'neg';
}) {
  const cor = tone === 'pos' ? 'text-emerald-300' : tone === 'neg' ? 'text-red-300' : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs uppercase text-white/50">{label}</div>
      <div className={`text-lg font-semibold ${cor}`}>{value}</div>
    </div>
  );
}
