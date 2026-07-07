import type { Purchase } from '../../../types/stock';
import { btn } from '../../../utils/buttonStyles';

interface RejectRequestModalProps {
  isOpen: boolean;
  purchaseToReject: Purchase | null;
  rejectReason: string;
  error: string | null;
  submitting: boolean;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function RejectRequestModal({
  isOpen,
  purchaseToReject,
  rejectReason,
  error,
  submitting,
  onChangeReason,
  onClose,
  onConfirm,
}: RejectRequestModalProps) {
  if (!isOpen || !purchaseToReject) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/20 bg-neutral shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/20 bg-neutral px-6 py-4">
          <h2 className="text-xl font-bold">Reprovar pedido de compra</h2>
          <button onClick={onClose} className="text-2xl text-white/50 transition-colors hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-6">
          <p className="mb-4 text-white/90">
            Item: <span className="font-semibold">{purchaseToReject.item}</span>
          </p>
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-white/90">Motivo da Rejeição *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => onChangeReason(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white placeholder:text-white/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Descreva o motivo da rejeição..."
              required
            />
          </div>
          {error && (
            <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/20 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <div className="flex justify-end space-x-4">
            <button type="button" onClick={onClose} className={btn.secondaryLg} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={btn.dangerLg}
              disabled={submitting || !rejectReason.trim()}
            >
              {submitting ? 'Reprovando...' : 'Confirmar Reprovação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
