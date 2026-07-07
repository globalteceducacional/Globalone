import type { Cotacao, Purchase } from '../../../types/stock';
import { btn } from '../../../utils/buttonStyles';
import { calculateCotacaoTotal, normalizeCotacaoForForm } from '../../../utils/stockHelpers';
import { resolvePublicUploadUrl } from '../../../utils/uploadFile';
import { FilePreviewTrigger } from '../../files/FilePreviewTrigger';
import { AttachmentList } from '../../files/AttachmentList';
import { parseAttachmentUrls, firstDisplayableImageUrl } from '../../../utils/attachmentUrls';

interface PurchaseDetailsModalProps {
  isOpen: boolean;
  purchase: Purchase | null;
  onClose: () => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getStatusEntregaColor: (statusEntrega: string) => string;
  getStatusEntregaLabel: (statusEntrega: string) => string;
  getCategoryName: (categoriaId?: number) => string;
  getSupplierName: (fornecedorId?: number) => string;
  getCotacaoValorUnitario: (cotacao: Cotacao) => number;
  pagoPorResumo: string;
}

export function PurchaseDetailsModal({
  isOpen,
  purchase,
  onClose,
  getStatusColor,
  getStatusLabel,
  getStatusEntregaColor,
  getStatusEntregaLabel,
  getCategoryName,
  getSupplierName,
  getCotacaoValorUnitario,
  pagoPorResumo,
}: PurchaseDetailsModalProps) {
  if (!isOpen || !purchase) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-white/20 bg-neutral shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/20 bg-neutral px-6 py-4">
          <h2 className="text-xl font-bold">Detalhes da Compra</h2>
          <button onClick={onClose} className="text-2xl text-white/50 transition-colors hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-6 p-6">
          {(() => {
            const thumb = firstDisplayableImageUrl(purchase.imagemUrl);
            return thumb ? (
              <div className="flex justify-center">
                <FilePreviewTrigger
                  src={thumb}
                  name={purchase.item || 'Item'}
                  variant="thumbnail"
                  className="inline-block max-h-64 max-w-full"
                >
                  <img
                    src={resolvePublicUploadUrl(thumb)}
                    alt={purchase.item || 'Item'}
                    className="max-h-64 max-w-full rounded-lg border border-white/10 object-contain cursor-pointer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </FilePreviewTrigger>
              </div>
            ) : null;
          })()}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Item</label>
              <p className="font-semibold text-white/90">{purchase.item || '—'}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Quantidade</label>
              <p className="font-semibold text-white/90">{purchase.quantidade || 0}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Status</label>
              <span className={`rounded px-2 py-1 text-xs ${getStatusColor(purchase.status)}`}>
                {getStatusLabel(purchase.status)}
              </span>
            </div>
            {purchase.statusEntrega && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Status de Entrega</label>
                <span className={`rounded px-2 py-1 text-xs ${getStatusEntregaColor(purchase.statusEntrega)}`}>
                  {getStatusEntregaLabel(purchase.statusEntrega)}
                </span>
              </div>
            )}
            {purchase.solicitadoPor && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Solicitado Por</label>
                <p className="font-semibold text-white/90">{purchase.solicitadoPor.nome}</p>
              </div>
            )}
            {(purchase as any).projeto && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Projeto</label>
                <p className="font-semibold text-white/90">{(purchase as any).projeto.nome}</p>
              </div>
            )}
            {(purchase as any).categoriaId && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Categoria</label>
                <p className="font-semibold text-white/90">{getCategoryName((purchase as any).categoriaId)}</p>
              </div>
            )}
            {purchase.dataSolicitacao && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Data do pedido</label>
                <p className="font-semibold text-white/90">
                  {new Date(purchase.dataSolicitacao).toLocaleString('pt-BR')}
                </p>
              </div>
            )}
            {purchase.dataCompra && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Data de Compra</label>
                <p className="font-semibold text-white/90">{new Date(purchase.dataCompra).toLocaleString('pt-BR')}</p>
              </div>
            )}
          </div>

          {purchase.descricao && (
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Descrição / Motivo</label>
              <p className="whitespace-pre-wrap text-white/90">{purchase.descricao}</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-white/60">Observação</label>
            <p className="whitespace-pre-wrap text-white/90">{purchase.observacao || 'Nenhuma observação'}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white/60">Pago por</label>
            <p className="whitespace-pre-wrap text-white/90">{pagoPorResumo || 'Não informado'}</p>
          </div>

          {purchase.cotacoesJson && Array.isArray(purchase.cotacoesJson) && purchase.cotacoesJson.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/60">Cotações</label>
              <div className="space-y-2">
                {purchase.cotacoesJson.map((cotacao: Cotacao, index: number) => {
                  const vu = getCotacaoValorUnitario(cotacao);
                  const fr = cotacao.frete ?? 0;
                  const imp = cotacao.impostos ?? 0;
                  const totalComQuantidade = calculateCotacaoTotal(
                    normalizeCotacaoForForm(cotacao),
                    purchase.quantidade || 1,
                  );
                  return (
                    <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/90">Cotação {index + 1}</span>
                        <span className="text-sm font-bold text-primary">
                          {totalComQuantidade.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                        <div>Valor Unitário: {vu.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <div>Frete: {fr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <div>Impostos: {imp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        {cotacao.formaPagamento && <div>Forma de Pagamento: {cotacao.formaPagamento}</div>}
                        {cotacao.fornecedorId ? (
                          <div>Fornecedor: {getSupplierName(cotacao.fornecedorId)}</div>
                        ) : cotacao.fornecedor ? (
                          <div>Fornecedor: {cotacao.fornecedor}</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AttachmentList
            raw={[
              ...parseAttachmentUrls(purchase.nfUrl),
              ...parseAttachmentUrls(purchase.comprovantePagamentoUrl),
            ]}
            title="Documentos"
            variant="grid"
            className="mt-0"
          />

          <div className="flex justify-end border-t border-white/10 pt-4">
            <button onClick={onClose} className={btn.secondaryLg}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
