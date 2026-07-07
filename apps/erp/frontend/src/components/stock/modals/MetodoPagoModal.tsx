import { FormEvent, useEffect, useState } from 'react';
import { BaseModal } from './BaseModal';
import { api } from '../../../services/api';
import { toast, formatApiError } from '../../../utils/toast';
import type { PagoPorMetodoOption } from '../../../types/stock';

interface MetodoPagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chamado após criar no servidor; pode ser async — o modal aguarda antes de fechar. */
  onMetodoCreated: (metodo: PagoPorMetodoOption) => void | Promise<void>;
}

export function MetodoPagoModal({ isOpen, onClose, onMetodoCreated }: MetodoPagoModalProps) {
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNome('');
      setError(null);
    }
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = nome.trim();
    if (!trimmed) {
      setError('Nome do método é obrigatório');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<PagoPorMetodoOption>('/stock/pago-por-metodos', { nome: trimmed });
      toast.success('Método cadastrado com sucesso!');
      await Promise.resolve(onMetodoCreated(data));
      handleClose();
    } catch (err: unknown) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setNome('');
    setError(null);
    onClose();
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Novo método de pagamento"
      maxWidth="max-w-lg"
      overlayZClass="z-[100]"
    >
      <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/90 mb-2">Nome *</label>
          <input
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={200}
            className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Ex.: cartão de emergência, PIX empresa"
          />
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-4 border-t border-white/20">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors text-sm sm:text-base"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-md bg-primary hover:bg-primary/80 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {loading ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
