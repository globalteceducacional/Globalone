import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { btn } from '../../utils/buttonStyles';
import { formatApiError } from '../../utils/toast';
import {
  Card,
  FinanceiroBarraAcoes,
  FinanceiroDataTable,
  fmtBrl,
  inputFiltroCls,
  financeiroCardMobileCls,
  type DataTableColumn,
} from './financeiroUi';

interface CuradoriaBudgetRow {
  id: number;
  nome: string;
  status?: string;
  projeto?: { id: number; nome: string } | null;
  totalLiquido: number;
  dataCriacao: string;
}

export function TabFinanceiroCuradoria() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CuradoriaBudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<CuradoriaBudgetRow[]>('/curadoria/orcamentos');
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const linhasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(t) ||
        (r.projeto?.nome ?? '').toLowerCase().includes(t) ||
        (r.status ?? '').toLowerCase().includes(t),
    );
  }, [rows, busca]);

  const filtrosAtivos = busca.trim().length > 0;

  const colunas = useMemo((): DataTableColumn<CuradoriaBudgetRow>[] => [
    {
      key: 'nome',
      label: 'Orçamento',
      render: (r) => (
        <Link
          to={`/curadoria/${r.id}`}
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.nome}
        </Link>
      ),
      stopRowClick: true,
    },
    {
      key: 'projeto',
      label: 'Projeto',
      render: (r) => <span className="text-white/70">{r.projeto?.nome ?? '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <span className="text-white/70">{r.status ?? '—'}</span>,
    },
    {
      key: 'total',
      label: 'Total líquido',
      align: 'right',
      tdClassName: 'tabular-nums text-white/85',
      render: (r) => fmtBrl(r.totalLiquido ?? 0),
    },
  ], []);

  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>
    );
  }

  return (
    <div className="space-y-4">
      <FinanceiroBarraAcoes
        descricao="Orçamentos de curadoria (totais líquidos). Cadastro completo na área Curadoria."
        actions={
          <Link to="/curadoria" className={btn.primary}>
            Abrir curadoria
          </Link>
        }
      />

      <CollapsibleFilters
        title="Filtros"
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={() => setBusca('')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Orçamento, projeto ou status…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={inputFiltroCls}
            />
          </div>
        </div>
      </CollapsibleFilters>

      <Card title="Curadoria">
        <FinanceiroDataTable<CuradoriaBudgetRow>
          columns={colunas}
          data={linhasFiltradas}
          keyExtractor={(r) => r.id}
          loading={loading}
          paginate
          initialPageSize={20}
          emptyMessage={filtrosAtivos ? 'Nenhum orçamento atende aos filtros.' : 'Nenhum orçamento encontrado.'}
          onRowClick={(r) => navigate(`/curadoria/${r.id}`)}
          renderMobileCard={(r) => (
            <div className={financeiroCardMobileCls}>
              <p className="font-medium text-white/95">{r.nome}</p>
              <p className="text-xs text-white/55">
                {r.projeto?.nome ?? 'Sem projeto'} · {r.status ?? '—'}
              </p>
              <p className="text-primary font-semibold tabular-nums">{fmtBrl(r.totalLiquido ?? 0)}</p>
              <p className="text-primary/90 text-xs pt-1">Toque para abrir o orçamento</p>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
