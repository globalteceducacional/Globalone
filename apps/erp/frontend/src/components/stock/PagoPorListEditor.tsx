import { useRef, useState } from 'react';
import { btn } from '../../utils/buttonStyles';
import type { PagoPorEntry, PagoPorMetodoOption } from '../../types/stock';
import { createEmptyPagoPorEntry } from '../../utils/pagoPor';
import { MetodoPagoModal } from './modals/MetodoPagoModal';

export interface PagoPorUserOption {
  id: number;
  nome: string;
}

interface PagoPorListEditorProps {
  value: PagoPorEntry[];
  onChange: (next: PagoPorEntry[]) => void;
  users: PagoPorUserOption[];
  metodos: PagoPorMetodoOption[];
  onRefreshMetodos: () => Promise<void>;
  disabled?: boolean;
}

export function PagoPorListEditor({
  value,
  onChange,
  users,
  metodos,
  onRefreshMetodos,
  disabled,
}: PagoPorListEditorProps) {
  const [metodoModalOpen, setMetodoModalOpen] = useState(false);
  const metodoModalRowRef = useRef<number | null>(null);

  const updateAt = (index: number, patch: Partial<PagoPorEntry>) => {
    const next = [...value];
    const cur = next[index];
    if (!cur) return;
    next[index] = { ...cur, ...patch } as PagoPorEntry;
    onChange(next);
  };

  const setTipo = (index: number, tipo: PagoPorEntry['tipo']) => {
    const next = [...value];
    if (tipo === 'usuario') {
      next[index] = { tipo: 'usuario', usuarioId: users[0]?.id ?? 0, nome: users[0]?.nome ?? '' };
    } else if (tipo === 'pessoa') {
      next[index] = { tipo: 'pessoa', nome: '' };
    } else {
      const m = metodos[0];
      next[index] = m
        ? { tipo: 'metodo', metodoId: m.id, descricao: m.nome }
        : { tipo: 'metodo', metodoId: 0, descricao: '' };
    }
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...value, createEmptyPagoPorEntry()]);
  };

  function openMetodoModalForRow(index: number) {
    metodoModalRowRef.current = index;
    setMetodoModalOpen(true);
  }

  function closeMetodoModal() {
    setMetodoModalOpen(false);
    metodoModalRowRef.current = null;
  }

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <MetodoPagoModal
        isOpen={metodoModalOpen}
        onClose={closeMetodoModal}
        onMetodoCreated={async (m) => {
          await onRefreshMetodos();
          const idx = metodoModalRowRef.current;
          if (idx !== null) {
            updateAt(idx, { metodoId: m.id, descricao: m.nome });
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white/90">Pago por</h4>
        <button type="button" onClick={addRow} disabled={disabled} className={btn.primarySoft}>
          + Adicionar
        </button>
      </div>
      <p className="text-xs text-white/50">
        Usuários do sistema, pessoas externas ou métodos cadastrados (pode criar novos no pop-up).
      </p>

      {value.length === 0 ? (
        <p className="text-sm text-white/40 italic">Nenhum registro. Use &quot;Adicionar&quot; se necessário.</p>
      ) : (
        <ul className="space-y-3">
          {value.map((entry, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <label className="text-xs text-white/70 sm:min-w-[140px]">
                Tipo
                <select
                  value={entry.tipo}
                  disabled={disabled}
                  onChange={(e) => setTipo(index, e.target.value as PagoPorEntry['tipo'])}
                  className="mt-1 w-full rounded-md border border-white/30 bg-white/10 px-2 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="usuario" className="bg-neutral text-white">
                    Usuário do sistema
                  </option>
                  <option value="pessoa" className="bg-neutral text-white">
                    Pessoa (nome livre)
                  </option>
                  <option value="metodo" className="bg-neutral text-white">
                    Método de pagamento
                  </option>
                </select>
              </label>

              {entry.tipo === 'usuario' && (
                <label className="min-w-0 flex-1 text-xs text-white/70">
                  Usuário
                  <select
                    value={entry.usuarioId || ''}
                    disabled={disabled}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const u = users.find((x) => x.id === id);
                      updateAt(index, { usuarioId: id, nome: u?.nome ?? '' });
                    }}
                    className="mt-1 w-full rounded-md border border-white/30 bg-white/10 px-2 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="" className="bg-neutral text-white">
                      Selecione…
                    </option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id} className="bg-neutral text-white">
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {entry.tipo === 'pessoa' && (
                <label className="min-w-0 flex-1 text-xs text-white/70">
                  Nome
                  <input
                    type="text"
                    value={entry.nome}
                    disabled={disabled}
                    maxLength={200}
                    onChange={(e) => updateAt(index, { nome: e.target.value })}
                    className="mt-1 w-full rounded-md border border-white/30 bg-white/10 px-2 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Nome da pessoa"
                  />
                </label>
              )}

              {entry.tipo === 'metodo' && (
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="block min-w-0 flex-1 text-xs text-white/70">
                      Método
                      <select
                        value={entry.metodoId || ''}
                        disabled={disabled}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const m = metodos.find((x) => x.id === id);
                          updateAt(index, { metodoId: id, descricao: m?.nome ?? '' });
                        }}
                        className="mt-1 w-full rounded-md border border-white/30 bg-white/10 px-2 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="" className="bg-neutral text-white">
                          Selecione…
                        </option>
                        {metodos.map((m) => (
                          <option key={m.id} value={m.id} className="bg-neutral text-white">
                            {m.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => openMetodoModalForRow(index)}
                      className={`${btn.primarySoft} shrink-0 text-xs py-2 whitespace-nowrap`}
                    >
                      <span className="mr-1">+</span> Novo método
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                className="text-xs text-danger hover:text-danger/80 sm:shrink-0"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
