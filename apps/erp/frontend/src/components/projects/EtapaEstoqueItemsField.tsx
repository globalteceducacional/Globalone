import { useMemo, useState } from 'react';
import { btn } from '../../utils/buttonStyles';
import { NumericInput } from '../ui/NumericInput';

export type EtapaEstoqueItemRow = { itemId: number; quantidade: number };

export type EstoqueItemOption = {
  id: number;
  item: string;
  descricao?: string | null;
  quantidade?: number;
  quantidadeDisponivel?: number;
  valorUnitario: number;
};

function formatBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Quantidade que ainda pode ser alocada nesta etapa para o item. */
export function quantidadeDisponivelParaEtapa(
  item: EstoqueItemOption,
  estoqueItems: EtapaEstoqueItemRow[],
  opts?: { excludeIndex?: number },
): number {
  const base = item.quantidadeDisponivel ?? item.quantidade ?? 0;
  const jaNaEtapa = estoqueItems
    .filter((ei, i) => ei.itemId === item.id && i !== opts?.excludeIndex)
    .reduce((sum, ei) => sum + ei.quantidade, 0);
  return Math.max(0, base - jaNaEtapa);
}

type Props = {
  items: EstoqueItemOption[];
  loading?: boolean;
  value: EtapaEstoqueItemRow[];
  onChange: (next: EtapaEstoqueItemRow[]) => void;
  onError?: (message: string | null) => void;
};

export function EtapaEstoqueItemsField({ items, loading, value, onChange, onError }: Props) {
  const [busca, setBusca] = useState('');
  const [pendenteId, setPendenteId] = useState<number | null>(null);
  const [qtdPendente, setQtdPendente] = useState(1);

  const itemsById = useMemo(() => {
    const m = new Map<number, EstoqueItemOption>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const idsJaSelecionados = useMemo(() => new Set(value.map((v) => v.itemId)), [value]);

  const sugestoes = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return items
      .filter((item) => {
        if (idsJaSelecionados.has(item.id)) return false;
        if (!term) return true;
        const nome = (item.item || '').toLowerCase();
        const desc = (item.descricao || '').toLowerCase();
        return nome.includes(term) || desc.includes(term);
      })
      .slice(0, 12);
  }, [items, busca, idsJaSelecionados]);

  const itemPendente = pendenteId != null ? itemsById.get(pendenteId) : undefined;

  const limparPendente = () => {
    setPendenteId(null);
    setQtdPendente(1);
  };

  const escolherItem = (itemId: number) => {
    const item = itemsById.get(itemId);
    if (!item) return;
    const disp = quantidadeDisponivelParaEtapa(item, value);
    if (disp < 1) {
      onError?.('Este item não tem quantidade disponível para alocar.');
      return;
    }
    setPendenteId(itemId);
    setQtdPendente(1);
    onError?.(null);
  };

  const confirmarAdicao = () => {
    if (!itemPendente || pendenteId == null) return;
    const disp = quantidadeDisponivelParaEtapa(itemPendente, value);
    if (qtdPendente < 1) {
      onError?.('Informe uma quantidade válida.');
      return;
    }
    if (qtdPendente > disp) {
      onError?.(`Quantidade (${qtdPendente}) excede o disponível (${disp}).`);
      return;
    }
    const idx = value.findIndex((ei) => ei.itemId === pendenteId);
    if (idx >= 0) {
      const next = [...value];
      next[idx] = { ...next[idx], quantidade: next[idx].quantidade + qtdPendente };
      onChange(next);
    } else {
      onChange([...value, { itemId: pendenteId, quantidade: qtdPendente }]);
    }
    setBusca('');
    limparPendente();
    onError?.(null);
  };

  return (
    <div className="space-y-3">
      <div>
        <input
          type="text"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            if (pendenteId != null) limparPendente();
          }}
          placeholder={loading ? 'Carregando itens...' : 'Buscar item do estoque para adicionar...'}
          disabled={loading}
          className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
        />
        {!loading && !pendenteId && busca.trim() && sugestoes.length === 0 && (
          <p className="text-xs text-white/50 mt-2">Nenhum item encontrado para esta busca.</p>
        )}
        {!loading && !pendenteId && sugestoes.length > 0 && (
          <ul className="mt-2 max-h-44 overflow-y-auto rounded-md border border-white/15 bg-neutral/95 divide-y divide-white/10">
            {sugestoes.map((item) => {
              const disp = quantidadeDisponivelParaEtapa(item, value);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disp < 1}
                    onClick={() => escolherItem(item.id)}
                    className="w-full text-left px-3 py-2.5 text-sm text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="font-medium block truncate">{item.item}</span>
                    <span className="text-xs text-white/50">
                      Disponível: {disp} · {formatBrl(item.valorUnitario)} / un.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !busca.trim() && !pendenteId && items.length > 0 && value.length === 0 && (
          <p className="text-xs text-white/50 mt-2">Digite o nome do item para buscar e adicionar à etapa.</p>
        )}
        {!loading && items.length === 0 && (
          <p className="text-xs text-white/50 mt-2">Nenhum item de estoque vinculado a este projeto.</p>
        )}
      </div>

      {itemPendente && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end bg-white/5 border border-white/15 rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/90 truncate">{itemPendente.item}</p>
            <p className="text-xs text-white/50 mt-0.5">
              Disponível: {quantidadeDisponivelParaEtapa(itemPendente, value)} ·{' '}
              {formatBrl(itemPendente.valorUnitario)} / un.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 shrink-0">
            <div className="w-24">
              <label className="block text-xs text-white/60 mb-1">Qtd.</label>
              <NumericInput
                integer
                min={1}
                max={quantidadeDisponivelParaEtapa(itemPendente, value)}
                value={qtdPendente}
                onValueChange={(v) => setQtdPendente(v == null ? 1 : Math.max(1, v))}
                className="w-full bg-neutral/80 border border-white/20 rounded-md px-2 py-1.5 text-sm text-white"
              />
            </div>
            <button type="button" onClick={confirmarAdicao} className={btn.primarySm}>
              Adicionar
            </button>
            <button type="button" onClick={limparPendente} className={btn.secondary}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {value.length > 0 ? (
        <div className="space-y-2">
          {value.map((row, index) => {
            const item = itemsById.get(row.itemId);
            if (!item) return null;
            const maxQtd = quantidadeDisponivelParaEtapa(item, value, { excludeIndex: index }) + row.quantidade;
            return (
              <div
                key={`${row.itemId}-${index}`}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white/5 border border-white/10 rounded-md px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white/90 truncate">{item.item}</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    {formatBrl(item.valorUnitario)} / un. · Total:{' '}
                    {formatBrl(item.valorUnitario * row.quantidade)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-xs text-white/60">Qtd.</label>
                  <NumericInput
                    integer
                    min={1}
                    max={maxQtd}
                    value={row.quantidade}
                    onValueChange={(v) => {
                      const qtd = v == null ? 1 : Math.min(maxQtd, Math.max(1, v));
                      const next = [...value];
                      next[index] = { ...next[index], quantidade: qtd };
                      onChange(next);
                      onError?.(null);
                    }}
                    className="w-20 bg-neutral/80 border border-white/20 rounded-md px-2 py-1 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    className="text-xs text-danger hover:text-danger/80 font-medium px-2 py-1"
                  >
                    Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !itemPendente && (
          <p className="text-xs text-white/50 border border-dashed border-white/15 rounded-md px-3 py-4 text-center">
            Nenhum item de estoque nesta etapa.
          </p>
        )
      )}
    </div>
  );
}
