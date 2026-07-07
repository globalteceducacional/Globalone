/** Meta mensal em minutos a partir da carga semanal (52/12 semanas por mês em média). */
export function metaHorasMensalMinFromCargaSemanal(cargaSemanalMin: number): number {
  if (!Number.isFinite(cargaSemanalMin) || cargaSemanalMin <= 0) return 0;
  return Math.round(cargaSemanalMin * (52 / 12));
}
