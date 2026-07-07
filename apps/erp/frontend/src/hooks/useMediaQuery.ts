import { useState, useEffect } from 'react';

/**
 * Retorna true quando a mídia corresponde à query (ex: min-width: 768px).
 * Útil para layout responsivo (sidebar drawer no mobile, etc).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/** True a partir do breakpoint md (768px) */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
