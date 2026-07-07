import { useMemo, useCallback } from 'react';
import { DataTable, DataTableColumn } from '../DataTable';
import type { Purchase } from '../../types/stock';
import { btn } from '../../utils/buttonStyles';
import { renderSortableTableTh } from '../../utils/sortableTableHeader';
import { useClientTableSort } from '../../utils/useClientTableSort';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';
import { firstDisplayableImageUrl } from '../../utils/attachmentUrls';

type SolicitacoesSortCol = 'item' | 'quantidade' | 'solicitadoPor' | 'projeto' | 'status';

interface SolicitacoesSectionProps {
  filteredSolicitacoesByOrigem: Purchase[];
  selectedSolicitacaoIds: number[];
  onOpenReport: () => void;
  onOpenBulkApprove: () => void;
  onOpenBulkDelete: () => void;
  onToggleSolicitacaoSelection: (id: number) => void;
  onToggleAllSolicitacoesFiltered: () => void;
  onOpenSolicitacaoDetails: (purchase: Purchase) => void;
  isCompraFuturaRemanescente: (purchase: Purchase) => boolean;
  isSolicitacaoNova: (purchase: Purchase) => boolean;
  truncateDisplayText: (value: string, maxLen: number) => string;
  listItemNameMaxLen: number;
  listItemDescMaxLen: number;
}

export function SolicitacoesSection({
  filteredSolicitacoesByOrigem,
  selectedSolicitacaoIds,
  onOpenReport,
  onOpenBulkApprove,
  onOpenBulkDelete,
  onToggleSolicitacaoSelection,
  onToggleAllSolicitacoesFiltered,
  onOpenSolicitacaoDetails,
  isCompraFuturaRemanescente,
  isSolicitacaoNova,
  truncateDisplayText,
  listItemNameMaxLen,
  listItemDescMaxLen,
}: SolicitacoesSectionProps) {
  const { sortColumn: solSortCol, sortDirection: solSortDir, handleSort: handleSolSort } =
    useClientTableSort<SolicitacoesSortCol>('item');

  const sortedSolicitacoes = useMemo(() => {
    const rows = [...filteredSolicitacoesByOrigem];
    const solicitanteNome = (p: Purchase) => (p as any).solicitadoPor?.nome ?? '';
    const projetoNome = (p: Purchase) => (p as any).projeto?.nome ?? '';
    const statusLabel = (p: Purchase) => (isCompraFuturaRemanescente(p) ? 'futura' : 'normal');
    rows.sort((a, b) => {
      let cmp = 0;
      switch (solSortCol) {
        case 'item':
          cmp = (a.item ?? '').localeCompare(b.item ?? '');
          break;
        case 'quantidade':
          cmp = (a.quantidade || 0) - (b.quantidade || 0);
          break;
        case 'solicitadoPor':
          cmp = solicitanteNome(a).localeCompare(solicitanteNome(b));
          break;
        case 'projeto':
          cmp = projetoNome(a).localeCompare(projetoNome(b));
          break;
        case 'status':
          cmp = statusLabel(a).localeCompare(statusLabel(b));
          break;
        default:
          cmp = 0;
      }
      return solSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredSolicitacoesByOrigem, solSortCol, solSortDir, isCompraFuturaRemanescente]);

  const renderSolTh = useCallback(
    (col: SolicitacoesSortCol, label: string) =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: solSortCol,
        sortDirection: solSortDir,
        onSort: handleSolSort,
        align: 'left',
      }),
    [solSortCol, solSortDir, handleSolSort],
  );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          Solicitações de Compra
          <span className="rounded-full border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
            {filteredSolicitacoesByOrigem.length}
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {filteredSolicitacoesByOrigem.length > 0 && (
            <button type="button" onClick={onOpenReport} className={btn.success}>
              Gerar relatório (
              {selectedSolicitacaoIds.length > 0
                ? `${selectedSolicitacaoIds.length} selecionados`
                : `todos — ${filteredSolicitacoesByOrigem.length}`}
              )
            </button>
          )}
          {selectedSolicitacaoIds.length > 0 && (
            <>
              <button type="button" onClick={onOpenBulkApprove} className={btn.success}>
                Aprovar selecionados ({selectedSolicitacaoIds.length})
              </button>
              <button type="button" onClick={onOpenBulkDelete} className={btn.danger}>
                Apagar todos esses itens ({selectedSolicitacaoIds.length})
              </button>
            </>
          )}
        </div>
      </div>
      <DataTable<Purchase>
        data={sortedSolicitacoes}
        keyExtractor={(p) => p.id}
        emptyMessage="Nenhum pedido de compra aguardando aprovação"
        paginate
        initialPageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        onRowClick={(p) => onOpenSolicitacaoDetails(p)}
        rowClassName={(p) =>
          isCompraFuturaRemanescente(p) ? 'bg-blue-500/10' : 'bg-yellow-500/10'
        }
        renderMobileCard={(p) => {
          const sol = (p as any).solicitadoPor;
          const cargo = sol?.cargo
            ? typeof sol.cargo === 'string'
              ? sol.cargo
              : sol.cargo.nome || 'Sem cargo'
            : null;
          const isCompraFutura = isCompraFuturaRemanescente(p);
          return (
            <div
              className={`space-y-3 rounded-xl border p-4 ${
                isCompraFutura
                  ? 'border-blue-500/20 bg-blue-500/10'
                  : 'border-yellow-500/20 bg-yellow-500/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="align-middle rounded border-white/30"
                    checked={selectedSolicitacaoIds.includes(p.id)}
                    onChange={() => onToggleSolicitacaoSelection(p.id)}
                    aria-label={`Selecionar pedido ${p.item || p.id}`}
                  />
                </div>
                {(() => {
                  const thumb = firstDisplayableImageUrl(p.imagemUrl);
                  if (!thumb) return null;
                  const src = thumb.startsWith('/uploads/') ? resolvePublicUploadUrl(thumb) : thumb;
                  return (
                    <img
                      src={src}
                      alt={p.item || 'Item'}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words font-semibold text-white" title={p.item || 'Sem nome'}>
                    {truncateDisplayText(p.item || 'Sem nome', listItemNameMaxLen)}
                  </p>
                  {p.descricao && (
                    <p
                      className="mt-0.5 line-clamp-2 break-words text-xs text-white/60"
                      title={p.descricao}
                    >
                      Motivo: {truncateDisplayText(p.descricao, listItemDescMaxLen)}
                    </p>
                  )}
                  {isSolicitacaoNova(p) && (
                    <span className="mt-1 inline-block rounded border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                      NOVA
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                    isCompraFutura
                      ? 'border border-blue-500/30 bg-blue-500/20 text-blue-300'
                      : 'border border-yellow-500/30 bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {isCompraFutura ? 'SOLICITADO (FUTURA)' : 'SOLICITADO'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/5 p-3">
                <div className="text-center">
                  <p className="mb-0.5 text-xs text-white/50">Qtd</p>
                  <p className="text-sm font-bold text-white">{p.quantidade || 0}</p>
                </div>
                <div className="text-center">
                  <p className="mb-0.5 text-xs text-white/50">Solicitante</p>
                  <p className="truncate text-xs text-white/80">{sol?.nome ?? 'N/A'}</p>
                  {cargo && <p className="truncate text-xs text-white/50">{cargo}</p>}
                </div>
                <div className="text-center">
                  <p className="mb-0.5 text-xs text-white/50">Projeto</p>
                  <p className="truncate text-xs text-white/80">{(p as any).projeto?.nome || '—'}</p>
                </div>
              </div>
              <div className="border-t border-white/10 pt-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onOpenSolicitacaoDetails(p)} className={btn.editSm}>
                  Ver Detalhes
                </button>
              </div>
            </div>
          );
        }}
        columns={[
          {
            key: '_select',
            label: (
              <input
                type="checkbox"
                className="rounded border-white/30"
                checked={
                  sortedSolicitacoes.length > 0 &&
                  selectedSolicitacaoIds.length === sortedSolicitacoes.length
                }
                onChange={onToggleAllSolicitacoesFiltered}
                title="Selecionar todas as solicitações da lista filtrada"
                aria-label="Selecionar todas as solicitações da lista filtrada"
              />
            ),
            thClassName: 'w-11 min-w-[2.75rem]',
            tdClassName: 'w-11 min-w-[2.75rem] align-top',
            stopRowClick: true,
            render: (p) => (
              <input
                type="checkbox"
                className="rounded border-white/30"
                checked={selectedSolicitacaoIds.includes(p.id)}
                onChange={() => onToggleSolicitacaoSelection(p.id)}
                aria-label={`Selecionar ${p.item || 'pedido de compra'}`}
              />
            ),
          },
          {
            key: 'item',
            label: '',
            renderTh: () => renderSolTh('item', 'Item'),
            render: (p) => (
              <div className="flex min-w-0 items-center gap-3">
                {(() => {
                  const thumb = firstDisplayableImageUrl(p.imagemUrl);
                  if (!thumb) return null;
                  const src = thumb.startsWith('/uploads/') ? resolvePublicUploadUrl(thumb) : thumb;
                  return (
                    <img
                      src={src}
                      alt={p.item || 'Item'}
                      className="h-10 w-10 shrink-0 rounded object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  );
                })()}
                <div className="max-w-xl min-w-0 overflow-hidden">
                  <div className="truncate font-medium" title={p.item || 'Sem nome'}>
                    {truncateDisplayText(p.item || 'Sem nome', listItemNameMaxLen)}
                  </div>
                  {p.descricao && (
                    <div className="truncate text-xs text-white/60" title={p.descricao}>
                      Motivo: {truncateDisplayText(p.descricao, listItemDescMaxLen)}
                    </div>
                  )}
                  {isSolicitacaoNova(p) && (
                    <span className="mt-1 inline-block rounded border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                      NOVA
                    </span>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'quantidade',
            label: '',
            renderTh: () => renderSolTh('quantidade', 'Qtd'),
            thClassName: 'whitespace-nowrap',
            tdClassName: 'whitespace-nowrap',
            render: (p) => <span className="font-medium">{p.quantidade || 0}</span>,
          },
          {
            key: 'solicitadoPor',
            label: '',
            renderTh: () => renderSolTh('solicitadoPor', 'Solicitado Por'),
            render: (p) => {
              const sol = (p as any).solicitadoPor;
              const cargo = sol?.cargo
                ? typeof sol.cargo === 'string'
                  ? sol.cargo
                  : sol.cargo.nome || 'Sem cargo'
                : 'N/A';
              return sol ? (
                <span>
                  {sol.nome} <span className="text-white/50">({cargo})</span>
                </span>
              ) : (
                <span>N/A</span>
              );
            },
          },
          {
            key: 'projeto',
            label: '',
            renderTh: () => renderSolTh('projeto', 'Projeto'),
            render: (p) => <span>{(p as any).projeto?.nome || 'Sem projeto'}</span>,
          },
          {
            key: 'status',
            label: '',
            renderTh: () => renderSolTh('status', 'Status'),
            render: (p) =>
              isCompraFuturaRemanescente(p) ? (
                <div className="flex items-center gap-2">
                  <span className="rounded border border-blue-500/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-300">
                    SOLICITADO (FUTURA)
                  </span>
                  {isSolicitacaoNova(p) && (
                    <span className="rounded border border-red-500/40 bg-red-500/20 px-2 py-1 text-xs text-red-300">
                      NOVA
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="rounded border border-yellow-500/30 bg-yellow-500/20 px-2 py-1 text-xs text-yellow-400">
                    SOLICITADO
                  </span>
                  {isSolicitacaoNova(p) && (
                    <span className="rounded border border-red-500/40 bg-red-500/20 px-2 py-1 text-xs text-red-300">
                      NOVA
                    </span>
                  )}
                </div>
              ),
          },
          {
            key: 'acoes',
            label: 'Ações',
            stopRowClick: true,
            render: (p) => (
              <button type="button" onClick={() => onOpenSolicitacaoDetails(p)} className={btn.editSm}>
                Ver Detalhes
              </button>
            ),
          },
        ] satisfies DataTableColumn<Purchase>[]}
      />
    </section>
  );
}
