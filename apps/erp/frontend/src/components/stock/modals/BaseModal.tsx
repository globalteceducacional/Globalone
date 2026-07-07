import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
  /** Para modais sobre outros modais (ex.: novo método dentro de Nova compra). */
  overlayZClass?: string;
}

export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
  showCloseButton = true,
  overlayZClass = 'z-50',
}: BaseModalProps) {
  if (!isOpen) return null;

  // Portal evita <form> dentro de <form> (ex.: novo método em Nova Compra), que quebra o HTML e
  // faz Enter/submit acionar o formulário pai e “reiniciar” a página ou o modal.
  return createPortal(
    <div
      className={`fixed inset-0 bg-black/70 flex items-center justify-center p-2 sm:p-4 overflow-y-auto ${overlayZClass}`}
    >
      <div
        className={`bg-neutral border border-white/20 rounded-xl shadow-2xl ${maxWidth} w-full max-h-[90vh] overflow-y-auto`}
      >
        <div className="sticky top-0 bg-neutral border-b border-white/20 px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between z-10">
          <h2 className="text-lg sm:text-2xl font-bold">{title}</h2>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors text-xl sm:text-2xl"
            >
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
