import { BaseModal } from './BaseModal';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  itemName?: string;
  isDeleting?: boolean;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar Exclusão',
  message,
  itemName,
  isDeleting = false,
}: ConfirmDeleteModalProps) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="p-4 sm:p-8 space-y-4">
        <p className="text-white/80 text-sm sm:text-base">
          {message}
          {itemName && (
            <span className="font-semibold text-white"> "{itemName}"</span>
          )}
          ?
        </p>
        <p className="text-red-400 text-xs sm:text-sm">
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-4 border-t border-white/20">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors text-sm sm:text-base"
            disabled={isDeleting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {isDeleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
