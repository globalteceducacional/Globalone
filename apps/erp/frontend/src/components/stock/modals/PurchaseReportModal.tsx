import type { Purchase } from '../../../types/stock';
import { getPurchaseLineTotal } from '../../../utils/stockHelpers';
import { btn } from '../../../utils/buttonStyles';
import { ExcelDownloadButton } from '../../ExcelDownloadButton';
import { parseAttachmentUrls } from '../../../utils/attachmentUrls';
import { fileDisplayName } from '../../../utils/filePreview';

export type PurchaseReportModalMode = 'selection' | 'signature-month' | 'solicitacoes-pending';

interface PurchaseReportModalProps {
  isOpen: boolean;
  reportMode: PurchaseReportModalMode;
  includeSignaturesInReport: boolean;
  selectedPurchases: number[];
  purchases: Purchase[];
  signatureReportMonth: string;
  onChangeSignatureReportMonth: (value: string) => void;
  signatureReportLoading: boolean;
  onToggleIncludeSignatures: (value: boolean) => void;
  onClose: () => void;
  onCloseAndClearSelection: () => void;
  calculateReportTotals: () => {
    totalValor: number;
    totalQuantidade: number;
    totalItens: number;
    purchases: Purchase[];
  };
  getStatusLabel: (status: string) => string;
  getStatusColor: (status: string) => string;
  getCategoryName: (categoriaId?: number) => string;
  buildWorkbook: () => any;
  onExportPdf: () => void;
}

export function PurchaseReportModal({
  isOpen,
  reportMode,
  includeSignaturesInReport,
  selectedPurchases,
  purchases,
  signatureReportMonth,
  onChangeSignatureReportMonth,
  signatureReportLoading,
  onToggleIncludeSignatures,
  onClose,
  onCloseAndClearSelection,
  calculateReportTotals,
  getStatusLabel,
  getStatusColor,
  getCategoryName,
  buildWorkbook,
  onExportPdf,
}: PurchaseReportModalProps) {
  if (!isOpen) return null;
  const reportData = calculateReportTotals();
  const isSignatureMonth = reportMode === 'signature-month';
  const isSolicitacoesPending = reportMode === 'solicitacoes-pending';
  const day = new Date().toISOString().split('T')[0];
  const excelName = isSignatureMonth
    ? `relatorio-assinaturas-${signatureReportMonth}.xlsx`
    : isSolicitacoesPending
      ? `relatorio-solicitacoes-pendentes-${day}.xlsx`
      : `relatorio-compras-${day}.xlsx`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-white/20 bg-neutral shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/20 bg-neutral px-8 py-6">
          <h2 className="text-2xl font-bold text-white">
            {isSignatureMonth
              ? 'Relatório mensal de assinaturas'
              : isSolicitacoesPending
                ? 'Relatório de solicitações pendentes'
                : 'Relatório de Compras'}
          </h2>
          <button onClick={onClose} className="text-2xl text-white/50 transition-colors hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-8">
          {isSignatureMonth ? (
            <div className="mb-4 space-y-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <label className="block text-sm font-medium text-white/90">Competência (YYYY-MM)</label>
              <input
                type="month"
                value={signatureReportMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) onChangeSignatureReportMonth(v);
                }}
                className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
              />
              <p className="text-xs text-white/60">
                Lista somente assinaturas recorrentes com nota fiscal e comprovante de pagamento cadastrados para o mês.
              </p>
            </div>
          ) : isSolicitacoesPending ? (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95">
              Itens com status <strong className="text-amber-50">Solicitado</strong> aguardando aprovação (pedidos de
              compra). Se houver linhas marcadas na lista, o relatório usa só a seleção; caso contrário, todos os itens
              visíveis com os filtros aplicados.
            </p>
          ) : (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <label className="inline-flex items-center gap-2 text-sm text-white/90">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/30 bg-white/10 text-primary focus:ring-primary"
                  checked={includeSignaturesInReport}
                  onChange={(e) => onToggleIncludeSignatures(e.target.checked)}
                />
                Incluir assinaturas no relatório
              </label>
              {!includeSignaturesInReport &&
                selectedPurchases.some((id) => {
                  const p = purchases.find((x) => x.id === id);
                  return !!p?.categoria?.isAssinatura;
                }) && (
                  <span className="text-xs text-amber-200">
                    Assinaturas selecionadas serão ignoradas enquanto esta opção estiver desmarcada.
                  </span>
                )}
            </div>
          )}

          {isSignatureMonth && signatureReportLoading && (
            <p className="mb-4 text-sm text-white/70">Carregando dados do mês…</p>
          )}

          <div className="space-y-6">
            <div className="rounded-lg border border-white/10 bg-white/5 p-6">
              <h3 className="mb-4 text-xl font-semibold text-white">Resumo Geral</h3>
              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-white/5 p-4">
                  <div className="mb-1 text-sm text-white/70">Total de Itens</div>
                  <div className="text-2xl font-bold text-white">{reportData.totalItens}</div>
                </div>
                <div className="rounded-lg bg-white/5 p-4">
                  <div className="mb-1 text-sm text-white/70">Quantidade Total</div>
                  <div className="text-2xl font-bold text-white">{reportData.totalQuantidade}</div>
                </div>
                <div className="rounded-lg bg-white/5 p-4">
                  <div className="mb-1 text-sm text-white/70">Valor Total</div>
                  <div className="text-2xl font-bold text-primary">
                    {reportData.totalValor.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {reportData.purchases.length === 0 && !signatureReportLoading ? (
                <p className="text-center text-sm text-white/50">
                  {isSignatureMonth
                    ? 'Nenhuma assinatura completa (NF + comprovante) para este mês.'
                    : isSolicitacoesPending
                      ? 'Nenhuma solicitação pendente no relatório.'
                      : 'Nenhum item no relatório.'}
                </p>
              ) : (
                reportData.purchases.map((purchase) => (
                  <div key={purchase.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{purchase.item}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${getStatusColor(purchase.status)}`}>
                        {getStatusLabel(purchase.status)}
                      </span>
                      {(purchase as any).categoriaId && (
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
                          {getCategoryName((purchase as any).categoriaId)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white/70">
                      {isSolicitacoesPending && purchase.projeto?.nome ? (
                        <span className="block">Projeto: {purchase.projeto.nome}</span>
                      ) : null}
                      {isSolicitacoesPending && purchase.solicitadoPor?.nome ? (
                        <span className="block">
                          Solicitado por: {purchase.solicitadoPor.nome}
                          {purchase.solicitadoPor.cargo?.nome
                            ? ` (${purchase.solicitadoPor.cargo.nome})`
                            : ''}
                        </span>
                      ) : null}
                      Qtd: {purchase.quantidade || 0} | Valor:{' '}
                      {getPurchaseLineTotal(purchase).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </div>
                    {isSolicitacoesPending && purchase.descricao ? (
                      <p className="mt-1 text-xs text-white/55 line-clamp-2">
                        Motivo: {purchase.descricao}
                      </p>
                    ) : null}
                    {isSignatureMonth &&
                      (parseAttachmentUrls(purchase.nfUrl).length > 0 ||
                        parseAttachmentUrls(purchase.comprovantePagamentoUrl).length > 0) && (
                      <div className="mt-2 space-y-1 text-xs text-white/60">
                        {parseAttachmentUrls(purchase.nfUrl).map((u, i) => (
                          <div key={`nf-${i}`} className="truncate" title={fileDisplayName(u, i, 'NF')}>
                            NF {parseAttachmentUrls(purchase.nfUrl).length > 1 ? `${i + 1}: ` : ': '}
                            {fileDisplayName(u, i, 'NF')}
                          </div>
                        ))}
                        {parseAttachmentUrls(purchase.comprovantePagamentoUrl).map((u, i) => (
                          <div key={`cp-${i}`} className="truncate" title={fileDisplayName(u, i, 'Comprovante')}>
                            Comprovante{' '}
                            {parseAttachmentUrls(purchase.comprovantePagamentoUrl).length > 1 ? `${i + 1}: ` : ': '}
                            {fileDisplayName(u, i, 'Comprovante')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-4 border-t border-white/20 pt-4">
              <button
                type="button"
                onClick={isSolicitacoesPending ? onClose : onCloseAndClearSelection}
                className={btn.secondaryLg}
              >
                Fechar
              </button>
              <ExcelDownloadButton
                buildWorkbook={buildWorkbook}
                fileName={excelName}
                label="Exportar Excel"
                className="flex items-center gap-2 rounded-md bg-green-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-green-700"
              />
              <button
                type="button"
                onClick={onExportPdf}
                disabled={isSignatureMonth && signatureReportLoading}
                className="rounded-md bg-primary px-6 py-2.5 font-semibold text-white transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Exportar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
