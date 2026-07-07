import type { Purchase } from '../../types/stock';
import { PurchaseMobileCard } from './PurchaseMobileCard';

interface PurchaseMobileListProps {
  purchases: Purchase[];
  allPurchasesCount: number;
  selectedPurchases: number[];
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

export function PurchaseMobileList({
  purchases,
  allPurchasesCount,
  selectedPurchases,
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
}: PurchaseMobileListProps) {
  return (
    <div className="sm:hidden space-y-3">
      {purchases.length === 0 ? (
        <div className="py-8 text-center text-white/50">
          {allPurchasesCount === 0
            ? 'Nenhuma compra cadastrada'
            : 'Nenhuma compra encontrada com os filtros aplicados'}
        </div>
      ) : (
        purchases.map((purchase) => (
          <PurchaseMobileCard
            key={purchase.id}
            purchase={purchase}
            isSelected={selectedPurchases.includes(purchase.id)}
            listItemNameMaxLen={listItemNameMaxLen}
            listItemDescMaxLen={listItemDescMaxLen}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            getStatusEntregaColor={getStatusEntregaColor}
            getStatusEntregaLabel={getStatusEntregaLabel}
            getCategoryName={getCategoryName}
            truncateDisplayText={truncateDisplayText}
            calculateCotacaoTotal={calculateCotacaoTotal}
            toggleSelection={toggleSelection}
            onOpenDetails={onOpenDetails}
            onOpenStatus={onOpenStatus}
            onOpenEdit={onOpenEdit}
            onOpenDelete={onOpenDelete}
            onRemoveSingleTag={onRemoveSingleTag}
            isSignaturePurchase={isSignaturePurchase}
            signatureAlertsByPurchaseId={signatureAlertsByPurchaseId}
            selectedSignatureMonth={selectedSignatureMonth}
            showEntregaColumn={showEntregaColumn}
          />
        ))
      )}
    </div>
  );
}
