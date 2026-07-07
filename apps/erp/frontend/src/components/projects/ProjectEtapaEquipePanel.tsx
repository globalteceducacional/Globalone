import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { btn } from '../../utils/buttonStyles';
import { toast, formatApiError } from '../../utils/toast';
import { AppSelect } from '../ui/AppSelect';
import { formatParticipantesResumo } from '../../utils/participantesResumo';

export interface EquipePanelUsuario {
  id: number;
  nome: string;
  email?: string;
  cargo?: string | { nome: string };
}

export interface EquipePanelEtapa {
  id: number;
  ordem?: number;
  nome: string;
  sessaoId?: number | null;
  sessao?: { id: number; nome: string } | null;
  aba?: string | null;
  executor?: { id: number; nome: string } | null;
  integrantes?: Array<{ usuario: { id: number; nome: string } }>;
}

export interface EquipePanelSessao {
  id: number;
  nome: string;
}

interface EtapaDraft {
  participantesIds: number[];
}

/** Participantes editáveis da etapa (integrantes; o executor é sempre o supervisor do projeto). */
function participantesFromEtapa(etapa: EquipePanelEtapa, supervisorId?: number | null): number[] {
  const integrantes =
    etapa.integrantes?.map((i) => i.usuario?.id).filter((id): id is number => typeof id === 'number') ?? [];
  const execId = etapa.executor?.id;
  const sup = supervisorId != null ? Number(supervisorId) : null;
  if (execId != null && (sup == null || Number(execId) !== sup)) {
    return Array.from(new Set([Number(execId), ...integrantes.map(Number)]));
  }
  return Array.from(new Set(integrantes.map(Number)));
}

function cargoLabel(u: EquipePanelUsuario): string {
  if (!u.cargo) return '';
  return typeof u.cargo === 'string' ? u.cargo : u.cargo.nome ?? '';
}

function EtapaParticipantesEditor({
  draft,
  users,
  usersFiltrados,
  userSearch,
  onUserSearch,
  onToggle,
  onSelectAllVisible,
  onClearAll,
}: {
  draft: EtapaDraft;
  users: EquipePanelUsuario[];
  usersFiltrados: EquipePanelUsuario[];
  userSearch: string;
  onUserSearch: (value: string) => void;
  onToggle: (userId: number) => void;
  onSelectAllVisible: () => void;
  onClearAll: () => void;
}) {
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const selectedUsers = useMemo(
    () =>
      draft.participantesIds
        .map((id) => userById.get(id))
        .filter((u): u is EquipePanelUsuario => u != null),
    [draft.participantesIds, userById],
  );

  const filtradosNaoSelecionados = usersFiltrados.filter((u) => !draft.participantesIds.includes(u.id));

  return (
    <div className="px-3 pb-3 pt-2 border-t border-white/10 bg-black/20 space-y-2">
      {selectedUsers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-white/45 shrink-0">
            Selecionados ({selectedUsers.length})
          </span>
          {selectedUsers.map((u) => (
              <span
                key={u.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/85"
              >
                <span className="truncate max-w-[10rem]">{u.nome}</span>
                <button
                  type="button"
                  className="text-white/50 hover:text-white leading-none px-0.5"
                  onClick={() => onToggle(u.id)}
                  aria-label={`Remover ${u.nome}`}
                >
                  {'\u00D7'}
                </button>
              </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-200/80">
          Nenhum participante - marque ao menos um na lista.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={userSearch}
          onChange={(e) => onUserSearch(e.target.value)}
          placeholder="Filtrar por nome, e-mail ou cargo..."
          className="flex-1 min-w-[12rem] bg-white/10 border border-white/20 rounded-md px-3 py-1.5 text-sm text-white"
        />
        <button
          type="button"
          className={btn.secondary}
          onClick={onSelectAllVisible}
          disabled={filtradosNaoSelecionados.length === 0}
        >
          Marcar filtrados
        </button>
        <button
          type="button"
          className={btn.secondary}
          onClick={onClearAll}
          disabled={draft.participantesIds.length === 0}
        >
          Limpar
        </button>
        <span className="text-[10px] text-white/45 tabular-nums sm:ml-auto">
          {draft.participantesIds.length} selec. | {usersFiltrados.length}
          {userSearch.trim() ? ` de ${users.length}` : ''} exibido(s)
        </span>
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur-sm">
            <tr className="text-left text-white/50 border-b border-white/10">
              <th className="w-9 px-2 py-1.5 font-medium" />
              <th className="px-2 py-1.5 font-medium">Nome</th>
              <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Cargo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {usersFiltrados.map((u) => {
              const checked = draft.participantesIds.includes(u.id);
              const cargo = cargoLabel(u);
              return (
                <tr
                  key={u.id}
                  className={
                    checked ? 'bg-teal-500/10 hover:bg-teal-500/15' : 'hover:bg-white/5'
                  }
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(u.id)}
                      className="accent-teal-500"
                      aria-label={`Participante ${u.nome}`}
                    />
                  </td>
                  <td className="px-2 py-1 font-medium text-white/90 max-w-[14rem]">
                    <span className="block truncate" title={u.nome}>
                      {u.nome}
                    </span>
                    {cargo && (
                      <span className="block truncate text-white/40 sm:hidden" title={cargo}>
                        {cargo}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-white/45 hidden sm:table-cell max-w-[10rem]">
                    <span className="block truncate" title={cargo}>
                      {cargo || '-'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {usersFiltrados.length === 0 && (
          <p className="text-xs text-white/50 text-center py-4">Nenhum usuário encontrado.</p>
        )}
      </div>
    </div>
  );
}

export function ProjectEtapaEquipePanel({
  etapas,
  sessoes,
  users,
  supervisorId,
  canManage,
  onSaved,
}: {
  etapas: EquipePanelEtapa[];
  sessoes: EquipePanelSessao[];
  users: EquipePanelUsuario[];
  supervisorId?: number | null;
  canManage: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [sessaoFilter, setSessaoFilter] = useState<number | 'all' | 'none'>('all');
  const [drafts, setDrafts] = useState<Record<number, EtapaDraft>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSourceId, setBulkSourceId] = useState<number | ''>('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const etapasOrdenadas = useMemo(() => {
    return [...etapas].sort((a, b) => {
      const oa = a.ordem ?? 0;
      const ob = b.ordem ?? 0;
      if (oa !== ob) return oa - ob;
      return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR');
    });
  }, [etapas]);

  const initDrafts = useCallback(() => {
    const next: Record<number, EtapaDraft> = {};
    for (const e of etapas) {
      next[e.id] = {
        participantesIds: participantesFromEtapa(e, supervisorId),
      };
    }
    setDrafts(next);
    setSelectedIds(new Set());
  }, [etapas, supervisorId]);

  useEffect(() => {
    initDrafts();
  }, [initDrafts]);

  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const etapasFiltradas = useMemo(() => {
    const q = normalize(search);
    return etapasOrdenadas.filter((e) => {
      if (sessaoFilter === 'none' && e.sessaoId != null) return false;
      if (typeof sessaoFilter === 'number' && e.sessaoId !== sessaoFilter) return false;
      if (!q) return true;
      const hay = [e.nome, e.aba, e.sessao?.nome, e.executor?.nome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [etapasOrdenadas, search, sessaoFilter]);

  const dirtyIds = useMemo(() => {
    return etapasFiltradas.filter((e) => {
      const draft = drafts[e.id];
      if (!draft) return false;
      const original = participantesFromEtapa(e, supervisorId);
      const a = [...draft.participantesIds].sort((x, y) => x - y);
      const b = [...original].sort((x, y) => x - y);
      if (a.length !== b.length) return true;
      return a.some((id, i) => id !== b[i]);
    }).map((e) => e.id);
  }, [etapasFiltradas, drafts, supervisorId]);

  const usersFiltrados = useMemo(() => {
    const q = normalize(userSearch);
    const list = [...users].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!q) return list;
    return list.filter(
      (u) =>
        normalize(u.nome).includes(q) ||
        normalize(u.email ?? '').includes(q) ||
        normalize(cargoLabel(u)).includes(q),
    );
  }, [users, userSearch]);

  function updateDraft(etapaId: number, patch: Partial<EtapaDraft>) {
    setDrafts((prev) => {
      const cur = prev[etapaId] ?? { participantesIds: [] };
      return { ...prev, [etapaId]: { ...cur, ...patch } };
    });
  }

  function toggleParticipante(etapaId: number, userId: number) {
    setDrafts((prev) => {
      const cur = prev[etapaId] ?? { participantesIds: [] };
      const has = cur.participantesIds.includes(userId);
      const ids = has
        ? cur.participantesIds.filter((id) => id !== userId)
        : [...cur.participantesIds, userId];
      return { ...prev, [etapaId]: { participantesIds: ids } };
    });
  }

  function selectAllVisibleForEtapa(etapaId: number) {
    setDrafts((prev) => {
      const cur = prev[etapaId] ?? { participantesIds: [] };
      const visibleIds = usersFiltrados.map((u) => u.id);
      const merged = Array.from(new Set([...cur.participantesIds, ...visibleIds]));
      return { ...prev, [etapaId]: { participantesIds: merged } };
    });
  }

  function clearParticipantes(etapaId: number) {
    updateDraft(etapaId, { participantesIds: [] });
  }

  function discardEtapaDraft(etapaId: number) {
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!etapa) return;
    updateDraft(etapaId, {
      participantesIds: participantesFromEtapa(etapa, supervisorId),
    });
  }

  function toggleExpanded(etapaId: number) {
    setExpandedId((prev) => {
      if (prev === etapaId) {
        setUserSearch('');
        return null;
      }
      setUserSearch('');
      return etapaId;
    });
  }

  function resolveExecutorId(): number | null {
    if (supervisorId == null || !Number.isFinite(Number(supervisorId))) return null;
    return Number(supervisorId);
  }

  async function saveEtapa(etapaId: number) {
    const draft = drafts[etapaId];
    const executorId = resolveExecutorId();
    if (executorId == null) {
      toast.error('Defina o supervisor do projeto antes de salvar a equipe das etapas.');
      return;
    }
    if (!draft?.participantesIds.length) {
      toast.error('Selecione pelo menos um participante.');
      return;
    }
    setSavingId(etapaId);
    try {
      await api.patch(`/tasks/${etapaId}`, {
        executorId,
        integrantesIds: draft.participantesIds,
      });
      toast.success('Participantes da etapa atualizados.');
      await onSaved();
      initDrafts();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSavingId(null);
    }
  }

  async function saveAllDirty() {
    if (dirtyIds.length === 0) {
      toast.info('Nenhuma alteração pendente.');
      return;
    }
    setSavingAll(true);
    let ok = 0;
    let fail = 0;
    const executorId = resolveExecutorId();
    if (executorId == null) {
      toast.error('Defina o supervisor do projeto antes de salvar a equipe das etapas.');
      setSavingAll(false);
      return;
    }
    for (const etapaId of dirtyIds) {
      const draft = drafts[etapaId];
      if (!draft?.participantesIds.length) {
        fail += 1;
        continue;
      }
      try {
        await api.patch(`/tasks/${etapaId}`, {
          executorId,
          integrantesIds: draft.participantesIds,
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setSavingAll(false);
    if (ok > 0) {
      toast.success(`${ok} etapa(s) atualizada(s).`);
      await onSaved();
      initDrafts();
    }
    if (fail > 0) {
      toast.error(`${fail} etapa(s) não foram salvas (verifique participantes).`);
    }
  }

  function applyBulkCopy() {
    if (bulkSourceId === '') {
      toast.error('Escolha a etapa de origem.');
      return;
    }
    const source = drafts[Number(bulkSourceId)];
    if (!source?.participantesIds.length) {
      toast.error('A etapa de origem não tem participantes.');
      return;
    }
    const targets =
      selectedIds.size > 0
        ? Array.from(selectedIds)
        : etapasFiltradas.map((e) => e.id);
    if (targets.length === 0) {
      toast.error('Marque etapas ou use o filtro.');
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of targets) {
        if (id === Number(bulkSourceId)) continue;
        next[id] = {
          participantesIds: [...source.participantesIds],
        };
      }
      return next;
    });
    toast.success(`Equipe copiada para ${targets.length} etapa(s). Revise e salve.`);
  }

  function toggleSelectAllFiltered() {
    if (selectedIds.size === etapasFiltradas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(etapasFiltradas.map((e) => e.id)));
    }
  }

  if (etapas.length === 0) {
    return (
      <p className="text-sm text-white/55 py-6 text-center">
        Nenhuma etapa neste projeto. Crie etapas na visão «Cronograma» primeiro.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/65 leading-relaxed">
        Defina os participantes de cada etapa sem abrir o cronograma. O supervisor do projeto é definido no
        cadastro do projeto e usado automaticamente como executor principal de cada etapa.
      </p>
      {supervisorId == null && (
        <p className="text-xs text-amber-200/90">
          Este projeto ainda não tem supervisor — defina-o na edição do projeto para salvar equipes.
        </p>
      )}

      <div className="rounded-lg border border-teal-500/25 bg-teal-950/20 p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-white/70 mb-1">Buscar etapa</label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, sessão ou aba..."
              className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Sessão</label>
            <AppSelect
              value={sessaoFilter === 'all' ? 'all' : sessaoFilter === 'none' ? 'none' : String(sessaoFilter)}
              onChange={(v) => {
                if (v === 'all') setSessaoFilter('all');
                else if (v === 'none') setSessaoFilter('none');
                else setSessaoFilter(Number(v));
              }}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'none', label: 'Sem sessão' },
                ...sessoes.map((s) => ({ value: String(s.id), label: s.nome })),
              ]}
              selectClassName="w-full"
            />
          </div>
          <div className="flex items-end">
            <p className="text-xs text-white/50 tabular-nums">
              {etapasFiltradas.length} etapa(s) | {dirtyIds.length} alteração(ões)
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-col gap-3 pt-2 border-t border-white/10 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <AppSelect
                value={bulkSourceId === '' ? '' : String(bulkSourceId)}
                onChange={(v) => setBulkSourceId(v === '' ? '' : Number(v))}
                options={[
                  { value: '', label: 'Copiar equipe de...' },
                  ...etapasOrdenadas.map((e) => ({
                    value: String(e.id),
                    label: e.nome,
                  })),
                ]}
                selectClassName="min-w-[12rem] flex-1"
              />
              <button type="button" className={btn.secondary} onClick={applyBulkCopy}>
                Aplicar às marcadas
              </button>
              <button
                type="button"
                className="text-xs text-teal-200/80 hover:text-teal-100 underline"
                onClick={toggleSelectAllFiltered}
              >
                {selectedIds.size === etapasFiltradas.length ? 'Desmarcar todas' : 'Marcar filtradas'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btn.secondary}
                onClick={initDrafts}
                disabled={savingAll || savingId != null}
              >
                Descartar alterações
              </button>
              <button
                type="button"
                className={btn.primary}
                onClick={() => void saveAllDirty()}
                disabled={!canManage || dirtyIds.length === 0 || savingAll}
              >
                {savingAll ? 'Salvando...' : `Salvar ${dirtyIds.length} alterada(s)`}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[auto_auto_1fr_1fr] gap-2 px-3 py-2 bg-white/5 text-xs font-medium text-white/60 border-b border-white/10">
          {canManage && <span className="w-8" />}
          <span className="w-6" aria-hidden />
          <span>Etapa</span>
          <span>Participantes atuais</span>
        </div>
        <ul className="divide-y divide-white/10 max-h-[min(70vh,720px)] overflow-y-auto">
          {etapasFiltradas.map((etapa, idx) => {
            const draft = drafts[etapa.id];
            const isDirty = dirtyIds.includes(etapa.id);
            const isExpanded = expandedId === etapa.id;
            const nomes = (draft?.participantesIds ?? [])
              .map((uid) => users.find((u) => u.id === uid)?.nome)
              .filter((n): n is string => Boolean(n));
            const { resumo } = formatParticipantesResumo(nomes);

            return (
              <li key={etapa.id} className={isDirty ? 'bg-amber-500/5' : ''}>
                <div
                  className={`flex items-start gap-2 p-3 min-w-0 ${
                    canManage ? 'cursor-pointer hover:bg-white/[0.03]' : ''
                  }`}
                  onClick={() => canManage && toggleExpanded(etapa.id)}
                  onKeyDown={(e) => {
                    if (canManage && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggleExpanded(etapa.id);
                    }
                  }}
                  role={canManage ? 'button' : undefined}
                  tabIndex={canManage ? 0 : undefined}
                  aria-expanded={canManage ? isExpanded : undefined}
                >
                  {canManage && (
                    <label
                      className="flex items-center pt-0.5 md:w-8 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(etapa.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(etapa.id)) n.delete(etapa.id);
                            else n.add(etapa.id);
                            return n;
                          });
                        }}
                        className="accent-teal-500"
                      />
                    </label>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(etapa.id);
                      }}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Recolher participantes' : 'Expandir participantes'}
                      className="shrink-0 text-white/70 mt-0.5 inline-flex transition-transform duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded"
                      style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    >
                      ▼
                    </button>
                  )}
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/90 break-words">
                        <span className="text-white/40 tabular-nums mr-1">#{idx + 1}</span>
                        {etapa.nome}
                        {isDirty && (
                          <span className="ml-2 text-[10px] font-normal text-amber-300/90 uppercase tracking-wide">
                            alterado
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-white/45 mt-0.5">
                        {[etapa.sessao?.nome, etapa.aba].filter(Boolean).join(' | ') || '-'}
                      </p>
                    </div>
                    <p className="text-xs text-white/70 min-w-0 break-words md:pt-0.5">{resumo || '-'}</p>
                  </div>
                </div>

                {isExpanded && canManage && draft && (
                  <div className="border-t border-white/10 bg-black/10">
                    <EtapaParticipantesEditor
                      draft={draft}
                      users={users}
                      usersFiltrados={usersFiltrados}
                      userSearch={userSearch}
                      onUserSearch={setUserSearch}
                      onToggle={(userId) => toggleParticipante(etapa.id, userId)}
                      onSelectAllVisible={() => selectAllVisibleForEtapa(etapa.id)}
                      onClearAll={() => clearParticipantes(etapa.id)}
                    />
                    <div
                      className="flex flex-wrap justify-end gap-2 px-3 pb-3 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isDirty && (
                        <button
                          type="button"
                          className={btn.secondary}
                          disabled={savingId === etapa.id || savingAll}
                          onClick={() => discardEtapaDraft(etapa.id)}
                        >
                          Descartar
                        </button>
                      )}
                      <button
                        type="button"
                        className={btn.primary}
                        disabled={!isDirty || savingId === etapa.id || savingAll}
                        onClick={() => void saveEtapa(etapa.id)}
                      >
                        {savingId === etapa.id ? 'Salvando...' : 'Salvar etapa'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {etapasFiltradas.length === 0 && (
          <p className="text-sm text-white/50 text-center py-8">Nenhuma etapa com esse filtro.</p>
        )}
      </div>

      {!canManage && (
        <p className="text-xs text-white/45">
          Você pode visualizar a equipe; alterações exigem permissão de edição.
        </p>
      )}
    </div>
  );
}
