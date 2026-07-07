import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { Projeto } from '../../types';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { btn } from '../../utils/buttonStyles';
import { formatApiError } from '../../utils/toast';
import {
  Card,
  FinanceiroBarraAcoes,
  FinanceiroDataTable,
  filtrarPorTexto,
  fmtBrl,
  inputFiltroCls,
  selectFiltroCls,
  financeiroCardMobileCls,
  type DataTableColumn,
} from './financeiroUi';

type StatusFiltro = 'all' | 'EM_ANDAMENTO' | 'FINALIZADO';

type ProjetoFinanceiro = Projeto & { valorUsadoCompras?: number };

export function TabFinanceiroProjetos() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProjetoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ProjetoFinanceiro[]>('/financeiro/projetos');
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
    return rows.filter((p) => {
      if (!filtrarPorTexto(p.nome, busca)) return false;
      if (statusFiltro !== 'all' && p.status !== statusFiltro) return false;
      return true;
    });
  }, [rows, busca, statusFiltro]);

  const filtrosAtivos = busca.trim().length > 0 || statusFiltro !== 'all';
  const emAndamento = linhasFiltradas.filter((p) => p.status === 'EM_ANDAMENTO').length;

  const colunas = useMemo((): DataTableColumn<ProjetoFinanceiro>[] => [
    {
      key: 'nome',
      label: 'Projeto',
      render: (p) => (
        <Link to={`/projects/${p.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {p.nome}
        </Link>
      ),
      stopRowClick: true,
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <span className="text-white/70">{p.status === 'FINALIZADO' ? 'Finalizado' : 'Em andamento'}</span>
      ),
    },
    {
      key: 'valor',
      label: 'Valor total',
      align: 'right',
      tdClassName: 'tabular-nums text-white/85',
      render: (p) => fmtBrl(p.valorTotal ?? 0),
    },
    {
      key: 'valorUsado',
      label: 'Valor usado',
      align: 'right',
      tdClassName: 'tabular-nums text-amber-200/90',
      render: (p) => fmtBrl(p.valorUsadoCompras ?? 0),
    },
    {
      key: 'progresso',
      label: 'Progresso',
      align: 'right',
      tdClassName: 'text-white/70',
      render: (p) => `${p.progress ?? 0}%`,
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
        descricao="Valores de contrato, compras vinculadas e status dos projetos aos quais você tem acesso."
        actions={
          <Link to="/projects" className={btn.primary}>
            Gerenciar projetos
          </Link>
        }
      />

      <CollapsibleFilters
        title="Filtros"
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={() => {
          setBusca('');
          setStatusFiltro('all');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Buscar projeto</label>
            <input
              type="text"
              placeholder="Nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={inputFiltroCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Status</label>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as StatusFiltro)}
              className={selectFiltroCls}
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              <option value="EM_ANDAMENTO" className="bg-neutral text-white">Em andamento</option>
              <option value="FINALIZADO" className="bg-neutral text-white">Finalizado</option>
            </select>
          </div>
        </div>
      </CollapsibleFilters>

      <Card title="Projetos">
        <p className="text-xs text-white/45 mb-3">
          {emAndamento} em andamento nesta lista — valor usado = soma das compras vinculadas ao projeto (exceto reprovadas).
        </p>
        <FinanceiroDataTable<ProjetoFinanceiro>
          columns={colunas}
          data={linhasFiltradas}
          keyExtractor={(p) => p.id}
          loading={loading}
          paginate
          initialPageSize={20}
          emptyMessage={filtrosAtivos ? 'Nenhum projeto atende aos filtros.' : 'Nenhum projeto encontrado.'}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
          renderMobileCard={(p) => (
            <div className={financeiroCardMobileCls}>
              <p className="font-medium text-white/95">{p.nome}</p>
              <p className="text-xs text-white/55">
                {p.status === 'FINALIZADO' ? 'Finalizado' : 'Em andamento'} · {p.progress ?? 0}%
              </p>
              <p className="text-primary font-semibold tabular-nums">{fmtBrl(p.valorTotal ?? 0)}</p>
              <p className="text-amber-200/90 text-sm tabular-nums">
                Usado: {fmtBrl(p.valorUsadoCompras ?? 0)}
              </p>
              <p className="text-primary/90 text-xs pt-1">Toque para abrir o projeto</p>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
