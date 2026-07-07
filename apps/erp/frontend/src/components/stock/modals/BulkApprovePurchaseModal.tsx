import { btn } from '../../../utils/buttonStyles';

export interface BulkApproveSkippedItem {
  id: number;
  item: string;
  reason: string;
}

interface BulkApprovePurchaseModalProps {
  isOpen: boolean;
  eligibleCount: number;
  skipped: BulkApproveSkippedItem[];
  error: string | null;
  approving: boolean;
  progressLabel?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function BulkApprovePurchaseModal({
  isOpen,
  eligibleCount,
  skipped,
  error,
  approving,
  progressLabel,
  onClose,
  onConfirm,
}: BulkApprovePurchaseModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-8 py-6 border-b border-white/20">
          <h2 className="text-2xl font-bold text-white">Aprovar solicitações selecionadas</h2>
        </div>
        <div className="p-8 space-y-4">
          <p className="text-white/90">
            Serão aprovadas <strong className="text-white">{eligibleCount}</strong>{' '}
            {eligibleCount === 1 ? 'solicitação' : 'solicitações'} usando as cotações já informadas no
            pedido (quantidade integral, sem alterações).
          </p>
          {skipped.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-medium mb-2">
                {skipped.length} {skipped.length === 1 ? 'item será ignorado' : 'itens serão ignorados'}{' '}
                (sem cotação válida para aprovação em massa):
              </p>
              <ul className="space-y-1 text-xs text-amber-100/90 max-h-40 overflow-y-auto">
                {skipped.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.item || `#${s.id}`}</span>
                    <span className="text-amber-200/70"> — {s.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-200/80">
                Abra o detalhe desses pedidos para adicionar cotações e aprovar individualmente.
              </p>
            </div>
          ) : null}
          {progressLabel ? (
            <p className="text-sm text-white/70">{progressLabel}</p>
          ) : null}
          {error ? (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={btn.secondaryLg} disabled={approving}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-green-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={approving || eligibleCount === 0}
            >
              {approving
                ? 'Aprovando...'
                : eligibleCount === 0
                  ? 'Nenhuma elegível'
                  : `Aprovar ${eligibleCount} ${eligibleCount === 1 ? 'solicitação' : 'solicitações'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
