import type { ListarPontoFiltros } from '../services/rh';

/** Primeiro e último dia civil da competência `YYYY-MM`. */
export function boundsDatasCompetencia(competencia: string): { min: string; max: string } {
  const [y, m] = competencia.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { min: `${y}-${pad(m)}-01`, max: `${y}-${pad(m)}-${pad(ultimo)}` };
}

/** Filtros de listagem/exportação de ponto para o mês civil da competência. */
export function filtrosPontoDaCompetencia(
  competencia: string,
  usuarioId?: number,
): ListarPontoFiltros {
  const { min, max } = boundsDatasCompetencia(competencia);
  return {
    inicio: min,
    fim: max,
    ...(usuarioId != null ? { usuarioId } : {}),
  };
}

/** Rótulo legível da competência (ex.: maio/2026). */
export function rotuloCompetencia(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number);
  if (!y || !m) return competencia;
  const d = new Date(y, m - 1, 1);
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)}/${y}`;
}
