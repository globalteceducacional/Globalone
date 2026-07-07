import { FormEvent, useEffect, useState } from 'react';
import { BaseModal } from './BaseModal';
import { api } from '../../../services/api';
import { toast, formatApiError } from '../../../utils/toast';
import type { Category, CategoryForm } from '../../../types/stock';
import { INITIAL_CATEGORY_FORM } from '../../../constants/stock';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (category: Category) => void;
  /** Ao abrir, já marca o fluxo de categoria de assinatura (mensal, sem estoque). */
  defaultIsAssinatura?: boolean;
}

export function CategoryModal({
  isOpen,
  onClose,
  onCategoryCreated,
  defaultIsAssinatura = false,
}: CategoryModalProps) {
  const [form, setForm] = useState<CategoryForm>({ ...INITIAL_CATEGORY_FORM });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      ...INITIAL_CATEGORY_FORM,
      ...(defaultIsAssinatura ? { isAssinatura: true } : {}),
    });
    setError(null);
  }, [isOpen, defaultIsAssinatura]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nome.trim()) {
      setError('Nome da categoria é obrigatório');
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        nome: form.nome.trim(),
        tipo: 'ITEM',
      };

      if (form.descricao && form.descricao.trim()) {
        payload.descricao = form.descricao.trim();
      }

      if (form.isAssinatura) {
        payload.isAssinatura = true;
      }

      const { data: newCategory } = await api.post<Category>('/categories', payload);

      toast.success('Categoria criada com sucesso!');
      onCategoryCreated(newCategory);
      handleClose();
    } catch (err: unknown) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setForm({ ...INITIAL_CATEGORY_FORM });
    setError(null);
    onClose();
  }

  const modalTitle = form.isAssinatura ? 'Nova categoria de assinatura' : 'Nova Categoria';

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title={modalTitle} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/90 mb-2">
            Nome da Categoria *
          </label>
          <input
            type="text"
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Ex.: Passagens, TI, Maquiagem..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/90 mb-2">Descrição</label>
          <textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Digite uma descrição (opcional)"
            rows={3}
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer rounded-md border border-white/15 bg-white/5 p-3">
          <input
            type="checkbox"
            checked={Boolean(form.isAssinatura)}
            onChange={(e) => setForm({ ...form, isAssinatura: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
          />
          <span>
            <span className="block text-sm font-medium text-white/90">Categoria de assinatura mensal</span>
            <span className="block text-xs text-white/55 mt-1">
              Marque só para recorrência mensal (software, aluguel). Compras e despesas podem usar qualquer categoria.
            </span>
          </span>
        </label>

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
            {loading ? 'Criando...' : 'Criar Categoria'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
