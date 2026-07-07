interface TablePaginationProps {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Padrão: [10, 20, 50, 100] */
  pageSizeOptions?: number[];
  className?: string;
}

/**
 * Controles de paginação (linhas por página + anterior/próxima).
 * Usado pelo DataTable e por listas customizadas (ex.: aba Compras em Stock).
 */
export function TablePagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}: TablePaginationProps) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = startIndex + safePageSize;

  if (totalItems <= 0) {
    return null;
  }

  return (
    <div
      className={`mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-white/70 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>Linhas por página</span>
        <select
          value={safePageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) || safePageSize)}
          className="bg-neutral border border-white/20 rounded px-2 py-1 text-xs text-white"
          aria-label="Linhas por página"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt} className="bg-neutral text-white">
              {opt}
            </option>
          ))}
        </select>
        <span>
          {startIndex + 1}-{Math.min(endIndex, totalItems)} de {totalItems}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-2 py-1 rounded border border-white/20 disabled:opacity-50"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          Anterior
        </button>
        <span>
          Página {currentPage} de {totalPages}
        </span>
        <button
          type="button"
          className="px-2 py-1 rounded border border-white/20 disabled:opacity-50"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
