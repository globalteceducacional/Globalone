import { useState, type FormEvent } from 'react';
import { api } from '../services/api';
import { btn } from '../utils/buttonStyles';
import { formatApiError, toast } from '../utils/toast';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChangePasswordModal({ open, onClose }: Props) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetAndClose() {
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setError('Todos os campos são obrigatórios');
      return;
    }

    if (novaSenha.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setError('As senhas não coincidem');
      return;
    }

    try {
      setLoading(true);
      await api.patch('/users/me/password', {
        senhaAtual,
        novaSenha,
      });
      resetAndClose();
      toast.success('Senha alterada com sucesso!');
    } catch (err: unknown) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="presentation"
      onClick={() => {
        if (!loading) resetAndClose();
      }}
    >
      <div
        className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-md w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-white/20">
          <h2 id="change-password-title" className="text-2xl font-bold text-white">
            Alterar senha
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Senha atual <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Nova senha <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              required
              minLength={6}
            />
            <p className="text-xs text-white/50 mt-1">Mínimo de 6 caracteres</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Confirmar nova senha <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">{error}</div>
          )}

          <div className="flex justify-end space-x-4 pt-4 border-t border-white/20">
            <button type="button" onClick={resetAndClose} className={btn.secondaryLg} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={btn.primaryLg} disabled={loading}>
              {loading ? 'Alterando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
