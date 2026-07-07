import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchFinanceiroPagamentosMensais,
  type FinanceiroPagamentoLinha,
} from '../../services/financeiroPagamentos';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { btn } from '../../utils/buttonStyles';
import { formatApiError, toast } from '../../utils/toast';
import {
  Card,
  FinanceiroBarraCompetencia,
  FinanceiroDataTable,
  FinanceiroResumoKpi,
  LABEL_REM,
  competenciaCorrente,
  filtrarPorTexto,
  fmtBrl,
  fmtHoras,
  fmtSaldo,
  inputFiltroCls,
  selectFiltroCls,
  financeiroCardMobileCls,
  type DataTableColumn,
} from './financeiroUi';

type FechamentoFiltro = 'all' | 'aberto' | 'fechado';
type SaldoMesFiltro = 'all' | 'positivo' | 'negativo' | 'zero';

export function TabFinanceiroFechamento() {
  const [mes, setMes] = useState(competenciaCorrente);
  const [linhas, setLinhas] = useState<FinanceiroPagamentoLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [fechamentoFiltro, setFechamentoFiltro] = useState<FechamentoFiltro>('all');
  const [saldoMesFiltro, setSaldoMesFiltro] = useState<SaldoMesFiltro>('all');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchFinanceiroPagamentosMensais(mes);
      setLinhas(r.linhas ?? []);
    } catch (e: unknown) {
      toast.error(formatApiError(e));
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const matchSaldo = (min: number, f: SaldoMesFiltro) => {
    if (f === 'all') return true;
    if (f === 'positivo') return min > 0;
    if (f === 'negativo') return min < 0;
    return min === 0;
  };

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (!filtrarPorTexto(l.nome, busca)) return false;
      if (fechamentoFiltro === 'aberto' && l.fechado) return false;
      if (fechamentoFiltro === 'fechado' && !l.fechado) return false;
      if (!matchSaldo(l.saldoMesMin, saldoMesFiltro)) return false;
      return true;
    });
  }, [linhas, busca, fechamentoFiltro, saldoMesFiltro]);

  const filtrosAtivos =
    busca.trim().length > 0 || fechamentoFiltro !== 'all' || saldoMesFiltro !== 'all';

  const totais = useMemo(() => {
    let valorBase = 0;
    let valorExtras = 0;
    let valorTotal = 0;
    let fechados = 0;
    let comRemuneracao = 0;
    for (const l of linhasFiltradas) {
      if (l.fechado) fechados += 1;
      if (l.valorTotal != null) {
        comRemuneracao += 1;
        valorTotal += l.valorTotal;
        if (l.valorBase != null) valorBase += l.valorBase;
        if (l.valorExtras != null) valorExtras += l.valorExtras;
      }
    }
    return {
      total: linhasFiltradas.length,
      fechados,
      abertos: linhasFiltradas.length - fechados,
      comRemuneracao,
      valorBase,
      valorExtras,
      valorTotal,
    };
  }, [linhasFiltradas]);

  const colunas = useMemo((): DataTableColumn<FinanceiroPagamentoLinha>[] => [
    {
      key: 'nome',
      label: 'Colaborador',
      render: (l) => <span className="font-medium text-white/95">{l.nome}</span>,
    },
    {
      key: 'rem',
      label: 'Remuneração',
      render: (l) => (
        <div className="text-xs text-white/65">
          {LABEL_REM[l.remuneracaoPontoTipo] ?? l.remuneracaoPontoTipo}
          {l.remuneracaoPontoTipo === 'MENSAL_META_HORAS' && l.metaAtingida != null ? (
            <span className="block text-white/45">{l.metaAtingida ? 'Meta atingida' : 'Proporcional'}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'horasPagas',
      label: 'Horas pagas',
      align: 'right',
      tdClassName: 'tabular-nums text-white/80',
      render: (l) => fmtHoras(l.horasBasePagasMin),
    },
    {
      key: 'banco',
      label: 'No banco',
      align: 'right',
      render: (l) =>
        l.extraBancoMin > 0 ? (
          <span className="tabular-nums text-xs text-sky-200/85">{fmtHoras(l.extraBancoMin)}</span>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: 'extras',
      label: 'Extras pagos',
      align: 'right',
      render: (l) =>
        l.extrasPagosMin > 0 ? (
          <span className="tabular-nums text-xs text-emerald-200/85">{fmtHoras(l.extrasPagosMin)}</span>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: 'deficit',
      label: 'Déficit',
      align: 'right',
      render: (l) =>
        l.deficitMesMin > 0 ? (
          <span className="tabular-nums text-xs text-rose-200/90" title={l.descontoDeficit != null ? `≈ ${fmtBrl(l.descontoDeficit)} no valor base` : undefined}>
            {fmtHoras(l.deficitMesMin)}
          </span>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: 'valorBase',
      label: 'Valor base',
      align: 'right',
      tdClassName: 'tabular-nums text-white/85',
      render: (l) => fmtBrl(l.valorBase),
    },
    {
      key: 'valorExtras',
      label: 'Extras R$',
      align: 'right',
      render: (l) =>
        l.valorExtras != null && l.valorExtras > 0 ? (
          <span className="tabular-nums text-white/85">{fmtBrl(l.valorExtras)}</span>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      tdClassName: 'tabular-nums font-medium text-primary',
      render: (l) => fmtBrl(l.valorTotal),
    },
    {
      key: 'saldoAnt',
      label: 'Saldo ant.',
      align: 'right',
      render: (l) =>
        l.saldoAnteriorMin > 0 ? (
          <span className="tabular-nums text-xs text-sky-200/85">{fmtSaldo(l.saldoAnteriorMin)}</span>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: 'saldoMes',
      label: 'Saldo mês',
      align: 'right',
      render: (l) => (
        <span className={`tabular-nums text-xs ${l.saldoMesMin >= 0 ? 'text-emerald-200/85' : 'text-rose-200/85'}`}>
          {fmtSaldo(l.saldoMesMin)}
        </span>
      ),
    },
    {
      key: 'saldoAcum',
      label: 'Banco',
      align: 'right',
      render: (l) => (
        <span className={`tabular-nums text-xs ${l.saldoAcumuladoMin > 0 ? 'text-emerald-200/90' : 'text-white/40'}`}>
          {l.saldoAcumuladoMin > 0 ? fmtSaldo(l.saldoAcumuladoMin) : '0h'}
        </span>
      ),
    },
    {
      key: 'bh',
      label: 'BH',
      render: (l) => <span className="text-xs text-white/45">{l.fechado ? 'Fechado' : 'Aberto'}</span>,
    },
    {
      key: 'acao',
      label: 'Ação',
      align: 'right',
      stopRowClick: true,
      render: (l) => (
        <Link
          to={`/rh/banco-horas/${l.usuarioId}?competencia=${encodeURIComponent(mes)}`}
          className="text-primary hover:text-primary/80 text-xs font-medium"
        >
          Extrato
        </Link>
      ),
    },
  ], [mes]);

  return (
    <div className="space-y-4">
      <FinanceiroBarraCompetencia
        descricao={
          <>
            Pagamentos por competência. Déficit reduz o valor e <strong className="text-white/75">não carrega</strong> no
            banco. Extras só com solicitação aprovada no RH.
          </>
        }
        mes={mes}
        onMesChange={setMes}
        onAtualizar={() => void carregar()}
        actions={
          <Link to="/rh?aba=banco" className={btn.primary}>
            Banco de horas (RH)
          </Link>
        }
      />

      {linhas.length > 0 ? (
        <FinanceiroResumoKpi>
          <span className="text-white/55">Colaboradores: </span>
          <strong className="text-white/90">{totais.total}</strong>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-emerald-300/90">BH fechado: {totais.fechados}</span>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-amber-200/90">BH aberto: {totais.abertos}</span>
          {totais.comRemuneracao > 0 ? (
            <>
              <span className="mx-2 text-white/35">·</span>
              <span className="text-white/55">Total a pagar: </span>
              <strong className="text-primary">{fmtBrl(totais.valorTotal)}</strong>
              <span className="ml-2 text-xs text-white/45">
                (base {fmtBrl(totais.valorBase)} + extras {fmtBrl(totais.valorExtras)})
              </span>
            </>
          ) : null}
        </FinanceiroResumoKpi>
      ) : null}

      <CollapsibleFilters
        title="Filtros"
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={() => {
          setBusca('');
          setFechamentoFiltro('all');
          setSaldoMesFiltro('all');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Buscar colaborador</label>
            <input
              type="text"
              placeholder="Nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={inputFiltroCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Fechamento BH</label>
            <select
              value={fechamentoFiltro}
              onChange={(e) => setFechamentoFiltro(e.target.value as FechamentoFiltro)}
              className={selectFiltroCls}
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              <option value="aberto" className="bg-neutral text-white">Em aberto</option>
              <option value="fechado" className="bg-neutral text-white">Fechado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Saldo do mês</label>
            <select
              value={saldoMesFiltro}
              onChange={(e) => setSaldoMesFiltro(e.target.value as SaldoMesFiltro)}
              className={selectFiltroCls}
            >
              <option value="all" className="bg-neutral text-white">Qualquer</option>
              <option value="positivo" className="bg-neutral text-white">Positivo</option>
              <option value="negativo" className="bg-neutral text-white">Negativo (déficit)</option>
              <option value="zero" className="bg-neutral text-white">Zerado</option>
            </select>
          </div>
        </div>
      </CollapsibleFilters>

      <Card title={`Pagamentos do mês — ${mes}`}>
        <FinanceiroDataTable<FinanceiroPagamentoLinha>
          columns={colunas}
          data={linhasFiltradas}
          keyExtractor={(l) => l.usuarioId}
          loading={loading}
          paginate
          initialPageSize={20}
          emptyMessage={
            filtrosAtivos
              ? 'Nenhum colaborador atende aos filtros.'
              : 'Nenhum colaborador com ponto ativo nesta competência.'
          }
          renderMobileCard={(l) => (
            <div className={financeiroCardMobileCls}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-white/95">{l.nome}</p>
                <span className="text-xs text-white/45 shrink-0">{l.fechado ? 'BH fechado' : 'BH aberto'}</span>
              </div>
              <p className="text-lg font-semibold text-primary tabular-nums">{fmtBrl(l.valorTotal)}</p>
              <p className="text-xs text-white/55">
                Base {fmtBrl(l.valorBase)}
                {l.valorExtras != null && l.valorExtras > 0 ? ` · Extras ${fmtBrl(l.valorExtras)}` : ''}
              </p>
              <p className="text-xs text-white/55">
                Saldo mês:{' '}
                <span className={l.saldoMesMin >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {fmtSaldo(l.saldoMesMin)}
                </span>
                {' · '}
                Banco:{' '}
                <span className={l.saldoAcumuladoMin > 0 ? 'text-emerald-300' : 'text-white/45'}>
                  {l.saldoAcumuladoMin > 0 ? fmtSaldo(l.saldoAcumuladoMin) : '0h'}
                </span>
              </p>
              <Link
                to={`/rh/banco-horas/${l.usuarioId}?competencia=${encodeURIComponent(mes)}`}
                className="inline-block text-primary text-xs font-medium pt-1"
                onClick={(e) => e.stopPropagation()}
              >
                Ver extrato
              </Link>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
