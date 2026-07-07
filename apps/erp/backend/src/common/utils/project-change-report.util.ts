import { ProjetoStatus, EtapaStatus } from '@prisma/client';

/** Texto curto para exibição; null/undefined → rótulo amigável. */
export function fmtTextoCampo(v: unknown): string {
  if (v === null || v === undefined) return '(vazio)';
  const s = String(v).trim();
  return s.length > 0 ? s : '(vazio)';
}

export function fmtMoedaPt(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n ?? '—');
  return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtDataPt(d: unknown): string {
  if (d == null) return '(vazio)';
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function linhaAlteracao(campo: string, antes: string, depois: string): string {
  if (antes === depois) return '';
  return `• ${campo}: "${antes}" → "${depois}"`;
}

export function statusProjetoLabel(s: ProjetoStatus | string): string {
  if (s === 'EM_ANDAMENTO') return 'Em andamento';
  if (s === 'FINALIZADO') return 'Finalizado';
  return String(s);
}

export function statusEtapaLabel(s: EtapaStatus | string): string {
  const map: Record<string, string> = {
    PENDENTE: 'Pendente',
    EM_ANDAMENTO: 'Em andamento',
    EM_ANALISE: 'Em análise',
    APROVADA: 'Aprovada',
    REPROVADA: 'Reprovada',
  };
  return map[String(s)] ?? String(s);
}

export type ProjetoSnapshot = {
  nome: string;
  resumo: string | null;
  objetivo: string | null;
  descricaoLonga: string | null;
  valorTotal: number | null;
  status: ProjetoStatus;
  supervisorId: number | null;
  supervisorNome: string | null;
  setores: Array<{ id: number; nome: string }>;
};

export function projetoRowToSnapshot(p: {
  nome: string;
  resumo?: string | null;
  objetivo?: string | null;
  descricaoLonga?: string | null;
  valorTotal?: number | null;
  status: ProjetoStatus;
  supervisor?: { id: number; nome?: string } | null;
  setores?: Array<{ id: number; nome: string }>;
}): ProjetoSnapshot {
  return {
    nome: p.nome,
    resumo: p.resumo ?? null,
    objetivo: p.objetivo ?? null,
    descricaoLonga: p.descricaoLonga ?? null,
    valorTotal: p.valorTotal ?? null,
    status: p.status,
    supervisorId: p.supervisor?.id ?? null,
    supervisorNome: p.supervisor?.nome ?? null,
    setores: Array.isArray(p.setores) ? p.setores.map((s) => ({ id: s.id, nome: s.nome })) : [],
  };
}

export function buildProjetoDiffLines(antes: ProjetoSnapshot, depois: ProjetoSnapshot): string {
  const lines: string[] = [];
  const push = (campo: string, a: string, b: string) => {
    const L = linhaAlteracao(campo, a, b);
    if (L) lines.push(L);
  };
  push('Nome', antes.nome, depois.nome);
  push('Resumo', fmtTextoCampo(antes.resumo), fmtTextoCampo(depois.resumo));
  push('Objetivo', fmtTextoCampo(antes.objetivo), fmtTextoCampo(depois.objetivo));
  push('Descrição longa', fmtTextoCampo(antes.descricaoLonga), fmtTextoCampo(depois.descricaoLonga));
  push('Valor total', fmtMoedaPt(antes.valorTotal ?? 0), fmtMoedaPt(depois.valorTotal ?? 0));
  push('Status do projeto', statusProjetoLabel(antes.status), statusProjetoLabel(depois.status));
  const supA =
    antes.supervisorId != null
      ? `${antes.supervisorNome ?? `#${antes.supervisorId}`} (id ${antes.supervisorId})`
      : '(vazio)';
  const supB =
    depois.supervisorId != null
      ? `${depois.supervisorNome ?? `#${depois.supervisorId}`} (id ${depois.supervisorId})`
      : '(vazio)';
  push('Supervisor', supA, supB);
  const setA =
    [...antes.setores]
      .map((s) => s.nome)
      .sort()
      .join(', ') || '(nenhum)';
  const setB =
    [...depois.setores]
      .map((s) => s.nome)
      .sort()
      .join(', ') || '(nenhum)';
  push('Setores', setA, setB);
  return lines.join('\n');
}

export type EtapaSnapshot = {
  id: number;
  nome: string;
  descricao: string | null;
  aba: string | null;
  status: EtapaStatus;
  valorInsumos: number;
  dataInicio: Date | null;
  dataFim: Date | null;
  executorId: number | null;
  executorNome: string | null;
  responsavelId: number | null;
  responsavelNome: string | null;
  projetoId: number;
  projetoNome: string;
  sessaoId: number | null;
  sessaoNome: string | null;
  setores: Array<{ id: number; nome: string }>;
  integrantesNomes: string[];
  checklistItens: number;
};

export function buildEtapaDiffLines(antes: EtapaSnapshot, depois: EtapaSnapshot): string {
  const lines: string[] = [];
  const push = (campo: string, a: string, b: string) => {
    const L = linhaAlteracao(campo, a, b);
    if (L) lines.push(L);
  };
  push('Nome da etapa', antes.nome, depois.nome);
  push('Descrição', fmtTextoCampo(antes.descricao), fmtTextoCampo(depois.descricao));
  push('Aba', fmtTextoCampo(antes.aba), fmtTextoCampo(depois.aba));
  push('Status', statusEtapaLabel(antes.status), statusEtapaLabel(depois.status));
  push('Valor insumos', fmtMoedaPt(antes.valorInsumos), fmtMoedaPt(depois.valorInsumos));
  push('Data início', fmtDataPt(antes.dataInicio), fmtDataPt(depois.dataInicio));
  push('Data fim', fmtDataPt(antes.dataFim), fmtDataPt(depois.dataFim));
  const exA =
    antes.executorId != null
      ? `${antes.executorNome ?? '—'} (id ${antes.executorId})`
      : '(vazio)';
  const exB =
    depois.executorId != null
      ? `${depois.executorNome ?? '—'} (id ${depois.executorId})`
      : '(vazio)';
  push('Executor', exA, exB);
  const respA =
    antes.responsavelId != null
      ? `${antes.responsavelNome ?? '—'} (id ${antes.responsavelId})`
      : '(sem responsável)';
  const respB =
    depois.responsavelId != null
      ? `${depois.responsavelNome ?? '—'} (id ${depois.responsavelId})`
      : '(sem responsável)';
  push('Responsável da etapa', respA, respB);
  if (antes.projetoId !== depois.projetoId) {
    lines.push(
      `• Projeto vinculado: "#${antes.projetoId} ${antes.projetoNome}" → "#${depois.projetoId} ${depois.projetoNome}"`,
    );
  }
  const sesA =
    antes.sessaoId != null ? `${antes.sessaoNome ?? '—'} (id ${antes.sessaoId})` : '(sem sessão)';
  const sesB =
    depois.sessaoId != null ? `${depois.sessaoNome ?? '—'} (id ${depois.sessaoId})` : '(sem sessão)';
  push('Sessão', sesA, sesB);
  const setA =
    [...antes.setores]
      .map((s) => s.nome)
      .sort()
      .join(', ') || '(nenhum)';
  const setB =
    [...depois.setores]
      .map((s) => s.nome)
      .sort()
      .join(', ') || '(nenhum)';
  push('Setores da etapa', setA, setB);
  const intA = [...antes.integrantesNomes].sort().join(', ') || '(nenhum)';
  const intB = [...depois.integrantesNomes].sort().join(', ') || '(nenhum)';
  push('Integrantes', intA, intB);
  if (antes.checklistItens !== depois.checklistItens) {
    lines.push(`• Checklist: quantidade de itens ${antes.checklistItens} → ${depois.checklistItens}`);
  }
  return lines.join('\n');
}

export function snapshotFromEtapaRow(row: {
  id: number;
  nome: string;
  descricao: string | null;
  aba: string | null;
  status: EtapaStatus;
  valorInsumos: number;
  dataInicio: Date | null;
  dataFim: Date | null;
  executorId: number | null;
  executor?: { nome: string } | null;
  responsavelId: number | null;
  responsavel?: { nome: string } | null;
  projetoId: number;
  projeto?: { nome: string } | null;
  sessaoId: number | null;
  sessao?: { nome: string } | null;
  setores?: Array<{ id: number; nome: string }>;
  integrantes?: Array<{ usuario: { nome: string } }>;
  checklistJson?: unknown;
}): EtapaSnapshot {
  const checklist = Array.isArray(row.checklistJson) ? row.checklistJson : [];
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    aba: row.aba,
    status: row.status,
    valorInsumos: row.valorInsumos ?? 0,
    dataInicio: row.dataInicio,
    dataFim: row.dataFim,
    executorId: row.executorId,
    executorNome: row.executor?.nome ?? null,
    responsavelId: row.responsavelId,
    responsavelNome: row.responsavel?.nome ?? null,
    projetoId: row.projetoId,
    projetoNome: row.projeto?.nome ?? '',
    sessaoId: row.sessaoId,
    sessaoNome: row.sessao?.nome ?? null,
    setores: row.setores ?? [],
    integrantesNomes: (row.integrantes ?? []).map((i) => i.usuario?.nome).filter(Boolean) as string[],
    checklistItens: checklist.length,
  };
}
