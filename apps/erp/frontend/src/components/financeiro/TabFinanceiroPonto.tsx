import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchFinanceiroPontoPlanejamento,
  type FinanceiroPontoLinha,
} from '../../services/financeiroPonto';
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
  inputFiltroCls,
  selectFiltroCls,
  financeiroCardMobileCls,
  type DataTableColumn,
} from './financeiroUi';

type RemFiltro = 'all' | 'VALOR_HORA' | 'MENSAL_META_HORAS' | 'NENHUMA';

export function TabFinanceiroPonto() {
  const [mes, setMes] = useState(competenciaCorrente);
  const [linhas, setLinhas] = useState<FinanceiroPontoLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [remFiltro, setRemFiltro] = useState<RemFiltro>('all');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchFinanceiroPontoPlanejamento(mes);
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

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (!filtrarPorTexto(l.nome, busca)) return false;
      if (remFiltro !== 'all' && l.remuneracaoPontoTipo !== remFiltro) return false;
      return true;
    });
  }, [linhas, busca, remFiltro]);

  const filtrosAtivos = busca.trim().length > 0 || remFiltro !== 'all';

  const totais = useMemo(() => {
    let horasMin = 0;
    let valor = 0;
    for (const l of linhasFiltradas) {
      horasMin += l.trabalhadoMin;
      if (l.valorEstimado != null) valor += l.valorEstimado;
    }
    return { horasMin, valor };
  }, [linhasFiltradas]);

  const colunas = useMemo((): DataTableColumn<FinanceiroPontoLinha>[] => [
    {
      key: 'nome',
      label: 'Colaborador',
      render: (l) => <span className="font-medium text-white/95">{l.nome}</span>,
    },
    {
      key: 'jornada',
      label: 'Jornada',
      render: (l) =>
        l.horarioFlexivel ? (
          <span className="text-xs text-sky-200/90">Flexível</span>
        ) : (
          <span className="text-xs text-white/45">Padrão</span>
        ),
    },
    {
      key: 'horas',
      label: 'Horas mês',
      align: 'right',
      tdClassName: 'tabular-nums text-white/80',
      render: (l) => fmtHoras(l.trabalhadoMin),
    },
    {
      key: 'rem',
      label: 'Remuneração',
      render: (l) => (
        <div className="text-xs text-white/70">
          {LABEL_REM[l.remuneracaoPontoTipo] ?? l.remuneracaoPontoTipo}
          {l.remuneracaoPontoTipo === 'VALOR_HORA' && l.valorHora != null ? (
            <span className="block text-white/50">{fmtBrl(l.valorHora)}/h</span>
          ) : null}
          {l.remuneracaoPontoTipo === 'MENSAL_META_HORAS' && l.valorMensal != null ? (
            <span className="block text-white/50">
              {fmtBrl(l.valorMensal)} · meta {l.metaHorasMensalMin != null ? fmtHoras(l.metaHorasMensalMin) : '—'}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'valor',
      label: 'Valor est.',
      align: 'right',
      tdClassName: 'tabular-nums text-white/85',
      render: (l) => fmtBrl(l.valorEstimado),
    },
    {
      key: 'meta',
      label: 'Meta',
      render: (l) =>
        l.remuneracaoPontoTipo === 'MENSAL_META_HORAS' && l.metaAtingida != null ? (
          l.metaAtingida ? (
            <span className="text-xs text-emerald-300/90">Atingida</span>
          ) : (
            <span className="text-xs text-amber-200/85">Proporcional</span>
          )
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
  ], []);

  return (
    <div className="space-y-4">
      <FinanceiroBarraCompetencia
        descricao={
          <>
            Horas do espelho e valor estimado conforme a remuneração na jornada (valor hora ou mensal + meta).
            Configure em <strong className="text-white/75">RH → Jornada</strong>.
          </>
        }
        mes={mes}
        onMesChange={setMes}
        onAtualizar={() => void carregar()}
        actions={
          <Link to="/rh/ponto?aba=jornada" className={`${btn.primary} justify-center`}>
            Jornadas (RH)
          </Link>
        }
      />

      {linhas.length > 0 ? (
        <FinanceiroResumoKpi>
          <span className="text-white/55">Total filtrado: </span>
          <strong className="text-white/90">{fmtHoras(totais.horasMin)}</strong>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-white/55">Soma estimada: </span>
          <strong className="text-primary">{fmtBrl(totais.valor)}</strong>
        </FinanceiroResumoKpi>
      ) : null}

      <CollapsibleFilters
        title="Filtros"
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={() => {
          setBusca('');
          setRemFiltro('all');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <label className="block text-xs font-medium text-white/90 mb-1">Remuneração</label>
            <select
              value={remFiltro}
              onChange={(e) => setRemFiltro(e.target.value as RemFiltro)}
              className={selectFiltroCls}
            >
              <option value="all" className="bg-neutral text-white">Todas</option>
              <option value="VALOR_HORA" className="bg-neutral text-white">Valor hora</option>
              <option value="MENSAL_META_HORAS" className="bg-neutral text-white">Mensal + meta</option>
              <option value="NENHUMA" className="bg-neutral text-white">Sem remuneração</option>
            </select>
          </div>
        </div>
      </CollapsibleFilters>

      <Card title={`Horas & valores — ${mes}`}>
        <FinanceiroDataTable<FinanceiroPontoLinha>
          columns={colunas}
          data={linhasFiltradas}
          keyExtractor={(l) => l.usuarioId}
          loading={loading}
          paginate
          initialPageSize={20}
          emptyMessage={
            filtrosAtivos
              ? 'Nenhum colaborador atende aos filtros.'
              : 'Nenhum colaborador com ponto ativo neste mês.'
          }
          renderMobileCard={(l) => (
            <div className={financeiroCardMobileCls}>
              <p className="font-medium text-white/95">{l.nome}</p>
              <p className="text-xs text-white/55">
                {l.horarioFlexivel ? 'Jornada flexível' : 'Jornada padrão'}
                {' · '}
                {LABEL_REM[l.remuneracaoPontoTipo] ?? l.remuneracaoPontoTipo}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  Horas: <strong className="text-white/85">{fmtHoras(l.trabalhadoMin)}</strong>
                </span>
                <span>
                  Valor est.: <strong className="text-primary">{fmtBrl(l.valorEstimado)}</strong>
                </span>
              </div>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
