import type { ReactNode } from 'react';

interface CollapsibleFiltersProps {
  title?: string;
  badgeText?: string;
  show: boolean;
  setShow: (show: boolean) => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  children: ReactNode;
}

export function CollapsibleFilters({
  title = 'Filtros de Busca',
  badgeText = 'Ativo',
  show,
  setShow,
  hasActiveFilters = false,
  onClear,
  children,
}: CollapsibleFiltersProps) {
  return (
    <div className="mb-4 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 text-white/70 transition-transform ${show ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-white/90">{title}</span>
        </div>
        {hasActiveFilters && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-primary/20 text-primary">
            {badgeText}
          </span>
        )}
      </button>

      {show && (
        <div className="p-4 border-t border-white/10">
          {children}
          {onClear && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClear}
                className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm text-white/90 transition-colors"
              >
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

