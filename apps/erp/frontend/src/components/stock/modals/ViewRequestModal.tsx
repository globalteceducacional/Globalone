import type { Cotacao, Purchase } from '../../../types/stock';
import { btn } from '../../../utils/buttonStyles';
import { calculateCotacaoTotal } from '../../../utils/stockHelpers';
import { NumericInput } from '../../ui/NumericInput';

interface ViewRequestModalProps {
  isOpen: boolean;
  purchaseToView: Purchase | null;
  isReviseApprovalModal: boolean;
  isSolicitacaoComCotacoes: boolean;
  approveWithChangesMode: boolean;
  approveCotacoes: Cotacao[];
  selectedCotacaoIndex: number;
  approveQuantity: number | null;
  reducedQuantityAction: 'COMPRAR_DEPOIS' | 'REMOVER';
  error: string | null;
  submitting: boolean;
  suppliers: Array<{ id: number; nomeFantasia: string; ativo: boolean }>;
  formasPagamento: readonly string[];
  categories: Array<{ id: number; nome: string; ativo: boolean; isAssinatura?: boolean | null }>;
  approveCategoriaId: number | '';
  onClose: () => void;
  setApproveWithChangesMode: (value: boolean) => void;
  setApproveCotacoes: React.Dispatch<React.SetStateAction<Cotacao[]>>;
  setSelectedCotacaoIndex: (value: number) => void;
  setApproveQuantity: (value: number | null) => void;
  setReducedQuantityAction: (value: 'COMPRAR_DEPOIS' | 'REMOVER') => void;
  setApproveCategoriaId: (value: number | '') => void;
  setCurrentCotacaoIndex: (value: number | null) => void;
  openSupplierModal: (index: number) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getStatusEntregaColor: (status: string) => string;
  getStatusEntregaLabel: (status: string) => string;
  getSupplierName: (fornecedorId?: number) => string;
  getCotacaoValorUnitario: (cotacao: Cotacao) => number;
  normalizeCotacaoForForm: (cot: Cotacao) => Cotacao;
  onReviseApproval: () => void;
  onApprove: () => void;
  onOpenReject: () => void;
}

export function ViewRequestModal({
  isOpen,
  purchaseToView,
  isReviseApprovalModal,
  isSolicitacaoComCotacoes,
  approveWithChangesMode,
  approveCotacoes,
  selectedCotacaoIndex,
  approveQuantity,
  reducedQuantityAction,
  error,
  submitting,
  suppliers,
  formasPagamento,
  categories,
  approveCategoriaId,
  onClose,
  setApproveWithChangesMode,
  setApproveCotacoes,
  setSelectedCotacaoIndex,
  setApproveQuantity,
  setReducedQuantityAction,
  setApproveCategoriaId,
  setCurrentCotacaoIndex,
  openSupplierModal,
  getStatusColor,
  getStatusLabel,
  getStatusEntregaColor,
  getStatusEntregaLabel,
  getSupplierName,
  getCotacaoValorUnitario,
  normalizeCotacaoForForm,
  onReviseApproval,
  onApprove,
  onOpenReject,
}: ViewRequestModalProps) {
  if (!isOpen || !purchaseToView) return null;

  const qtyCotacao = Math.max(1, (approveQuantity ?? purchaseToView.quantidade) || 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/20 bg-neutral shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/20 bg-neutral px-6 py-4">
          <h2 className="text-xl font-bold">
            {isReviseApprovalModal ? 'Editar aprovação do pedido' : 'Detalhes do pedido de compra'}
          </h2>
          <button onClick={onClose} className="text-2xl text-white/50 transition-colors hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-6">
          {isReviseApprovalModal && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">
              Altere valor, desconto, link, fornecedor ou a cotação escolhida. Ao salvar, o solicitante recebe um
              relatório do que mudou.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">Item</label>
              <p className="font-semibold text-white/90">{purchaseToView.item}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">Quantidade</label>
              <p className="text-white/90">{purchaseToView.quantidade}</p>
            </div>
            {purchaseToView.descricao && (
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-white/70">Motivo da compra</label>
                <p className="text-white/90">{purchaseToView.descricao}</p>
              </div>
            )}
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-white/70">Observação</label>
              <p className="whitespace-pre-wrap text-white/90">{(purchaseToView as any).observacao || 'Nenhuma observação'}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">Status</label>
              <span className={`rounded px-2 py-1 text-xs ${getStatusColor(purchaseToView.status)}`}>
                {getStatusLabel(purchaseToView.status)}
              </span>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">Data do pedido</label>
              <p className="text-white/90">
                {new Date((purchaseToView as any).dataSolicitacao || new Date()).toLocaleString('pt-BR')}
              </p>
            </div>
            {purchaseToView.status === 'SOLICITADO' && (
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium text-white/70">Categoria da compra</label>
                <select
                  value={approveCategoriaId}
                  onChange={(e) => setApproveCategoriaId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="" className="bg-neutral text-white">
                    Sem categoria
                  </option>
                  {categories
                    .filter((category) => category.ativo)
                    .map((category) => (
                      <option key={category.id} value={category.id} className="bg-neutral text-white">
                        {category.nome}
                        {category.isAssinatura ? ' (Assinatura)' : ''}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-white/60">
                  Selecione uma categoria marcada como assinatura para enviar este pedido para a aba Assinaturas.
                </p>
              </div>
            )}
          </div>

          {purchaseToView.status === 'COMPRADO_ACAMINHO' && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-4">
              <h3 className="mb-3 text-lg font-semibold text-blue-300">Status de Entrega</h3>
              <div className="grid grid-cols-2 gap-4">
                {purchaseToView.statusEntrega && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-white/70">Status de Entrega</label>
                    <span className={`rounded px-2 py-1 text-xs ${getStatusEntregaColor(purchaseToView.statusEntrega)}`}>
                      {getStatusEntregaLabel(purchaseToView.statusEntrega)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isReviseApprovalModal && approveWithChangesMode && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <label className="mb-1 block text-sm font-medium text-white/80">Quantidade aprovada</label>
              <NumericInput
                min={1}
                integer
                value={approveQuantity}
                onValueChange={(v) => setApproveQuantity(v)}
                className="w-full max-w-xs rounded-md border border-white/30 bg-white/10 px-3 py-2 text-white"
              />
              {approveQuantity != null && approveQuantity < purchaseToView.quantidade && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-amber-200/90">
                    Você removeu {purchaseToView.quantidade - (approveQuantity ?? 0)} unidade(s). Como deseja tratar o saldo?
                  </p>
                  <div className="flex flex-col gap-1 text-sm text-white/90">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        checked={reducedQuantityAction === 'COMPRAR_DEPOIS'}
                        onChange={() => setReducedQuantityAction('COMPRAR_DEPOIS')}
                      />
                      Criar novo pedido futuro para comprar esse saldo mais para frente
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        checked={reducedQuantityAction === 'REMOVER'}
                        onChange={() => setReducedQuantityAction('REMOVER')}
                      />
                      Apenas remover a quantidade reduzida
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isReviseApprovalModal &&
          !approveWithChangesMode &&
          purchaseToView.cotacoesJson &&
          Array.isArray(purchaseToView.cotacoesJson) &&
          purchaseToView.cotacoesJson.length > 0 ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">Cotações Existentes</label>
              <div className="space-y-2">
                {purchaseToView.cotacoesJson.map((cotacao: any, index: number) => (
                  <div key={index} className="rounded-md border border-white/10 bg-white/5 p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-white/70">Valor Unitário: </span>
                        <span className="text-white/90">
                          {cotacao.valorUnitario?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'N/A'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium text-white/70">
                          Total ({purchaseToView.quantidade} unidades):{' '}
                        </span>
                        <span className="text-lg font-semibold text-primary">
                          {calculateCotacaoTotal(
                            normalizeCotacaoForForm(cotacao),
                            purchaseToView.quantidade || 1,
                          ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">
                {isReviseApprovalModal ? 'Cotações da aprovação' : 'Adicionar Cotações para Aprovar'}
              </label>
              <p className="mb-3 text-xs text-white/60">
                {isReviseApprovalModal
                  ? 'Edite os campos abaixo e confirme para atualizar a compra pendente e notificar o solicitante.'
                  : 'Este pedido não possui cotações. Adicione pelo menos uma cotação para poder aprovar.'}
              </p>
              <div className="space-y-3">
                {approveCotacoes.map((cotacao: Cotacao, index: number) => (
                  <div key={index} className="rounded-md border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-white/90">Cotação {index + 1}</span>
                      {approveCotacoes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = approveCotacoes.filter((_, i) => i !== index);
                            setApproveCotacoes(next);
                            if (selectedCotacaoIndex >= next.length) {
                              setSelectedCotacaoIndex(next.length - 1);
                            }
                          }}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-white/70">Valor Unitário *</label>
                        <NumericInput
                          min={0}
                          step={0.01}
                          value={cotacao.valorUnitario}
                          onValueChange={(v) => {
                            const next = [...approveCotacoes];
                            next[index].valorUnitario = v ?? undefined;
                            setApproveCotacoes(next);
                          }}
                          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-white/70">Link (opcional)</label>
                        <input
                          type="text"
                          value={cotacao.link || ''}
                          onChange={(e) => {
                            const next = [...approveCotacoes];
                            next[index].link = e.target.value;
                            setApproveCotacoes(next);
                          }}
                          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="col-span-2">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="block text-xs text-white/70">Fornecedor (opcional)</label>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentCotacaoIndex(index);
                              openSupplierModal(index);
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                          >
                            <span>+</span> Adicionar Fornecedor
                          </button>
                        </div>
                        <select
                          value={cotacao.fornecedorId || ''}
                          onChange={(e) => {
                            const next = [...approveCotacoes];
                            next[index].fornecedorId = e.target.value ? Number(e.target.value) : undefined;
                            setApproveCotacoes(next);
                          }}
                          className="w-full cursor-pointer appearance-none rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="" className="bg-neutral text-white">
                            Selecione um fornecedor
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
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs text-white/70">Forma de Pagamento (opcional)</label>
                        <select
                          value={cotacao.formaPagamento || ''}
                          onChange={(e) => {
                            const next = [...approveCotacoes];
                            next[index].formaPagamento = e.target.value;
                            setApproveCotacoes(next);
                          }}
                          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
                        >
                          <option value="" className="bg-neutral text-white">
                            Selecione
                          </option>
                          {formasPagamento.map((forma) => (
                            <option key={forma} value={forma} className="bg-neutral text-white">
                              {forma}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className="text-xs text-white/70">Total: </span>
                      <span className="text-sm font-semibold text-primary">
                        {calculateCotacaoTotal(normalizeCotacaoForForm(cotacao), qtyCotacao).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setApproveCotacoes([
                      ...approveCotacoes,
                      {
                        valorUnitario: 0,
                        frete: 0,
                        impostos: 0,
                        desconto: 0,
                        descontoTipo: 'valor',
                        link: '',
                        fornecedorId: undefined,
                        formaPagamento: '',
                      },
                    ])
                  }
                  className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
                >
                  + Adicionar Outra Cotação
                </button>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-white/70">Selecionar Cotação para Aprovar</label>
                <select
                  value={selectedCotacaoIndex}
                  onChange={(e) => setSelectedCotacaoIndex(parseInt(e.target.value, 10))}
                  className="w-full rounded-md border border-white/30 bg-white/10 px-4 py-2.5 text-white"
                >
                  {approveCotacoes.map((_, index) => (
                    <option key={index} value={index} className="bg-neutral text-white">
                      Cotação {index + 1} - Total:{' '}
                      {calculateCotacaoTotal(approveCotacoes[index], qtyCotacao).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/20 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
            <button type="button" onClick={onClose} className={btn.secondaryLg}>
              Fechar
            </button>
            {isReviseApprovalModal ? (
              <button
                type="button"
                onClick={onReviseApproval}
                className="rounded-md bg-amber-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? 'Salvando...' : 'Salvar e notificar solicitante'}
              </button>
            ) : (
              <>
                {isSolicitacaoComCotacoes && !approveWithChangesMode && (
                  <button
                    type="button"
                    onClick={() => {
                      const mapped = (purchaseToView.cotacoesJson as Cotacao[]).map((c: Cotacao) =>
                        normalizeCotacaoForForm(c),
                      );
                      setApproveCotacoes(mapped);
                      setSelectedCotacaoIndex(0);
                      setApproveWithChangesMode(true);
                      setApproveQuantity(purchaseToView.quantidade || 1);
                      setReducedQuantityAction('REMOVER');
                    }}
                    className="rounded-md bg-amber-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-amber-700"
                  >
                    Aprovar com alterações
                  </button>
                )}
                <button
                  type="button"
                  onClick={onApprove}
                  className="rounded-md bg-green-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? 'Aprovando...' : 'Aprovar compra'}
                </button>
                <button
                  type="button"
                  onClick={onOpenReject}
                  className="rounded-md bg-red-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Reprovar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
