/** Quantidade de nomes exibidos na lista compacta antes de "+ N". */
export const PARTICIPANTES_RESUMO_MAX_NOMES = 2;

export function nomesParticipantesDaEtapa(etapa: {
  executor?: { nome?: string | null } | null;
  integrantes?: Array<{ usuario?: { nome?: string | null } | null } | null>;
}): string[] {
  const nomes: string[] = [];
  const ex = etapa.executor?.nome?.trim();
  if (ex) nomes.push(ex);
  for (const i of etapa.integrantes ?? []) {
    const n = i?.usuario?.nome?.trim();
    if (n && !nomes.includes(n)) nomes.push(n);
  }
  return nomes;
}

/** Participantes da etapa sem o usuário do papel supervisor (evita duplicar na lista). */
export function nomesParticipantesDaEtapaSemUsuario(
  etapa: {
    executor?: { id?: number; nome?: string | null } | null;
    integrantes?: Array<{ usuario?: { id?: number; nome?: string | null } | null } | null>;
  },
  excluirUsuarioId?: number | null,
): string[] {
  if (excluirUsuarioId == null || Number.isNaN(Number(excluirUsuarioId))) {
    return nomesParticipantesDaEtapa(etapa);
  }
  const ex = Number(excluirUsuarioId);
  const nomes: string[] = [];
  const exExecutorId = etapa.executor?.id != null ? Number(etapa.executor.id) : null;
  const nomeExecutor = etapa.executor?.nome?.trim();
  if (nomeExecutor && exExecutorId !== ex) nomes.push(nomeExecutor);
  for (const i of etapa.integrantes ?? []) {
    const uid = i?.usuario?.id != null ? Number(i.usuario.id) : null;
    const n = i?.usuario?.nome?.trim();
    if (!n || uid === ex) continue;
    if (!nomes.includes(n)) nomes.push(n);
  }
  return nomes;
}

/**
 * Texto curto para UI (tooltip com lista completa).
 * Ex.: "Ana, Bruno + 5" quando há mais de PARTICIPANTES_RESUMO_MAX_NOMES.
 */
export function formatParticipantesResumo(
  nomes: string[],
  maxNomes = PARTICIPANTES_RESUMO_MAX_NOMES,
): { resumo: string; tituloCompleto: string } {
  const unicos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  const tituloCompleto = unicos.join(', ');
  if (unicos.length === 0) return { resumo: '', tituloCompleto: '' };
  if (unicos.length <= maxNomes) {
    return { resumo: tituloCompleto, tituloCompleto };
  }
  const mostrados = unicos.slice(0, maxNomes).join(', ');
  const restante = unicos.length - maxNomes;
  return { resumo: `${mostrados} +${restante}`, tituloCompleto };
}
