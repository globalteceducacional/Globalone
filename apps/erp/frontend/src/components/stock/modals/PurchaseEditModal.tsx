import { useState, useEffect } from 'react';
import type {
  Category,
  Cotacao,
  CreatePurchaseForm,
  PagoPorMetodoOption,
  PagoPorEntry,
  Purchase,
  Supplier,
} from '../../../types/stock';
import { btn } from '../../../utils/buttonStyles';
import { FileDropInput } from '../../FileDropInput';
import { PagoPorListEditor } from '../PagoPorListEditor';
import { NumericInput } from '../../ui/NumericInput';
import { UploadFileLink } from '../../files/UploadFileLink';
import { resolvePublicUploadUrl, type PurchaseAttachmentField } from '../../../utils/uploadFile';
import { getCotacaoValorMedioPorUnidade } from '../../../utils/stockHelpers';

interface PurchaseEditModalProps {
  isOpen: boolean;
  editingPurchase: Purchase | null;
  purchaseForm: CreatePurchaseForm;
  pendingImageFiles: File[];
  pendingNfFiles: File[];
  pendingComprovanteFiles: File[];
  /** Assinaturas: oculta frete na cotação e usa o mesmo critério de total que «Nova assinatura». */
  isAssinatura: boolean;
  /** Despesas operacionais: categoria obrigatória e filtrada. */
  isDespesa?: boolean;
  projects: Array<{ id: number; nome: string }>;
  setores: Array<{ id: number; nome: string }>;
  users: Array<{ id: number; nome: string }>;
  metodosPago: PagoPorMetodoOption[];
  suppliers: Supplier[];
  categories: Category[];
  formasPagamento: readonly string[];
  submitting: boolean;
  error: string | null;
  setPurchaseForm: React.Dispatch<React.SetStateAction<CreatePurchaseForm>>;
  loadMetodosPago: () => Promise<void>;
  handleUpdatePurchase: (e: React.FormEvent) => void;
  onAppendPurchaseImages: (files: File[]) => void;
  onAppendPurchaseNf: (files: File[]) => void;
  onAppendPurchaseComprovante: (files: File[]) => void;
  onRemovePendingImage: (index: number) => void;
  onRemovePendingNf: (index: number) => void;
  onRemovePendingComprovante: (index: number) => void;
  openCategoryModal: (opts?: { assinaturaDefault?: boolean }) => void;
  openSupplierModal: (index: number) => void;
  getSupplierName: (fornecedorId?: number) => string;
  updateCotacao: (
    form: CreatePurchaseForm,
    setForm: React.Dispatch<React.SetStateAction<CreatePurchaseForm>>,
    index: number,
    field: keyof Cotacao,
    value: string | number | undefined | 'valor' | 'porcentagem',
  ) => void;
  addCotacao: (
    form: CreatePurchaseForm,
    setForm: React.Dispatch<React.SetStateAction<CreatePurchaseForm>>,
  ) => void;
  removeCotacao: (
    form: CreatePurchaseForm,
    setForm: React.Dispatch<React.SetStateAction<CreatePurchaseForm>>,
    index: number,
  ) => void;
  getCotacaoValorUnitario: (cotacao: Cotacao) => number;
  calculateTotal: (cotacao: Cotacao, quantidade: number) => number;
  onClose: () => void;
  /** Limpa arquivo pendente de upload no pai ao remover do formulário */
  onClearPendingAttachment?: (field: PurchaseAttachmentField) => void;
  /** Na aba Assinaturas: NF/comprovante salvam no registro mensal (YYYY-MM). */
  assinaturaCompetenciaMes?: string | null;
}

export function PurchaseEditModal({
  isOpen,
  editingPurchase,
  purchaseForm,
  pendingImageFiles,
  pendingNfFiles,
  pendingComprovanteFiles,
  isAssinatura,
  isDespesa = false,
  projects,
  setores,
  users,
  metodosPago,
  suppliers,
  categories,
  formasPagamento,
  submitting,
  error,
  setPurchaseForm,
  loadMetodosPago,
  handleUpdatePurchase,
  onAppendPurchaseImages,
  onAppendPurchaseNf,
  onAppendPurchaseComprovante,
  onRemovePendingImage,
  onRemovePendingNf,
  onRemovePendingComprovante,
  openCategoryModal,
  openSupplierModal,
  getSupplierName,
  updateCotacao,
  addCotacao,
  removeCotacao,
  getCotacaoValorUnitario,
  calculateTotal,
  onClose,
  onClearPendingAttachment,
  assinaturaCompetenciaMes = null,
}: PurchaseEditModalProps) {
  const [removeConfirm, setRemoveConfirm] = useState<PurchaseAttachmentField | null>(null);

  useEffect(() => {
    if (!isOpen || !editingPurchase) setRemoveConfirm(null);
  }, [isOpen, editingPurchase]);

  if (!isOpen || !editingPurchase) return null;

  const categoriaObrigatoria = isAssinatura;
  const cotacaoGridClass = isAssinatura ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3';

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

  const removeLabels: Record<PurchaseAttachmentField, string> = {
    imagemUrl: 'todas as imagens',
    nfUrl: 'todas as notas fiscais (NF)',
    comprovantePagamentoUrl: 'todos os comprovantes de pagamento',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-2 sm:p-4">
      <div className="my-auto max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-white/20 bg-neutral shadow-2xl sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/20 bg-neutral px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-lg font-bold sm:text-xl">Editar Compra</h2>
          <button type="button" onClick={onClose} className="text-2xl text-white/50 transition-colors hover:text-white">
            ✕
          </button>
        </div>
        <form onSubmit={handleUpdatePurchase} className="space-y-3 p-4 sm:space-y-4 sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">Projeto</label>
            <select
              value={purchaseForm.projetoId || ''}
              onChange={(e) =>
                setPurchaseForm({
                  ...purchaseForm,
                  projetoId: e.target.value ? Number(e.target.value) : 0,
                })
              }
              className="w-full cursor-pointer appearance-none rounded-md border border-white/30 bg-neutral px-4 py-2.5 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
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
            <label className="mb-2 block text-sm font-medium text-white/90">Setor</label>
            <select
              value={purchaseForm.setorId ?? ''}
              onChange={(e) =>
                setPurchaseForm({
                  ...purchaseForm,
                  setorId: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-full cursor-pointer appearance-none rounded-md border border-white/30 bg-neutral px-4 py-2.5 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
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
            <label className="mb-2 block text-sm font-medium text-white/90">Vinculado a</label>
            <p className="mb-2 text-xs text-white/50">
              Usuário responsável (solicitante). Pode deixar em branco para remover o vínculo.
            </p>
            <select
              value={purchaseForm.solicitadoPorId ?? ''}
              onChange={(e) =>
                setPurchaseForm({
                  ...purchaseForm,
                  solicitadoPorId: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-full cursor-pointer appearance-none rounded-md border border-white/30 bg-neutral px-4 py-2.5 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" className="bg-neutral text-white">
                Nenhum (remover vínculo)
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id} className="bg-neutral text-white">
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">Nome do Item *</label>
            <input
              type="text"
              required
              value={purchaseForm.item}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, item: e.target.value })}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white placeholder:text-white/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">Motivo da compra</label>
            <textarea
              value={purchaseForm.descricao}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, descricao: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white placeholder:text-white/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Descreva o motivo da compra..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">Observação</label>
            <textarea
              value={purchaseForm.observacao || ''}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, observacao: e.target.value })}
              rows={3}
              maxLength={1000}
              className="w-full resize-none rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white placeholder:text-white/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Observações gerais (opcional)"
            />
          </div>

          <PagoPorListEditor
            value={(purchaseForm.pagoPor ?? []) as PagoPorEntry[]}
            onChange={(pagoPor) => setPurchaseForm({ ...purchaseForm, pagoPor })}
            users={users}
            metodos={metodosPago}
            onRefreshMetodos={loadMetodosPago}
            disabled={submitting}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">Imagens</label>
            <p className="mb-2 text-xs text-white/50">Várias imagens; novos arquivos são enviados ao salvar.</p>
            <FileDropInput
              accept="image/*"
              multiple
              onFilesSelected={(files) => {
                if (files.length > 0) onAppendPurchaseImages(files);
              }}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white file:mr-4 file:rounded-md file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/30"
              dropMessage="Solte as imagens aqui"
            />
            {(purchaseForm.imagemUrls.length > 0 || pendingImageFiles.length > 0) && (
              <div className="mt-2 space-y-2">
                {purchaseForm.imagemUrls.map((url, idx) => (
                  <div key={`eimg-${idx}-${url.slice(-24)}`} className="flex flex-wrap items-center gap-3">
                    {url.startsWith('/uploads/') || url.startsWith('http') ? (
                      <img
                        src={resolvePublicUploadUrl(url)}
                        alt="Preview"
                        className="h-20 w-20 rounded border border-white/20 object-cover"
                      />
                    ) : (
                      <span className="text-sm text-white/70">{url}</span>
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
                  <div key={`epimg-${idx}-${f.name}`} className="flex flex-wrap items-center gap-3">
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

          {assinaturaCompetenciaMes ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
              NF e comprovante abaixo referem-se à competência{' '}
              <span className="font-mono font-semibold text-amber-50">{assinaturaCompetenciaMes}</span>. Para outro mês,
              altere «Competência» na lista de assinaturas e abra editar de novo.
            </p>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">Nota Fiscal (NF)</label>
            <p className="mb-2 text-xs text-white/50">Um ou mais arquivos (imagem ou PDF).</p>
            <FileDropInput
              accept="image/*,.pdf"
              multiple
              onFilesSelected={(files) => {
                if (files.length > 0) onAppendPurchaseNf(files);
              }}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white file:mr-4 file:rounded-md file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/30"
              dropMessage="Solte as NFs aqui"
            />
            {(purchaseForm.nfUrls.length > 0 || pendingNfFiles.length > 0) && (
              <div className="mt-2 space-y-2">
                {purchaseForm.nfUrls.map((url, idx) => (
                  <div key={`enf-${idx}-${url.slice(-24)}`} className="flex flex-wrap items-center gap-3">
                    {url.startsWith('/uploads/') || url.startsWith('http') || url.startsWith('data:') ? (
                      <UploadFileLink src={url} className="text-sm text-primary hover:underline">
                        Ver NF {idx + 1}
                      </UploadFileLink>
                    ) : (
                      <span className="text-sm text-white/70">{url}</span>
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
                  <div key={`epnf-${idx}-${f.name}`} className="flex flex-wrap items-center gap-3">
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
            <label className="mb-2 block text-sm font-medium text-white/90">Comprovante de Pagamento</label>
            <p className="mb-2 text-xs text-white/50">Um ou mais arquivos (imagem ou PDF).</p>
            <FileDropInput
              accept="image/*,.pdf"
              multiple
              onFilesSelected={(files) => {
                if (files.length > 0) onAppendPurchaseComprovante(files);
              }}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white file:mr-4 file:rounded-md file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/30"
              dropMessage="Solte os comprovantes aqui"
            />
            {(purchaseForm.comprovanteUrls.length > 0 || pendingComprovanteFiles.length > 0) && (
              <div className="mt-2 space-y-2">
                {purchaseForm.comprovanteUrls.map((url, idx) => (
                  <div key={`ecp-${idx}-${url.slice(-24)}`} className="flex flex-wrap items-center gap-3">
                    {url.startsWith('/uploads/') || url.startsWith('http') || url.startsWith('data:') ? (
                      <UploadFileLink src={url} className="text-sm text-primary hover:underline">
                        Ver comprovante {idx + 1}
                      </UploadFileLink>
                    ) : (
                      <span className="text-sm text-white/70">{url}</span>
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
                  <div key={`epcp-${idx}-${f.name}`} className="flex flex-wrap items-center gap-3">
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
            <label className="mb-2 block text-sm font-medium text-white/90">
              {isAssinatura ? 'Quantidade (licenças / base de cobrança) *' : 'Quantidade *'}
            </label>
            {isAssinatura && (
              <p className="mb-2 text-xs text-white/50">
                Ex.: número de licenças ou fator que multiplica o valor. Use 1 se a cobrança for única.
              </p>
            )}
            <NumericInput
              required
              min={1}
              integer
              value={purchaseForm.quantidade}
              onValueChange={(v) => setPurchaseForm({ ...purchaseForm, quantidade: v })}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/90">
              {isAssinatura
                ? 'Data de referência (início / competência)'
                : isDespesa
                  ? 'Data da despesa'
                  : 'Data de Compra'}
            </label>
            <input
              type="date"
              value={purchaseForm.dataCompra || ''}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, dataCompra: e.target.value })}
              className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-white/90">
                {isAssinatura ? 'Categoria de assinatura *' : 'Categoria'}
              </label>
              <button
                type="button"
                onClick={() => openCategoryModal({ assinaturaDefault: isAssinatura })}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
              >
                <span>+</span> {isAssinatura ? 'Nova categoria de assinatura' : 'Nova Categoria'}
              </button>
            </div>
            <select
              required={categoriaObrigatoria}
              value={purchaseForm.categoriaId || ''}
              onChange={(e) =>
                setPurchaseForm({
                  ...purchaseForm,
                  categoriaId: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-full rounded-md border border-white/30 bg-neutral px-4 py-2.5 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" className="bg-neutral text-white">
                {isAssinatura
                  ? 'Selecione a categoria de assinatura *'
                  : 'Selecione uma categoria (opcional)'}
              </option>
              {categories
                .filter((c) => c.ativo && (!isAssinatura || Boolean(c.isAssinatura)))
                .map((cat) => (
                  <option key={cat.id} value={cat.id} className="bg-neutral text-white">
                    {cat.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{isAssinatura ? 'Mensalidade e fornecedor' : 'Cotações'}</h3>
              <button
                type="button"
                onClick={() => addCotacao(purchaseForm, setPurchaseForm)}
                className={btn.primarySoft}
              >
                {isAssinatura ? '+ Comparar outra proposta' : '+ Adicionar Cotação'}
              </button>
            </div>

            <div className="space-y-4">
              {purchaseForm.cotacoes.map((cotacao: Cotacao, index: number) => (
                <div key={index} className="rounded-lg border border-white/30 bg-white/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      {isAssinatura ? `Proposta ${index + 1}` : `Cotação ${index + 1}`}
                    </span>
                    <div className="flex items-center gap-4">
                      {purchaseForm.cotacoes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCotacao(purchaseForm, setPurchaseForm, index)}
                          className="text-sm font-medium text-danger hover:text-danger/80"
                        >
                          Remover
                        </button>
                      )}
                      <label className="flex cursor-pointer items-center space-x-2">
                        <input
                          type="radio"
                          name="selectedCotacaoEditPurchase"
                          checked={purchaseForm.selectedCotacaoIndex === index}
                          onChange={() => setPurchaseForm({ ...purchaseForm, selectedCotacaoIndex: index })}
                          className="h-4 w-4 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-white/90">
                          {isAssinatura ? 'Usar esta proposta' : 'Usar esta cotação'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className={cotacaoGridClass}>
                    <div>
                      <label className="mb-2 block text-xs font-medium text-white/90">
                        {isAssinatura ? 'Valor mensal (R$) *' : 'Valor Unitário (R$)'}
                      </label>
                      <NumericInput
                        min={0}
                        step={0.01}
                        value={cotacao.valorUnitario}
                        onValueChange={(v) =>
                          updateCotacao(purchaseForm, setPurchaseForm, index, 'valorUnitario', v ?? undefined)
                        }
                        className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    {!isAssinatura && (
                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/90">Frete (R$)</label>
                        <NumericInput
                          min={0}
                          step={0.01}
                          value={cotacao.frete}
                          onValueChange={(v) => updateCotacao(purchaseForm, setPurchaseForm, index, 'frete', v ?? undefined)}
                          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-xs font-medium text-white/90">
                        {isAssinatura ? 'Impostos / taxas no mês (R$)' : 'Impostos (R$)'}
                      </label>
                      <NumericInput
                        min={0}
                        step={0.01}
                        value={cotacao.impostos}
                        onValueChange={(v) =>
                          updateCotacao(purchaseForm, setPurchaseForm, index, 'impostos', v ?? undefined)
                        }
                        className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className={isAssinatura ? 'sm:col-span-2' : ''}>
                      <label className="mb-2 block text-xs font-medium text-white/90">
                        {isAssinatura ? 'Desconto na mensalidade' : 'Desconto'}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-white/90">
                          <input
                            type="radio"
                            name={`edit-descontoTipo-${index}`}
                            checked={(cotacao.descontoTipo || 'valor') === 'valor'}
                            onChange={() => updateCotacao(purchaseForm, setPurchaseForm, index, 'descontoTipo', 'valor')}
                            className="rounded"
                          />
                          R$
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-white/90">
                          <input
                            type="radio"
                            name={`edit-descontoTipo-${index}`}
                            checked={(cotacao.descontoTipo || 'valor') === 'porcentagem'}
                            onChange={() => updateCotacao(purchaseForm, setPurchaseForm, index, 'descontoTipo', 'porcentagem')}
                            className="rounded"
                          />
                          %
                        </label>
                        <NumericInput
                          min={0}
                          step={(cotacao.descontoTipo || 'valor') === 'porcentagem' ? 0.1 : 0.01}
                          value={cotacao.desconto}
                          onValueChange={(v) =>
                            updateCotacao(purchaseForm, setPurchaseForm, index, 'desconto', v ?? undefined)
                          }
                          className={`rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white ${isAssinatura ? 'w-28' : 'w-24'}`}
                        />
                      </div>
                    </div>

                    <div className={isAssinatura ? 'sm:col-span-2' : ''}>
                      <label className="mb-2 block text-xs font-medium text-white/90">
                        {isAssinatura ? 'Link (portal, fatura ou contrato)' : 'Link'}
                      </label>
                      <input
                        type="url"
                        value={cotacao.link || ''}
                        onChange={(e) => updateCotacao(purchaseForm, setPurchaseForm, index, 'link', e.target.value)}
                        className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                        placeholder="https://..."
                      />
                    </div>

                    <div className={isAssinatura ? 'sm:col-span-2' : 'col-span-2'}>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="block text-xs font-medium text-white/90">
                          {isAssinatura ? 'Fornecedor / prestador' : 'Fornecedor'}
                        </label>
                        <button
                          type="button"
                          onClick={() => openSupplierModal(index)}
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                        >
                          <span>+</span> Adicionar Fornecedor
                        </button>
                      </div>
                      <select
                        value={cotacao.fornecedorId || ''}
                        onChange={(e) =>
                          updateCotacao(
                            purchaseForm,
                            setPurchaseForm,
                            index,
                            'fornecedorId',
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                      >
                        <option value="" className="bg-neutral text-white">
                          Selecione um fornecedor (opcional)
                        </option>
                        {suppliers
                          .filter((s) => s.ativo)
                          .map((supplier) => (
                            <option key={supplier.id} value={supplier.id} className="bg-neutral text-white">
                              {supplier.nomeFantasia}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className={isAssinatura ? 'sm:col-span-2' : 'col-span-2'}>
                      <label className="mb-2 block text-xs font-medium text-white/90">
                        {isAssinatura ? 'Forma de pagamento' : 'Forma de Pagamento'}
                      </label>
                      <select
                        value={cotacao.formaPagamento || ''}
                        onChange={(e) =>
                          updateCotacao(purchaseForm, setPurchaseForm, index, 'formaPagamento', e.target.value)
                        }
                        className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                      >
                        <option value="" className="bg-neutral text-white">
                          Selecione (opcional)
                        </option>
                        {formasPagamento.map((forma) => (
                          <option key={forma} value={forma} className="bg-neutral text-white">
                            {forma}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3">
                    {cotacao.fornecedorId && (
                      <div className="mb-2 text-sm text-white/70">
                        Fornecedor: <span className="font-semibold text-white">{getSupplierName(cotacao.fornecedorId)}</span>
                      </div>
                    )}
                    {cotacao.formaPagamento && (
                      <div className="mb-2 text-sm text-white/70">
                        Pagamento: <span className="font-semibold text-white">{cotacao.formaPagamento}</span>
                      </div>
                    )}

                    {isAssinatura ? (
                      <>
                        <div className="text-sm text-white/70">
                          Valor líquido por mês:{' '}
                          <span className="font-semibold text-white">
                            {getCotacaoValorMedioPorUnidade(
                              cotacao,
                              Math.max(1, purchaseForm.quantidade ?? 1),
                            ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <div className="text-sm text-white/70">
                          Total no mês × quantidade ({purchaseForm.quantidade ?? '—'}):{' '}
                          <span className="font-semibold text-primary">
                            {calculateTotal(cotacao, purchaseForm.quantidade ?? 0).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-white/70">
                          Total por unidade:{' '}
                          <span className="font-semibold text-white">
                            {getCotacaoValorMedioPorUnidade(
                              cotacao,
                              Math.max(1, purchaseForm.quantidade ?? 1),
                            ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <div className="text-sm text-white/70">
                          Total ({purchaseForm.quantidade ?? '—'} unidades):{' '}
                          <span className="font-semibold text-primary">
                            {calculateTotal(cotacao, purchaseForm.quantidade ?? 0).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-danger/50 bg-danger/20 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-4 border-t border-white/20 pt-4">
            <button type="button" onClick={onClose} className={btn.secondary} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className={btn.primary}>
              {submitting ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>

      {removeConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-attach-title"
          onClick={() => setRemoveConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-white/20 bg-neutral p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="remove-attach-title" className="text-lg font-semibold text-white">
              Remover anexo?
            </h3>
            <p className="mt-2 text-sm text-white/75">
              Deseja remover {removeLabels[removeConfirm]}? A alteração só será aplicada ao salvar a compra.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={btn.secondary}
                onClick={() => setRemoveConfirm(null)}
              >
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
