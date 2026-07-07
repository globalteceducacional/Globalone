import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  atualizarJornada,
  bulkControlePontoJornada,
  listarJornadas,
  type Jornada,
  type JornadaUsuario,
  type RemuneracaoPontoTipo,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { calcularCargasJornada } from '../../utils/jornadaCarga';
import { metaHorasMensalMinFromCargaSemanal } from '../../utils/jornadaFinance';
import { DataTable, type DataTableColumn } from '../DataTable';
import { Field, Modal } from './rhUi';
import {
  GeocercaPicker,
  geocercaInicialDe,
  montarPayloadGeocerca,
  type GeocercaValor,
} from './GeocercaPicker';

type ModoAlmocoFiltro = 'all' | 'auto' | 'manual' | 'sem-jornada';
type GeocercaFiltro = 'all' | 'propria' | 'unidade';
type ControlePontoFiltro = 'all' | 'com-ponto' | 'sem-ponto';
type BatidaFiltro = 'all' | 'com-batida' | 'sem-batida';

/** Exige ponto/BH na prática: flag ativa no cadastro ou já tem histórico de batida. */
function exigePontoBhNaPratica(l: JornadaUsuario): boolean {
  return l.jornada?.controlePonto === true || l.temBatidaPonto === true;
}

const CONTROLE_PONTO_OPCOES: { value: ControlePontoFiltro; label: string }[] = [
  { value: 'all', label: 'Todos (exigência / batida)' },
  { value: 'com-ponto', label: 'Com BH / já bateram' },
  { value: 'sem-ponto', label: 'Sem BH (sem exigência e sem batida)' },
];

const BATIDA_OPCOES: { value: BatidaFiltro; label: string }[] = [
  { value: 'all', label: 'Todos (histórico)' },
  { value: 'com-batida', label: 'Já bateu ponto' },
  { value: 'sem-batida', label: 'Nunca bateu' },
];

const MODO_ALMOCO_OPCOES: { value: ModoAlmocoFiltro; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'auto', label: 'Automático' },
  { value: 'manual', label: 'Manual (4 batidas)' },
  { value: 'sem-jornada', label: 'Sem jornada definida' },
];

const GEOCERCA_OPCOES: { value: GeocercaFiltro; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'propria', label: 'Local próprio' },
  { value: 'unidade', label: 'Usa unidade (sem override)' },
];

const DIAS_LABEL: Record<string, string> = {
  '0': 'Dom',
  '1': 'Seg',
  '2': 'Ter',
  '3': 'Qua',
  '4': 'Qui',
  '5': 'Sex',
  '6': 'Sáb',
};

/** Ordem de exibição: segunda → domingo (chaves como string no JSON). */
const DIAS_ORDEM_EXIBICAO = ['1', '2', '3', '4', '5', '6', '0'] as const;

function formatDiasUteisResumo(diasUteis: Record<string, boolean> | undefined): string {
  if (!diasUteis) return '—';
  const partes: string[] = [];
  for (const k of DIAS_ORDEM_EXIBICAO) {
    if (diasUteis[k] === true) {
      const lab = DIAS_LABEL[k];
      if (lab) partes.push(lab);
    }
  }
  return partes.length ? partes.join(' · ') : '—';
}

function formatHorasJornada(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${String(m).padStart(2, '0')}` : ''}`;
}

export function TabJornada() {
  const user = useAuthStore((s) => s.user);
  const podeConfigurar = userHasPermission(user, 'jornada:configurar');

  const [linhas, setLinhas] = useState<JornadaUsuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<JornadaUsuario | null>(null);

  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [cargoFiltro, setCargoFiltro] = useState<string>('all');
  const [modoAlmocoFiltro, setModoAlmocoFiltro] = useState<ModoAlmocoFiltro>('all');
  const [geocercaFiltro, setGeocercaFiltro] = useState<GeocercaFiltro>('all');
  const [controlePontoFiltro, setControlePontoFiltro] = useState<ControlePontoFiltro>('all');
  const [batidaFiltro, setBatidaFiltro] = useState<BatidaFiltro>('all');
  const [selecionados, setSelecionados] = useState<Set<number>>(() => new Set());
  const [bulkEmAndamento, setBulkEmAndamento] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarJornadas();
      setLinhas(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (podeConfigurar) void carregar();
  }, [carregar, podeConfigurar]);

  // Lista de cargos únicos para popular o select.
  const cargosOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhas) {
      const nome = l.cargo?.nome?.trim();
      if (nome) set.add(nome);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      if (cargoFiltro !== 'all' && (l.cargo?.nome ?? '') !== cargoFiltro) return false;
      if (modoAlmocoFiltro !== 'all') {
        if (modoAlmocoFiltro === 'sem-jornada') {
          if (l.jornada) return false;
        } else if (!l.jornada) {
          return false;
        } else {
          const auto = l.jornada.almocoAutomatico;
          if (modoAlmocoFiltro === 'auto' && !auto) return false;
          if (modoAlmocoFiltro === 'manual' && auto) return false;
        }
      }
      if (geocercaFiltro !== 'all') {
        const tem =
          !!l.jornada &&
          l.jornada.latitudeReferencia != null &&
          l.jornada.longitudeReferencia != null &&
          l.jornada.raioMetros != null;
        if (geocercaFiltro === 'propria' && !tem) return false;
        if (geocercaFiltro === 'unidade' && tem) return false;
      }
      if (batidaFiltro !== 'all') {
        const temBatida = l.temBatidaPonto === true;
        if (batidaFiltro === 'com-batida' && !temBatida) return false;
        if (batidaFiltro === 'sem-batida' && temBatida) return false;
      }
      if (controlePontoFiltro !== 'all') {
        const exige = exigePontoBhNaPratica(l);
        if (controlePontoFiltro === 'com-ponto' && !exige) return false;
        if (controlePontoFiltro === 'sem-ponto' && exige) return false;
      }
      return true;
    });
  }, [linhas, busca, cargoFiltro, modoAlmocoFiltro, geocercaFiltro, batidaFiltro, controlePontoFiltro]);

  const filtrosAtivos =
    busca.trim().length > 0 ||
    cargoFiltro !== 'all' ||
    modoAlmocoFiltro !== 'all' ||
    geocercaFiltro !== 'all' ||
    controlePontoFiltro !== 'all' ||
    batidaFiltro !== 'all';

  const limparFiltros = () => {
    setBusca('');
    setCargoFiltro('all');
    setModoAlmocoFiltro('all');
    setGeocercaFiltro('all');
    setControlePontoFiltro('all');
    setBatidaFiltro('all');
  };

  const toggleSelecionado = useCallback((usuarioId: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(usuarioId)) next.delete(usuarioId);
      else next.add(usuarioId);
      return next;
    });
  }, []);

  const aplicarBulk = useCallback(
    async (controlePonto: boolean) => {
      const ids = [...selecionados];
      if (ids.length === 0) return;
      setBulkEmAndamento(true);
      try {
        const r = await bulkControlePontoJornada({ usuarioIds: ids, controlePonto });
        toast.success(`${r.atualizados} colaborador(es) atualizado(s).`);
        if (r.ignoradosComBatida > 0) {
          toast.error(
            `${r.ignoradosComBatida} não dispensado(s): já possuem batida de ponto. Edite individualmente se precisar.`,
            6500,
          );
        }
        setSelecionados(new Set());
        await carregar();
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setBulkEmAndamento(false);
      }
    },
    [selecionados, carregar],
  );

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    const total = linhasFiltradas.length;
    const sel = linhasFiltradas.filter((l) => selecionados.has(l.usuarioId)).length;
    el.checked = total > 0 && sel === total;
    el.indeterminate = sel > 0 && sel < total;
  }, [linhasFiltradas, selecionados]);

  const colunasJornada = useMemo((): DataTableColumn<JornadaUsuario>[] => {
    return [
      {
        key: 'sel',
        label: '',
        thClassName: 'w-10 !px-2',
        tdClassName: 'w-10 !px-2',
        renderTh: () => (
          <th key="sel" className="w-10 px-2 py-3 align-middle">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="rounded border-white/30"
              title="Selecionar todos os filtrados"
              onChange={(e) => {
                if (e.target.checked) {
                  setSelecionados(new Set(linhasFiltradas.map((l) => l.usuarioId)));
                } else {
                  setSelecionados(new Set());
                }
              }}
            />
          </th>
        ),
        stopRowClick: true,
        render: (l) => (
          <input
            type="checkbox"
            className="rounded border-white/30"
            checked={selecionados.has(l.usuarioId)}
            onChange={() => toggleSelecionado(l.usuarioId)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      { key: 'nome', label: 'Colaborador', render: (l) => l.nome },
      {
        key: 'pontoBh',
        label: 'Ponto / BH',
        render: (l) => {
          if (exigePontoBhNaPratica(l)) {
            return <span className="text-xs text-green-200/75">Exigido / ativo</span>;
          }
          return <span className="text-xs text-amber-200/90">Sem exigência</span>;
        },
      },
      {
        key: 'batida',
        label: 'Histórico',
        render: (l) =>
          l.temBatidaPonto ? (
            <span className="text-xs text-emerald-200/85">Já bateu</span>
          ) : (
            <span className="text-xs text-white/45">Nunca</span>
          ),
      },
      { key: 'cargo', label: 'Cargo', render: (l) => <span className="text-white/70">{l.cargo?.nome ?? '-'}</span> },
      {
        key: 'carga',
        label: 'Carga diária',
        render: (l) => (l.jornada ? formatHorasJornada(l.jornada.cargaDiariaMin) : '—'),
      },
      {
        key: 'flex',
        label: 'Horário',
        render: (l) =>
          l.jornada?.horarioFlexivel ? (
            <span className="text-xs text-sky-200/90" title="Sem horário fixo: meta diária pela semana">
              Flexível
            </span>
          ) : (
            <span className="text-xs text-white/45">Fixo</span>
          ),
      },
      { key: 'inicio', label: 'Início', render: (l) => l.jornada?.inicioPadrao ?? '—' },
      { key: 'fim', label: 'Fim', render: (l) => l.jornada?.fimPadrao ?? '—' },
      {
        key: 'toler',
        label: 'Tolerância',
        render: (l) => (l.jornada ? `${l.jornada.tolerAtrasoMin} min` : '—'),
      },
      {
        key: 'almoco',
        label: 'Almoço',
        render: (l) => (
          <span className="text-xs text-white/80">
            {l.jornada
              ? l.jornada.almocoAutomatico
                ? `${l.jornada.almocoInicio}–${l.jornada.almocoFim} (auto)`
                : 'Desligado'
              : '—'}
          </span>
        ),
      },
      {
        key: 'dias',
        label: 'Dias úteis',
        tdClassName: '!whitespace-nowrap !break-normal align-top',
        render: (l) => {
          const texto = formatDiasUteisResumo(l.jornada?.diasUteis);
          return (
            <span className="text-[11px] text-white/75 tracking-tight" title={texto === '—' ? undefined : texto}>
              {texto}
            </span>
          );
        },
      },
      {
        key: 'geocerca',
        label: 'Local',
        render: (l) => {
          if (!l.jornada) return <span className="text-white/40">—</span>;
          const tem =
            l.jornada.latitudeReferencia != null &&
            l.jornada.longitudeReferencia != null &&
            l.jornada.raioMetros != null;
          return tem ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] px-2 py-0.5"
              title={`Específico: raio ${l.jornada.raioMetros} m`}
            >
              📍 Próprio
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white/60 text-[11px] px-2 py-0.5"
              title="Usa a geocerca da unidade (Local da unidade)"
            >
              Unidade
            </span>
          );
        },
      },
      {
        key: 'acoes',
        label: 'Ações',
        align: 'right',
        stopRowClick: true,
        render: (l) => (
          <button
            type="button"
            onClick={() => setEditando(l)}
            className="text-blue-300 hover:text-blue-200"
          >
            Editar
          </button>
        ),
      },
    ];
  }, [linhasFiltradas, selecionados, toggleSelecionado]);

  if (!podeConfigurar) {
    return <div className="text-white/60">Você não tem permissão para configurar jornadas.</div>;
  }

  const inputBase =
    'w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50';

  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="px-4 py-3 border-b border-white/10 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white/95">Jornada dos colaboradores</h2>
          <p className="text-sm text-white/60 mt-1">
            Mesmo padrão da aba Equipe: filtros no topo e tabela abaixo. Use a seleção para{' '}
            <strong className="text-white/75">exigir ou dispensar ponto/BH em lote</strong>. Quem já tem batida fica
            com exigência ativa (edição individual). Toque numa linha para editar a jornada.
          </p>
        </div>

        {selecionados.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
            <span className="text-sm text-white/90 font-medium">{selecionados.size} selecionado(s)</span>
            <button
              type="button"
              disabled={bulkEmAndamento}
              onClick={() => void aplicarBulk(true)}
              className="bg-primary text-neutral text-sm font-semibold px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
            >
              Exigir ponto e BH
            </button>
            <button
              type="button"
              disabled={bulkEmAndamento}
              onClick={() => void aplicarBulk(false)}
              className="bg-white/10 hover:bg-white/20 text-sm px-3 py-2 rounded disabled:opacity-50"
            >
              Dispensar (só sem batida)
            </button>
            <button
              type="button"
              disabled={bulkEmAndamento}
              onClick={() => setSelecionados(new Set())}
              className="text-sm text-white/70 hover:text-white px-2 py-1 rounded hover:bg-white/10 disabled:opacity-50"
            >
              Limpar seleção
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-white/60 block mb-1">Buscar colaborador</label>
            <input
              type="text"
              placeholder="Nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={inputBase}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-white/60 block mb-1">Cargo</label>
            <select
              value={cargoFiltro}
              onChange={(e) => setCargoFiltro(e.target.value)}
              className={inputBase}
            >
              <option value="all" className="bg-neutral text-white">
                Todos os cargos
              </option>
              {cargosOpcoes.map((c) => (
                <option key={c} value={c} className="bg-neutral text-white">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowFiltros((v) => !v)}
              className={`text-sm px-3 py-2 rounded border ${
                showFiltros || filtrosAtivos
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-white/10 bg-white/10 text-white/90 hover:bg-white/20'
              }`}
            >
              {showFiltros ? 'Ocultar filtros' : 'Mais filtros'}
              {filtrosAtivos && !showFiltros ? (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" title="Filtros ativos" />
              ) : null}
            </button>
            {filtrosAtivos ? (
              <button type="button" onClick={limparFiltros} className="text-sm px-3 py-2 rounded bg-white/10 hover:bg-white/20">
                Limpar filtros
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void carregar()}
              className="bg-white/10 hover:bg-white/20 text-sm px-3 py-2 rounded"
            >
              Atualizar
            </button>
          </div>
        </div>

        {showFiltros ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/10">
            <div>
              <label className="text-xs text-white/60 block mb-1">Modo de almoço</label>
              <select
                value={modoAlmocoFiltro}
                onChange={(e) => setModoAlmocoFiltro(e.target.value as ModoAlmocoFiltro)}
                className={inputBase}
              >
                {MODO_ALMOCO_OPCOES.map((o) => (
                  <option key={o.value} value={o.value} className="bg-neutral text-white">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60 block mb-1">Local de batida</label>
              <select
                value={geocercaFiltro}
                onChange={(e) => setGeocercaFiltro(e.target.value as GeocercaFiltro)}
                className={inputBase}
              >
                {GEOCERCA_OPCOES.map((o) => (
                  <option key={o.value} value={o.value} className="bg-neutral text-white">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60 block mb-1">Histórico de batida</label>
              <select
                value={batidaFiltro}
                onChange={(e) => setBatidaFiltro(e.target.value as BatidaFiltro)}
                className={inputBase}
              >
                {BATIDA_OPCOES.map((o) => (
                  <option key={o.value} value={o.value} className="bg-neutral text-white">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60 block mb-1">Ponto / banco de horas</label>
              <select
                value={controlePontoFiltro}
                onChange={(e) => setControlePontoFiltro(e.target.value as ControlePontoFiltro)}
                className={inputBase}
              >
                {CONTROLE_PONTO_OPCOES.map((o) => (
                  <option key={o.value} value={o.value} className="bg-neutral text-white">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </header>

      <div className="p-4">
        <DataTable<JornadaUsuario>
          columns={colunasJornada}
          data={linhasFiltradas}
          keyExtractor={(l) => l.usuarioId}
          loading={loading}
          emptyMessage={
            filtrosAtivos
              ? 'Nenhum colaborador atende aos filtros aplicados.'
              : 'Nenhum colaborador encontrado.'
          }
          onRowClick={(l) => setEditando(l)}
          renderMobileCard={(l) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-white/30 shrink-0"
                  checked={selecionados.has(l.usuarioId)}
                  onChange={() => toggleSelecionado(l.usuarioId)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-white/95">{l.nome}</p>
                  <p className="text-white/60 text-xs">{l.cargo?.nome ?? '—'}</p>
                  <p className="text-white/75 text-xs">
                    {l.jornada
                      ? `${formatHorasJornada(l.jornada.cargaDiariaMin)} · ${l.jornada.inicioPadrao}–${l.jornada.fimPadrao}`
                      : 'Sem jornada'}
                  </p>
                  <p className="text-white/55 text-[11px]">
                    Dias: {formatDiasUteisResumo(l.jornada?.diasUteis)}
                  </p>
                  <p className="text-white/55 text-[11px]">
                    Ponto/BH: {exigePontoBhNaPratica(l) ? 'ativo' : 'sem exigência'} · Batida:{' '}
                    {l.temBatidaPonto ? 'sim' : 'não'}
                  </p>
                </div>
              </div>
              <p className="text-primary/90 text-xs pt-1 pl-7">Toque para editar</p>
            </div>
          )}
        />
      </div>

      {editando ? (
        <EditarJornadaModal
          key={editando.usuarioId}
          linha={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            void carregar();
          }}
        />
      ) : null}
    </section>
  );
}

function EditarJornadaModal({
  linha,
  onClose,
  onSaved,
}: {
  linha: JornadaUsuario;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inicial = useMemo<Partial<Jornada>>(
    () => ({
      cargaDiariaMin: linha.jornada?.cargaDiariaMin ?? 480,
      cargaSemanalMin: linha.jornada?.cargaSemanalMin ?? 2400,
      inicioPadrao: linha.jornada?.inicioPadrao ?? '08:00',
      fimPadrao: linha.jornada?.fimPadrao ?? '17:00',
      tolerAtrasoMin: linha.jornada?.tolerAtrasoMin ?? 10,
      almocoAutomatico: linha.jornada?.almocoAutomatico ?? true,
      almocoInicio: linha.jornada?.almocoInicio ?? '12:00',
      almocoFim: linha.jornada?.almocoFim ?? '13:00',
      diasUteis: linha.jornada?.diasUteis ?? {
        '0': false,
        '1': true,
        '2': true,
        '3': true,
        '4': true,
        '5': true,
        '6': false,
      },
      observacao: linha.jornada?.observacao ?? '',
      controlePonto: linha.jornada?.controlePonto === true || linha.temBatidaPonto === true,
      horarioFlexivel: linha.jornada?.horarioFlexivel === true,
      remuneracaoPontoTipo: (linha.jornada?.remuneracaoPontoTipo as RemuneracaoPontoTipo | undefined) ?? 'NENHUMA',
      valorHora:
        linha.jornada?.valorHora != null && String(linha.jornada.valorHora).length > 0
          ? Number(linha.jornada.valorHora)
          : undefined,
      valorMensal:
        linha.jornada?.valorMensal != null && String(linha.jornada.valorMensal).length > 0
          ? Number(linha.jornada.valorMensal)
          : undefined,
      metaHorasMensalMin: linha.jornada?.metaHorasMensalMin ?? undefined,
    }),
    [linha],
  );

  const [form, setForm] = useState<Partial<Jornada>>(inicial);
  const [salvando, setSalvando] = useState(false);

  const cargasCalculadas = useMemo(
    () =>
      calcularCargasJornada({
        inicioPadrao: form.inicioPadrao ?? '08:00',
        fimPadrao: form.fimPadrao ?? '17:00',
        almocoAutomatico: form.almocoAutomatico,
        almocoInicio: form.almocoInicio,
        almocoFim: form.almocoFim,
        diasUteis: form.diasUteis,
      }),
    [
      form.inicioPadrao,
      form.fimPadrao,
      form.almocoAutomatico,
      form.almocoInicio,
      form.almocoFim,
      form.diasUteis,
    ],
  );

  const cargaSemanalEfetiva = form.horarioFlexivel
    ? (form.cargaSemanalMin ?? 0)
    : cargasCalculadas.cargaSemanalMin;

  const metaMensalPreviewMin = useMemo(
    () => metaHorasMensalMinFromCargaSemanal(cargaSemanalEfetiva),
    [cargaSemanalEfetiva],
  );

  // Geocerca individual: estado próprio porque mistura strings (inputs) com booleans.
  const [geocerca, setGeocerca] = useState<GeocercaValor>(() =>
    geocercaInicialDe({
      latitudeReferencia: linha.jornada?.latitudeReferencia,
      longitudeReferencia: linha.jornada?.longitudeReferencia,
      raioMetros: linha.jornada?.raioMetros,
    }),
  );

  function toggleDia(key: string) {
    setForm((f) => ({
      ...f,
      diasUteis: { ...(f.diasUteis ?? {}), [key]: !(f.diasUteis ?? {})[key] },
    }));
  }

  async function handleSalvar() {
    const result = montarPayloadGeocerca(geocerca);
    if (!result.ok) {
      toast.error(result.motivo);
      return;
    }
    setSalvando(true);
    try {
      if (!form.horarioFlexivel && cargasCalculadas.cargaDiariaMin < 1) {
        toast.error('Ajuste início/fim padrão: o horário final deve ser depois do início.');
        setSalvando(false);
        return;
      }

      const tipo = form.remuneracaoPontoTipo ?? 'NENHUMA';
      if (tipo === 'MENSAL_META_HORAS') {
        const cs = cargaSemanalEfetiva;
        if (!cs || cs < 1) {
          toast.error(
            form.horarioFlexivel
              ? 'Defina a carga semanal (minutos) maior que zero — a meta mensal é calculada a partir dela.'
              : 'Configure horários e dias úteis para gerar a carga semanal.',
          );
          setSalvando(false);
          return;
        }
      }
      if (tipo === 'VALOR_HORA') {
        const v = form.valorHora;
        if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) {
          toast.error('Informe o valor por hora maior que zero.');
          setSalvando(false);
          return;
        }
      }
      if (tipo === 'MENSAL_META_HORAS') {
        const vm = form.valorMensal;
        if (vm == null || !Number.isFinite(Number(vm)) || Number(vm) <= 0) {
          toast.error('Informe o valor mensal maior que zero.');
          setSalvando(false);
          return;
        }
      }

      const payload: Partial<Jornada> = { ...form, ...result.payload };
      if (!form.horarioFlexivel) {
        payload.cargaDiariaMin = cargasCalculadas.cargaDiariaMin;
        payload.cargaSemanalMin = cargasCalculadas.cargaSemanalMin;
      }

      await atualizarJornada(linha.usuarioId, payload);
      toast.success('Jornada atualizada.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Editar jornada — ${linha.nome}`}
      onClose={onClose}
      size="lg"
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
      <label className="flex items-start gap-3 text-sm cursor-pointer rounded-lg border border-white/10 bg-white/5 p-3 mb-1">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-white/30"
          checked={form.controlePonto === true}
          onChange={(e) => setForm((f) => ({ ...f, controlePonto: e.target.checked }))}
        />
        <span>
          <span className="font-medium text-white/90">Exige registro de ponto e banco de horas</span>
          <span className="block text-xs text-white/55 mt-1 leading-relaxed">
            Por padrão fica desmarcado até a primeira batida no app. Quem <strong className="text-white/70">já tem
            batida</strong> aparece marcado aqui. Alterações em lote: selecione linhas na tabela e use os botões de ação.
            Desmarcar quem já bateu impede novas batidas pelo app até reativar.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm cursor-pointer rounded-lg border border-white/10 bg-white/5 p-3 mb-1">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-white/30"
          checked={form.horarioFlexivel === true}
          onChange={(e) => {
            const checked = e.target.checked;
            setForm((f) => {
              if (!checked) {
                return { ...f, horarioFlexivel: false };
              }
              const c = calcularCargasJornada({
                inicioPadrao: f.inicioPadrao ?? '08:00',
                fimPadrao: f.fimPadrao ?? '17:00',
                almocoAutomatico: f.almocoAutomatico,
                almocoInicio: f.almocoInicio,
                almocoFim: f.almocoFim,
                diasUteis: f.diasUteis,
              });
              return {
                ...f,
                horarioFlexivel: true,
                cargaDiariaMin: c.cargaDiariaMin,
                cargaSemanalMin: c.cargaSemanalMin,
              };
            });
          }}
        />
        <span>
          <span className="font-medium text-white/90">Jornada flexível (sem horário fixo de entrada)</span>
          <span className="block text-xs text-white/55 mt-1 leading-relaxed">
            O espelho reparte a <strong className="text-white/70">carga semanal</strong> igualmente pelos dias úteis
            marcados e <strong className="text-white/70">não calcula atraso</strong> pela hora de entrada. Indicado
            para quem só tem meta semanal e bate ponto sem horário exato.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Início padrão">
          <input
            type="time"
            value={form.inicioPadrao ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, inicioPadrao: e.target.value }))}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Fim padrão">
          <input
            type="time"
            value={form.fimPadrao ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, fimPadrao: e.target.value }))}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Tolerância de atraso (min)">
          <input
            type="number"
            value={form.tolerAtrasoMin ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, tolerAtrasoMin: Number(e.target.value) }))}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </Field>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.almocoAutomatico !== false}
            onChange={(e) => setForm((f) => ({ ...f, almocoAutomatico: e.target.checked }))}
          />
          <span>Almoço automático (desconta do espelho sem batida manual)</span>
        </label>
        {form.almocoAutomatico !== false ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início do almoço">
              <input
                type="time"
                value={form.almocoInicio ?? '12:00'}
                onChange={(e) => setForm((f) => ({ ...f, almocoInicio: e.target.value }))}
                className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Fim do almoço">
              <input
                type="time"
                value={form.almocoFim ?? '13:00'}
                onChange={(e) => setForm((f) => ({ ...f, almocoFim: e.target.value }))}
                className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
              />
            </Field>
          </div>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-white/60 mb-2">Dias úteis</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(DIAS_LABEL).map((k) => (
            <label key={k} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={!!(form.diasUteis ?? {})[k]}
                onChange={() => toggleDia(k)}
              />
              {DIAS_LABEL[k]}
            </label>
          ))}
        </div>
      </div>

      {form.horarioFlexivel ? (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="col-span-2 text-xs text-amber-100/80 leading-relaxed">
            Jornada flexível: informe manualmente as cargas contratuais (o espelho reparte a semanal pelos dias
            úteis).
          </p>
          <Field label="Carga diária (min)">
            <input
              type="number"
              min={1}
              value={form.cargaDiariaMin ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, cargaDiariaMin: Number(e.target.value) }))}
              className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Carga semanal (min)">
            <input
              type="number"
              min={1}
              value={form.cargaSemanalMin ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, cargaSemanalMin: Number(e.target.value) }))}
              className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
            />
          </Field>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-100/90">
          <span className="font-medium text-emerald-200">Carga calculada automaticamente</span>
          <span className="block text-xs text-white/60 mt-1 leading-relaxed">
            Diária: <strong className="text-white/85">{formatHorasJornada(cargasCalculadas.cargaDiariaMin)}</strong>
            {' '}({cargasCalculadas.cargaDiariaMin} min) · Semanal:{' '}
            <strong className="text-white/85">{formatHorasJornada(cargasCalculadas.cargaSemanalMin)}</strong>
            {' '}({cargasCalculadas.cargaSemanalMin} min) · {cargasCalculadas.diasUteisCount} dia(s) útil(is)
            <span className="block mt-1 text-white/50">
              Horário {form.inicioPadrao}–{form.fimPadrao}
              {form.almocoAutomatico !== false
                ? `, almoço ${form.almocoInicio ?? '12:00'}–${form.almocoFim ?? '13:00'} descontado`
                : ', sem desconto de almoço'}
            </span>
          </span>
        </div>
      )}

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-3">
        <p className="text-sm font-medium text-white/90">Planejamento financeiro (aba Financeiro → Ponto)</p>
        <p className="text-xs text-white/55 leading-relaxed">
          Opcional. Usado só para estimativa de custo no mês; não substitui folha de pagamento.
        </p>
        <Field label="Tipo de remuneração para projeção">
          <select
            value={form.remuneracaoPontoTipo ?? 'NENHUMA'}
            onChange={(e) =>
              setForm((f) => ({ ...f, remuneracaoPontoTipo: e.target.value as RemuneracaoPontoTipo }))
            }
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="NENHUMA">Não usar</option>
            <option value="VALOR_HORA">Valor por hora</option>
            <option value="MENSAL_META_HORAS">Valor mensal ao atingir meta de horas</option>
          </select>
        </Field>
        {form.remuneracaoPontoTipo === 'VALOR_HORA' ? (
          <Field label="Valor hora (R$)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.valorHora ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  valorHora: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
              className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
            />
          </Field>
        ) : null}
        {form.remuneracaoPontoTipo === 'MENSAL_META_HORAS' ? (
          <div className="space-y-3">
            <Field label="Valor mensal cheio (R$)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.valorMensal ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    valorMensal: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
              />
            </Field>
            <div className="rounded-md border border-white/10 bg-neutral/80 px-3 py-2 text-sm text-white/80">
              <p className="font-medium text-white/90">Meta de horas no mês (automática)</p>
              <p className="mt-1 text-xs text-white/55 leading-relaxed">
                Calculada da <strong className="text-white/75">carga semanal (min)</strong> acima: minutos no mês ≈
                carga semanal × 52 ÷ 12 (média de semanas por mês). Atingiu essa meta no espelho = valor mensal
                cheio; abaixo = proporcional.
              </p>
              <p className="mt-2 tabular-nums text-white/90">
                {metaMensalPreviewMin > 0 ? (
                  <>
                    ≈ <strong>{formatHorasJornada(metaMensalPreviewMin)}</strong>
                    <span className="text-white/50"> ({metaMensalPreviewMin} min)</span>
                  </>
                ) : (
                  <span className="text-amber-200/90">Informe a carga semanal para ver a meta.</span>
                )}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <Field label="Observação">
        <textarea
          value={form.observacao ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
        <div>
          <p className="text-sm font-medium text-white/90">Local de batida específico</p>
          <p className="text-xs text-white/60 mt-1 leading-relaxed">
            Define um ponto + raio próprios para este colaborador (sobrescreve o "Local da
            unidade" só para ele). Útil para externos, home-office com endereço fixo ou
            equipes de outras filiais. <strong>Quando desmarcado</strong>, vale a regra
            global da unidade — ou nenhuma, se a unidade também não tiver geocerca.
          </p>
        </div>
        <GeocercaPicker
          value={geocerca}
          onChange={setGeocerca}
          toggleLabel="Usar local específico para este colaborador (sobrescreve a unidade)"
          mapHeight="h-64"
        />
      </div>
    </Modal>
  );
}
