import type { ReactNode } from 'react';

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
  stickyHeader?: boolean;
  showHeader?: boolean;
  bodyClassName?: string;
  panelClassName?: string;
  overlayClassName?: string;
}

const sizeClassMap: Record<NonNullable<AppModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

export function AppModal({
  open,
  onClose,
  title,
  children,
  size = 'lg',
  showCloseButton = true,
  stickyHeader = true,
  showHeader = true,
  bodyClassName = 'p-6',
  panelClassName = '',
  overlayClassName = '',
}: AppModalProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 ${overlayClassName}`}
      style={{ colorScheme: 'dark' }}
    >
      <div
        className={`bg-neutral border border-white/20 rounded-xl shadow-2xl w-full min-w-0 max-h-[90vh] overflow-y-auto ${sizeClassMap[size]} ${panelClassName}`}
      >
        {showHeader && (
          <div
            className={`bg-neutral border-b border-white/10 px-6 py-4 flex items-center justify-between ${stickyHeader ? 'sticky top-0' : ''}`}
          >
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="text-white/50 hover:text-white transition-colors"
                aria-label="Fechar modal"
              >
                ✕
              </button>
            )}
          </div>
        )}

        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}

