import type { ReactElement, ReactNode } from 'react';

/** Função que devolve um `th` ordenável (ex.: `const h = (col, label) => renderSortableTableTh({ ... })`). */
export type SortableTableHeaderCellFn = (columnKey: string, label: string) => ReactNode;

/** Classes base do cabeçalho th clicável (planilhas / DataTable com ordenação por coluna). */
export const SORTABLE_TH_BASE_CLASS =
  'px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors select-none whitespace-normal break-words';

/** Ícones de ordenação (caret) — viewBox comum. */
export const SORTABLE_CARET_VIEWBOX = '0 0 20 20';

/** Paths dos carets (seta para cima / para baixo). */
export const SORTABLE_CARET_PATH = {
  up: 'M5 12l5-5 5 5H5z',
  down: 'M5 8l5 5 5-5H5z',
} as const;

export const SORTABLE_ICON_ACTIVE_CLASS = 'w-3 h-3 text-primary';
export const SORTABLE_ICON_INACTIVE_CLASS = 'w-2.5 h-2.5 text-white/30';

export interface RenderSortableTableThParams {
  columnKey: string;
  label: string;
  /** Coluna atualmente ordenada (null = nenhuma). */
  activeColumn: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  align?: 'left' | 'right';
  /** `key` do React no th (padrão: columnKey). */
  thKey?: string;
}

/**
 * Cabeçalho de tabela ordenável (mesmo padrão visual em Compras, Curadoria, etc.).
 * Use em `renderTh` do DataTable ou ao montar thead manualmente (ex.: PurchaseDesktopTable).
 */
export function renderSortableTableTh({
  columnKey,
  label,
  activeColumn,
  sortDirection,
  onSort,
  align = 'left',
  thKey = columnKey,
}: RenderSortableTableThParams): ReactElement {
  const isSorted = activeColumn === columnKey;
  const textAlign = align === 'right' ? 'text-right' : 'text-left';
  const justify = align === 'right' ? 'justify-end' : '';

  return (
    <th key={thKey} className={`${SORTABLE_TH_BASE_CLASS} ${textAlign}`} onClick={() => onSort(columnKey)}>
      <div className={`flex items-center gap-1.5 ${justify}`}>
        <span>{label}</span>
        <div className="flex flex-col items-center justify-center shrink-0">
          {isSorted ? (
            sortDirection === 'asc' ? (
              <svg className={SORTABLE_ICON_ACTIVE_CLASS} fill="currentColor" viewBox={SORTABLE_CARET_VIEWBOX}>
                <path d={SORTABLE_CARET_PATH.up} />
              </svg>
            ) : (
              <svg className={SORTABLE_ICON_ACTIVE_CLASS} fill="currentColor" viewBox={SORTABLE_CARET_VIEWBOX}>
                <path d={SORTABLE_CARET_PATH.down} />
              </svg>
            )
          ) : (
            <div className="flex flex-col -space-y-0.5">
              <svg className={SORTABLE_ICON_INACTIVE_CLASS} fill="currentColor" viewBox={SORTABLE_CARET_VIEWBOX}>
                <path d={SORTABLE_CARET_PATH.up} />
              </svg>
              <svg className={SORTABLE_ICON_INACTIVE_CLASS} fill="currentColor" viewBox={SORTABLE_CARET_VIEWBOX}>
                <path d={SORTABLE_CARET_PATH.down} />
              </svg>
            </div>
          )}
        </div>
      </div>
    </th>
  );
}
