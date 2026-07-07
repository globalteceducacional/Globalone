import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Category, Purchase } from '../../types/stock';
import { PURCHASE_STATUS } from '../../constants/stock';
import {
  getAssinaturaCompraStatusColor,
  getAssinaturaCompraStatusLabel,
  getCategoryName,
  getPurchaseLineTotal,
  getStatusColor,
  getStatusLabel,
  isDespesaPurchase,
  isEstoquePurchase,
  isSignaturePurchase,
} from '../../utils/stockHelpers';
import { exportFinanceiroComprasMes } from '../../utils/financeiroComprasReport';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { btn } from '../../utils/buttonStyles';
import { formatApiError } from '../../utils/toast';
import {
  Card,
  FinanceiroBarraCompetencia,
  FinanceiroDataTable,
  FinanceiroResumoKpi,
  competenciaCorrente,
  filtrarPorTexto,
  fmtBrl,
  inputFiltroCls,
  selectFiltroCls,
  financeiroCardMobileCls,
  type DataTableColumn,
} from './financeiroUi';

const STATUS_EXCLUI_GASTO = new Set(['REPROVADO']);

type TipoRecorte = 'all' | 'compras' | 'despesas' | 'assinaturas';

/** Data de referência para competência de compras avulsas. */
function dataReferenciaCompra(p: Purchase): Date | null {
  const raw = p.dataCompra ?? p.dataConfirmacao ?? p.solicitacaoAprovadaEm ?? p.dataSolicitacao;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function competenciaDeData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesInicioAssinatura(p: Purchase): string | null {
  const d = dataReferenciaCompra(p);
  if (!d) return null;
  return competenciaDeData(d);
}

function compraPontualNaCompetencia(p: Purchase, mes: string): boolean {
  if (isSignaturePurchase(p)) return false;
  const d = dataReferenciaCompra(p);
  if (!d) return false;
  return competenciaDeData(d) === mes;
}

/** Assinaturas ativas entram em todo mês a partir da competência de início. */
function assinaturaNaCompetencia(p: Purchase, mes: string): boolean {
  if (!isSignaturePurchase(p)) return false;
  if (p.status === 'REPROVADO') return false;
  const inicio = mesInicioAssinatura(p);
  if (!inicio) return false;
  return mes >= inicio;
}

function naCompetenciaFinanceiro(p: Purchase, mes: string): boolean {
  return compraPontualNaCompetencia(p, mes) || assinaturaNaCompetencia(p, mes);
}

function valorGastoCompra(p: Purchase): number | null {
  if (STATUS_EXCLUI_GASTO.has(p.status)) return null;
  const total = getPurchaseLineTotal(p);
  return total > 0 ? total : null;
}

function fmtMesLongo(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  if (!y || !m) return mes;
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function fmtDataRefCompra(p: Purchase, mes: string) {
  if (isSignaturePurchase(p)) {
    return `Assinatura · ${fmtMesLongo(mes)}`;
  }
  const d = dataReferenciaCompra(p);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR');
}

function statusLabelCompra(p: Purchase): string {
  if (isSignaturePurchase(p)) return getAssinaturaCompraStatusLabel(p.status);
  return getStatusLabel(p.status);
}

function statusClassCompra(p: Purchase): string {
  if (isSignaturePurchase(p)) return getAssinaturaCompraStatusColor(p.status);
  return getStatusColor(p.status);
}

function StatusBadge({ purchase }: { purchase: Purchase }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusClassCompra(purchase)}`}>
      {statusLabelCompra(purchase)}
    </span>
  );
}

export function TabFinanceiroCompras() {
  const [mes, setMes] = useState(competenciaCorrente);
  const [rows, setRows] = useState<Purchase[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('all');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('all');
  const [tipoRecorte, setTipoRecorte] = useState<TipoRecorte>('all');
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [purchasesRes, categoriesRes] = await Promise.all([
        api.get<Purchase[]>('/stock/purchases', { params: { mesReferenciaAssinatura: mes } }),
        api.get<Category[]>('/categories?tipo=ITEM'),
      ]);
      setRows(Array.isArray(purchasesRes.data) ? purchasesRes.data : []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
    } catch (e: unknown) {
      setError(formatApiError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhasMes = useMemo(() => rows.filter((p) => naCompetenciaFinanceiro(p, mes)), [rows, mes]);

  const statusOpcoes = useMemo(() => {
    const set = new Set(linhasMes.map((r) => r.status).filter(Boolean));
    return Array.from(set).sort();
  }, [linhasMes]);

  const categoriasAtivas = useMemo(
    () => categories.filter((c) => c.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    [categories],
  );

  const linhasFiltradas = useMemo(() => {
    return linhasMes.filter((p) => {
      if (!filtrarPorTexto(p.item ?? '', busca)) return false;
      if (statusFiltro !== 'all' && p.status !== statusFiltro) return false;
      if (categoriaFiltro !== 'all' && String(p.categoriaId ?? '') !== categoriaFiltro) return false;
      if (tipoRecorte === 'compras' && !isEstoquePurchase(p)) return false;
      if (tipoRecorte === 'despesas' && !isDespesaPurchase(p)) return false;
      if (tipoRecorte === 'assinaturas' && !isSignaturePurchase(p)) return false;
      return true;
    });
  }, [linhasMes, busca, statusFiltro, categoriaFiltro, tipoRecorte]);

  const filtrosAtivos =
    busca.trim().length > 0 ||
    statusFiltro !== 'all' ||
    categoriaFiltro !== 'all' ||
    tipoRecorte !== 'all';

  const totais = useMemo(() => {
    let valorTotal = 0;
    let valorEntregue = 0;
    let valorEmFluxo = 0;
    let valorAssinaturas = 0;
    let comValor = 0;
    let semValor = 0;
    let entregues = 0;
    let emFluxo = 0;
    let assinaturas = 0;
    let comprasEstoque = 0;
    let despesas = 0;

    for (const p of linhasFiltradas) {
      if (isSignaturePurchase(p)) assinaturas += 1;
      else if (isDespesaPurchase(p)) despesas += 1;
      else comprasEstoque += 1;

      const v = valorGastoCompra(p);
      if (v != null) {
        comValor += 1;
        valorTotal += v;
        if (isSignaturePurchase(p)) valorAssinaturas += v;
        if (p.status === 'ENTREGUE') {
          entregues += 1;
          valorEntregue += v;
        } else if (p.status !== 'REPROVADO') {
          emFluxo += 1;
          valorEmFluxo += v;
        }
      } else if (!STATUS_EXCLUI_GASTO.has(p.status)) {
        semValor += 1;
      }
    }

    return {
      itens: linhasFiltradas.length,
      comprasEstoque,
      despesas,
      assinaturas,
      comValor,
      semValor,
      entregues,
      emFluxo,
      valorTotal,
      valorEntregue,
      valorEmFluxo,
      valorAssinaturas,
    };
  }, [linhasFiltradas]);

  const colunas = useMemo((): DataTableColumn<Purchase>[] => [
    {
      key: 'item',
      label: 'Item',
      render: (p) => (
        <div>
          <span className="font-medium text-white/95">{p.item}</span>
          {isSignaturePurchase(p) ? (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-300/80">Assinatura</span>
          ) : isDespesaPurchase(p) ? (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300/80">Despesa</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'categoria',
      label: 'Categoria',
      render: (p) => (
        <span className="text-white/65 text-sm">
          {p.categoria?.nome ?? getCategoryName(p.categoriaId ?? undefined, categories)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => <StatusBadge purchase={p} />,
    },
    {
      key: 'data',
      label: 'Data ref.',
      render: (p) => <span className="text-xs text-white/55">{fmtDataRefCompra(p, mes)}</span>,
    },
    {
      key: 'qtd',
      label: 'Qtd.',
      align: 'right',
      tdClassName: 'tabular-nums text-white/70',
      render: (p) => p.quantidade,
    },
    {
      key: 'valor',
      label: 'Valor',
      align: 'right',
      tdClassName: 'tabular-nums text-white/85',
      render: (p) => {
        const v = valorGastoCompra(p);
        return v != null ? fmtBrl(v) : '—';
      },
    },
  ], [categories, mes]);

  const gerarRelatorio = () => {
    if (linhasFiltradas.length === 0) return;
    setExportando(true);
    try {
      exportFinanceiroComprasMes(mes, linhasFiltradas, categories);
    } finally {
      setExportando(false);
    }
  };

  const labelStatusFiltro = (status: string) => {
    const known = Object.values(PURCHASE_STATUS).find((s) => s.value === status);
    if (known) return known.label;
    const linha = linhasMes.find((p) => p.status === status);
    if (linha && isSignaturePurchase(linha)) return getAssinaturaCompraStatusLabel(status);
    return getStatusLabel(status);
  };

  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>
    );
  }

  return (
    <div className="space-y-4">
      <FinanceiroBarraCompetencia
        descricao={
          <>
            Gastos na competência civil: compras avulsas pela <strong className="text-white/75">data da compra</strong>,
            confirmação ou solicitação; <strong className="text-white/75">despesas</strong> (passagens, serviços) pelo
            mesmo critério; <strong className="text-white/75">assinaturas</strong> entram em cada mês a partir do início
            (valor recorrente).
          </>
        }
        mes={mes}
        onMesChange={setMes}
        onAtualizar={() => void carregar()}
        actions={
          <>
            <button
              type="button"
              onClick={gerarRelatorio}
              disabled={exportando || linhasFiltradas.length === 0}
              className={`${btn.secondary} justify-center`}
            >
              {exportando ? 'Gerando…' : 'Relatório do mês'}
            </button>
            <Link to="/categories" className={`${btn.secondary} justify-center`}>
              Categorias
            </Link>
            <Link to="/stock" className={`${btn.primary} justify-center`}>
              Compras e estoque
            </Link>
          </>
        }
      />

      {!loading ? (
        <FinanceiroResumoKpi>
          <span className="text-white/55">Itens no mês: </span>
          <strong className="text-white/90">{totais.itens}</strong>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-white/70">Estoque: {totais.comprasEstoque}</span>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-amber-200/90">Despesas: {totais.despesas}</span>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-violet-200/90">Assinaturas: {totais.assinaturas}</span>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-emerald-300/90">Entregues/pagas: {totais.entregues}</span>
          <span className="mx-2 text-white/35">·</span>
          <span className="text-amber-200/90">Em fluxo: {totais.emFluxo}</span>
          {totais.comValor > 0 ? (
            <>
              <span className="mx-2 text-white/35">·</span>
              <span className="text-white/55">Total gasto: </span>
              <strong className="text-primary">{fmtBrl(totais.valorTotal)}</strong>
              <span className="ml-2 text-xs text-white/45">
                (entregue/pago {fmtBrl(totais.valorEntregue)} + em fluxo {fmtBrl(totais.valorEmFluxo)}
                {totais.assinaturas > 0 ? ` · assinaturas ${fmtBrl(totais.valorAssinaturas)}` : ''})
              </span>
            </>
          ) : (
            <>
              <span className="mx-2 text-white/35">·</span>
              <span className="text-white/45 text-xs">Nenhum valor calculado neste recorte</span>
            </>
          )}
          {totais.semValor > 0 ? (
            <span className="block mt-1 text-xs text-white/40">
              {totais.semValor} item(ns) sem cotação/valor no período
            </span>
          ) : null}
        </FinanceiroResumoKpi>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all' as const, label: 'Todos' },
            { id: 'compras' as const, label: 'Compras (estoque)' },
            { id: 'despesas' as const, label: 'Despesas' },
            { id: 'assinaturas' as const, label: 'Assinaturas' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTipoRecorte(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm border transition-colors ${
              tipoRecorte === tab.id
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <CollapsibleFilters
        title="Filtros"
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={() => {
          setBusca('');
          setStatusFiltro('all');
          setCategoriaFiltro('all');
          setTipoRecorte('all');
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Buscar item</label>
            <input
              type="text"
              placeholder="Descrição…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={inputFiltroCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Status</label>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              className={selectFiltroCls}
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              {statusOpcoes.map((s) => (
                <option key={s} value={s} className="bg-neutral text-white">
                  {labelStatusFiltro(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Categoria</label>
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className={selectFiltroCls}
            >
              <option value="all" className="bg-neutral text-white">Todas</option>
              {categoriasAtivas.map((c) => (
                <option key={c.id} value={String(c.id)} className="bg-neutral text-white">
                  {c.nome}
                  {c.isAssinatura ? ' (assinatura)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CollapsibleFilters>

      <Card title={`Compras — ${mes}`}>
        <FinanceiroDataTable<Purchase>
          columns={colunas}
          data={linhasFiltradas}
          keyExtractor={(p) => `${p.id}-${isSignaturePurchase(p) ? 'sig' : 'com'}`}
          loading={loading}
          paginate
          initialPageSize={20}
          emptyMessage={
            filtrosAtivos
              ? 'Nenhuma compra atende aos filtros.'
              : `Nenhuma compra ou assinatura na competência ${fmtMesLongo(mes)}.`
          }
          renderMobileCard={(p) => {
            const v = valorGastoCompra(p);
            return (
              <div className={financeiroCardMobileCls}>
                <p className="font-medium text-white/95">{p.item}</p>
                <p className="text-xs text-white/55">
                  {p.categoria?.nome ?? getCategoryName(p.categoriaId ?? undefined, categories)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge purchase={p} />
                  <span className="text-xs text-white/50">{fmtDataRefCompra(p, mes)} · Qtd. {p.quantidade}</span>
                </div>
                <p className="text-primary font-semibold tabular-nums">{v != null ? fmtBrl(v) : '—'}</p>
              </div>
            );
          }}
        />
      </Card>
    </div>
  );
}
