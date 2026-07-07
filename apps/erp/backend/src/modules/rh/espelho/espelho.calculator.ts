import { JornadaTrabalho, RegistroPonto, TipoBatida } from '@prisma/client';

export type EspelhoStatus =
  | 'PRESENTE'
  | 'INCOMPLETO'
  | 'FALTA'
  | 'NAO_UTIL'
  | 'ATESTADO'
  | 'LICENCA'
  | 'FERIAS'
  | 'FERIADO'
  | 'FALTA_ABONADA'
  | 'HOME_OFFICE';

/** Tipos de marcação não-trabalhada que o calculador trata como dia coberto. */
export type CoberturaDia = {
  data: string; // YYYY-MM-DD
  status: 'ATESTADO' | 'LICENCA' | 'FERIAS' | 'FERIADO' | 'FALTA_ABONADA' | 'HOME_OFFICE';
  motivo?: string | null;
};

export interface DiaEspelho {
  data: string; // YYYY-MM-DD
  diaSemana: number; // 0=Dom, 6=Sab
  diaUtil: boolean;
  entrada: string | null; // ISO
  saida: string | null;
  trabalhadoMin: number;
  esperadoMin: number;
  atrasoMin: number;
  extraMin: number;
  saldoMin: number; // trabalhado - esperado
  status: EspelhoStatus;
  registros: number;
  /** Minutos descontados pelo intervalo de almoço automático (cruza entrada–saída). */
  almocoDeducaoMin: number;
  /** Início/fim ISO do intervalo fixo de almoço quando houve desconto (batidas automáticas). */
  almocoIntervaloInicio: string | null;
  almocoIntervaloFim: string | null;
  /** Quando o dia foi coberto por afastamento/férias, motivo opcional. */
  coberturaMotivo?: string | null;
}

export interface EspelhoMes {
  mes: string; // YYYY-MM
  usuarioId: number;
  totais: {
    diasUteis: number;
    diasComBatida: number;
    faltas: number;
    incompletos: number;
    trabalhadoMin: number;
    esperadoMin: number;
    atrasoMin: number;
    extraMin: number;
    saldoMin: number;
  };
  dias: DiaEspelho[];
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffMin(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function combineDateAndHHMM(day: Date, hhmm: string): Date | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/** Quantidade de dias da semana marcados como úteis na jornada (mínimo 1 para divisão). */
function diasUteisNaSemana(diasUteis: Record<string, boolean>): number {
  let n = 0;
  for (let i = 0; i <= 6; i++) {
    if (diasUteis[String(i)] === true) n++;
  }
  return Math.max(1, n);
}

/**
 * Minutos esperados num dia útil no espelho.
 * Com `horarioFlexivel`, reparte a carga semanal igualmente pelos dias úteis (sem horário fixo de entrada).
 */
export function esperadoMinPorDiaUtil(jornada: JornadaTrabalho): number {
  const diasUteis = jornada.diasUteis as Record<string, boolean>;
  if (jornada.horarioFlexivel) {
    const n = diasUteisNaSemana(diasUteis);
    if (jornada.cargaSemanalMin > 0) {
      return Math.round(jornada.cargaSemanalMin / n);
    }
  }
  return jornada.cargaDiariaMin;
}

/** Sobreposição em minutos entre [workStart, workEnd] e [breakStart, breakEnd]. */
function overlapMinutes(workStart: Date, workEnd: Date, breakStart: Date, breakEnd: Date): number {
  if (workEnd.getTime() <= workStart.getTime() || breakEnd.getTime() <= breakStart.getTime()) {
    return 0;
  }
  const start = Math.max(workStart.getTime(), breakStart.getTime());
  const end = Math.min(workEnd.getTime(), breakEnd.getTime());
  return end > start ? Math.round((end - start) / 60000) : 0;
}

/** Campos de jornada usados só no cálculo do almoço (compatível com versões antigas do client). */
export type JornadaFatiaAlmoco = {
  almocoAutomatico?: boolean | null;
  almocoInicio?: string | null;
  almocoFim?: string | null;
};

/**
 * Calcula desconto de almoço quando a jornada usa intervalo fixo (ex.: 12:00–13:00)
 * e a presença (entrada→saída) cruza esse intervalo.
 */
export function computeAlmocoDoDia(
  diaLocalMeiaNoite: Date,
  entrada: Date | null,
  saida: Date | null,
  jornada: JornadaFatiaAlmoco,
): { deductMin: number; lunchStart: Date | null; lunchEnd: Date | null } {
  if (jornada.almocoAutomatico === false || !entrada || !saida) {
    return { deductMin: 0, lunchStart: null, lunchEnd: null };
  }
  const ai = jornada.almocoInicio ?? '12:00';
  const af = jornada.almocoFim ?? '13:00';
  const lunchStart = combineDateAndHHMM(diaLocalMeiaNoite, ai);
  const lunchEnd = combineDateAndHHMM(diaLocalMeiaNoite, af);
  if (!lunchStart || !lunchEnd || lunchEnd.getTime() <= lunchStart.getTime()) {
    return { deductMin: 0, lunchStart: null, lunchEnd: null };
  }
  const deduct = overlapMinutes(entrada, saida, lunchStart, lunchEnd);
  if (deduct <= 0) {
    return { deductMin: 0, lunchStart: null, lunchEnd: null };
  }
  return { deductMin: deduct, lunchStart, lunchEnd };
}

/** Devolve [inicio, fim) do mês YYYY-MM. */
export function boundsMes(mes: string): { inicio: Date; fim: Date } {
  const [y, m] = mes.split('-').map(Number);
  const inicio = new Date(y, (m ?? 1) - 1, 1, 0, 0, 0, 0);
  const fim = new Date(y, (m ?? 1), 1, 0, 0, 0, 0);
  return { inicio, fim };
}

/** Início do “hoje” civil no fuso local do processo (00:00). */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Início do dia seguinte ao “hoje” no fuso local do servidor (limite exclusivo para não contar o futuro como falta). */
export function startOfTomorrow(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Período do mês para KPIs e espelho “em aberto”: **não inclui o dia civil de hoje** como limite superior
 * (`[inicio, início de hoje)`).
 *
 * Motivo: enquanto o dia está em curso, entrada sem saída vira INCOMPLETO com saldo negativo cheio
 * (trabalhado 0 × carga prevista), o que penaliza o banco de horas antes da jornada terminar.
 * O dia atual continua aparecendo nas batidas do banco; só o “saldo do espelho” desse dia deixa de ser
 * calculado até o calendário avançar.
 *
 * Dias futuros dentro do mês também ficam fora (mesmo efeito que antes ao usar meia-noite de hoje como teto).
 */
export function boundsMesAteHoje(mes: string): { inicio: Date; fimExclusive: Date } {
  const { inicio, fim } = boundsMes(mes);
  const hoje = startOfToday();
  if (inicio.getTime() >= hoje.getTime()) {
    return { inicio, fimExclusive: inicio };
  }
  const cap = Math.min(fim.getTime(), hoje.getTime());
  return { inicio, fimExclusive: new Date(cap) };
}

/**
 * Calcula o espelho para um intervalo [inicio, fimExclusive) de dias civis.
 *
 * Regras adotadas no MVP:
 * - 1 batida no dia → INCOMPLETO (entrada sem saída).
 * - 2 batidas no dia → PRESENTE; trabalhado = (saída - entrada) menos sobreposição com
 *   o intervalo de almoço automático da jornada (padrão 12:00–13:00), quando ativo.
 * - dias úteis (jornada.diasUteis) sem batida → FALTA.
 * - atraso = (entrada efetiva - inicioPadrao) acima da tolerância (desligado com `horarioFlexivel`).
 * - extra = max(0, trabalhado - esperado do dia); saldo = trabalhado - esperado do dia.
 */
export function calcularEspelhoPeriodo(
  inicio: Date,
  fimExclusive: Date,
  mesLabel: string,
  usuarioId: number,
  jornada: JornadaTrabalho,
  registros: Pick<RegistroPonto, 'tipo' | 'dataHora'>[],
  coberturas: CoberturaDia[] = [],
): EspelhoMes {
  const diasUteis = jornada.diasUteis as Record<string, boolean>;
  const tolerAtrasoMin = jornada.tolerAtrasoMin;

  // Agrupa registros por dia (YYYY-MM-DD).
  const porDia = new Map<string, Pick<RegistroPonto, 'tipo' | 'dataHora'>[]>();
  for (const r of registros) {
    const key = ymd(new Date(r.dataHora));
    const arr = porDia.get(key) ?? [];
    arr.push(r);
    porDia.set(key, arr);
  }
  for (const arr of porDia.values()) {
    arr.sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
  }

  // Cobertura por dia: prioriza FERIAS > FERIADO > LICENCA > ATESTADO > FALTA_ABONADA > HOME_OFFICE.
  const prioridadeCobertura: Record<CoberturaDia['status'], number> = {
    FERIAS: 6,
    FERIADO: 5,
    LICENCA: 4,
    ATESTADO: 3,
    FALTA_ABONADA: 2,
    HOME_OFFICE: 1,
  };
  const coberturaPorDia = new Map<string, CoberturaDia>();
  for (const c of coberturas) {
    const cur = coberturaPorDia.get(c.data);
    if (!cur || prioridadeCobertura[c.status] > prioridadeCobertura[cur.status]) {
      coberturaPorDia.set(c.data, c);
    }
  }

  const dias: DiaEspelho[] = [];
  const totais = {
    diasUteis: 0,
    diasComBatida: 0,
    faltas: 0,
    incompletos: 0,
    trabalhadoMin: 0,
    esperadoMin: 0,
    atrasoMin: 0,
    extraMin: 0,
    saldoMin: 0,
  };

  for (let cursor = startOfDay(inicio); cursor < fimExclusive; cursor.setDate(cursor.getDate() + 1)) {
    const data = ymd(cursor);
    const diaSemana = cursor.getDay();
    const diaUtil = !!diasUteis[String(diaSemana)];
    const regs = porDia.get(data) ?? [];
    const cobertura = coberturaPorDia.get(data) ?? null;

    // Múltiplas batidas/dia: pareamos ENTRADA/SAIDA em ordem cronológica.
    const pares: Array<{ entrada: Date; saida: Date | null }> = [];
    let abertura: Date | null = null;
    for (const r of regs) {
      const t = new Date(r.dataHora);
      if (r.tipo === TipoBatida.ENTRADA) {
        if (abertura) pares.push({ entrada: abertura, saida: null });
        abertura = t;
      } else if (r.tipo === TipoBatida.SAIDA) {
        if (abertura) {
          pares.push({ entrada: abertura, saida: t });
          abertura = null;
        }
      }
    }
    if (abertura) pares.push({ entrada: abertura, saida: null });

    const entrada = pares[0]?.entrada ? regs.find((r) => r.tipo === TipoBatida.ENTRADA) ?? null : null;
    const ultimaSaidaReg = [...regs].reverse().find((r) => r.tipo === TipoBatida.SAIDA) ?? null;
    const saida = ultimaSaidaReg;

    let trabalhadoMin = 0;
    let atrasoMin = 0;
    let almocoDeducaoMin = 0;
    let almocoIntervaloInicio: string | null = null;
    let almocoIntervaloFim: string | null = null;

    // Soma os pares fechados (E/S). Pares incompletos não somam.
    for (const p of pares) {
      if (!p.saida) continue;
      trabalhadoMin += diffMin(p.entrada, p.saida);
    }

    if (pares.length === 1 && pares[0].saida) {
      // Caso clássico (1 entrada + 1 saída): aplica almoço automático.
      const almoco = computeAlmocoDoDia(cursor, pares[0].entrada, pares[0].saida, jornada);
      trabalhadoMin = Math.max(0, trabalhadoMin - almoco.deductMin);
      almocoDeducaoMin = almoco.deductMin;
      almocoIntervaloInicio = almoco.lunchStart ? almoco.lunchStart.toISOString() : null;
      almocoIntervaloFim = almoco.lunchEnd ? almoco.lunchEnd.toISOString() : null;
    }
    // Quando há 2+ pares, o almoço já foi marcado manualmente — não aplicamos desconto automático.

    if (entrada && diaUtil && !jornada.horarioFlexivel) {
      const inicioPadrao = combineDateAndHHMM(cursor, jornada.inicioPadrao);
      if (inicioPadrao) {
        const atraso = diffMin(inicioPadrao, new Date(entrada.dataHora));
        atrasoMin = atraso > tolerAtrasoMin ? atraso - tolerAtrasoMin : 0;
      }
    }

    let esperadoMin = diaUtil ? esperadoMinPorDiaUtil(jornada) : 0;
    let saldoMin = trabalhadoMin - esperadoMin;
    let extraMin = saldoMin > 0 ? saldoMin : 0;

    let status: EspelhoStatus;
    if (cobertura && cobertura.status !== 'HOME_OFFICE') {
      // Dia coberto: trata como esperado=trabalhado, saldo zero, sem falta.
      status = cobertura.status;
      esperadoMin = diaUtil ? esperadoMinPorDiaUtil(jornada) : 0;
      // Mesmo se não houver batidas, o dia é coberto.
      trabalhadoMin = esperadoMin;
      saldoMin = 0;
      extraMin = 0;
      atrasoMin = 0;
    } else if (cobertura && cobertura.status === 'HOME_OFFICE') {
      // Home office: mantém regra normal mas marca status.
      if (!diaUtil) {
        status = regs.length > 0 ? 'PRESENTE' : 'NAO_UTIL';
      } else if (regs.length === 0) {
        status = 'HOME_OFFICE';
        // Sem batidas: assume jornada cumprida em home office.
        trabalhadoMin = esperadoMin;
        saldoMin = 0;
        extraMin = 0;
      } else if (pares.every((p) => p.saida) && pares.length > 0) {
        status = 'HOME_OFFICE';
      } else {
        status = 'INCOMPLETO';
      }
    } else if (!diaUtil) {
      status = regs.length > 0 ? 'PRESENTE' : 'NAO_UTIL';
    } else if (regs.length === 0) {
      status = 'FALTA';
    } else if (pares.length > 0 && pares.every((p) => p.saida)) {
      status = 'PRESENTE';
    } else {
      status = 'INCOMPLETO';
    }

    dias.push({
      data,
      diaSemana,
      diaUtil,
      entrada: entrada ? new Date(entrada.dataHora).toISOString() : null,
      saida: saida ? new Date(saida.dataHora).toISOString() : null,
      trabalhadoMin,
      esperadoMin,
      atrasoMin,
      extraMin,
      saldoMin,
      status,
      registros: regs.length,
      almocoDeducaoMin,
      almocoIntervaloInicio,
      almocoIntervaloFim,
      coberturaMotivo: cobertura?.motivo ?? null,
    });

    if (diaUtil) totais.diasUteis += 1;
    if (regs.length > 0) totais.diasComBatida += 1;
    if (status === 'FALTA') totais.faltas += 1;
    if (status === 'INCOMPLETO') totais.incompletos += 1;
    totais.trabalhadoMin += trabalhadoMin;
    totais.esperadoMin += esperadoMin;
    totais.atrasoMin += atrasoMin;
    totais.extraMin += extraMin;
    totais.saldoMin += saldoMin;
  }

  return { mes: mesLabel, usuarioId, totais, dias };
}

/** Espelho do mês civil completo (relatórios, folha) — inclui todos os dias do mês. */
export function calcularEspelhoMes(
  mes: string,
  usuarioId: number,
  jornada: JornadaTrabalho,
  registros: Pick<RegistroPonto, 'tipo' | 'dataHora'>[],
  coberturas: CoberturaDia[] = [],
): EspelhoMes {
  const { inicio, fim } = boundsMes(mes);
  return calcularEspelhoPeriodo(inicio, fim, mes, usuarioId, jornada, registros, coberturas);
}
