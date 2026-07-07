import { btn } from '../../../utils/buttonStyles';

interface BulkDeletePurchaseModalProps {
  isOpen: boolean;
  count: number;
  activeTab: 'estoque' | 'compras' | 'solicitacoes';
  confirmPhrase: string;
  confirmInput: string;
  error: string | null;
  deleting: boolean;
  isConfirmValid: boolean;
  onChangeConfirmInput: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function BulkDeletePurchaseModal({
  isOpen,
  count,
  activeTab,
  confirmPhrase,
  confirmInput,
  error,
  deleting,
  isConfirmValid,
  onChangeConfirmInput,
  onClose,
  onConfirm,
}: BulkDeletePurchaseModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full">
        <div className="px-8 py-6 border-b border-white/20">
          <h2 className="text-2xl font-bold text-white">Apagar todos esses itens?</h2>
        </div>
        <div className="p-8">
          <p className="text-white/90 mb-2">
            Você está prestes a remover <strong className="text-white">{count}</strong>{' '}
            {count === 1 ? 'compra' : 'compras'} de uma só vez
            {activeTab === 'solicitacoes' ? ' (solicitações)' : ''}.
          </p>
          <p className="text-sm text-white/70 mb-4">
            Esta ação não pode ser desfeita. Confirme se deseja apagar todos esses itens.
          </p>
          <div className="mb-6">
            <label htmlFor="bulk-delete-purchase-confirm" className="block text-sm font-medium text-white/90 mb-2">
              Digite <span className="font-mono text-primary font-semibold">{confirmPhrase}</span> para confirmar:
            </label>
            <input
              id="bulk-delete-purchase-confirm"
              type="text"
              value={confirmInput}
              onChange={(e) => onChangeConfirmInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={confirmPhrase}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-md mb-4 text-sm">
              {error}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className={btn.secondaryLg} disabled={deleting}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={btn.dangerLg}
              disabled={deleting || !isConfirmValid}
            >
              {deleting ? 'Apagando...' : 'Sim, apagar todos esses itens'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
