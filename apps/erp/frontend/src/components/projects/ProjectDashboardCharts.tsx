import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../../utils/stockHelpers';

export interface CompraChartRow {
  id: number;
  dataSolicitacao: string;
  dataCompra?: string | null;
  quantidade: number;
  valorUnitario: number | null;
}

/** Contagens por `getEtapaTimelineStatus` (cronograma / detalhes do projeto). */
export interface EtapaRoscaCounts {
  finalizadas: number;
  emAndamento: number;
  atrasadas: number;
  naoIniciadas: number;
}

function monthLabelPt(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

/** Série acumulada de valor de compras (dataCompra ou dataSolicitação) por mês. */
function buildInvestimentoCumulative(
  compras: CompraChartRow[],
  valorInsumos: number,
  dataCriacao?: string | null,
): { mes: string; valor: number }[] {
  const byMonth = new Map<string, number>();
  for (const c of compras) {
    const raw = c.dataCompra ?? c.dataSolicitacao;
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const v = Math.max(0, (c.valorUnitario ?? 0) * (c.quantidade || 0));
    byMonth.set(k, (byMonth.get(k) ?? 0) + v);
  }

  const keys = [...byMonth.keys()].sort();
  if (keys.length === 0) {
    const now = new Date();
    const start = dataCriacao
      ? new Date(dataCriacao)
      : new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const ins = Math.max(0, valorInsumos);
    return [
      { mes: monthLabelPt(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`), valor: 0 },
      { mes: monthLabelPt(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`), valor: ins },
    ];
  }

  let cum = 0;
  const out: { mes: string; valor: number }[] = [];
  for (const k of keys) {
    cum += byMonth.get(k) ?? 0;
    out.push({ mes: monthLabelPt(k), valor: cum });
  }

  if (out.length === 1) {
    const first = keys[0];
    const [y, mo] = first.split('-').map(Number);
    const prev = new Date(y, mo - 2, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    out.unshift({ mes: monthLabelPt(prevKey), valor: 0 });
  }

  return out;
}

/** Hover: só anel um pouco mais grosso na cor do indicador (sem texto dentro da rosca). */
function EtapasRadialActiveShape(props: unknown) {
  const p = props as Record<string, unknown>;
  const cx = Number(p.cx);
  const cy = Number(p.cy);
  const innerRadius = Number(p.innerRadius);
  const outerRadius = Number(p.outerRadius);
  const startAngle = Number(p.startAngle);
  const endAngle = Number(p.endAngle);
  const payload = p.payload as { fill?: string } | undefined;
  const fill = (typeof p.fill === 'string' ? p.fill : undefined) ?? payload?.fill ?? '#58a6ff';
  const grow = 4;
  const ir = Math.max(0, innerRadius - grow * 0.35);
  const or = outerRadius + grow;

  return (
    <g className="recharts-layer">
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={ir}
        outerRadius={or}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke={fill}
        strokeWidth={1}
        cornerRadius={6}
        style={{ filter: 'brightness(1.15)' }}
      />
    </g>
  );
}

type RadialRow = {
  name: string;
  value: number;
  fill: string;
  pct: number;
  count: number;
};

export function ProjectDashboardCharts({
  projetoNome,
  progressoEtapasPct,
  totalEtapas,
  etapasRosca,
  valorTotal,
  valorInsumos,
  compras,
  dataCriacao,
  podeVerValor,
}: {
  projetoNome: string;
  progressoEtapasPct: number;
  totalEtapas: number;
  etapasRosca: EtapaRoscaCounts;
  valorTotal: number;
  valorInsumos: number;
  compras: CompraChartRow[];
  dataCriacao?: string | null;
  podeVerValor: boolean;
}) {
  const gid = useId().replace(/:/g, '');

  const indicadoresCronograma = useMemo(
    () =>
      [
        { name: 'Finalizadas', value: etapasRosca.finalizadas, color: '#10b981' },
        { name: 'Em andamento', value: etapasRosca.emAndamento, color: '#38bdf8' },
        { name: 'Atrasadas', value: etapasRosca.atrasadas, color: '#f87171' },
        { name: 'Não iniciadas', value: etapasRosca.naoIniciadas, color: '#64748b' },
      ] as const,
    [etapasRosca],
  );

  /**
   * Três anéis (verde, vermelho, azul na ordem centro → fora). “Não iniciadas” não tem anel
   * (é o restante implícito) mas segue na legenda.
   */
  const radialEtapasData = useMemo((): RadialRow[] => {
    if (totalEtapas === 0) return [];
    const pctOf = (n: number) => Math.min(100, Math.round((n / totalEtapas) * 100));
    return [
      { name: 'Finalizadas', value: etapasRosca.finalizadas, fill: '#10b981' },
      { name: 'Atrasadas', value: etapasRosca.atrasadas, fill: '#f87171' },
      { name: 'Em andamento', value: etapasRosca.emAndamento, fill: '#38bdf8' },
    ].map((item) => ({
      ...item,
      pct: pctOf(item.value),
      count: item.value,
    }));
  }, [etapasRosca, totalEtapas]);

  const nomeCurto =
    projetoNome.length > 14 ? `${projetoNome.slice(0, 12)}…` : projetoNome;

  const investimentoData = useMemo(
    () => buildInvestimentoCumulative(compras, valorInsumos, dataCriacao),
    [compras, valorInsumos, dataCriacao],
  );

  /** Média de insumos alocados por etapa (total de insumos ÷ nº de etapas). */
  const valorInsumosPorEtapa = useMemo(() => {
    if (totalEtapas <= 0) return null;
    return Math.max(0, valorInsumos) / totalEtapas;
  }, [valorInsumos, totalEtapas]);

  const tooltipStyle = {
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    color: '#f0f6fc',
  };

  return (
    <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
      <div>
        <div className="mb-6 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-[#8b949e]">Etapas no cronograma</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">
            {totalEtapas.toLocaleString('pt-BR')} ETAPAS
          </span>
        </div>

        {totalEtapas === 0 ? (
          <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-[#30363d] bg-[#0d1117] text-sm text-[#8b949e]">
            Nenhuma etapa cadastrada neste projeto.
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-stretch gap-6 sm:flex-row">
            <div className="mx-auto flex w-[240px] shrink-0 flex-col items-center sm:mx-0">
              <div className="flex h-[240px] w-full items-center justify-center">
                <RadialBarChart
                  width={240}
                  height={240}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={110}
                  data={radialEtapasData}
                  startAngle={90}
                  endAngle={-270}
                  barCategoryGap={10}
                  barSize={12}
                >
                  <PolarAngleAxis
                    type="number"
                    domain={[0, 100]}
                    angleAxisId={0}
                    tick={false}
                  />
                  <PolarRadiusAxis
                    type="category"
                    dataKey="name"
                    tick={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RadialBar
                    dataKey="pct"
                    cornerRadius={6}
                    background={{ fill: '#21262d' }}
                    activeShape={EtapasRadialActiveShape}
                    isAnimationActive={false}
                  >
                    {radialEtapasData.map((entry, index) => (
                      <Cell key={`radial-${entry.name}-${index}`} fill={entry.fill} stroke="none" />
                    ))}
                  </RadialBar>
                  <Tooltip
                    cursor={false}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: '#f0f6fc' }}
                    formatter={(_value: number, _name: string, item: unknown) => {
                      const pl = item as { payload?: { count?: number; name?: string } };
                      const count = pl?.payload?.count ?? 0;
                      const label = pl?.payload?.name ?? '';
                      return [`${count.toLocaleString('pt-BR')} etapas`, label];
                    }}
                  />
                </RadialBarChart>
              </div>

              <div className="mt-2 w-full rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3 text-center shadow-sm">
                <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5">
                  <span className="text-xl font-bold tabular-nums text-gray-100">
                    {progressoEtapasPct}%
                  </span>
                  <span className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-[#8b949e]">
                    etapas finalizadas
                  </span>
                </div>
                <p className="mt-1 text-[11px] tabular-nums text-[#8b949e]">
                  {etapasRosca.finalizadas.toLocaleString('pt-BR')}/
                  {totalEtapas.toLocaleString('pt-BR')} etapas no cronograma
                </p>
                <p className="mt-1 truncate text-xs text-[#8b949e]/90" title={projetoNome}>
                  {nomeCurto}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-sm">
                <ul className="flex flex-col gap-5">
                  {indicadoresCronograma.map((item) => {
                    const pct =
                      totalEtapas > 0
                        ? Math.round((item.value / totalEtapas) * 100)
                        : 0;
                    return (
                      <li key={item.name} className="flex items-center gap-3 text-sm">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 font-medium text-gray-200">
                          {item.name}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-gray-100">
                          {item.value.toLocaleString('pt-BR')}
                        </span>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[#8b949e]">
                          {pct}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        {!podeVerValor ? (
          <div className="flex h-52 flex-col items-center justify-center rounded-lg border border-dashed border-[#30363d] bg-[#0d1117] px-4 text-center text-sm text-[#8b949e]">
            Sem permissão para exibir valores financeiros.
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#8b949e]">Valor de investimento</h3>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#e3b341] sm:text-3xl">
                {formatCurrency(Math.max(0, valorTotal))}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#8b949e]">
                Insumos (etapas): {formatCurrency(Math.max(0, valorInsumos))}
                {valorInsumosPorEtapa != null && (
                  <>
                    {' '}
                    · {formatCurrency(valorInsumosPorEtapa)} por etapa (média de{' '}
                    {totalEtapas.toLocaleString('pt-BR')} etapas)
                  </>
                )}
                {valorInsumosPorEtapa == null && <> · — por etapa (sem etapas cadastradas)</>}
                {' '}
                · curva = compras acumuladas por mês
              </p>
            </div>

            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={investimentoData}
                  margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={`${gid}-areaValor`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    stroke="#484f58"
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="#484f58"
                    tick={{ fill: '#8b949e', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={(v: number) => {
                      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                      if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                      return String(v);
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [
                      formatCurrency(Number(value)),
                      'Acumulado',
                    ]}
                    labelStyle={{ color: '#8b949e' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="valor"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#${gid}-areaValor)`}
                    activeDot={{
                      r: 5,
                      fill: '#38bdf8',
                      stroke: '#161b22',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
