import { EtapaStatus } from '@prisma/client';

/** Item do checklist concluído no cadastro (pai + todos os subitens marcados). */
export function checklistItemFullyDoneForProgress(item: {
  concluido?: boolean;
  subitens?: Array<{ concluido?: boolean }>;
}): boolean {
  const subitensOk =
    !item.subitens || item.subitens.length === 0
      ? true
      : item.subitens.every((sub) => sub.concluido === true);
  return item.concluido === true && subitensOk;
}

export function latestChecklistEntregaForProgress(
  entregas: Array<{
    checklistIndex: number;
    subitemIndex?: number | null;
    status: string;
    dataEnvio?: Date;
  }>,
  checklistIndex: number,
  subitemIndex: number | null,
): { status: string } | null {
  const wantSub = subitemIndex;
  const matches = entregas.filter((e) => {
    const eSub = e.subitemIndex ?? null;
    return e.checklistIndex === checklistIndex && eSub === wantSub;
  });
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => new Date(b.dataEnvio || 0).getTime() - new Date(a.dataEnvio || 0).getTime(),
  )[0];
}

/**
 * Linha do checklist conta para progresso só com:
 * - cadastro completo (pai + subs marcados), ou
 * - entrega **aprovada** (APROVADO) no item/subitem correspondente.
 * Entrega em análise (EM_ANALISE) não aumenta a porcentagem.
 */
export function checklistRowFeitoParaProgresso(
  item: { concluido?: boolean; subitens?: Array<{ concluido?: boolean }> },
  checklistIndex: number,
  entregas: Array<{
    checklistIndex: number;
    subitemIndex?: number | null;
    status: string;
    dataEnvio?: Date;
  }>,
): boolean {
  const subs = item.subitens;
  if (Array.isArray(subs) && subs.length > 0) {
    return subs.every((sub, subIdx) => {
      if (sub.concluido === true) return true;
      const ent = latestChecklistEntregaForProgress(entregas, checklistIndex, subIdx);
      return ent != null && ent.status === 'APROVADO';
    });
  }
  if (checklistItemFullyDoneForProgress(item)) return true;
  const ent = latestChecklistEntregaForProgress(entregas, checklistIndex, null);
  return ent != null && ent.status === 'APROVADO';
}

export type EtapaProgressMetrics = {
  etapaConcluidaParaProgresso: boolean;
  checklistItensTotal: number;
  checklistItensConcluidos: number;
  etapaStatus: EtapaStatus | string;
};

type EtapaCompletaLike = {
  checklistJson?: unknown;
  checklistEntregas?: Array<{
    checklistIndex: number;
    subitemIndex?: number | null;
    status: string;
    dataEnvio?: Date;
  }>;
  entregas?: Array<{ status: string }>;
};

/**
 * Mesma regra que `ProjectsService.findAll`: etapa “cheia” só com APROVADA ou entrega de etapa aprovada;
 * fração por linhas do checklist usa `checklistRowFeitoParaProgresso` (sem EM_ANALISE).
 */
export function buildEtapaProgressMetrics(
  etapaCompleta: EtapaCompletaLike | null,
  status: EtapaStatus,
): EtapaProgressMetrics {
  let checklistItensTotal = 0;
  let checklistItensConcluidos = 0;
  let etapaConcluidaParaProgresso = false;

  if (!etapaCompleta) {
    return {
      etapaConcluidaParaProgresso: status === EtapaStatus.APROVADA,
      checklistItensTotal: 0,
      checklistItensConcluidos: 0,
      etapaStatus: status,
    };
  }

  const temEntregaEtapaAprovada = etapaCompleta.entregas?.some((e) => e.status === 'APROVADA');
  if (status === EtapaStatus.APROVADA || temEntregaEtapaAprovada) {
    etapaConcluidaParaProgresso = true;
  }

  if (etapaCompleta.checklistJson && Array.isArray(etapaCompleta.checklistJson)) {
    const checklist = etapaCompleta.checklistJson as Array<{
      texto: string;
      concluido?: boolean;
      subitens?: Array<{ texto: string; concluido?: boolean }>;
    }>;
    const entregas = (etapaCompleta.checklistEntregas ?? []) as Array<{
      checklistIndex: number;
      subitemIndex?: number | null;
      status: string;
      dataEnvio?: Date;
    }>;
    checklistItensTotal = checklist.length;
    checklistItensConcluidos = checklist.filter((itemRow, idx) =>
      checklistRowFeitoParaProgresso(itemRow, idx, entregas),
    ).length;

    if (!etapaConcluidaParaProgresso && checklist.length > 0) {
      const todosItensConcluidos = checklist.every((itemRow) =>
        checklistItemFullyDoneForProgress(itemRow),
      );
      if (todosItensConcluidos) {
        etapaConcluidaParaProgresso = true;
      }
    }
  }

  return {
    etapaConcluidaParaProgresso,
    checklistItensTotal,
    checklistItensConcluidos,
    etapaStatus: status,
  };
}

/** Porcentagem 0–100 do projeto: só etapas concluídas + fração das linhas de checklist (sem bônus por EM_ANALISE). */
export function computeProjectProgressPercent(
  etapasMetrics: EtapaProgressMetrics[],
  totalEtapas: number,
): number {
  if (totalEtapas <= 0) return 0;
  const acc = etapasMetrics.reduce((sum, e) => {
    if (e.etapaConcluidaParaProgresso) return sum + 1;
    if (e.checklistItensTotal > 0) {
      return sum + e.checklistItensConcluidos / e.checklistItensTotal;
    }
    return sum;
  }, 0);
  return Math.round((acc / totalEtapas) * 100);
}
