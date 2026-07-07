import { ReactNode } from 'react';
import { btn } from '../../utils/buttonStyles';
import { AppModal } from './AppModal';
import { namesMatchForDeleteConfirm } from '../../utils/deleteNameConfirm';

interface ConfirmDeleteByNameModalProps {
  open: boolean;
  title?: string;
  entityLabel: string;
  entityName: string;
  confirmValue: string;
  onConfirmValueChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  confirmButtonLabel?: string;
  dangerNote?: string;
  extraContent?: ReactNode;
}

export function ConfirmDeleteByNameModal({
  open,
  title = 'Confirmar Exclusão',
  entityLabel,
  entityName,
  confirmValue,
  onConfirmValueChange,
  onClose,
  onConfirm,
  loading = false,
  errorMessage,
  confirmButtonLabel = 'Excluir',
  dangerNote = 'Esta ação não pode ser desfeita.',
  extraContent,
}: ConfirmDeleteByNameModalProps) {
  const canConfirm = namesMatchForDeleteConfirm(confirmValue, entityName);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      stickyHeader={false}
      bodyClassName="p-6 space-y-4"
    >
      <p className="text-white/90">
        Tem certeza que deseja excluir {entityLabel}:{' '}
        <span className="font-semibold">"{entityName}"</span>
      </p>
      <p className="text-sm text-white/70">
        {dangerNote} Para confirmar, digite o mesmo nome acima (acentos, maiúsculas/minúsculas e
        quantidade de espaços podem diferir).
      </p>

      <input
        id="confirm-delete-by-name-input"
        name="confirmDeleteEntityName"
        type="text"
        value={confirmValue}
        onChange={(e) => onConfirmValueChange(e.target.value)}
        placeholder={entityName}
        className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        autoFocus
        autoComplete="off"
      />

      {extraContent}

      {errorMessage && (
        <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">
          {errorMessage}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className={btn.secondaryLg} disabled={loading}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={btn.dangerLg}
          disabled={loading || !canConfirm}
        >
          {loading ? 'Excluindo...' : confirmButtonLabel}
        </button>
      </div>
    </AppModal>
  );
}

