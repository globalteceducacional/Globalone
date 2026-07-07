export type SectionTabItem = {
  id: string;
  label: string;
  /** Rótulo curto abaixo de `lg`; se omitido, usa `label`. */
  shortLabel?: string;
};

interface AppSectionTabsProps {
  tabs: SectionTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export function AppSectionTabs({ tabs, activeId, onChange, ariaLabel = 'Abas' }: AppSectionTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div
        className="flex w-full border-b border-white/10 overflow-x-auto lg:overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => {
          const ativo = activeId === tab.id;
          const curto = tab.shortLabel ?? tab.label;
          const usaRotuloCurto = curto !== tab.label;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => onChange(tab.id)}
              className={`shrink-0 lg:flex-1 lg:min-w-0 whitespace-nowrap px-4 lg:px-3 xl:px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px min-h-[44px] text-center ${
                ativo
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              {usaRotuloCurto ? (
                <>
                  <span className="lg:hidden">{curto}</span>
                  <span className="hidden lg:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
