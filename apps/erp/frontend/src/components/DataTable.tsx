import { ReactNode, MouseEvent, useEffect, useRef, useState } from 'react';
import { TablePagination } from './TablePagination';

export interface DataTableColumn<T = any> {
  key: string;
  /** Conteúdo do <th>. Aceita ReactNode para labels responsivos. */
  label: ReactNode;
  /** Substitui completamente o <th> (ex.: cabeçalhos com ordenação). */
  renderTh?: () => ReactNode;
  /** Classes extras para o <th>. */
  thClassName?: string;
  /** Classes extras para o <td>. */
  tdClassName?: string;
  /** Alinhamento da coluna (padrão: 'left'). */
  align?: 'left' | 'right' | 'center';
  /** Função que renderiza o conteúdo da célula. */
  render?: (item: T) => ReactNode;
  /** Se true, o clique neste <td> não dispara o onRowClick da linha. */
  stopRowClick?: boolean;
}

type DataTableResponsiveFrom = 'sm' | 'md' | 'lg';

const MOBILE_ONLY_CLASS: Record<DataTableResponsiveFrom, string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
};

const DESKTOP_ONLY_CLASS: Record<DataTableResponsiveFrom, string> = {
  sm: 'hidden sm:block',
  md: 'hidden md:block',
  lg: 'hidden lg:block',
};

export interface DataTableProps<T = any> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  /** Mensagem exibida quando data está vazia. */
  emptyMessage?: string;
  loading?: boolean;
  /** Callback ao clicar na linha (ignorado em colunas com stopRowClick). */
  onRowClick?: (item: T, e: MouseEvent<HTMLTableRowElement>) => void;
  /** Classes extras para cada <tr>. */
  rowClassName?: (item: T) => string;
  /** Classes extras para o wrapper (overflow-x-auto …). */
  wrapperClassName?: string;
  /** Classes extras para o <table>. */
  tableClassName?: string;
  /**
   * Renderiza um card mobile para cada item.
   * Quando fornecido, a tabela fica oculta em telas < sm e os cards
   * são exibidos no lugar (sm:hidden / hidden sm:block automático).
   */
  renderMobileCard?: (item: T) => ReactNode;
  /** Habilita paginação por tabela. */
  paginate?: boolean;
  /** Quantidade inicial de linhas por página. */
  initialPageSize?: number;
  /** Página controlada (opcional). */
  page?: number;
  /** Tamanho de página controlado (opcional). */
  pageSize?: number;
  /** Callback quando a página muda (modo controlado). */
  onPageChange?: (page: number) => void;
  /** Callback quando o tamanho da página muda (modo controlado). */
  onPageSizeChange?: (pageSize: number) => void;
  /** Opções de linhas por página. */
  pageSizeOptions?: number[];
  /**
   * A partir deste breakpoint a tabela desktop aparece; abaixo disso usa `renderMobileCard`.
   * Padrão `md` (768px) — melhor em telas estreitas e painéis laterais.
   */
  responsiveFrom?: DataTableResponsiveFrom;
}

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Nenhum registro encontrado',
  loading = false,
  onRowClick,
  rowClassName,
  wrapperClassName = '',
  tableClassName = '',
  renderMobileCard,
  paginate = false,
  initialPageSize = 20,
  page: controlledPage,
  pageSize: controlledPageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  responsiveFrom = 'sm',
}: DataTableProps<T>) {
  const colCount = columns.length;
  const hasMobileCards = !!renderMobileCard;
  const mobileOnlyClass = MOBILE_ONLY_CLASS[responsiveFrom];
  const desktopOnlyClass = DESKTOP_ONLY_CLASS[responsiveFrom];
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(initialPageSize);
  const isControlledPagination =
    controlledPage !== undefined &&
    controlledPageSize !== undefined &&
    onPageChange !== undefined &&
    onPageSizeChange !== undefined;
  const page = isControlledPagination ? controlledPage : internalPage;
  const pageSize = isControlledPagination ? controlledPageSize : internalPageSize;
  const setPage = isControlledPagination ? onPageChange : setInternalPage;
  const setPageSize = isControlledPagination ? onPageSizeChange : setInternalPageSize;
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);

  useEffect(() => {
    const syncState = () => {
      const tableEl = tableScrollRef.current;
      const topInnerEl = topScrollInnerRef.current;
      if (!tableEl || !topInnerEl) {
        setShowTopScrollbar(false);
        return;
      }

      const hasOverflow = tableEl.scrollWidth > tableEl.clientWidth + 1;
      setShowTopScrollbar(hasOverflow);
      topInnerEl.style.width = `${tableEl.scrollWidth}px`;
    };

    syncState();
    window.addEventListener('resize', syncState);
    const tableEl = tableScrollRef.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncState())
        : null;
    if (resizeObserver && tableEl) {
      resizeObserver.observe(tableEl);
    }
    return () => {
      window.removeEventListener('resize', syncState);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [data, columns, hasMobileCards]);

  const handleTopScroll = () => {
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    tableEl.scrollLeft = topEl.scrollLeft;
  };

  const handleTableScroll = () => {
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    topEl.scrollLeft = tableEl.scrollLeft;
  };

  const safePageSize = Math.max(1, pageSize);
  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = startIndex + safePageSize;
  const visibleData = paginate ? data.slice(startIndex, endIndex) : data;

  useEffect(() => {
    if (!isControlledPagination) {
      setInternalPage(1);
    }
  }, [data, paginate, pageSize, isControlledPagination]);

  return (
    <>
      {/* ── Cards Mobile ─────────────────────────────────────── */}
      {hasMobileCards && (
        <div className={mobileOnlyClass}>
          {loading ? (
            <div className="py-8 text-center text-white/50">Carregando...</div>
          ) : visibleData.length === 0 ? (
            <div className="py-8 text-center text-white/50">{emptyMessage}</div>
          ) : (
            <div className="space-y-3">
              {visibleData.map((item) => {
                const rowKey = keyExtractor(item);
                const extraClass = rowClassName ? rowClassName(item) : '';
                return (
                  <div
                    key={rowKey}
                    className={extraClass}
                    onClick={
                      onRowClick
                        ? (e) =>
                            onRowClick(
                              item,
                              e as unknown as MouseEvent<HTMLTableRowElement>,
                            )
                        : undefined
                    }
                  >
                    {renderMobileCard(item)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tabela Desktop ───────────────────────────────────── */}
      <div
        className={`${hasMobileCards ? desktopOnlyClass : ''} ${
          showTopScrollbar ? 'mb-2' : 'mb-0'
        } sticky top-0 z-20 overflow-x-auto rounded-md border border-white/10 bg-neutral/95`}
        ref={topScrollRef}
        onScroll={handleTopScroll}
        style={{ visibility: showTopScrollbar ? 'visible' : 'hidden' }}
      >
        <div ref={topScrollInnerRef} className="h-2" />
      </div>
      <div
        className={`${hasMobileCards ? desktopOnlyClass : ''} overflow-x-auto rounded-xl border border-white/10 ${wrapperClassName}`}
        ref={tableScrollRef}
        onScroll={handleTableScroll}
      >
        <table className={`w-full min-w-full text-sm table-auto border-collapse ${tableClassName}`}>
          <thead className="bg-white/5 text-white/70 border-b border-white/10">
            <tr>
              {columns.map((col) => {
                if (col.renderTh) return col.renderTh();

                const align = alignClass[col.align ?? 'left'];
                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 ${align} whitespace-normal break-words ${col.thClassName ?? ''}`}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-white/50"
                >
                  Carregando...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-white/50"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleData.map((item) => {
                const rowKey = keyExtractor(item);
                const extraRowClass = rowClassName ? rowClassName(item) : '';
                const clickable = !!onRowClick;

                return (
                  <tr
                    key={rowKey}
                    className={`border-t border-white/10 hover:bg-white/5 transition-colors ${
                      clickable ? 'cursor-pointer' : ''
                    } ${extraRowClass}`}
                    onClick={
                      onRowClick ? (e) => onRowClick(item, e) : undefined
                    }
                  >
                    {columns.map((col) => {
                      const align = alignClass[col.align ?? 'left'];
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 min-w-0 whitespace-normal break-words ${align} ${col.tdClassName ?? ''}`}
                          onClick={
                            col.stopRowClick
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
                          {col.render ? col.render(item) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paginate && totalItems > 0 && (
        <TablePagination
          totalItems={totalItems}
          page={page}
          pageSize={safePageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </>
  );
}
