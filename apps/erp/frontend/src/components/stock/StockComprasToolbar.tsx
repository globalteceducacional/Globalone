import { btn } from '../../utils/buttonStyles';

interface StockComprasToolbarProps {
  selectedPurchasesCount: number;
  selectedPurchasesPendenteCount: number;
  /** Na aba Assinaturas: abre relatório mensal (NF+comprovante) sem exigir seleção. */
  showAssinaturasMesReport?: boolean;
  onOpenAssinaturasMesReport?: () => void;
  onOpenReport: () => void;
  onOpenAddTag: () => void;
  onOpenRemoveTag: () => void;
  onOpenBulkDelete: () => void;
  onOpenBatchAcaminho: () => void;
  onOpenImportSheet: () => void;
  onOpenNovaCompra: () => void;
  onOpenNovaDespesa: () => void;
  onOpenNovaAssinatura: () => void;
}

export function StockComprasToolbar({
  selectedPurchasesCount,
  selectedPurchasesPendenteCount,
  showAssinaturasMesReport = false,
  onOpenAssinaturasMesReport,
  onOpenReport,
  onOpenAddTag,
  onOpenRemoveTag,
  onOpenBulkDelete,
  onOpenBatchAcaminho,
  onOpenImportSheet,
  onOpenNovaCompra,
  onOpenNovaDespesa,
  onOpenNovaAssinatura,
}: StockComprasToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xl font-semibold">Compras</h3>
      <div className="flex items-center gap-2">
        {showAssinaturasMesReport && onOpenAssinaturasMesReport && (
          <button type="button" onClick={onOpenAssinaturasMesReport} className={btn.warning}>
            Relatório assinaturas (mês)
          </button>
        )}
        {selectedPurchasesCount > 0 && (
          <button onClick={onOpenReport} className={btn.success}>
            Gerar Relatório ({selectedPurchasesCount})
          </button>
        )}
        {selectedPurchasesCount > 0 && (
          <button
            onClick={onOpenAddTag}
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
          >
            Adicionar Tag ({selectedPurchasesCount})
          </button>
        )}
        {selectedPurchasesCount > 0 && (
          <button
            onClick={onOpenRemoveTag}
            className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors"
          >
            Remover Tag ({selectedPurchasesCount})
          </button>
        )}
        {selectedPurchasesCount > 0 && (
          <button type="button" onClick={onOpenBulkDelete} className={btn.danger}>
            Apagar todos esses itens ({selectedPurchasesCount})
          </button>
        )}
        {selectedPurchasesPendenteCount > 0 && (
          <button onClick={onOpenBatchAcaminho} className={btn.primary}>
            Compra em lote ({selectedPurchasesPendenteCount})
          </button>
        )}
        <button onClick={onOpenImportSheet} className={btn.secondary}>
          Importar Planilha
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpenNovaCompra} className={btn.primary}>
            Nova compra (estoque)
          </button>
          <button type="button" onClick={onOpenNovaDespesa} className={btn.secondary}>
            Nova despesa
          </button>
          <button type="button" onClick={onOpenNovaAssinatura} className={btn.secondary}>
            Nova assinatura
          </button>
        </div>
      </div>
    </div>
  );
}
