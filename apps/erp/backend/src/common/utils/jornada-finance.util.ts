/**
 * Meta de horas no mês (em minutos) derivada da carga semanal contratual.
 * Usa a média de semanas por mês no ano civil (52/12), alinhada à conversão usual CLT.
 */
export function metaHorasMensalMinFromCargaSemanal(cargaSemanalMin: number): number {
  if (!Number.isFinite(cargaSemanalMin) || cargaSemanalMin <= 0) return 0;
  return Math.round(cargaSemanalMin * (52 / 12));
}
