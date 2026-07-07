import type { ReviewEntregaPopupTarget } from '../components/projects/ReviewEntregaPopup';

export type AnalisePendenciaChecklist = {
  checklistIndex: number;
  subitemIndex: number | null;
  textoLinha: string;
  dataEnvio: string;
  executor: { id: number; nome: string };
};

export type AnalisePendenciaEtapa = {
  id: number;
  dataEnvio: string;
  executor: { id: number; nome: string };
};

export type AnaliseEtapaGrupo = {
  id: number;
  nome: string;
  ordem: number;
  aba: string | null;
  sessaoNome: string | null;
  executor: { id: number; nome: string };
  pendenciasChecklist: AnalisePendenciaChecklist[];
  pendenciasEtapaEntrega: AnalisePendenciaEtapa[];
};

export type AnaliseProjetoGrupo = {
  projeto: { id: number; nome: string; supervisorId?: number | null };
  etapas: AnaliseEtapaGrupo[];
};

export type AnaliseOrdemFila = 'antigas' | 'recentes';

/**
 * - todas: todas as entregas em análise no escopo da API
 * - para_avaliar: exclui só entregas enviadas pelo próprio usuário (sem auto-aprovação)
 * - do_supervisor: entregas cujo executor é o supervisor cadastrado no projeto
 */
export type AnaliseEscopoExecutor = 'todas' | 'para_avaliar' | 'do_supervisor';

export type AnaliseFilaItem = {
  key: string;
  projeto: { id: number; nome: string; supervisorId?: number | null };
  etapa: AnaliseEtapaGrupo;
  tipo: 'checklist' | 'etapa_entrega';
  dataEnvio: string;
  pendenciaChecklist?: AnalisePendenciaChecklist;
  pendenciaEtapa?: AnalisePendenciaEtapa;
};

export function reviewTargetToKey(target: ReviewEntregaPopupTarget): string {
  if (target.mode === 'checklist') {
    return `chk-${target.etapaId}-${target.checklistIndex}-${target.subitemIndex ?? 'm'}`;
  }
  return `et-${target.etapaId}-${target.entregaId}`;
}

export function filaItemToReviewTarget(item: AnaliseFilaItem): ReviewEntregaPopupTarget {
  if (item.tipo === 'checklist' && item.pendenciaChecklist) {
    return {
      mode: 'checklist',
      projetoId: item.projeto.id,
      etapaId: item.etapa.id,
      checklistIndex: item.pendenciaChecklist.checklistIndex,
      subitemIndex: item.pendenciaChecklist.subitemIndex,
    };
  }
  if (item.pendenciaEtapa) {
    return {
      mode: 'etapa_entrega',
      projetoId: item.projeto.id,
      etapaId: item.etapa.id,
      entregaId: item.pendenciaEtapa.id,
    };
  }
  throw new Error('Item de fila inválido');
}

export function buildAnaliseFila(grupos: AnaliseProjetoGrupo[]): AnaliseFilaItem[] {
  const items: AnaliseFilaItem[] = [];
  for (const grupo of grupos) {
    for (const etapa of grupo.etapas) {
      for (const p of etapa.pendenciasChecklist) {
        items.push({
          key: `chk-${etapa.id}-${p.checklistIndex}-${p.subitemIndex ?? 'm'}-${p.dataEnvio}`,
          projeto: { ...grupo.projeto },
          etapa,
          tipo: 'checklist',
          dataEnvio: p.dataEnvio,
          pendenciaChecklist: p,
        });
      }
      for (const en of etapa.pendenciasEtapaEntrega) {
        items.push({
          key: `et-${etapa.id}-${en.id}`,
          projeto: { ...grupo.projeto },
          etapa,
          tipo: 'etapa_entrega',
          dataEnvio: en.dataEnvio,
          pendenciaEtapa: en,
        });
      }
    }
  }
  return items;
}

function dataEnvioMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export type AnaliseFilaFiltros = {
  projetoId: number | 'all';
  busca: string;
  ordem: AnaliseOrdemFila;
  escopoExecutor?: AnaliseEscopoExecutor;
  /** Usuário logado — usado em «para eu avaliar» para ocultar apenas as próprias entregas. */
  viewerUserId?: number | null;
  viewerIsAdmin?: boolean;
};

/** Entrega que o usuário pode avaliar (não é auto-aprovação da própria entrega). */
export function entregaVisivelParaAvaliador(
  item: AnaliseFilaItem,
  viewerUserId: number | null | undefined,
  viewerIsAdmin?: boolean,
): boolean {
  if (viewerIsAdmin) return true;
  const execId = executorIdDaPendencia(item);
  if (execId == null || viewerUserId == null) return true;
  return Number(execId) !== Number(viewerUserId);
}

export function executorIdDaPendencia(item: AnaliseFilaItem): number | null {
  if (item.tipo === 'checklist' && item.pendenciaChecklist) {
    return item.pendenciaChecklist.executor.id;
  }
  if (item.pendenciaEtapa) return item.pendenciaEtapa.executor.id;
  return null;
}

/** Entrega enviada pelo supervisor cadastrado no projeto. */
export function isEntregaDoSupervisorProjeto(item: AnaliseFilaItem): boolean {
  const supId = item.projeto.supervisorId;
  if (supId == null) return false;
  const execId = executorIdDaPendencia(item);
  return execId != null && Number(execId) === Number(supId);
}

export function filterAndSortAnaliseFila(
  grupos: AnaliseProjetoGrupo[],
  filtros: AnaliseFilaFiltros,
): AnaliseFilaItem[] {
  let items = buildAnaliseFila(grupos);

  if (filtros.projetoId !== 'all') {
    items = items.filter((i) => i.projeto.id === filtros.projetoId);
  }

  const escopo = filtros.escopoExecutor ?? 'todas';
  if (escopo === 'para_avaliar') {
    items = items.filter((i) =>
      entregaVisivelParaAvaliador(i, filtros.viewerUserId, filtros.viewerIsAdmin),
    );
  } else if (escopo === 'do_supervisor') {
    items = items.filter((i) => isEntregaDoSupervisorProjeto(i));
  }

  const q = filtros.busca.trim().toLowerCase();
  if (q) {
    items = items.filter((i) => {
      const parts = [
        i.projeto.nome,
        i.etapa.nome,
        i.etapa.sessaoNome ?? '',
        i.etapa.aba ?? '',
        i.etapa.executor.nome,
        i.pendenciaChecklist?.textoLinha ?? '',
        i.pendenciaChecklist?.executor.nome ?? '',
        i.pendenciaEtapa?.executor.nome ?? '',
      ];
      return parts.some((p) => p.toLowerCase().includes(q));
    });
  }

  const dir = filtros.ordem === 'antigas' ? 1 : -1;
  items.sort((a, b) => {
    const d = dataEnvioMs(a.dataEnvio) - dataEnvioMs(b.dataEnvio);
    if (d !== 0) return d * dir;
    return a.key.localeCompare(b.key);
  });

  return items;
}

/** Reagrupa itens já filtrados/ordenados para exibição por projeto (mantém ordem global). */
export function groupAnaliseFilaForDisplay(fila: AnaliseFilaItem[]): AnaliseProjetoGrupo[] {
  const out: AnaliseProjetoGrupo[] = [];
  const projetoIndex = new Map<number, number>();

  for (const item of fila) {
    let pi = projetoIndex.get(item.projeto.id);
    if (pi === undefined) {
      pi = out.length;
      projetoIndex.set(item.projeto.id, pi);
      out.push({ projeto: item.projeto, etapas: [] });
    }
    const grupo = out[pi]!;
    let etapa = grupo.etapas.find((e) => e.id === item.etapa.id);
    if (!etapa) {
      etapa = {
        ...item.etapa,
        pendenciasChecklist: [],
        pendenciasEtapaEntrega: [],
      };
      grupo.etapas.push(etapa);
    }
    if (item.tipo === 'checklist' && item.pendenciaChecklist) {
      etapa.pendenciasChecklist.push(item.pendenciaChecklist);
    }
    if (item.tipo === 'etapa_entrega' && item.pendenciaEtapa) {
      etapa.pendenciasEtapaEntrega.push(item.pendenciaEtapa);
    }
  }

  return out;
}

export function projetoOptionsFromAnalise(grupos: AnaliseProjetoGrupo[]): Array<{ id: number; nome: string }> {
  return grupos
    .map((g) => g.projeto)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function buildAnaliseFilaFiltros(
  partial: Omit<AnaliseFilaFiltros, 'viewerUserId' | 'viewerIsAdmin'> & {
    viewerUserId?: number | null;
    viewerIsAdmin?: boolean;
  },
): AnaliseFilaFiltros {
  return {
    projetoId: partial.projetoId,
    busca: partial.busca,
    ordem: partial.ordem,
    escopoExecutor: partial.escopoExecutor,
    viewerUserId: partial.viewerUserId ?? null,
    viewerIsAdmin: partial.viewerIsAdmin ?? false,
  };
}
