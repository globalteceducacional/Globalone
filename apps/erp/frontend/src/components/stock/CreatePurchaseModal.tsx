import { useState, useEffect, type FormEvent } from 'react';
import { FileDropInput } from '../FileDropInput';
import { PagoPorListEditor } from './PagoPorListEditor';
import { btn } from '../../utils/buttonStyles';
import type {
  Category,
  CreatePurchaseForm,
  PagoPorMetodoOption,
  PurchaseLineItem,
  PurchaseModalMode,
  Supplier,
} from '../../types/stock';
import { PurchaseRequestFields } from './PurchaseRequestFields';
import { createEmptyPurchaseLineItem } from '../../utils/purchaseRequest';
import type { PurchaseAttachmentField } from '../../utils/uploadFile';
import { UploadFileLink } from '../files/UploadFileLink';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';

interface CreatePurchaseModalProps {
  isOpen: boolean;
  purchaseModalMode: PurchaseModalMode;
  purchaseForm: CreatePurchaseForm;
  lineItems: PurchaseLineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<PurchaseLineItem[]>>;
  pendingImageFiles: File[];
  pendingNfFiles: File[];
  pendingComprovanteFiles: File[];
  projects: Array<{ id: number; nome: string }>;
  setores: Array<{ id: number; nome: string }>;
  users: Array<{ id: number; nome: string }>;
  metodosPago: PagoPorMetodoOption[];
  suppliers: Supplier[];
  categories: Category[];
  signaturePurchaseCategories: Category[];
  formasPagamento: readonly string[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  setPurchaseForm: React.Dispatch<React.SetStateAction<CreatePurchaseForm>>;
  onRefreshMetodos: () => Promise<void>;
  onOpenCategoryModal: (opts?: { assinaturaDefault?: boolean }) => void;
  onOpenSupplierModal: (lineIndex: number, cotacaoIndex: number) => void;
  onAppendPurchaseImages: (files: File[]) => void;
  onAppendPurchaseNf: (files: File[]) => void;
  onAppendPurchaseComprovante: (files: File[]) => void;
  onRemovePendingImage: (index: number) => void;
  onRemovePendingNf: (index: number) => void;
  onRemovePendingComprovante: (index: number) => void;
  onClearPendingAttachment?: (field: PurchaseAttachmentField) => void;
}

export function CreatePurchaseModal({
  isOpen,
  purchaseModalMode,
  purchaseForm,
  lineItems,
  setLineItems,
  pendingImageFiles,
  pendingNfFiles,
  pendingComprovanteFiles,
  projects,
  setores,
  users,
  metodosPago,
  suppliers,
  categories,
  signaturePurchaseCategories,
  formasPagamento,
  submitting,
  error,
  onClose,
  onSubmit,
  setPurchaseForm,
  onRefreshMetodos,
  onOpenCategoryModal,
  onOpenSupplierModal,
  onAppendPurchaseImages,
  onAppendPurchaseNf,
  onAppendPurchaseComprovante,
  onRemovePendingImage,
  onRemovePendingNf,
  onRemovePendingComprovante,
  onClearPendingAttachment,
}: CreatePurchaseModalProps) {
  function updateLineItem(index: number, next: PurchaseLineItem) {
    setLineItems((prev) => prev.map((row, i) => (i === index ? next : row)));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, createEmptyPurchaseLineItem()]);
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }
  const [removeConfirm, setRemoveConfirm] = useState<PurchaseAttachmentField | null>(null);

  useEffect(() => {
    if (!isOpen) setRemoveConfirm(null);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const isAssinaturaMode = purchaseModalMode === 'assinatura';
  const isDespesaMode = purchaseModalMode === 'despesa';
  const categoriaObrigatoria = isAssinaturaMode;
  const categoriasModal = isAssinaturaMode
    ? signaturePurchaseCategories
    : categories.filter((c) => c.ativo);

  const removeLabels: Record<PurchaseAttachmentField, string> = {
    imagemUrl: 'todas as imagens',
    nfUrl: 'todas as notas fiscais (NF)',
    comprovantePagamentoUrl: 'todos os comprovantes de pagamento',
  };

  function confirmRemoveAttachment() {
    if (!removeConfirm) return;
    onClearPendingAttachment?.(removeConfirm);
    if (removeConfirm === 'imagemUrl') {
      setPurchaseForm({ ...purchaseForm, imagemUrls: [] });
    } else if (removeConfirm === 'nfUrl') {
      setPurchaseForm({ ...purchaseForm, nfUrls: [] });
    } else {
      setPurchaseForm({ ...purchaseForm, comprovanteUrls: [] });
    }
    setRemoveConfirm(null);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-neutral border border-white/20 rounded-lg sm:rounded-xl shadow-2xl max-w-4xl w-full my-auto max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral border-b border-white/20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <h2 className="text-lg sm:text-xl font-bold">
            {isAssinaturaMode ? 'Nova assinatura' : isDespesaMode ? 'Nova despesa' : 'Nova compra (estoque)'}
          </h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white transition-colors text-xl sm:text-2xl">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Projeto</label>
            <select
              value={purchaseForm.projetoId || ''}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, projetoId: e.target.value ? Number(e.target.value) : 0 })
              }
              className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center',
                paddingRight: '2.5rem',
              }}
            >
              <option value="" className="bg-neutral text-white">
                Sem projeto (opcional)
              </option>
              {projects.map((projeto) => (
                <option key={projeto.id} value={projeto.id} className="bg-neutral text-white">
                  {projeto.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Setor</label>
            <select
              value={purchaseForm.setorId ?? ''}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, setorId: e.target.value ? Number(e.target.value) : undefined })
              }
              className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center',
                paddingRight: '2.5rem',
              }}
            >
              <option value="" className="bg-neutral text-white">
                Sem setor (opcional)
              </option>
              {setores.map((setor) => (
                <option key={setor.id} value={setor.id} className="bg-neutral text-white">
                  {setor.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Vinculado a</label>
            <p className="text-xs text-white/50 mb-2">
              Usuário responsável (aparece como solicitante). Se não escolher, fica quem está criando a compra.
            </p>
            <select
              value={purchaseForm.solicitadoPorId ?? ''}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, solicitadoPorId: e.target.value ? Number(e.target.value) : undefined })
              }
              className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center',
                paddingRight: '2.5rem',
              }}
            >
              <option value="" className="bg-neutral text-white">
                Usuário logado (padrão)
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id} className="bg-neutral text-white">
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Observação geral</label>
            <textarea
              value={purchaseForm.observacao || ''}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, observacao: e.target.value })}
              rows={3}
              maxLength={1000}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              placeholder="Observações gerais (opcional)"
            />
          </div>

          <PagoPorListEditor
            value={purchaseForm.pagoPor ?? []}
            onChange={(pagoPor) => setPurchaseForm({ ...purchaseForm, pagoPor })}
            users={users}
            metodos={metodosPago}
            onRefreshMetodos={onRefreshMetodos}
            disabled={submitting}
          />

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Imagens</label>
            <p className="text-xs text-white/50 mb-2">Você pode anexar várias imagens (uma por vez ou várias no seletor).</p>
            <FileDropInput
              accept="image/*"
              multiple
              onFilesSelected={(files) => {
                if (files.length > 0) onAppendPurchaseImages(files);
              }}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
              dropMessage="Solte as imagens aqui"
            />
            {(purchaseForm.imagemUrls.length > 0 || pendingImageFiles.length > 0) && (
              <div className="mt-2 space-y-2">
                {purchaseForm.imagemUrls.map((url, idx) => (
                  <div key={`img-${idx}-${url.slice(-24)}`} className="flex flex-wrap items-center gap-3">
                    {url.startsWith('/uploads/') || url.startsWith('http') ? (
                      <img
                        src={resolvePublicUploadUrl(url)}
                        alt=""
                        className="h-16 w-16 rounded border border-white/20 object-cover"
                      />
                    ) : (
                      <span className="text-sm text-white/70 truncate max-w-[12rem]">{url}</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPurchaseForm((prev) => ({
                          ...prev,
                          imagemUrls: prev.imagemUrls.filter((_, i) => i !== idx),
                        }))
                      }
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {pendingImageFiles.map((f, idx) => (
                  <div key={`pimg-${idx}-${f.name}`} className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-white/70">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemovePendingImage(idx)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setRemoveConfirm('imagemUrl')} className="text-xs text-white/50 hover:text-white/80">
                  Limpar todas as imagens
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Nota Fiscal (NF)</label>
            <p className="text-xs text-white/50 mb-2">Um ou mais arquivos (imagem ou PDF).</p>
            <FileDropInput
              accept="image/*,.pdf"
              multiple
              onFilesSelected={(files) => {
                if (files.length > 0) onAppendPurchaseNf(files);
              }}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
              dropMessage="Solte as NFs aqui"
            />
            {(purchaseForm.nfUrls.length > 0 || pendingNfFiles.length > 0) && (
              <div className="mt-2 space-y-2">
                {purchaseForm.nfUrls.map((url, idx) => (
                  <div key={`nf-${idx}-${url.slice(-24)}`} className="flex flex-wrap items-center gap-3">
                    {url.startsWith('/uploads/') || url.startsWith('http') || url.startsWith('data:') ? (
                      <UploadFileLink src={url} className="text-sm text-primary hover:underline">
                        Abrir NF {idx + 1}
                      </UploadFileLink>
                    ) : (
                      <span className="text-sm text-white/70 truncate max-w-[14rem]">{url}</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPurchaseForm((prev) => ({
                          ...prev,
                          nfUrls: prev.nfUrls.filter((_, i) => i !== idx),
                        }))
                      }
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {pendingNfFiles.map((f, idx) => (
                  <div key={`pnf-${idx}-${f.name}`} className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-white/70">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemovePendingNf(idx)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setRemoveConfirm('nfUrl')} className="text-xs text-white/50 hover:text-white/80">
                  Limpar todas as NFs
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">Comprovante de Pagamento</label>
            <p className="text-xs text-white/50 mb-2">Um ou mais arquivos (imagem ou PDF).</p>
            <FileDropInput
              accept="image/*,.pdf"
              multiple
              onFilesSelected={(files) => {
                if (files.length > 0) onAppendPurchaseComprovante(files);
              }}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
              dropMessage="Solte os comprovantes aqui"
            />
            {(purchaseForm.comprovanteUrls.length > 0 || pendingComprovanteFiles.length > 0) && (
              <div className="mt-2 space-y-2">
                {purchaseForm.comprovanteUrls.map((url, idx) => (
                  <div key={`cp-${idx}-${url.slice(-24)}`} className="flex flex-wrap items-center gap-3">
                    {url.startsWith('/uploads/') || url.startsWith('http') || url.startsWith('data:') ? (
                      <UploadFileLink src={url} className="text-sm text-primary hover:underline">
                        Abrir comprovante {idx + 1}
                      </UploadFileLink>
                    ) : (
                      <span className="text-sm text-white/70 truncate max-w-[14rem]">{url}</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPurchaseForm((prev) => ({
                          ...prev,
                          comprovanteUrls: prev.comprovanteUrls.filter((_, i) => i !== idx),
                        }))
                      }
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {pendingComprovanteFiles.map((f, idx) => (
                  <div key={`pcp-${idx}-${f.name}`} className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-white/70">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemovePendingComprovante(idx)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRemoveConfirm('comprovantePagamentoUrl')}
                  className="text-xs text-white/50 hover:text-white/80"
                >
                  Limpar todos os comprovantes
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              {isAssinaturaMode
                ? 'Data de referência (início / competência)'
                : isDespesaMode
                  ? 'Data da despesa'
                  : 'Data de Compra'}
            </label>
            <input
              type="date"
              value={purchaseForm.dataCompra || ''}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, dataCompra: e.target.value })}
              className="w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-white/90">
                {isAssinaturaMode ? 'Categoria de assinatura *' : 'Categoria'}
              </label>
              <button
                type="button"
                onClick={() => onOpenCategoryModal({ assinaturaDefault: isAssinaturaMode })}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
              >
                <span>+</span>{' '}
                {isAssinaturaMode ? 'Nova categoria de assinatura' : 'Nova Categoria'}
              </button>
            </div>
            {isAssinaturaMode && signaturePurchaseCategories.length === 0 && (
              <p className="text-xs text-amber-200/90 mb-2">
                Nenhuma categoria de assinatura cadastrada. Clique em "Nova categoria de assinatura" para criar uma antes de salvar.
              </p>
            )}
            {isDespesaMode ? (
              <p className="text-xs text-white/50 mb-2">
                Use qualquer categoria já cadastrada (a mesma de compras ou assinaturas). O registro ficará na aba Despesas.
              </p>
            ) : null}
            <select
              required={categoriaObrigatoria}
              value={purchaseForm.categoriaId || ''}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, categoriaId: e.target.value ? Number(e.target.value) : undefined })
              }
              className="w-full bg-neutral border border-white/30 rounded-md px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center',
                paddingRight: '2.5rem',
              }}
            >
              <option value="" className="bg-neutral text-white">
                {isAssinaturaMode
                  ? 'Selecione a categoria de assinatura *'
                  : 'Selecione uma categoria (opcional)'}
              </option>
              {categoriasModal.map((cat) => (
                <option key={cat.id} value={cat.id} className="bg-neutral text-white">
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">
                {isAssinaturaMode
                  ? 'Itens da assinatura'
                  : isDespesaMode
                    ? 'Itens da despesa'
                    : 'Itens da solicitação'}
              </h3>
              <p className="text-xs text-white/50 w-full sm:w-auto">
                Vários produtos na mesma solicitação — use &quot;Adicionar outro item&quot; ao lado de cada cotação.
              </p>
            </div>
            {lineItems.map((line, lineIdx) => (
              <div
                key={lineIdx}
                className="rounded-lg border border-white/20 bg-white/5 p-4 sm:p-5"
              >
                <PurchaseRequestFields
                  value={line}
                  onChange={(next) => updateLineItem(lineIdx, next)}
                  suppliers={suppliers}
                  showObservacao
                  hideFrete={isAssinaturaMode}
                  quoteOptionalText={
                    isAssinaturaMode ? '(propostas mensais)' : '(opcional na solicitação)'
                  }
                  lineIndex={lineIdx + 1}
                  lineCount={lineItems.length}
                  onAddLineItem={lineIdx === lineItems.length - 1 ? addLineItem : undefined}
                  onRemoveLineItem={
                    lineItems.length > 1 ? () => removeLineItem(lineIdx) : undefined
                  }
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-danger/20 border border-danger/50 text-danger px-4 py-3 rounded-md text-sm">{error}</div>
          )}

          <div className="flex justify-end space-x-4 pt-4 border-t border-white/20">
            <button type="button" onClick={onClose} className={btn.secondary}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className={btn.primary}>
              {submitting
                ? 'Salvando...'
                : isAssinaturaMode
                  ? lineItems.length > 1
                    ? `Registrar ${lineItems.length} assinaturas`
                    : 'Registrar assinatura'
                  : isDespesaMode
                    ? lineItems.length > 1
                      ? `Registrar ${lineItems.length} despesas`
                      : 'Registrar despesa'
                    : lineItems.length > 1
                      ? `Criar ${lineItems.length} compras`
                      : 'Criar compra'}
            </button>
          </div>
        </form>
      </div>

      {removeConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-remove-attach-title"
          onClick={() => setRemoveConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-white/20 bg-neutral p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="create-remove-attach-title" className="text-lg font-semibold text-white">
              Remover anexo?
            </h3>
            <p className="mt-2 text-sm text-white/75">
              Deseja remover {removeLabels[removeConfirm]}? Os arquivos ainda não enviados não serão incluídos na compra.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => setRemoveConfirm(null)}>
                Cancelar
              </button>
              <button type="button" className={btn.danger} onClick={confirmRemoveAttachment}>
                Sim, remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
