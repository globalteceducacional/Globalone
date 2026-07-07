import type { Purchase } from '../../../types/stock';

interface DeletePurchaseModalProps {
  isOpen: boolean;
  purchaseToDelete: Purchase | null;
  error: string | null;
  deletingPurchase: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeletePurchaseModal({
  isOpen,
  purchaseToDelete,
  error,
  deletingPurchase,
  onClose,
  onConfirm,
}: DeletePurchaseModalProps) {
  if (!isOpen || !purchaseToDelete) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-neutral border border-white/20 rounded-lg sm:rounded-xl shadow-2xl max-w-md w-full my-auto">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/20">
          <h2 className="text-lg sm:text-xl font-bold text-white">Confirmar Exclusão</h2>
        </div>
        <div className="p-4 sm:p-6">
          <p className="text-white/90 mb-2 text-sm sm:text-base">Tem certeza que deseja remover a compra:</p>
          <p className="text-lg sm:text-xl font-semibold text-white mb-4 break-words">"{purchaseToDelete.item}"</p>
          <p className="text-xs sm:text-sm text-white/70 mb-4">Esta ação não pode ser desfeita.</p>
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 sm:px-4 py-2 sm:py-3 rounded-md mb-3 text-xs sm:text-sm">
              {error}
            </div>
          )}
          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 sm:space-x-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors text-sm sm:text-base"
              disabled={deletingPurchase}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              disabled={deletingPurchase}
            >
              {deletingPurchase ? 'Removendo...' : 'Confirmar Remoção'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
