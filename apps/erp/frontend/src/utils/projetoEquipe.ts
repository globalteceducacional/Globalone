export type SetorComMembros = {
  id: number;
  nome: string;
  membros?: Array<{ usuario?: { id: number; nome?: string; email?: string; cargo?: unknown } | null }>;
};

export type UsuarioEquipeMin = {
  id: number;
  nome: string;
  email?: string;
  cargo?: string | { nome?: string } | null;
};

export type EquipeMembroLinha = {
  id: number;
  nome: string;
  email?: string;
  cargoLabel: string;
  papeis: string[];
};

export function cargoLabelFromUsuario(u: UsuarioEquipeMin | null | undefined): string {
  if (!u) return 'Sem cargo';
  const c = u.cargo;
  if (typeof c === 'string') return c || 'Sem cargo';
  if (c && typeof c === 'object' && 'nome' in c) return (c as { nome?: string }).nome || 'Sem cargo';
  return 'Sem cargo';
}

export function computeProjetoAutoMemberIds(
  setores: SetorComMembros[],
  selectedSetorIds: number[],
): number[] {
  const ids = new Set<number>();
  for (const setorId of selectedSetorIds) {
    const setor = setores.find((s) => s.id === setorId);
    if (!setor?.membros) continue;
    for (const membro of setor.membros) {
      const usuarioId = membro.usuario?.id;
      if (typeof usuarioId === 'number') ids.add(usuarioId);
    }
  }
  return Array.from(ids);
}

export function mergeProjetoEquipeOnSetorChange(
  prevSetorIds: number[],
  nextSetorIds: number[],
  responsavelIds: number[],
  excludedAutoIds: number[],
  setores: SetorComMembros[],
) {
  const prevAuto = computeProjetoAutoMemberIds(setores, prevSetorIds);
  const nextAuto = computeProjetoAutoMemberIds(setores, nextSetorIds);
  const manualIds = responsavelIds.filter((id) => !prevAuto.includes(id));
  const autoAllowed = nextAuto.filter((id) => !excludedAutoIds.includes(id));
  const nextResponsavelIds = Array.from(new Set([...manualIds, ...autoAllowed]));
  return { setorIds: nextSetorIds, responsavelIds: nextResponsavelIds };
}

export function buildProjetoResponsavelIdsPayload(
  setores: SetorComMembros[],
  setorIds: number[],
  responsavelIds: number[],
  excludedAutoIds: number[],
  supervisorId?: number,
): number[] {
  const autoIds = computeProjetoAutoMemberIds(setores, setorIds);
  const autoAllowed = autoIds.filter((id) => !excludedAutoIds.includes(id));
  const ids = new Set<number>([...autoAllowed, ...responsavelIds]);
  if (typeof supervisorId === 'number') ids.delete(supervisorId);
  return Array.from(ids);
}

type ProjetoEquipeSource = {
  supervisor?: UsuarioEquipeMin | null;
  responsaveis?: Array<{ usuario?: UsuarioEquipeMin | null }>;
  responsaveisExcluidos?: Array<{ usuarioId: number }>;
  setores?: Array<{ id: number; nome: string }>;
};

/** Lista integrantes do projeto (supervisor, responsáveis e setores), sem vínculo por etapa. */
export function resumoPapeisEquipe(papeis: string[]): string {
  if (papeis.includes('Supervisor')) return 'Supervisor';
  const setores = papeis.filter((p) => p.startsWith('Setor:'));
  const partes: string[] = [];
  if (papeis.includes('Integrante')) partes.push('Integrante');
  if (setores.length === 1) partes.push(setores[0].replace(/^Setor:\s*/, 'Setor '));
  else if (setores.length > 1) partes.push(`${setores.length} setores`);
  return partes.join(' · ') || 'Integrante';
}

export function buildEquipeCompleta(
  project: ProjetoEquipeSource,
  setores: SetorComMembros[],
): EquipeMembroLinha[] {
  const map = new Map<number, EquipeMembroLinha>();

  const upsert = (u: UsuarioEquipeMin | null | undefined, papel: string) => {
    if (!u?.id) return;
    const existing = map.get(u.id);
    if (existing) {
      if (!existing.papeis.includes(papel)) existing.papeis.push(papel);
      return;
    }
    map.set(u.id, {
      id: u.id,
      nome: u.nome,
      email: u.email,
      cargoLabel: cargoLabelFromUsuario(u),
      papeis: [papel],
    });
  };

  if (project.supervisor) upsert(project.supervisor, 'Supervisor');

  const excluded = new Set(
    (project.responsaveisExcluidos ?? []).map((x) => x.usuarioId).filter((id) => typeof id === 'number'),
  );

  for (const r of project.responsaveis ?? []) {
    if (r.usuario) upsert(r.usuario, 'Integrante');
  }

  const setorIds = (project.setores ?? []).map((s) => s.id);
  for (const setorId of setorIds) {
    const setor = setores.find((s) => s.id === setorId);
    const setorNome = setor?.nome ?? project.setores?.find((s) => s.id === setorId)?.nome ?? 'Setor';
    if (!setor?.membros) continue;
    for (const membro of setor.membros) {
      const u = membro.usuario;
      if (!u?.id || excluded.has(u.id)) continue;
      upsert(u as UsuarioEquipeMin, `Setor: ${setorNome}`);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aSup = a.papeis.includes('Supervisor') ? 0 : 1;
    const bSup = b.papeis.includes('Supervisor') ? 0 : 1;
    if (aSup !== bSup) return aSup - bSup;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}
