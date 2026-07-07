import { useMemo } from 'react';

export function useTextFilter<T>(
  items: T[],
  term: string,
  pickHaystack: (item: T) => Array<string | null | undefined>,
): T[] {
  return useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return items;

    return items.filter((item) => {
      const parts = pickHaystack(item)
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.toLowerCase());

      return parts.some((p) => p.includes(t));
    });
  }, [items, term, pickHaystack]);
}

