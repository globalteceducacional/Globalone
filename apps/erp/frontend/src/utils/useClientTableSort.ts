import { useCallback, useState } from 'react';

/**
 * Ordenação client-side por coluna (clique no cabeçalho), usada com `renderSortableTableTh`.
 */
export function useClientTableSort<S extends string>(initialColumn: S, initialDir: 'asc' | 'desc' = 'asc') {
  const [sortColumn, setSortColumn] = useState<S>(initialColumn);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialDir);

  const handleSort = useCallback(
    (column: string) => {
      const c = column as S;
      if (sortColumn === c) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(c);
        setSortDirection('asc');
      }
    },
    [sortColumn],
  );

  return { sortColumn, sortDirection, handleSort };
}
