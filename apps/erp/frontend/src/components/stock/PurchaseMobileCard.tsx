import type { Purchase } from '../../types/stock';
import { btn } from '../../utils/buttonStyles';
import { getAssinaturaCompraStatusColor, getAssinaturaCompraStatusLabel } from '../../utils/stockHelpers';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';
import { firstDisplayableImageUrl } from '../../utils/attachmentUrls';

interface PurchaseMobileCardProps {
  purchase: Purchase;
  isSelected: boolean;
  listItemNameMaxLen: number;
  listItemDescMaxLen: number;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getStatusEntregaColor: (statusEntrega: string) => string;
  getStatusEntregaLabel: (statusEntrega: string) => string;
  getCategoryName: (categoryId?: number) => string;
  truncateDisplayText: (value: string, maxLen: number) => string;
  calculateCotacaoTotal: (cotacao: Record<string, unknown>, quantidade: number) => number;
  toggleSelection: (purchaseId: number) => void;
  onOpenDetails: (purchase: Purchase) => void;
  onOpenStatus: (purchase: Purchase) => void;
  onOpenEdit: (purchase: Purchase) => void;
  onOpenDelete: (purchase: Purchase) => void;
  onRemoveSingleTag: (purchaseId: number, tagName: string) => Promise<void>;
  isSignaturePurchase: (purchase: Purchase) => boolean;
  signatureAlertsByPurchaseId: Record<number, { mesReferencia: string; precisaConfirmacao: boolean }>;
  selectedSignatureMonth: string;
  showEntregaColumn?: boolean;
}

export function PurchaseMobileCard({
  purchase,
  isSelected,
  listItemNameMaxLen,
  listItemDescMaxLen,
  getStatusColor,
  getStatusLabel,
  getStatusEntregaColor,
  getStatusEntregaLabel,
  getCategoryName,
  truncateDisplayText,
  calculateCotacaoTotal,
  toggleSelection,
  onOpenDetails,
  onOpenStatus,
  onOpenEdit,
  onOpenDelete,
  onRemoveSingleTag,
  isSignaturePurchase,
  signatureAlertsByPurchaseId,
  selectedSignatureMonth,
  showEntregaColumn = true,
}: PurchaseMobileCardProps) {
  const cotacoes =
    purchase.cotacoesJson && Array.isArray(purchase.cotacoesJson) ? purchase.cotacoesJson : [];
  const melhorCotacao =
    cotacoes.length > 0
      ? cotacoes.reduce((best, c) => {
          const totalC = calculateCotacaoTotal(
            { ...c, descontoTipo: c.descontoTipo || 'valor' } as Record<string, unknown>,
            purchase.quantidade || 1,
          );
          const totalBest = calculateCotacaoTotal(
            { ...best, descontoTipo: best.descontoTipo || 'valor' } as Record<string, unknown>,
            purchase.quantidade || 1,
          );
          return totalC < totalBest ? c : best;
        })
      : null;
  const valorMelhor =
    melhorCotacao != null
      ? calculateCotacaoTotal(
          {
            ...melhorCotacao,
            descontoTipo: melhorCotacao.descontoTipo || 'valor',
          } as Record<string, unknown>,
          purchase.quantidade || 1,
        )
      : null;
  const tags = Array.isArray(purchase.tagsJson) ? purchase.tagsJson : [];
  const signatureAlert = signatureAlertsByPurchaseId[purchase.id];

  return (
    <div
      className="bg-neutral/60 border border-white/10 rounded-xl p-4 space-y-3 cursor-pointer active:bg-white/5"
      onClick={() => onOpenDetails(purchase)}
    >
      <div className="flex items-start gap-3">
        <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
            checked={isSelected}
            onChange={() => toggleSelection(purchase.id)}
            aria-label={`Selecionar compra ${purchase.item || purchase.id}`}
          />
        </div>
        {(() => {
          const thumb = firstDisplayableImageUrl(purchase.imagemUrl);
          if (!thumb) return null;
          const src = thumb.startsWith('/uploads/') ? resolvePublicUploadUrl(thumb) : thumb;
          return (
            <img
              src={src}
              alt={purchase.item || 'Item'}
              className="w-12 h-12 object-cover rounded-lg shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          );
        })()}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white line-clamp-2 break-words" title={purchase.item || 'Sem nome'}>
            {truncateDisplayText(purchase.item || 'Sem nome', listItemNameMaxLen)}
          </p>
          {purchase.descricao && (
            <p className="text-xs text-white/60 line-clamp-2 break-words mt-0.5" title={purchase.descricao}>
              {truncateDisplayText(purchase.descricao, listItemDescMaxLen)}
            </p>
          )}
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag, idx) => (
                <span
                  key={`${tag?.nome || 'tag'}-${idx}`}
                  className="text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1"
                  style={{
                    backgroundColor: `${tag?.cor || '#3B82F6'}33`,
                    borderColor: `${tag?.cor || '#3B82F6'}66`,
                    color: tag?.cor || '#93C5FD',
                  }}
                >
                  {tag?.nome || 'Tag'}
                  <button
                    type="button"
                    className="text-sm font-bold leading-none text-white opacity-90 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRemoveSingleTag(purchase.id, String(tag?.nome || ''));
                    }}
                    title="Remover tag"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
            isSignaturePurchase(purchase)
              ? getAssinaturaCompraStatusColor(purchase.status)
              : getStatusColor(purchase.status)
          }`}
        >
          {isSignaturePurchase(purchase)
            ? getAssinaturaCompraStatusLabel(purchase.status)
            : getStatusLabel(purchase.status)}
        </span>
      </div>

      {purchase.status === 'COMPRADO_ACAMINHO' && purchase.statusEntrega && !isSignaturePurchase(purchase) && (
        <span
          className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${getStatusEntregaColor(
            purchase.statusEntrega,
          )}`}
        >
          {getStatusEntregaLabel(purchase.statusEntrega)}
        </span>
      )}

      {isSignaturePurchase(purchase) && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1">
          <span className="text-xs text-white/80">
            {signatureAlert?.precisaConfirmacao
              ? `Doc. pendente: ${signatureAlert?.mesReferencia || selectedSignatureMonth}`
              : `Doc. ok: ${signatureAlert?.mesReferencia || selectedSignatureMonth}`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-lg p-3">
        <div className="text-center">
          <p className="text-xs text-white/50 mb-0.5">Qtd</p>
          <p className="text-sm font-bold text-white">{purchase.quantidade || 0}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-white/50 mb-0.5">Cotação</p>
          <p className="text-xs font-semibold text-primary">
            {valorMelhor != null
              ? valorMelhor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : '-'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-white/50 mb-0.5">Categoria</p>
          <p className="text-xs text-white/80 truncate">{getCategoryName(purchase.categoriaId ?? undefined)}</p>
        </div>
      </div>

      {(purchase.solicitadoPor?.nome || (showEntregaColumn && purchase.dataEntrega)) && (
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>{purchase.solicitadoPor?.nome ? `Por: ${purchase.solicitadoPor.nome}` : ''}</span>
          {showEntregaColumn && purchase.dataEntrega && (
            <span>📅 {new Date(purchase.dataEntrega).toLocaleDateString('pt-BR')}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onOpenStatus(purchase)} className={btn.successSm}>
          Status
        </button>
        <button onClick={() => onOpenEdit(purchase)} className={btn.editSm}>
          Editar
        </button>
        <button onClick={() => onOpenDelete(purchase)} className={btn.dangerSm}>
          Remover
        </button>
      </div>
    </div>
  );
}
