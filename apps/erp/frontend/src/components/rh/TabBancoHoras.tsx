import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  aprovarSolicitacaoUsoExtrasBancoHoras,
  cancelarSolicitacaoUsoExtrasBancoHoras,
  criarAjustePonto,
  excluirLancamentoBancoHoras,
  fecharBancoHorasEmMassa,
  getMeuBancoHoras,
  getResumoBancoHoras,
  lancarBancoHoras,
  listarTodosPontos,
  listarSolicitacoesUsoExtrasBancoHoras,
  removerPonto,
  reprovarSolicitacaoUsoExtrasBancoHoras,
  solicitarUsoExtrasBancoHoras,
  type BancoHorasLancamento,
  type BancoHorasUsoExtrasSolicitacao,
  type JornadaAlmocoResumo,
  type RegistroPonto,
  type TipoBatida,
} from '../../services/rh';
import { DataTable, type DataTableColumn } from '../DataTable';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { useAuthStore } from '../../store/auth';
import { getCargoNome, userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { ExportarBatidasMesModal } from './ExportarBatidasMesModal';
import { ImprimirMinhaFolhaPontoButton } from './ImprimirMinhaFolhaPontoButton';
import { btn } from '../../utils/buttonStyles';
import {
  BancoHorasFiltroConsulta,
  Card,
  Field,
  Modal,
  competenciaCorrente,
  filtroBancoHorasParaParams,
  formatData,
  formatHoras,
  rotuloPeriodoBancoHoras,
  type EstadoFiltroBancoHoras,
} from './rhUi';

type FechamentoFiltro = 'all' | 'aberto' | 'fechado';
type BloqueioFiltro = 'all' | 'com' | 'sem';
type SaldoFiltro = 'all' | 'positivo' | 'negativo' | 'zero';

type LinhaEquipe = {
  usuarioId: number;
  nome: string;
  email: string;
  saldoMesMin: number;
  saldoAcumuladoMin: number;
  fechado: boolean;
  bloqueios?: {
    documentosVencendo: number;
    afastamentosSemAnexo: number;
    saldoNegativo: boolean;
  };
};

/** Rótulo amigável para a coluna Origem (inclui linhas virtuais pré-fechamento). */
export function rotuloOrigemBancoHoras(origem: BancoHorasLancamento['origem']): string {
  switch (origem) {
    case 'BATIDA_PRE':
      return 'Batida (mês aberto)';
    case 'SALDO_PRE':
      return 'Espelho — saldo do dia (mês aberto)';
    case 'PONTO':
      return 'Ponto (fechamento)';
    case 'FECHAMENTO':
      return 'Fechamento';
    case 'AJUSTE':
      return 'Ajuste manual';
    case 'COMPENSACAO':
      return 'Compensação / uso extras';
    default:
      return origem;
  }
}

export const COLUNAS_LANCAMENTOS_BANCO_HORAS: DataTableColumn<BancoHorasLancamento>[] = [
  { key: 'data', label: 'Data', render: (l) => formatData(l.data) },
  {
    key: 'credito',
    label: 'Crédito',
    render: (l) => (
      <span className="text-green-300">{l.minutosCredito ? formatHoras(l.minutosCredito) : '—'}</span>
    ),
  },
  {
    key: 'debito',
    label: 'Débito',
    render: (l) => (
      <span className="text-red-300">{l.minutosDebito ? formatHoras(l.minutosDebito) : '—'}</span>
    ),
  },
  {
    key: 'origem',
    label: 'Origem',
    render: (l) => (
      <span className="text-xs text-white/60">{rotuloOrigemBancoHoras(l.origem)}</span>
    ),
  },
  {
    key: 'descricao',
    label: 'Descrição',
    render: (l) => <span className="text-xs">{l.descricao ?? '—'}</span>,
  },
];

/** Lançamentos que podem ser apagados manualmente (não espelho / fechamento automático). */
export function bancoHorasLancamentoExclusivel(l: BancoHorasLancamento): boolean {
  return l.origem === 'AJUSTE' || l.origem === 'COMPENSACAO';
}

export type LancamentosBancoHorasAcoesExtra = {
  competenciaFechada?: boolean;
  /** Requer permissão `ponto:ajustar`. Registra ENTRADA e SAÍDA como AJUSTE_RH no dia da linha. */
  podeAjustarPonto?: boolean;
  onAjustarBatidasDia?: (l: BancoHorasLancamento) => void;
};

export function colunasLancamentosBancoHorasComAcoes(
  onExcluir: (l: BancoHorasLancamento) => void,
  extra?: LancamentosBancoHorasAcoesExtra,
): DataTableColumn<BancoHorasLancamento>[] {
  return [
    ...COLUNAS_LANCAMENTOS_BANCO_HORAS,
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      stopRowClick: true,
      thClassName: 'whitespace-nowrap w-36',
      tdClassName: 'whitespace-nowrap',
      render: (l) => {
        const excluir =
          bancoHorasLancamentoExclusivel(l) ? (
            <button
              type="button"
              onClick={() => onExcluir(l)}
              className="text-red-300 hover:text-red-200 text-sm font-medium"
            >
              Excluir
            </button>
          ) : null;
        const ajustar =
          extra?.podeAjustarPonto &&
          !extra.competenciaFechada &&
          extra.onAjustarBatidasDia ? (
            <button
              type="button"
              onClick={() => extra.onAjustarBatidasDia!(l)}
              className="text-primary hover:text-primary/90 text-sm font-medium"
            >
              Ajustar batidas
            </button>
          ) : null;
        if (!excluir && !ajustar) {
          return <span className="text-white/35 text-xs">—</span>;
        }
        return (
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            {ajustar}
            {excluir}
          </div>
        );
      },
    },
  ];
}

/** YYYY-MM-DD no calendário local do navegador (alinha com formatData em pt-BR). */
export function dataLancamentoChaveDiaLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Horários de entrada/saída descritos no texto (espelho, batida), evitando usar o timestamp do lançamento virtual. */
function extrairHorariosDescricao(descricao: string): {
  entradas: string[];
  saidas: string[];
} {
  const entradas: string[] = [];
  const saidas: string[] = [];
  const normalize = (s: string) => s.slice(0, 5);
  for (const m of descricao.matchAll(/entrada[^0-9]*(\d{2}:\d{2})/gi)) {
    entradas.push(normalize(m[1] ?? ''));
  }
  for (const m of descricao.matchAll(/sa[ií]da[^0-9]*(\d{2}:\d{2})/gi)) {
    saidas.push(normalize(m[1] ?? ''));
  }
  return { entradas, saidas };
}

/**
 * Agrupa lançamentos do mesmo dia para reduzir ruído visual.
 * Regra de tela: 1 linha por dia (04/05, 05/05, ...), sempre.
 *
 * Importante: não usar `slice(0,10)` do ISO — é a data em UTC; batidas à tarde/noite
 * e o saldo virtual (ex.: 23:59 local) podem cair em dias UTC diferentes e quebrar o grupo.
 */
export function agruparLancamentosMesmoDia(
  lancamentos: BancoHorasLancamento[],
): BancoHorasLancamento[] {
  const porDia = new Map<string, BancoHorasLancamento[]>();
  for (const l of lancamentos) {
    const dia = dataLancamentoChaveDiaLocal(l.data);
    const arr = porDia.get(dia) ?? [];
    arr.push(l);
    porDia.set(dia, arr);
  }

  const dias = Array.from(porDia.keys()).sort((a, b) => a.localeCompare(b));
  const out: BancoHorasLancamento[] = [];

  for (const dia of dias) {
    const itens = (porDia.get(dia) ?? []).sort((a, b) => a.data.localeCompare(b.data));
    const base = itens[0];
    const credito = itens.reduce((acc, l) => acc + (l.minutosCredito || 0), 0);
    const debito = itens.reduce((acc, l) => acc + (l.minutosDebito || 0), 0);

    const entradas: string[] = [];
    const saidas: string[] = [];
    const extras: string[] = [];

    for (const l of itens) {
      const descRaw = l.descricao ?? '';
      const { entradas: eDesc, saidas: sDesc } = extrairHorariosDescricao(descRaw);
      if (eDesc.length || sDesc.length) {
        entradas.push(...eDesc);
        saidas.push(...sDesc);
        continue;
      }
      const hhmm = new Date(l.data).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const desc = descRaw.toLowerCase();
      if (desc.includes('entrada')) {
        entradas.push(hhmm);
      } else if (desc.includes('saída') || desc.includes('saida')) {
        saidas.push(hhmm);
      } else {
        extras.push(`[${rotuloOrigemBancoHoras(l.origem)}] ${descRaw || '—'}`);
      }
    }

    const yyyymmdd = Number(dia.replaceAll('-', ''));
    const partes: string[] = [];
    if (entradas.length) partes.push(`Entradas: ${entradas.join(', ')}`);
    if (saidas.length) partes.push(`Saídas: ${saidas.join(', ')}`);
    if (extras.length) partes.push(extras.join(' · '));
    if (!partes.length) partes.push('Sem eventos detalhados.');

    const [yLoc, mLoc, dLoc] = dia.split('-').map(Number);
    const dataColuna = new Date(yLoc, mLoc - 1, dLoc, 12, 0, 0, 0);

    out.push({
      ...base,
      id: -yyyymmdd,
      origem: 'SALDO_PRE',
      data: dataColuna.toISOString(),
      minutosCredito: credito,
      minutosDebito: debito,
      descricao: `Consolidado do dia (${itens.length}): ${partes.join(' | ')}`,
    });
  }

  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Confirmação de exclusão de lançamento (AJUSTE / COMPENSACAO) no padrão visual do RH. */
export function ModalConfirmarExcluirLancamentoBancoHoras({
  lancamento,
  usuarioIdAlvo,
  onClose,
  onExcluido,
}: {
  lancamento: BancoHorasLancamento | null;
  usuarioIdAlvo: number;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [salvando, setSalvando] = useState(false);

  if (!lancamento) return null;
  const lancamentoAlvo = lancamento;

  async function confirmar() {
    setSalvando(true);
    try {
      await excluirLancamentoBancoHoras(usuarioIdAlvo, lancamentoAlvo.id);
      toast.success('Lançamento excluído.');
      onClose();
      onExcluido();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  const fechar = () => {
    if (salvando) return;
    onClose();
  };

  return (
    <Modal
      title="Excluir lançamento"
      onClose={fechar}
      footer={
        <>
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={salvando}
            className="px-3 py-2 rounded bg-red-600 text-white font-semibold text-sm hover:bg-red-500 disabled:opacity-50"
          >
            {salvando ? 'Excluindo…' : 'Excluir'}
          </button>
        </>
      }
    >
      <p className="text-sm text-white/75 leading-relaxed">
        Confirma a exclusão deste lançamento? Esta ação não pode ser desfeita.
      </p>
      <ul className="mt-3 text-sm text-white/60 space-y-1 list-disc list-inside">
        <li>Data: {formatData(lancamentoAlvo.data)}</li>
        <li>Origem: {lancamentoAlvo.origem}</li>
        <li>
          Crédito: {lancamentoAlvo.minutosCredito ? formatHoras(lancamentoAlvo.minutosCredito) : '—'} · Débito:{' '}
          {lancamentoAlvo.minutosDebito ? formatHoras(lancamentoAlvo.minutosDebito) : '—'}
        </li>
      </ul>
    </Modal>
  );
}

export function TabBancoHoras() {
  const user = useAuthStore((s) => s.user);
  const podeVerTodos = userHasPermission(user, 'banco_horas:ver_todos');
  const podeFechar = userHasPermission(user, 'banco_horas:fechar');
  const podeExportarBatidas = userHasPermission(user, 'ponto:exportar');
  const navigate = useNavigate();
  const [exportarBatidasOpen, setExportarBatidasOpen] = useState(false);

  const [filtro, setFiltro] = useState<EstadoFiltroBancoHoras>({
    modo: 'mes',
    competencia: competenciaCorrente(),
  });
  const consultaParams = useMemo(() => filtroBancoHorasParaParams(filtro), [filtro]);
  const rotuloConsulta = useMemo(() => rotuloPeriodoBancoHoras(filtro), [filtro]);
  const consultaPorMes = filtro.modo === 'mes';
  const competenciaMes = consultaPorMes ? filtro.competencia : competenciaCorrente();

  const [meu, setMeu] = useState<Awaited<ReturnType<typeof getMeuBancoHoras>> | null>(null);
  const [resumo, setResumo] = useState<{
    competencia: string | null;
    periodo?: { dataInicio: string; dataFim: string };
    usuarios: LinhaEquipe[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lancamentoExcluir, setLancamentoExcluir] = useState<BancoHorasLancamento | null>(null);
  const [linhaAjustePonto, setLinhaAjustePonto] = useState<BancoHorasLancamento | null>(null);
  const [pendentesUsoExtras, setPendentesUsoExtras] = useState<BancoHorasUsoExtrasSolicitacao[]>([]);
  const [minutosUsoExtras, setMinutosUsoExtras] = useState('');
  const [obsUsoExtras, setObsUsoExtras] = useState('');
  const [salvandoUsoExtras, setSalvandoUsoExtras] = useState(false);
  const [solicAcao, setSolicAcao] = useState<BancoHorasUsoExtrasSolicitacao | null>(null);
  const [tipoAcaoSolic, setTipoAcaoSolic] = useState<'aprovar' | 'reprovar' | null>(null);
  const [comentarioAcaoSolic, setComentarioAcaoSolic] = useState('');
  const [salvandoAcaoSolic, setSalvandoAcaoSolic] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(() => new Set());
  const [fechandoMassa, setFechandoMassa] = useState(false);

  // Filtros da lista da equipe.
  const [showFiltros, setShowFiltros] = useState(false);
  const [buscaEquipe, setBuscaEquipe] = useState('');
  const [fechamentoFiltro, setFechamentoFiltro] = useState<FechamentoFiltro>('all');
  const [bloqueioFiltro, setBloqueioFiltro] = useState<BloqueioFiltro>('all');
  const [saldoMesFiltro, setSaldoMesFiltro] = useState<SaldoFiltro>('all');
  const [saldoAcumFiltro, setSaldoAcumFiltro] = useState<SaldoFiltro>('all');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r, pend] = await Promise.all([
        getMeuBancoHoras(consultaParams).catch(() => null),
        podeVerTodos ? getResumoBancoHoras(consultaParams) : Promise.resolve(null),
        podeFechar ? listarSolicitacoesUsoExtrasBancoHoras('PENDENTE').catch(() => []) : Promise.resolve([]),
      ]);
      setMeu(m);
      setResumo(r);
      setPendentesUsoExtras(Array.isArray(pend) ? pend : []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [consultaParams, podeVerTodos, podeFechar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const meuUsuarioId = user?.id;
  const podeAjustarPonto = userHasPermission(user, 'ponto:ajustar');
  const meuMesFechado = consultaPorMes && !!meu?.fechamento;

  const colunasExtratoMeu = useMemo(() => {
    const extra = {
      competenciaFechada: meuMesFechado,
      podeAjustarPonto,
      onAjustarBatidasDia: (l: BancoHorasLancamento) => setLinhaAjustePonto(l),
    };
    if (!meuUsuarioId) return COLUNAS_LANCAMENTOS_BANCO_HORAS;
    if (!podeFechar) {
      if (!podeAjustarPonto || meuMesFechado) return COLUNAS_LANCAMENTOS_BANCO_HORAS;
      return colunasLancamentosBancoHorasComAcoes(() => {}, extra);
    }
    return colunasLancamentosBancoHorasComAcoes((l) => setLancamentoExcluir(l), extra);
  }, [podeFechar, meuUsuarioId, podeAjustarPonto, meuMesFechado]);
  const lancamentosMeuAgrupados = useMemo(
    () => agruparLancamentosMesmoDia(meu?.lancamentos ?? []),
    [meu?.lancamentos],
  );

  const toggleSelecionado = useCallback((usuarioId: number, checked: boolean) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (checked) next.add(usuarioId);
      else next.delete(usuarioId);
      return next;
    });
  }, []);

  const colunasEquipe = useMemo((): DataTableColumn<LinhaEquipe>[] => {
    const colunas: DataTableColumn<LinhaEquipe>[] = [];
    if (podeFechar) {
      colunas.push({
        key: 'sel',
        label: '',
        thClassName: 'w-10',
        stopRowClick: true,
        render: (u) => (
          <input
            type="checkbox"
            disabled={u.fechado}
            checked={selecionados.has(u.usuarioId)}
            onChange={(e) => toggleSelecionado(u.usuarioId, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      });
    }
    colunas.push(
      { key: 'nome', label: 'Colaborador', render: (u) => <span className="font-medium text-white/95">{u.nome}</span> },
      {
        key: 'saldoMes',
        label: 'Saldo do mês',
        render: (u) => (
          <span className={u.saldoMesMin < 0 ? 'text-red-300' : 'text-green-300'}>
            {formatHoras(u.saldoMesMin)}
          </span>
        ),
      },
      {
        key: 'saldoAcum',
        label: 'Banco (acum.)',
        render: (u) => (
          <span
            className={u.saldoAcumuladoMin > 0 ? 'text-green-300' : 'text-white/45'}
            title="Só horas positivas acumulam; déficit do mês não carrega"
          >
            {formatHoras(u.saldoAcumuladoMin)}
          </span>
        ),
      },
      {
        key: 'fech',
        label: 'Fechamento',
        render: (u) => <span className="text-sm text-white/75">{u.fechado ? 'Fechado' : 'Em aberto'}</span>,
      },
      {
        key: 'bloq',
        label: 'Bloqueios',
        render: (u) => {
          const b = u.bloqueios;
          if (!b) return <span className="text-xs text-white/40">—</span>;
          const itens: string[] = [];
          if (b.documentosVencendo > 0) itens.push(`${b.documentosVencendo} doc. vencendo`);
          if (b.afastamentosSemAnexo > 0) itens.push(`${b.afastamentosSemAnexo} afast. sem anexo`);
          if (b.saldoNegativo) itens.push('saldo negativo');
          if (!itens.length) return <span className="text-xs text-emerald-300">OK</span>;
          return (
            <span className="text-xs text-amber-300" title={itens.join(' · ')}>
              ⚠ {itens.length}
            </span>
          );
        },
      },
      {
        key: 'hint',
        label: '',
        align: 'right',
        thClassName: 'w-32',
        render: () => <span className="text-xs text-primary/90">Ver extrato →</span>,
      },
    );
    return colunas;
  }, [podeFechar, selecionados, toggleSelecionado]);

  const equipeOrdenada = useMemo(() => {
    if (!resumo) return [];
    return [...resumo.usuarios].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [resumo]);

  const equipeFiltrada = useMemo(() => {
    const termo = buscaEquipe.trim().toLowerCase();
    const matchSaldo = (min: number, modo: SaldoFiltro) => {
      switch (modo) {
        case 'positivo':
          return min > 0;
        case 'negativo':
          return min < 0;
        case 'zero':
          return min === 0;
        default:
          return true;
      }
    };
    const temBloqueio = (u: LinhaEquipe) => {
      const b = u.bloqueios;
      if (!b) return false;
      return b.documentosVencendo > 0 || b.afastamentosSemAnexo > 0 || b.saldoNegativo;
    };
    return equipeOrdenada.filter((u) => {
      if (termo) {
        const alvo = `${u.nome} ${u.email ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (fechamentoFiltro === 'aberto' && u.fechado) return false;
      if (fechamentoFiltro === 'fechado' && !u.fechado) return false;
      if (bloqueioFiltro === 'com' && !temBloqueio(u)) return false;
      if (bloqueioFiltro === 'sem' && temBloqueio(u)) return false;
      if (!matchSaldo(u.saldoMesMin, saldoMesFiltro)) return false;
      if (!matchSaldo(u.saldoAcumuladoMin, saldoAcumFiltro)) return false;
      return true;
    });
  }, [equipeOrdenada, buscaEquipe, fechamentoFiltro, bloqueioFiltro, saldoMesFiltro, saldoAcumFiltro]);

  const filtrosEquipeAtivos =
    buscaEquipe.trim().length > 0 ||
    fechamentoFiltro !== 'all' ||
    bloqueioFiltro !== 'all' ||
    saldoMesFiltro !== 'all' ||
    saldoAcumFiltro !== 'all';

  const limparFiltrosEquipe = () => {
    setBuscaEquipe('');
    setFechamentoFiltro('all');
    setBloqueioFiltro('all');
    setSaldoMesFiltro('all');
    setSaldoAcumFiltro('all');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-sm text-white/60 max-w-xl">
          Consulte por <strong className="text-white/75">mês</strong> (competência) ou por{' '}
          <strong className="text-white/75">intervalo de datas</strong>. Fechamento em massa só está disponível no
          modo por mês. Na equipe, clique em um colaborador para o extrato completo.
        </p>
        <BancoHorasFiltroConsulta filtro={filtro} onChange={setFiltro} />
      </div>

      {consultaPorMes && podeExportarBatidas ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="text-sm text-white/70 max-w-xl">
            Exporte a <strong className="text-white/85">folha de frequência</strong> (PDF) ou relatórios em Excel,
            HTML ou CSV da competência <strong className="text-white/85">{competenciaMes}</strong>.
          </p>
          <button
            type="button"
            onClick={() => setExportarBatidasOpen(true)}
            className={btn.primarySoft}
          >
            Exportar batidas do mês
          </button>
        </div>
      ) : null}

      {podeVerTodos && resumo && podeFechar && consultaPorMes && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-white/70">
            Selecionados: <span className="font-semibold text-white">{selecionados.size}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selecionados.size === 0 || fechandoMassa}
              onClick={async () => {
                if (selecionados.size === 0) return;
                if (
                  !window.confirm(
                    `Fechar competência ${competenciaMes} para ${selecionados.size} colaborador(es)?`,
                  )
                )
                  return;
                setFechandoMassa(true);
                try {
                  const r = await fecharBancoHorasEmMassa(Array.from(selecionados), competenciaMes);
                  toast.success(
                    `Fechamento em massa: ${r.sucessos.length} ok` +
                      (r.falhas.length ? `, ${r.falhas.length} falharam` : ''),
                  );
                  setSelecionados(new Set());
                  await carregar();
                } catch (err) {
                  toast.error(`Falha no fechamento em massa. ${formatApiError(err)}`);
                } finally {
                  setFechandoMassa(false);
                }
              }}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {fechandoMassa ? 'Fechando…' : 'Fechar selecionados'}
            </button>
            <button
              type="button"
              disabled={!equipeFiltrada.some((u) => !u.fechado)}
              onClick={() => {
                const abertos = equipeFiltrada.filter((u) => !u.fechado).map((u) => u.usuarioId);
                setSelecionados(new Set(abertos));
              }}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
              title={
                filtrosEquipeAtivos
                  ? 'Seleciona apenas os colaboradores abertos visíveis (filtros aplicados)'
                  : 'Seleciona todos os colaboradores em aberto'
              }
            >
              {filtrosEquipeAtivos ? 'Selecionar abertos visíveis' : 'Selecionar todos abertos'}
            </button>
            <button
              type="button"
              disabled={selecionados.size === 0}
              onClick={() => setSelecionados(new Set())}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {podeVerTodos && resumo ? (
        <CollapsibleFilters
          title="Filtros da equipe"
          show={showFiltros}
          setShow={setShowFiltros}
          hasActiveFilters={filtrosEquipeAtivos}
          onClear={limparFiltrosEquipe}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Buscar colaborador</label>
              <input
                type="text"
                placeholder="Nome ou e-mail…"
                value={buscaEquipe}
                onChange={(e) => setBuscaEquipe(e.target.value)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Fechamento</label>
              <select
                value={fechamentoFiltro}
                onChange={(e) => setFechamentoFiltro(e.target.value as FechamentoFiltro)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral text-white">Todos</option>
                <option value="aberto" className="bg-neutral text-white">Em aberto</option>
                <option value="fechado" className="bg-neutral text-white">Fechado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Bloqueios</label>
              <select
                value={bloqueioFiltro}
                onChange={(e) => setBloqueioFiltro(e.target.value as BloqueioFiltro)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral text-white">Todos</option>
                <option value="com" className="bg-neutral text-white">Com bloqueios</option>
                <option value="sem" className="bg-neutral text-white">Sem bloqueios (OK)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Saldo do mês</label>
              <select
                value={saldoMesFiltro}
                onChange={(e) => setSaldoMesFiltro(e.target.value as SaldoFiltro)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral text-white">Qualquer</option>
                <option value="positivo" className="bg-neutral text-white">Positivo (&gt; 0h)</option>
                <option value="negativo" className="bg-neutral text-white">Negativo (&lt; 0h)</option>
                <option value="zero" className="bg-neutral text-white">Zerado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Saldo acumulado</label>
              <select
                value={saldoAcumFiltro}
                onChange={(e) => setSaldoAcumFiltro(e.target.value as SaldoFiltro)}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral text-white">Qualquer</option>
                <option value="positivo" className="bg-neutral text-white">Positivo (&gt; 0h)</option>
                <option value="negativo" className="bg-neutral text-white">Negativo (&lt; 0h)</option>
                <option value="zero" className="bg-neutral text-white">Zerado</option>
              </select>
            </div>
          </div>
        </CollapsibleFilters>
      ) : null}

      {podeVerTodos && resumo ? (
        <Card
          title={`Equipe — ${resumo.periodo ? rotuloPeriodoBancoHoras({ modo: 'periodo', ...resumo.periodo }) : resumo.competencia ?? rotuloConsulta}`}
        >
          <DataTable<LinhaEquipe>
            columns={colunasEquipe}
            data={equipeFiltrada}
            keyExtractor={(u) => u.usuarioId}
            emptyMessage={
              filtrosEquipeAtivos
                ? 'Nenhum colaborador atende aos filtros aplicados.'
                : 'Nenhum colaborador na competência.'
            }
            onRowClick={(u) => {
              const q =
                filtro.modo === 'mes'
                  ? `competencia=${encodeURIComponent(filtro.competencia)}`
                  : `dataInicio=${encodeURIComponent(filtro.dataInicio)}&dataFim=${encodeURIComponent(filtro.dataFim)}`;
              navigate(`/rh/banco-horas/${u.usuarioId}?${q}`, { state: { nome: u.nome } });
            }}
            renderMobileCard={(u) => (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-1">
                <p className="font-medium text-white/95">{u.nome}</p>
                <p className="text-white/55 text-xs">
                  Mês:{' '}
                  <span className={u.saldoMesMin < 0 ? 'text-red-300' : 'text-green-300'}>
                    {formatHoras(u.saldoMesMin)}
                  </span>
                  {' · '}
                  Banco:{' '}
                  <span className={u.saldoAcumuladoMin > 0 ? 'text-green-300' : 'text-white/45'}>
                    {formatHoras(u.saldoAcumuladoMin)}
                  </span>
                </p>
                <p className="text-primary/90 text-xs pt-1">Toque para ver o extrato completo</p>
              </div>
            )}
          />
        </Card>
      ) : null}

      <Card title={`Meu extrato — ${rotuloConsulta}`}>
        {loading ? (
          <p className="text-white/60">Carregando...</p>
        ) : !meu ? (
          <p className="text-white/60">Sem dados.</p>
        ) : meu.participaControlePonto === false ? (
          <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100/95 leading-relaxed">
            Você ainda <strong className="text-amber-50">não está no banco de horas</strong> (padrão até a primeira
            batida de ponto) ou o RH deixou o controle dispensado. Para passar a ver saldo aqui, bata ponto uma vez no
            app ou peça no <strong className="text-amber-50">RH → Jornada</strong> para marcarem &quot;Exige registro de
            ponto e banco de horas&quot;.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Box
                label={meu.periodo || !consultaPorMes ? 'Saldo do período' : 'Saldo do mês'}
                valor={formatHoras(meu.saldoMesMin)}
                valorClass={meu.saldoMesMin < 0 ? 'text-red-300' : 'text-green-300'}
              />
              <Box
                label="Banco (acumulado)"
                valor={formatHoras(meu.saldoAcumuladoMin)}
                valorClass={meu.saldoAcumuladoMin > 0 ? 'text-green-300' : 'text-white/45'}
              />
              <Box
                label="Fechamento"
                valor={
                  meu.periodo
                    ? 'Por período'
                    : meu.fechamento
                      ? `Fechado ${formatData(meu.fechamento.fechadoEm)}`
                      : 'Em aberto'
                }
              />
            </div>

            {user?.id ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-sm text-white/65 flex-1 min-w-[200px]">
                  Baixe ou imprima a <strong className="text-white/85">folha de ponto</strong> do{' '}
                  {consultaPorMes ? 'mês' : 'período'}{' '}
                  <strong className="text-white/85">{rotuloConsulta}</strong> (batidas, horários e saldo).
                </p>
                <ImprimirMinhaFolhaPontoButton
                  filtro={filtro}
                  usuarioId={user.id}
                  nome={user.nome}
                  funcao={getCargoNome(user) || user.funcao || undefined}
                  usuarioIdAtual={user.id}
                />
              </div>
            ) : null}

            {meu.politicaUsoExtras ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 space-y-3">
                <p className="text-sm font-semibold text-white/90">Uso de horas extras (solicitação ao RH)</p>
                <p className="text-xs text-white/55 leading-relaxed">
                  O RH define se você pode solicitar e até quantos minutos no total (pendentes + aprovados contam no
                  limite). Ao aprovar, o RH lança um débito no banco (compensação) na competência escolhida, desde que
                  exista saldo acumulado suficiente até esse mês.
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-white/70">
                    Autorizado:{' '}
                    <strong className={meu.politicaUsoExtras.permitido ? 'text-green-300' : 'text-white/50'}>
                      {meu.politicaUsoExtras.permitido ? 'Sim' : 'Não'}
                    </strong>
                  </span>
                  {meu.politicaUsoExtras.permitido ? (
                    <>
                      <span className="text-white/70">
                        Limite:{' '}
                        <strong className="text-white">
                          {meu.politicaUsoExtras.limiteMinutos != null
                            ? formatHoras(meu.politicaUsoExtras.limiteMinutos)
                            : '—'}
                        </strong>
                      </span>
                      <span className="text-white/70">
                        Disponível p/ solicitar:{' '}
                        <strong className="text-primary">
                          {meu.politicaUsoExtras.disponivelMinutos != null
                            ? formatHoras(meu.politicaUsoExtras.disponivelMinutos)
                            : '—'}
                        </strong>
                      </span>
                    </>
                  ) : null}
                </div>
                {meu.politicaUsoExtras.permitido &&
                meu.politicaUsoExtras.disponivelMinutos != null &&
                meu.politicaUsoExtras.disponivelMinutos > 0 ? (
                  <form
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/10"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const min = Number.parseInt(minutosUsoExtras.trim(), 10);
                      if (!Number.isFinite(min) || min < 1) {
                        toast.error('Informe a quantidade em minutos (número inteiro ≥ 1).');
                        return;
                      }
                      if (min > meu.politicaUsoExtras!.disponivelMinutos!) {
                        toast.error('Valor acima do disponível no seu limite.');
                        return;
                      }
                      setSalvandoUsoExtras(true);
                      void (async () => {
                        try {
                          await solicitarUsoExtrasBancoHoras({
                            minutos: min,
                            observacao: obsUsoExtras.trim() || undefined,
                            competencia: meu.competencia,
                          });
                          toast.success('Solicitação enviada ao RH.');
                          setMinutosUsoExtras('');
                          setObsUsoExtras('');
                          await carregar();
                        } catch (err) {
                          toast.error(formatApiError(err));
                        } finally {
                          setSalvandoUsoExtras(false);
                        }
                      })();
                    }}
                  >
                    <Field label="Quantidade (minutos)">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={minutosUsoExtras}
                        onChange={(e) => setMinutosUsoExtras(e.target.value)}
                        placeholder={`máx. ${meu.politicaUsoExtras.disponivelMinutos}`}
                        className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </Field>
                    <Field label="Competência do débito (mês)">
                      <input
                        type="month"
                        value={meu.competencia}
                        readOnly
                        className="w-full h-9 rounded-md border border-white/10 bg-white/5 px-2.5 text-sm text-white/70"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Observação (opcional)">
                        <textarea
                          rows={2}
                          value={obsUsoExtras}
                          onChange={(e) => setObsUsoExtras(e.target.value)}
                          className="w-full rounded-md border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                          placeholder="Motivo / como pretende usar…"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={salvandoUsoExtras}
                        className="px-4 py-2 rounded-md bg-primary text-neutral text-sm font-semibold hover:opacity-95 disabled:opacity-50"
                      >
                        {salvandoUsoExtras ? 'Enviando…' : 'Enviar solicitação'}
                      </button>
                    </div>
                  </form>
                ) : meu.politicaUsoExtras.permitido ? (
                  <p className="text-xs text-amber-200/90">Sem minutos disponíveis no limite (aguarde análise de solicitações pendentes ou peça aumento ao RH).</p>
                ) : null}

                {meu.solicitacoesUsoExtras && meu.solicitacoesUsoExtras.length > 0 ? (
                  <div className="border-t border-white/10 pt-3">
                    <p className="text-xs uppercase tracking-wide text-white/45 mb-2">Suas solicitações recentes</p>
                    <ul className="space-y-2 text-sm">
                      {meu.solicitacoesUsoExtras.slice(0, 10).map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <span className="text-white/80">
                            {formatHoras(s.minutosSolicitados)} · {s.competencia} ·{' '}
                            <span className="text-white/55">{s.status}</span>
                          </span>
                          {s.status === 'PENDENTE' ? (
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await cancelarSolicitacaoUsoExtrasBancoHoras(s.id);
                                    toast.success('Solicitação cancelada.');
                                    await carregar();
                                  } catch (err) {
                                    toast.error(formatApiError(err));
                                  }
                                })();
                              }}
                              className="text-xs text-red-300 hover:text-red-200"
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {podeFechar && pendentesUsoExtras.length > 0 ? (
              <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-100">Solicitações pendentes (uso de extras)</p>
                <ul className="space-y-2 text-sm">
                  {pendentesUsoExtras.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2"
                    >
                      <span className="text-white/85">
                        <span className="font-medium">{s.usuario?.nome ?? `#${s.usuarioId}`}</span>
                        {' · '}
                        {formatHoras(s.minutosSolicitados)} · {s.competencia}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSolicAcao(s);
                            setTipoAcaoSolic('aprovar');
                            setComentarioAcaoSolic('');
                          }}
                          className="text-xs px-2 py-1 rounded bg-green-600/80 text-white hover:bg-green-600"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSolicAcao(s);
                            setTipoAcaoSolic('reprovar');
                            setComentarioAcaoSolic('');
                          }}
                          className="text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                        >
                          Reprovar
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="border-t border-white/10 pt-4 mt-4">
              <DataTable<BancoHorasLancamento>
                columns={colunasExtratoMeu}
                data={lancamentosMeuAgrupados}
                keyExtractor={(l) => l.id}
                emptyMessage="Sem lançamentos no mês."
                renderMobileCard={(l) => (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-1">
                    <p className="text-white/90 font-medium">{formatData(l.data)}</p>
                    <p className="text-xs text-white/60">{l.origem}</p>
                    <p className="text-xs">
                      <span className="text-green-300">
                        Créd.: {l.minutosCredito ? formatHoras(l.minutosCredito) : '—'}
                      </span>
                      {' · '}
                      <span className="text-red-300">
                        Déb.: {l.minutosDebito ? formatHoras(l.minutosDebito) : '—'}
                      </span>
                    </p>
                    <p className="text-white/55 text-xs line-clamp-2">{l.descricao ?? '—'}</p>
                    {podeAjustarPonto && !meuMesFechado ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLinhaAjustePonto(l);
                        }}
                        className="text-primary hover:text-primary/90 text-sm font-medium pt-1 text-left"
                      >
                        Ajustar batidas
                      </button>
                    ) : null}
                    {podeFechar && meuUsuarioId && bancoHorasLancamentoExclusivel(l) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLancamentoExcluir(l);
                        }}
                        className="text-red-300 hover:text-red-200 text-sm font-medium pt-1"
                      >
                        Excluir lançamento
                      </button>
                    ) : null}
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </Card>

      {meuUsuarioId ? (
        <ModalConfirmarExcluirLancamentoBancoHoras
          lancamento={lancamentoExcluir}
          usuarioIdAlvo={meuUsuarioId}
          onClose={() => setLancamentoExcluir(null)}
          onExcluido={() => void carregar()}
        />
      ) : null}

      {linhaAjustePonto && meuUsuarioId ? (
        <ModalAjustePontoParDia
          competencia={linhaAjustePonto.competencia}
          usuarioId={meuUsuarioId}
          nomeColaborador={user?.nome ?? 'Eu'}
          jornadaAlmoco={meu?.jornadaAlmoco}
          linha={linhaAjustePonto}
          onClose={() => setLinhaAjustePonto(null)}
          onSaved={() => {
            setLinhaAjustePonto(null);
            void carregar();
          }}
        />
      ) : null}

      {solicAcao && tipoAcaoSolic ? (
        <Modal
          title={tipoAcaoSolic === 'aprovar' ? 'Aprovar uso de horas extras' : 'Reprovar solicitação'}
          onClose={() => {
            if (salvandoAcaoSolic) return;
            setSolicAcao(null);
            setTipoAcaoSolic(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  if (salvandoAcaoSolic) return;
                  setSolicAcao(null);
                  setTipoAcaoSolic(null);
                }}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvandoAcaoSolic}
                onClick={() => {
                  setSalvandoAcaoSolic(true);
                  void (async () => {
                    try {
                      if (tipoAcaoSolic === 'aprovar') {
                        await aprovarSolicitacaoUsoExtrasBancoHoras(solicAcao.id, comentarioAcaoSolic.trim() || undefined);
                        toast.success('Solicitação aprovada e débito lançado.');
                      } else {
                        await reprovarSolicitacaoUsoExtrasBancoHoras(solicAcao.id, comentarioAcaoSolic.trim() || undefined);
                        toast.success('Solicitação reprovada.');
                      }
                      setSolicAcao(null);
                      setTipoAcaoSolic(null);
                      await carregar();
                    } catch (err) {
                      toast.error(formatApiError(err));
                    } finally {
                      setSalvandoAcaoSolic(false);
                    }
                  })();
                }}
                className={`px-3 py-2 rounded text-sm font-semibold text-white disabled:opacity-50 ${
                  tipoAcaoSolic === 'aprovar' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {salvandoAcaoSolic ? 'Salvando…' : 'Confirmar'}
              </button>
            </>
          }
        >
          <p className="text-sm text-white/75 mb-2">
            {solicAcao.usuario?.nome ?? `Usuário #${solicAcao.usuarioId}`} · {formatHoras(solicAcao.minutosSolicitados)} ·{' '}
            {solicAcao.competencia}
          </p>
          <Field label="Comentário (opcional)">
            <textarea
              rows={2}
              value={comentarioAcaoSolic}
              onChange={(e) => setComentarioAcaoSolic(e.target.value)}
              className="w-full rounded-md border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm text-white"
            />
          </Field>
        </Modal>
      ) : null}

      <ExportarBatidasMesModal
        open={exportarBatidasOpen}
        onClose={() => setExportarBatidasOpen(false)}
        competencia={competenciaMes}
        colaboradores={(resumo?.usuarios ?? []).map((u) => ({
          usuarioId: u.usuarioId,
          nome: u.nome,
        }))}
        selecionadosIds={Array.from(selecionados)}
      />
    </div>
  );
}

function Box({ label, valor, valorClass }: { label: string; valor: string; valorClass?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 min-w-[140px]">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${valorClass ?? ''}`}>{valor}</p>
    </div>
  );
}

function boundsDatasCompetencia(competencia: string): { min: string; max: string } {
  const [y, m] = competencia.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { min: `${y}-${pad(m)}-01`, max: `${y}-${pad(m)}-${pad(ultimo)}` };
}

function dataPadraoNoMes(competencia: string): string {
  const { min, max } = boundsDatasCompetencia(competencia);
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymdHoje = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
  if (ymdHoje >= min && ymdHoje <= max) return ymdHoje;
  if (ymdHoje < min) return min;
  return max;
}

const JORNADA_ALMOCO_PADRAO: JornadaAlmocoResumo = {
  almocoAutomatico: true,
  almocoInicio: '12:00',
  almocoFim: '13:00',
};

/** Minutos desde meia-noite a partir de "HH:mm" ou "HH:mm:ss". */
function parseTimeToMinutes(hhmm: string): number | null {
  const t = hhmm.trim();
  if (!t) return null;
  const parts = t.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

/** Sobreposição em minutos entre [aStart,aEnd) e [bStart,bEnd). */
function overlapMinutesClosed(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  return Math.max(0, hi - lo);
}

function combineDataHoraLocal(ymd: string, hhmm: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number);
  const parts = hhmm.trim().split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1] ?? 0);
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

function horaHHmm(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Valor estável para `<input type="time" />` (HH:mm 24h). */
function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Valida ordem crescente e alternância ENTRADA/SAÍDA após ordenar por horário. */
function validarSequenciaEntradaSaida(
  ordenadas: Array<{ tipo: TipoBatida; minutos: number }>,
): string | null {
  if (ordenadas.length === 0) return null;
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i].minutos <= ordenadas[i - 1].minutos) {
      return 'Os horários precisam ficar em ordem crescente (sem empate entre batidas).';
    }
  }
  for (let i = 0; i < ordenadas.length; i++) {
    const esperado: TipoBatida = i % 2 === 0 ? 'ENTRADA' : 'SAIDA';
    if (ordenadas[i].tipo !== esperado) {
      return `Com os horários atuais, a ${i + 1}ª batida (por ordem de horário) deveria ser ${esperado === 'ENTRADA' ? 'ENTRADA' : 'SAÍDA'}. Ajuste horários ou remova linhas.`;
    }
  }
  return null;
}

type BatidaExistenteDraft = {
  id: number;
  origem: RegistroPonto['origem'];
  tipoOriginal: TipoBatida;
  horaOriginal: string;
  tipo: TipoBatida;
  hora: string;
  removido: boolean;
};

type BatidaNovaDraft = {
  tempId: string;
  tipo: TipoBatida;
  hora: string;
};

function batidaExistenteAlterada(d: BatidaExistenteDraft): boolean {
  return !d.removido && (d.tipo !== d.tipoOriginal || d.hora.trim() !== d.horaOriginal);
}

function temPendenciasSalvar(existentes: BatidaExistenteDraft[], novas: BatidaNovaDraft[]): boolean {
  return existentes.some((d) => d.removido || batidaExistenteAlterada(d)) || novas.length > 0;
}

/**
 * RH: ajusta batidas do dia na competência (rascunho local; persiste só ao Salvar).
 */
export function ModalAjustePontoParDia({
  competencia,
  usuarioId,
  nomeColaborador,
  jornadaAlmoco: _jornadaAlmoco,
  linha,
  onClose,
  onSaved,
}: {
  competencia: string;
  usuarioId: number;
  nomeColaborador: string;
  jornadaAlmoco?: JornadaAlmocoResumo;
  linha: BancoHorasLancamento;
  onClose: () => void;
  onSaved: () => void;
}) {
  const limitesData = useMemo(() => boundsDatasCompetencia(competencia), [competencia]);
  const dataInicial = dataLancamentoChaveDiaLocal(linha.data);
  const [dataDia, setDataDia] = useState(dataInicial);
  const [justificativa, setJustificativa] = useState('');
  const [observacao, setObservacao] = useState('');
  const [existentes, setExistentes] = useState<BatidaExistenteDraft[]>([]);
  const [novas, setNovas] = useState<BatidaNovaDraft[]>([]);
  const [carregandoBatidas, setCarregandoBatidas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mostrarAdicionarHoras, setMostrarAdicionarHoras] = useState(false);
  const [novaBatidaTipo, setNovaBatidaTipo] = useState<TipoBatida>('ENTRADA');
  const [novaBatidaHora, setNovaBatidaHora] = useState('');

  const carregarBatidasDoDia = useCallback(async () => {
    setCarregandoBatidas(true);
    try {
      const inicio = `${dataDia}T00:00:00`;
      const fim = `${dataDia}T23:59:59`;
      const lista = await listarTodosPontos({ usuarioId, inicio, fim });
      const ordenada = [...lista].sort((a, b) => a.dataHora.localeCompare(b.dataHora));
      setExistentes(
        ordenada.map((b) => {
          const hora = toTimeInputValue(b.dataHora);
          return {
            id: b.id,
            origem: b.origem,
            tipoOriginal: b.tipo,
            horaOriginal: hora,
            tipo: b.tipo,
            hora,
            removido: false,
          };
        }),
      );
      setNovas([]);
    } catch {
      setExistentes([]);
      setNovas([]);
    } finally {
      setCarregandoBatidas(false);
    }
  }, [usuarioId, dataDia]);

  useEffect(() => {
    const ymd = dataLancamentoChaveDiaLocal(linha.data);
    setDataDia(ymd);
    setJustificativa('');
    setObservacao('');
    setMostrarAdicionarHoras(false);
    setNovaBatidaTipo('ENTRADA');
    setNovaBatidaHora('');
    setNovas([]);
  }, [linha.id, linha.data, linha.descricao]);

  useEffect(() => {
    void carregarBatidasDoDia();
  }, [carregarBatidasDoDia]);

  function marcarRemocaoLocal(id: number) {
    setExistentes((prev) => prev.map((d) => (d.id === id ? { ...d, removido: true } : d)));
  }

  function desfazerRemocaoLocal(id: number) {
    setExistentes((prev) => prev.map((d) => (d.id === id ? { ...d, removido: false } : d)));
  }

  function removerBatidaNovaLocal(tempId: string) {
    setNovas((prev) => prev.filter((n) => n.tempId !== tempId));
  }

  function atualizarExistente(id: number, patch: Partial<Pick<BatidaExistenteDraft, 'tipo' | 'hora'>>) {
    setExistentes((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function atualizarNova(tempId: string, patch: Partial<Pick<BatidaNovaDraft, 'tipo' | 'hora'>>) {
    setNovas((prev) => prev.map((n) => (n.tempId === tempId ? { ...n, ...patch } : n)));
  }

  function batidasAtivasParaValidacao(): Array<{ tipo: TipoBatida; minutos: number }> {
    const rows: Array<{ tipo: TipoBatida; minutos: number }> = [];
    for (const d of existentes) {
      if (d.removido) continue;
      const m = parseTimeToMinutes(d.hora);
      if (m != null) rows.push({ tipo: d.tipo, minutos: m });
    }
    for (const n of novas) {
      const m = parseTimeToMinutes(n.hora);
      if (m != null) rows.push({ tipo: n.tipo, minutos: m });
    }
    return rows.sort((a, b) => a.minutos - b.minutos);
  }

  function incluirBatidaNaLista() {
    if (!novaBatidaHora.trim()) {
      toast.error('Informe o horário da nova batida.');
      return;
    }
    const mNova = parseTimeToMinutes(novaBatidaHora);
    if (mNova === null) {
      toast.error('Horário inválido.');
      return;
    }
    const ativas = existentes.filter((d) => !d.removido).length + novas.length;
    if (ativas >= 8) {
      toast.error('Este dia já possui 8 batidas (limite). Remova uma antes de adicionar.');
      return;
    }
    const merged = [...batidasAtivasParaValidacao(), { tipo: novaBatidaTipo, minutos: mNova }].sort(
      (a, b) => a.minutos - b.minutos,
    );
    const seqErr = validarSequenciaEntradaSaida(merged);
    if (seqErr) {
      toast.error(seqErr);
      return;
    }
    setNovas((prev) => [
      ...prev,
      {
        tempId: `new-${Date.now()}-${prev.length}`,
        tipo: novaBatidaTipo,
        hora: novaBatidaHora.trim(),
      },
    ]);
    setNovaBatidaHora('');
    setMostrarAdicionarHoras(false);
  }

  async function salvarPendencias() {
    if (justificativa.trim().length < 5) {
      toast.error('Informe uma justificativa com pelo menos 5 caracteres para salvar.');
      return;
    }
    if (!dataDia || dataDia < limitesData.min || dataDia > limitesData.max) {
      toast.error('Escolha uma data dentro da competência.');
      return;
    }
    if (!temPendenciasSalvar(existentes, novas)) {
      toast.error('Nenhuma alteração pendente. Edite tipo/horário, remova linhas ou inclua batidas.');
      return;
    }
    for (const d of existentes) {
      if (d.removido) continue;
      if (parseTimeToMinutes(d.hora) === null) {
        toast.error('Horário inválido na tabela (use HH:mm).');
        return;
      }
    }
    for (const n of novas) {
      if (parseTimeToMinutes(n.hora) === null) {
        toast.error('Horário inválido em batida nova (use HH:mm).');
        return;
      }
    }
    const seqErr = validarSequenciaEntradaSaida(batidasAtivasParaValidacao());
    if (seqErr) {
      toast.error(seqErr);
      return;
    }
    const removidas = existentes.filter((d) => d.removido);
    const alteradas = existentes.filter((d) => batidaExistenteAlterada(d));
    const prefix = justificativa.trim();
    const baseObs = observacao.trim() || undefined;
    setSalvando(true);
    try {
      for (const d of removidas) {
        await removerPonto(d.id, `${prefix} [remoção no ajuste BH — dia ${dataDia}]`);
      }
      for (const d of alteradas) {
        await removerPonto(d.id, `${prefix} [alteração BH — dia ${dataDia}]`);
        await criarAjustePonto({
          usuarioId,
          tipo: d.tipo,
          dataHora: combineDataHoraLocal(dataDia, d.hora.trim()).toISOString(),
          justificativa: prefix,
          observacao: baseObs,
        });
      }
      const novasOrdenadas = [...novas].sort(
        (a, b) => (parseTimeToMinutes(a.hora) ?? 0) - (parseTimeToMinutes(b.hora) ?? 0),
      );
      for (const n of novasOrdenadas) {
        await criarAjustePonto({
          usuarioId,
          tipo: n.tipo,
          dataHora: combineDataHoraLocal(dataDia, n.hora.trim()).toISOString(),
          justificativa: prefix,
          observacao: baseObs,
        });
      }
      const partes: string[] = [];
      if (removidas.length) partes.push(`${removidas.length} remoção(ões)`);
      if (alteradas.length) partes.push(`${alteradas.length} alteração(ões)`);
      if (novas.length) partes.push(`${novas.length} inclusão(ões)`);
      toast.success(`Ajuste aplicado: ${partes.join(', ')}.`);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  const temPendencias = temPendenciasSalvar(existentes, novas);

  const linhasTabela = useMemo(() => {
    const rows: Array<
      | { kind: 'existente'; draft: BatidaExistenteDraft }
      | { kind: 'nova'; draft: BatidaNovaDraft }
    > = [];
    for (const d of existentes) rows.push({ kind: 'existente', draft: d });
    for (const n of novas) rows.push({ kind: 'nova', draft: n });
    rows.sort((a, b) => {
      const minA =
        a.kind === 'existente'
          ? parseTimeToMinutes(a.draft.removido ? a.draft.horaOriginal : a.draft.hora) ?? 0
          : parseTimeToMinutes(a.draft.hora) ?? 0;
      const minB =
        b.kind === 'existente'
          ? parseTimeToMinutes(b.draft.removido ? b.draft.horaOriginal : b.draft.hora) ?? 0
          : parseTimeToMinutes(b.draft.hora) ?? 0;
      return minA - minB;
    });
    return rows;
  }, [existentes, novas]);

  return (
    <Modal
      title={`Ajustar ponto — ${nomeColaborador}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvarPendencias()}
            disabled={salvando || !temPendencias}
            className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <p className="text-xs text-white/55 leading-relaxed mb-3">
        Faça todas as alterações (tipo, horário, remover ou incluir batidas) e clique em{' '}
        <strong className="text-white/80">Salvar</strong> uma vez. A justificativa só é exigida ao salvar. Remover e
        Adicionar horas alteram apenas o rascunho nesta tela.
      </p>
      <Field label="Justificativa (obrigatória ao salvar)">
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          placeholder="Motivo legal do ajuste (mín. 5 caracteres)..."
        />
      </Field>
      <Field label="Descrição / observação (opcional)">
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          placeholder="Notas internas nas batidas criadas..."
        />
      </Field>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <Field label={`Dia (${competencia})`}>
          <input
            type="date"
            value={dataDia}
            min={limitesData.min}
            max={limitesData.max}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setDataDia(v);
            }}
            className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <div>
          <p className="text-xs text-white/60 mb-2">
            Batidas do dia {carregandoBatidas ? '(carregando...)' : ''}
            {temPendencias ? ' — alterações pendentes (salve para aplicar)' : ''} — edite tipo e horário, ou use Remover.
          </p>
          {linhasTabela.length === 0 ? (
            <p className="text-xs text-white/45 rounded-md border border-white/10 bg-black/20 px-3 py-2">
              Nenhuma batida neste dia. Clique em Adicionar horas para incluir entrada ou saída no rascunho.
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-md border border-white/10">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 bg-neutral/95 text-white/55 z-10 border-b border-white/10">
                  <tr>
                    <th className="py-2 px-2 font-medium w-10">#</th>
                    <th className="py-2 px-2 font-medium w-28">Tipo</th>
                    <th className="py-2 px-2 font-medium w-32">Horário</th>
                    <th className="py-2 px-2 font-medium">Origem</th>
                    <th className="py-2 px-2 font-medium text-right w-28">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasTabela.map((row, idx) => {
                    if (row.kind === 'existente') {
                      const d = row.draft;
                      const alterada =
                        d.removido || d.tipo !== d.tipoOriginal || d.hora.trim() !== d.horaOriginal;
                      return (
                        <tr
                          key={`ex-${d.id}`}
                          className={`border-b border-white/5 hover:bg-white/[0.04] ${d.removido ? 'opacity-45 line-through' : ''}`}
                        >
                          <td className="py-1.5 px-2 text-white/50">{idx + 1}</td>
                          <td className="py-1.5 px-2">
                            <select
                              value={d.tipo}
                              disabled={salvando || carregandoBatidas || d.removido}
                              onChange={(e) =>
                                atualizarExistente(d.id, { tipo: e.target.value as TipoBatida })
                              }
                              className="h-8 w-full min-w-[6.5rem] rounded border border-white/15 bg-black/40 px-1 text-xs text-white disabled:opacity-50"
                            >
                              <option value="ENTRADA">Entrada</option>
                              <option value="SAIDA">Saída</option>
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="time"
                              value={d.hora}
                              onChange={(e) => atualizarExistente(d.id, { hora: e.target.value })}
                              disabled={salvando || carregandoBatidas || d.removido}
                              className="h-8 w-[7.25rem] rounded border border-white/15 bg-black/40 px-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-white/45">
                            {d.origem}
                            {alterada && !d.removido ? (
                              <span className="ml-1 text-primary/80">*</span>
                            ) : null}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {d.removido ? (
                              <button
                                type="button"
                                disabled={salvando || carregandoBatidas}
                                onClick={() => desfazerRemocaoLocal(d.id)}
                                className="text-primary hover:text-primary/80 font-medium disabled:opacity-50"
                              >
                                Desfazer
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={salvando || carregandoBatidas}
                                onClick={() => marcarRemocaoLocal(d.id)}
                                className="text-red-300 hover:text-red-200 font-medium disabled:opacity-50"
                              >
                                Remover
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }
                    const n = row.draft;
                    return (
                      <tr
                        key={n.tempId}
                        className="border-b border-white/5 hover:bg-white/[0.04] bg-primary/[0.06]"
                      >
                        <td className="py-1.5 px-2 text-white/50">{idx + 1}</td>
                        <td className="py-1.5 px-2">
                          <select
                            value={n.tipo}
                            disabled={salvando || carregandoBatidas}
                            onChange={(e) =>
                              atualizarNova(n.tempId, { tipo: e.target.value as TipoBatida })
                            }
                            className="h-8 w-full min-w-[6.5rem] rounded border border-white/15 bg-black/40 px-1 text-xs text-white disabled:opacity-50"
                          >
                            <option value="ENTRADA">Entrada</option>
                            <option value="SAIDA">Saída</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="time"
                            value={n.hora}
                            onChange={(e) => atualizarNova(n.tempId, { hora: e.target.value })}
                            disabled={salvando || carregandoBatidas}
                            className="h-8 w-[7.25rem] rounded border border-white/15 bg-black/40 px-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-primary/70">Nova</td>
                        <td className="py-1.5 px-2 text-right">
                          <button
                            type="button"
                            disabled={salvando || carregandoBatidas}
                            onClick={() => removerBatidaNovaLocal(n.tempId)}
                            className="text-red-300 hover:text-red-200 font-medium disabled:opacity-50"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 pt-3 space-y-3">
          <button
            type="button"
            disabled={salvando || carregandoBatidas}
            onClick={() => setMostrarAdicionarHoras((v) => !v)}
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-sm font-medium text-white/90 disabled:opacity-50"
          >
            {mostrarAdicionarHoras ? 'Fechar adicionar horas' : 'Adicionar horas'}
          </button>
          {mostrarAdicionarHoras ? (
            <div className="rounded-md border border-white/10 bg-black/25 p-3 space-y-3">
              <p className="text-xs text-white/50">
                Inclui a batida na lista (rascunho). Ao salvar, vira AJUSTE_RH. A sequência do dia precisa alternar
                entrada e saída.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[140px]">
                  <label className="block text-xs text-white/60 mb-1">Tipo</label>
                  <select
                    value={novaBatidaTipo}
                    onChange={(e) => setNovaBatidaTipo(e.target.value as TipoBatida)}
                    disabled={salvando}
                    className="h-9 w-full min-w-[8rem] rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  >
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Horário</label>
                  <input
                    type="time"
                    value={novaBatidaHora}
                    onChange={(e) => setNovaBatidaHora(e.target.value)}
                    disabled={salvando}
                    className="h-9 w-[7.5rem] rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={incluirBatidaNaLista}
                  className="h-9 px-4 rounded-md bg-primary text-neutral text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  Incluir na lista
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

export function LancarManualModal({
  competencia,
  usuarioId,
  nome,
  jornadaAlmoco: jornadaProp,
  onClose,
  onSaved,
}: {
  competencia: string;
  usuarioId: number;
  nome: string;
  /** Horários de almoço da jornada do colaborador (para descontar do intervalo quando aplicável). */
  jornadaAlmoco?: JornadaAlmocoResumo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const jornadaAlmoco = jornadaProp ?? JORNADA_ALMOCO_PADRAO;
  const limitesData = useMemo(() => boundsDatasCompetencia(competencia), [competencia]);
  const [dataReferencia, setDataReferencia] = useState(() => dataPadraoNoMes(competencia));
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [tipoCredito, setTipoCredito] = useState(true);
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setDataReferencia(dataPadraoNoMes(competencia));
  }, [competencia]);

  const calculoIntervalo = useMemo(() => {
    const i = parseTimeToMinutes(horaInicio);
    const f = parseTimeToMinutes(horaFim);
    if (i === null || f === null) {
      return { ok: false as const, motivo: 'Informe início e fim no formato de horário.' };
    }
    if (f <= i) {
      return { ok: false as const, motivo: 'O horário final deve ser depois do inicial (mesmo dia).' };
    }
    const bruto = f - i;
    let descontoAlmoco = 0;
    if (jornadaAlmoco.almocoAutomatico) {
      const li = parseTimeToMinutes(jornadaAlmoco.almocoInicio);
      const lf = parseTimeToMinutes(jornadaAlmoco.almocoFim);
      if (li !== null && lf !== null && lf > li) {
        descontoAlmoco = overlapMinutesClosed(i, f, li, lf);
      }
    }
    const liquido = bruto - descontoAlmoco;
    if (liquido <= 0) {
      return {
        ok: false as const,
        motivo:
          descontoAlmoco >= bruto
            ? 'O intervalo ficou totalmente coberto pelo horário de almoço da jornada (ou não sobra tempo líquido). Ajuste os horários.'
            : 'O tempo líquido precisa ser maior que zero.',
      };
    }
    return {
      ok: true as const,
      bruto,
      descontoAlmoco,
      liquido,
    };
  }, [horaInicio, horaFim, jornadaAlmoco]);

  async function salvar() {
    if (!descricao.trim()) {
      toast.error('Informe uma descrição.');
      return;
    }
    if (!dataReferencia || dataReferencia < limitesData.min || dataReferencia > limitesData.max) {
      toast.error('Escolha uma data dentro da competência.');
      return;
    }
    if (!calculoIntervalo.ok) {
      toast.error(calculoIntervalo.motivo);
      return;
    }
    const { liquido, descontoAlmoco } = calculoIntervalo;
    const minutos = tipoCredito ? liquido : -liquido;
    const trecho = `${horaInicio}–${horaFim}`;
    const detalheAlmoco = descontoAlmoco > 0 ? `; −${formatHoras(descontoAlmoco)} almoço` : '';
    const descricaoCompleta = `${descricao.trim()} (${trecho}; líq. ${formatHoras(liquido)}${detalheAlmoco}; ${tipoCredito ? 'crédito' : 'débito'})`;

    setSalvando(true);
    try {
      await lancarBancoHoras(usuarioId, {
        minutos,
        descricao: descricaoCompleta,
        competencia,
        dataReferencia,
      });
      toast.success('Lançamento registrado.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Lançamento manual — ${nome}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !calculoIntervalo.ok}
            className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <p className="text-xs text-white/55 leading-relaxed mb-3">
        Informe o intervalo no mesmo dia (ex.: 13:00 a 15:00). Se a jornada do colaborador tiver almoço automático,
        o trecho que coincidir com {jornadaAlmoco.almocoInicio}–{jornadaAlmoco.almocoFim} é descontado (ex.: 07:00–18:00
        vira o trabalho líquido sem contar o almoço).
      </p>
      <Field label={`Data do ajuste (competência ${competencia})`}>
        <input
          type="date"
          value={dataReferencia}
          min={limitesData.min}
          max={limitesData.max}
          onChange={(e) => {
            const v = e.target.value;
            if (v) setDataReferencia(v);
          }}
          className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="De (hora inicial)">
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
        <Field label="Até (hora final)">
          <input
            type="time"
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
            className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
      </div>
      <Field label="Tipo do ajuste">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTipoCredito(true)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              tipoCredito
                ? 'border-green-400/50 bg-green-500/20 text-green-100'
                : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            Crédito (somar ao saldo)
          </button>
          <button
            type="button"
            onClick={() => setTipoCredito(false)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              !tipoCredito
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-100'
                : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            Débito (subtrair do saldo)
          </button>
        </div>
      </Field>
      {calculoIntervalo.ok ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 space-y-1">
          <p>
            Intervalo bruto: <span className="text-white/90 font-medium tabular-nums">{formatHoras(calculoIntervalo.bruto)}</span>
          </p>
          {!jornadaAlmoco.almocoAutomatico ? (
            <p className="text-white/50">Almoço automático desativado na jornada — usa o intervalo bruto inteiro.</p>
          ) : calculoIntervalo.descontoAlmoco > 0 ? (
            <p>
              Desconto almoço ({jornadaAlmoco.almocoInicio}–{jornadaAlmoco.almocoFim}):{' '}
              <span className="text-amber-200/90 font-medium tabular-nums">−{formatHoras(calculoIntervalo.descontoAlmoco)}</span>
            </p>
          ) : (
            <p className="text-white/50">Nenhum trecho do intervalo coincide com o almoço configurado.</p>
          )}
          <p className="pt-1 border-t border-white/10 text-white/85">
            Líquido a lançar ({tipoCredito ? 'crédito' : 'débito'}):{' '}
            <span className="font-semibold tabular-nums text-primary">
              {tipoCredito ? '' : '−'}
              {formatHoras(calculoIntervalo.liquido)}
            </span>
          </p>
        </div>
      ) : horaInicio && horaFim ? (
        <p className="text-xs text-amber-200/90">{calculoIntervalo.motivo}</p>
      ) : null}
      <Field label="Descrição">
        <textarea
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          placeholder="Motivo do ajuste..."
        />
      </Field>
    </Modal>
  );
}
