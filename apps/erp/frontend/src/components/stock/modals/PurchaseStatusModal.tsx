import type { Purchase } from '../../../types/stock';

interface StatusEntregaOption {
  value: string;
  label: string;
}

interface PurchaseStatusModalProps {
  isOpen: boolean;
  purchaseToUpdateStatus: Purchase | null;
  newStatus: string;
  newStatusEntrega: string;
  newPrevisaoEntrega: string;
  newDataEntrega: string;
  newEnderecoEntrega: string;
  newRecebidoPor: string;
  newObservacao: string;
  error: string | null;
  submitting: boolean;
  statusEntregaOptions: readonly StatusEntregaOption[];
  setNewStatus: (value: string) => void;
  setNewStatusEntrega: (value: string) => void;
  setNewPrevisaoEntrega: (value: string) => void;
  setNewDataEntrega: (value: string) => void;
  setNewEnderecoEntrega: (value: string) => void;
  setNewRecebidoPor: (value: string) => void;
  setNewObservacao: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function PurchaseStatusModal({
  isOpen,
  purchaseToUpdateStatus,
  newStatus,
  newStatusEntrega,
  newPrevisaoEntrega,
  newDataEntrega,
  newEnderecoEntrega,
  newRecebidoPor,
  newObservacao,
  error,
  submitting,
  statusEntregaOptions,
  setNewStatus,
  setNewStatusEntrega,
  setNewPrevisaoEntrega,
  setNewDataEntrega,
  setNewEnderecoEntrega,
  setNewRecebidoPor,
  setNewObservacao,
  onClose,
  onConfirm,
}: PurchaseStatusModalProps) {
  if (!isOpen || !purchaseToUpdateStatus) return null;

  const isAssinatura = Boolean(purchaseToUpdateStatus.categoria?.isAssinatura);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-2">
      <div className="my-auto max-h-[98vh] w-full max-w-sm overflow-y-auto rounded-lg border border-white/20 bg-neutral shadow-2xl sm:max-w-md">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/20 bg-neutral px-3 py-2.5 sm:px-4">
          <h2 className="text-base font-bold text-white sm:text-lg">Alterar Status</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-lg text-white/50 transition-colors hover:text-white sm:text-xl"
          >
            ✕
          </button>
        </div>
        <div className="p-3 sm:p-4">
          <p className="mb-2.5 text-xs text-white/90 sm:text-sm">
            Item: <span className="break-words font-semibold">{purchaseToUpdateStatus.item}</span>
          </p>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-white/90">Novo Status *</label>
            <select
              value={newStatus}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setNewStatus(nextStatus);

                if (isAssinatura) {
                  setNewStatusEntrega('');
                  setNewPrevisaoEntrega('');
                  setNewDataEntrega('');
                  setNewEnderecoEntrega('');
                  setNewRecebidoPor('');
                  return;
                }

                if (nextStatus === 'COMPRADO_ACAMINHO') {
                  setNewStatusEntrega(purchaseToUpdateStatus.statusEntrega || 'NAO_ENTREGUE');
                  setNewPrevisaoEntrega(
                    purchaseToUpdateStatus.previsaoEntrega
                      ? new Date(purchaseToUpdateStatus.previsaoEntrega).toISOString().split('T')[0]
                      : '',
                  );
                  setNewDataEntrega('');
                  setNewEnderecoEntrega('');
                  setNewRecebidoPor('');
                } else if (nextStatus === 'ENTREGUE') {
                  setNewStatusEntrega('');
                  setNewPrevisaoEntrega('');
                  setNewDataEntrega(
                    purchaseToUpdateStatus.dataEntrega
                      ? new Date(purchaseToUpdateStatus.dataEntrega).toISOString().split('T')[0]
                      : '',
                  );
                  setNewEnderecoEntrega(purchaseToUpdateStatus.enderecoEntrega || '');
                  setNewRecebidoPor(purchaseToUpdateStatus.recebidoPor || '');
                } else {
                  setNewStatusEntrega('');
                  setNewPrevisaoEntrega('');
                  setNewDataEntrega('');
                  setNewEnderecoEntrega('');
                  setNewRecebidoPor('');
                }
              }}
              className="w-full cursor-pointer appearance-none rounded-md border border-white/30 bg-neutral px-3 py-2 pr-8 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23ffffff\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
              }}
            >
              {isAssinatura ? (
                <>
                  <option value="PENDENTE" className="bg-neutral text-white">
                    Pendente
                  </option>
                  <option value="ENTREGUE" className="bg-neutral text-white">
                    Pago
                  </option>
                </>
              ) : (
                <>
                  <option value="PENDENTE" className="bg-neutral text-white">
                    Pendente
                  </option>
                  <option value="COMPRADO_ACAMINHO" className="bg-neutral text-white">
                    Comprado/A Caminho
                  </option>
                  <option value="ENTREGUE" className="bg-neutral text-white">
                    Entregue
                  </option>
                </>
              )}
            </select>
          </div>

          {!isAssinatura && newStatus === 'COMPRADO_ACAMINHO' && (
            <div className="mb-3 space-y-2.5 rounded-md border border-blue-500/30 bg-blue-500/10 p-2.5 sm:p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-blue-300">Status de Entrega</h4>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/90">Status de Entrega</label>
                <select
                  value={newStatusEntrega}
                  onChange={(e) => setNewStatusEntrega(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-md border border-white/30 bg-neutral px-3 py-2 pr-8 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{
                    backgroundImage:
                      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23ffffff\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                  }}
                >
                  {statusEntregaOptions
                    .filter((option) => option.value !== 'ENTREGUE')
                    .map((option) => (
                      <option key={option.value} value={option.value} className="bg-neutral text-white">
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/90">Previsão de Entrega</label>
                <input
                  type="date"
                  value={newPrevisaoEntrega}
                  onChange={(e) => setNewPrevisaoEntrega(e.target.value)}
                  className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {!isAssinatura && newStatus === 'ENTREGUE' && (
            <div className="mb-3 space-y-2.5 rounded-md border border-green-500/30 bg-green-500/10 p-2.5 sm:p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-green-300">Informações de Entrega</h4>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/90">Data da Entrega</label>
                <input
                  type="date"
                  value={newDataEntrega}
                  onChange={(e) => setNewDataEntrega(e.target.value)}
                  className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/90">Endereço de Entrega</label>
                <input
                  type="text"
                  value={newEnderecoEntrega}
                  onChange={(e) => setNewEnderecoEntrega(e.target.value)}
                  className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Endereço onde foi entregue"
                  maxLength={500}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/90">Recebido por</label>
                <input
                  type="text"
                  value={newRecebidoPor}
                  onChange={(e) => setNewRecebidoPor(e.target.value)}
                  className="w-full rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Nome de quem recebeu"
                  maxLength={100}
                />
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-white/90">Observação</label>
            <textarea
              value={newObservacao}
              onChange={(e) => setNewObservacao(e.target.value)}
              className="w-full resize-none rounded-md border border-white/30 bg-neutral px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Observações gerais..."
              rows={2}
              maxLength={1000}
            />
          </div>

          {error && (
            <div className="mb-2.5 rounded-md border border-red-500/50 bg-red-500/20 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 sm:w-auto"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              disabled={submitting || !newStatus}
            >
              {submitting ? 'Atualizando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
