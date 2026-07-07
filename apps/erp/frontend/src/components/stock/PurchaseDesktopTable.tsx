import type { Cotacao, Purchase } from '../../types/stock';
import { btn } from '../../utils/buttonStyles';
import type { SortableTableHeaderCellFn } from '../../utils/sortableTableHeader';
import {
  calculateCotacaoTotal,
  getAssinaturaCompraStatusColor,
  getAssinaturaCompraStatusLabel,
  truncateDisplayText as truncateCellText,
} from '../../utils/stockHelpers';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';
import { firstDisplayableImageUrl } from '../../utils/attachmentUrls';

const TABLE_CATEGORY_MAX = 22;
const TABLE_SOLICITANTE_MAX = 20;
const TABLE_TAG_NAME_MAX = 14;

interface PurchaseDesktopTableProps {
  finalSortedPurchases: Purchase[];
  paginatedPurchases: Purchase[];
  selectedPurchases: number[];
  toggleAllPurchases: () => void;
  togglePurchaseSelection: (purchaseId: number) => void;
  renderSortableHeader: SortableTableHeaderCellFn;
  getCategoryName: (categoryId?: number) => string;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getStatusEntregaColor: (statusEntrega: string) => string;
  getStatusEntregaLabel: (statusEntrega: string) => string;
  isSignaturePurchase: (purchase: Purchase) => boolean;
  signatureAlertsByPurchaseId: Record<number, { mesReferencia: string; precisaConfirmacao: boolean }>;
  selectedSignatureMonth: string;
  onOpenDetails: (purchase: Purchase) => void;
  onOpenStatus: (purchase: Purchase) => void;
  onOpenEdit: (purchase: Purchase) => void;
  onOpenDelete: (purchase: Purchase) => void;
  onRemoveSingleTag: (purchaseId: number, tagName: string) => Promise<void>;
  truncateDisplayText: (value: string, maxLen: number) => string;
  listItemNameMaxLen: number;
  listItemDescMaxLen: number;
  purchasesCount: number;
  /** Na aba Assinaturas a coluna de entrega não se aplica. */
  showEntregaColumn?: boolean;
}

export function PurchaseDesktopTable({
  finalSortedPurchases,
  paginatedPurchases,
  selectedPurchases,
  toggleAllPurchases,
  togglePurchaseSelection,
  renderSortableHeader,
  getCategoryName,
  getStatusColor,
  getStatusLabel,
  getStatusEntregaColor,
  getStatusEntregaLabel,
  isSignaturePurchase,
  signatureAlertsByPurchaseId,
  selectedSignatureMonth,
  onOpenDetails,
  onOpenStatus,
  onOpenEdit,
  onOpenDelete,
  onRemoveSingleTag,
  truncateDisplayText,
  listItemNameMaxLen,
  listItemDescMaxLen,
  purchasesCount,
  showEntregaColumn = true,
}: PurchaseDesktopTableProps) {
  const colCount = showEntregaColumn ? 9 : 8;
  return (
    <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-white/5 text-white/70">
          <tr>
            <th className="px-4 py-3 text-left">
              <input
                type="checkbox"
                checked={
                  finalSortedPurchases.length > 0 &&
                  selectedPurchases.length === finalSortedPurchases.length
                }
                onChange={toggleAllPurchases}
                className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
              />
            </th>
            {renderSortableHeader('item', 'Item')}
            {renderSortableHeader('quantidade', 'Qtd')}
            {renderSortableHeader('cotacoes', 'Cotações')}
            {renderSortableHeader('categoria', 'Categoria')}
            {renderSortableHeader('solicitadoPor', 'Solicitado Por')}
            {renderSortableHeader('status', 'Status')}
            {showEntregaColumn && renderSortableHeader('dataEntrega', 'Entrega')}
            <th className="px-4 py-3 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          {finalSortedPurchases.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-8 text-center text-white/50">
                {purchasesCount === 0
                  ? 'Nenhuma compra cadastrada'
                  : 'Nenhuma compra encontrada com os filtros aplicados'}
              </td>
            </tr>
          ) : (
            paginatedPurchases.map((purchase) => {
              const cotacoes =
                purchase.cotacoesJson && Array.isArray(purchase.cotacoesJson) ? purchase.cotacoesJson : [];
              const isSelected = selectedPurchases.includes(purchase.id);
              const tags = Array.isArray(purchase.tagsJson) ? purchase.tagsJson : [];
              const signatureAlert = signatureAlertsByPurchaseId[purchase.id];

              return (
                <tr
                  key={purchase.id}
                  className={`border-t border-white/5 hover:bg-white/5 cursor-pointer ${
                    isSelected ? 'bg-primary/10' : ''
                  }`}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('input') || target.closest('a')) {
                      return;
                    }
                    onOpenDetails(purchase);
                  }}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePurchaseSelection(purchase.id)}
                      className="w-4 h-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-4 py-3 max-w-[11rem] sm:max-w-[13rem] lg:max-w-[15rem] align-top">
                    <div className="flex items-center space-x-3 min-w-0">
                      {(() => {
                        const thumb = firstDisplayableImageUrl(purchase.imagemUrl);
                        if (!thumb) return null;
                        const src =
                          thumb.startsWith('/uploads/') ? resolvePublicUploadUrl(thumb) : thumb;
                        return (
                          <img
                            src={src}
                            alt={purchase.item || 'Item'}
                            className="w-10 h-10 object-cover rounded flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        );
                      })()}
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="font-medium truncate" title={purchase.item || 'Sem nome'}>
                          {truncateDisplayText(purchase.item || 'Sem nome', listItemNameMaxLen)}
                        </div>
                        {purchase.descricao && (
                          <div className="text-xs text-white/60 truncate" title={purchase.descricao}>
                            {truncateDisplayText(purchase.descricao, listItemDescMaxLen)}
                          </div>
                        )}
                        {tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tags.map((tag, idx) => (
                              <span
                                key={`${tag?.nome || 'tag'}-${idx}`}
                                title={tag?.nome ? String(tag.nome) : undefined}
                                className="text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 max-w-[8rem]"
                                style={{
                                  backgroundColor: `${tag?.cor || '#3B82F6'}33`,
                                  borderColor: `${tag?.cor || '#3B82F6'}66`,
                                  color: tag?.cor || '#93C5FD',
                                }}
                              >
                                {truncateCellText(tag?.nome || 'Tag', TABLE_TAG_NAME_MAX)}
                                <button
                                  type="button"
                                  className="text-sm font-bold leading-none text-white opacity-90 hover:opacity-100"
                                  onClick={() => {
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
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium">{purchase.quantidade || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    {cotacoes.length > 0 ? (
                      <div className="space-y-1">
                        {cotacoes.map((cotacao: Cotacao, index: number) => {
                          const totalComQuantidade = calculateCotacaoTotal(
                            cotacao,
                            purchase.quantidade || 1,
                          );
                          return (
                            <div key={index} className="text-sm">
                              <span className="text-white/70">Cotação {index + 1}: </span>
                              {cotacao.link ? (
                                <a
                                  href={cotacao.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-primary hover:text-primary/80 underline cursor-pointer"
                                >
                                  {totalComQuantidade.toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </a>
                              ) : (
                                <span className="font-semibold text-primary">
                                  {totalComQuantidade.toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-white/50 text-sm">Sem cotações</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[7rem] sm:max-w-[9rem]">
                    <span
                      className="text-sm text-white/80 block truncate"
                      title={getCategoryName(purchase.categoriaId ?? undefined)}
                    >
                      {truncateCellText(getCategoryName(purchase.categoriaId ?? undefined), TABLE_CATEGORY_MAX)}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[7rem] sm:max-w-[9rem]">
                    <span
                      className="text-sm text-white/80 block truncate"
                      title={purchase.solicitadoPor?.nome || '-'}
                    >
                      {truncateCellText(purchase.solicitadoPor?.nome || '-', TABLE_SOLICITANTE_MAX)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          isSignaturePurchase(purchase)
                            ? getAssinaturaCompraStatusColor(purchase.status)
                            : getStatusColor(purchase.status)
                        }`}
                      >
                        {isSignaturePurchase(purchase)
                          ? getAssinaturaCompraStatusLabel(purchase.status)
                          : getStatusLabel(purchase.status)}
                      </span>
                      {purchase.status === 'COMPRADO_ACAMINHO' && purchase.statusEntrega && !isSignaturePurchase(purchase) && (
                        <span className={`px-2 py-1 rounded text-xs ${getStatusEntregaColor(purchase.statusEntrega)}`}>
                          {getStatusEntregaLabel(purchase.statusEntrega)}
                        </span>
                      )}
                      {isSignaturePurchase(purchase) && (
                        <span className="px-2 py-1 rounded text-xs border border-amber-500/40 bg-amber-500/20 text-amber-200">
                          {signatureAlert?.precisaConfirmacao
                            ? `Doc. pendente (${signatureAlert?.mesReferencia || selectedSignatureMonth})`
                            : `Doc. completo (${signatureAlert?.mesReferencia || selectedSignatureMonth})`}
                        </span>
                      )}
                    </div>
                  </td>
                  {showEntregaColumn && (
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 text-xs min-w-0">
                        {purchase.status === 'COMPRADO_ACAMINHO' && purchase.previsaoEntrega && (
                          <span className="text-blue-300 whitespace-nowrap">
                            📅 Previsão: {new Date(purchase.previsaoEntrega).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        {purchase.status === 'ENTREGUE' ? (
                          <>
                            {purchase.dataEntrega && (
                              <span className="text-white/90 whitespace-nowrap">
                                📅 {new Date(purchase.dataEntrega).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                            {purchase.enderecoEntrega && (
                              <span className="text-white/80 truncate max-w-[7rem] sm:max-w-[9rem]" title={purchase.enderecoEntrega}>
                                📍 {truncateCellText(purchase.enderecoEntrega, 32)}
                              </span>
                            )}
                            {purchase.recebidoPor && (
                              <span className="text-white/70 truncate max-w-[9rem] block" title={purchase.recebidoPor}>
                                👤 {truncateCellText(purchase.recebidoPor, 24)}
                              </span>
                            )}
                            {purchase.observacao && (
                              <span className="text-white/60 truncate max-w-[7rem] sm:max-w-[9rem]" title={purchase.observacao}>
                                📝 {truncateCellText(purchase.observacao, 32)}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {purchase.dataEntrega ? (
                              <span className="text-white/90 whitespace-nowrap">
                                📅 {new Date(purchase.dataEntrega).toLocaleDateString('pt-BR')}
                              </span>
                            ) : purchase.dataCompra ? (
                              <span className="text-white/50 whitespace-nowrap">
                                📅 Compra: {new Date(purchase.dataCompra).toLocaleDateString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-white/50">-</span>
                            )}
                            {purchase.recebidoPor && (
                              <span className="text-white/70 whitespace-nowrap truncate max-w-[9rem] block" title={purchase.recebidoPor}>
                                👤 {truncateCellText(purchase.recebidoPor, 24)}
                              </span>
                            )}
                            {purchase.observacao && (
                              <span className="text-white/60 truncate max-w-[7rem] sm:max-w-[9rem]" title={purchase.observacao}>
                                📝 {truncateCellText(purchase.observacao, 32)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <button
                        onClick={() => onOpenStatus(purchase)}
                        className={btn.successSm}
                        title="Alterar Status"
                      >
                        Status
                      </button>
                      <button onClick={() => onOpenEdit(purchase)} className={btn.editSm} title="Editar Compra">
                        Editar
                      </button>
                      <button onClick={() => onOpenDelete(purchase)} className={btn.dangerSm} title="Remover Compra">
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
