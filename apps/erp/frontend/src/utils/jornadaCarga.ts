export type DiasUteisMap = Record<string, boolean>;

function hhmmToMin(hhmm: string): number {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overlapMin(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? end - start : 0;
}

export function contarDiasUteis(diasUteis: DiasUteisMap | undefined): number {
  if (!diasUteis) return 5;
  const n = Object.values(diasUteis).filter(Boolean).length;
  return Math.max(1, n);
}

/** Carga diária em minutos a partir do horário padrão e almoço automático. */
export function calcularCargaDiariaMin(input: {
  inicioPadrao: string;
  fimPadrao: string;
  almocoAutomatico?: boolean;
  almocoInicio?: string;
  almocoFim?: string;
}): number {
  const inicio = hhmmToMin(input.inicioPadrao || '08:00');
  const fim = hhmmToMin(input.fimPadrao || '17:00');
  if (fim <= inicio) return 0;

  let total = fim - inicio;
  if (input.almocoAutomatico !== false) {
    const ai = hhmmToMin(input.almocoInicio || '12:00');
    const af = hhmmToMin(input.almocoFim || '13:00');
    if (af > ai) {
      total -= overlapMin(inicio, fim, ai, af);
    }
  }
  return Math.max(0, total);
}

export function calcularCargaSemanalMin(cargaDiariaMin: number, diasUteis: DiasUteisMap | undefined): number {
  return cargaDiariaMin * contarDiasUteis(diasUteis);
}

export function calcularCargasJornada(input: {
  inicioPadrao: string;
  fimPadrao: string;
  almocoAutomatico?: boolean;
  almocoInicio?: string;
  almocoFim?: string;
  diasUteis?: DiasUteisMap;
}): { cargaDiariaMin: number; cargaSemanalMin: number; diasUteisCount: number } {
  const cargaDiariaMin = calcularCargaDiariaMin(input);
  const diasUteisCount = contarDiasUteis(input.diasUteis);
  const cargaSemanalMin = cargaDiariaMin * diasUteisCount;
  return { cargaDiariaMin, cargaSemanalMin, diasUteisCount };
}
