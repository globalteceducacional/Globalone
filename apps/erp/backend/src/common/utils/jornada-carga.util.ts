type DiasUteisMap = Record<string, boolean>;

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overlapMin(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? end - start : 0;
}

function contarDiasUteis(diasUteis: DiasUteisMap | null | undefined): number {
  if (!diasUteis || typeof diasUteis !== 'object') return 5;
  const n = Object.values(diasUteis).filter((v) => v === true).length;
  return Math.max(1, n);
}

export function calcularCargaDiariaMin(input: {
  inicioPadrao: string;
  fimPadrao: string;
  almocoAutomatico: boolean;
  almocoInicio: string;
  almocoFim: string;
}): number {
  const inicio = hhmmToMin(input.inicioPadrao);
  const fim = hhmmToMin(input.fimPadrao);
  if (fim <= inicio) return 0;

  let total = fim - inicio;
  if (input.almocoAutomatico) {
    const ai = hhmmToMin(input.almocoInicio);
    const af = hhmmToMin(input.almocoFim);
    if (af > ai) {
      total -= overlapMin(inicio, fim, ai, af);
    }
  }
  return Math.max(0, total);
}

export function calcularCargasJornada(input: {
  inicioPadrao: string;
  fimPadrao: string;
  almocoAutomatico: boolean;
  almocoInicio: string;
  almocoFim: string;
  diasUteis: DiasUteisMap | null | undefined;
}): { cargaDiariaMin: number; cargaSemanalMin: number } {
  const cargaDiariaMin = calcularCargaDiariaMin(input);
  const cargaSemanalMin = cargaDiariaMin * contarDiasUteis(input.diasUteis);
  return { cargaDiariaMin, cargaSemanalMin };
}
