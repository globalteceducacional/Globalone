import { useMemo, useRef } from 'react';
import {
  cargoLabelFromUsuario,
  computeProjetoAutoMemberIds,
  type SetorComMembros,
} from '../../utils/projetoEquipe';

type EquipeUserOption = {
  id: number;
  nome: string;
  cargo?: string | { nome?: string } | null;
};

export type ProjetoEquipeFormState = {
  setorIds: number[];
  responsavelIds: number[];
  excludedAutoIds: number[];
  supervisorId?: number;
};

type Props = {
  users: EquipeUserOption[];
  setores: SetorComMembros[];
  value: ProjetoEquipeFormState;
  onChange: (next: ProjetoEquipeFormState) => void;
  disabled?: boolean;
};

export function ProjetoEquipeMembrosField({ users, setores, value, onChange, disabled }: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);

  const autoMemberIds = useMemo(
    () => computeProjetoAutoMemberIds(setores, value.setorIds),
    [setores, value.setorIds],
  );
  const autoMemberIdsSet = useMemo(() => new Set(autoMemberIds), [autoMemberIds]);

  const membrosVisiveis = useMemo(() => {
    const ids = new Set<number>();
    for (const id of value.responsavelIds) {
      if (id !== value.supervisorId) ids.add(id);
    }
    return Array.from(ids);
  }, [value.responsavelIds, value.supervisorId]);

  const usersById = useMemo(() => {
    const m = new Map<number, EquipeUserOption>();
    for (const u of users) {
      if (u?.id) m.set(u.id, u);
    }
    return m;
  }, [users]);

  return (
    <div>
      <label className="block text-sm font-medium text-white/90 mb-2">Equipe do projeto</label>
      <p className="text-xs text-white/50 mb-2">
        Integrantes dos setores selecionados entram automaticamente. Adicione outras pessoas ou remova quem não
        participa.
      </p>

      <select
        ref={selectRef}
        disabled={disabled}
        value=""
        onChange={(e) => {
          const selectedUserId = Number(e.target.value);
          if (!selectedUserId || membrosVisiveis.includes(selectedUserId)) return;
          if (selectedUserId === value.supervisorId) return;
          onChange({
            ...value,
            responsavelIds: Array.from(new Set([...value.responsavelIds, selectedUserId])),
            excludedAutoIds: value.excludedAutoIds.filter((id) => id !== selectedUserId),
          });
          if (selectRef.current) selectRef.current.value = '';
        }}
        className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer disabled:opacity-50"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 1rem center',
          paddingRight: '2.5rem',
        }}
      >
        <option value="" className="bg-neutral text-white">
          Adicionar pessoa à equipe...
        </option>
        {users
          .filter((u) => u?.id && u.id !== value.supervisorId && !membrosVisiveis.includes(u.id))
          .map((u) => (
            <option key={u.id} value={u.id} className="bg-neutral text-white">
              {u.nome} ({cargoLabelFromUsuario(u)})
            </option>
          ))}
      </select>

      {membrosVisiveis.length === 0 ? (
        <p className="text-xs text-white/50 mt-2">Nenhum integrante além do supervisor.</p>
      ) : (
        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
          {membrosVisiveis.map((membroId) => {
            const membro = usersById.get(membroId);
            const isAuto = autoMemberIdsSet.has(membroId);
            return (
              <div
                key={membroId}
                className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-md px-3 py-2"
              >
                <span className="text-sm text-white/90 min-w-0 break-words">
                  {membro ? (
                    <>
                      {membro.nome} ({cargoLabelFromUsuario(membro)})
                      {isAuto ? (
                        <span className="text-white/45 text-xs block sm:inline sm:ml-1">— via setor</span>
                      ) : null}
                    </>
                  ) : (
                    `Usuário #${membroId}`
                  )}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const nextResponsavelIds = value.responsavelIds.filter((id) => id !== membroId);
                    const nextExcluded = isAuto
                      ? Array.from(new Set([...value.excludedAutoIds, membroId]))
                      : value.excludedAutoIds;
                    onChange({
                      ...value,
                      responsavelIds: nextResponsavelIds,
                      excludedAutoIds: nextExcluded,
                    });
                  }}
                  className="shrink-0 text-xs text-danger hover:text-danger/80 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
