import type { Category, Projeto, PagoPorMetodoOption } from '../../../types/stock';
import type { PurchaseFilters as PurchaseFiltersType } from '../../../hooks/usePurchaseFilters';

interface PurchaseFiltersProps {
  filters: PurchaseFiltersType;
  setFilters: React.Dispatch<React.SetStateAction<PurchaseFiltersType>>;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  categories: Category[];
  projects: Projeto[];
  metodosPago: PagoPorMetodoOption[];
  selectedProjectFilter: number | 'all';
  setSelectedProjectFilter: (value: number | 'all') => void;
  tagOptions: string[];
}

export function PurchaseFilters({
  filters,
  setFilters,
  showFilters,
  setShowFilters,
  clearFilters,
  hasActiveFilters,
  categories,
  projects,
  metodosPago,
  selectedProjectFilter,
  setSelectedProjectFilter,
  tagOptions,
}: PurchaseFiltersProps) {
  return (
    <div className="mb-4 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
      {/* Cabeçalho do Filtro */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 text-white/70 transition-transform ${showFilters ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-white/90">Filtros de Busca</span>
        </div>
        {hasActiveFilters && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-primary/20 text-primary">
            Ativo
          </span>
        )}
      </button>

      {/* Conteúdo dos Filtros */}
      {showFilters && (
        <div className="p-4 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Busca */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
              <input
                type="text"
                placeholder="Item, descrição, solicitado por..."
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Projeto */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Projeto</label>
              <select
                value={selectedProjectFilter}
                onChange={(e) =>
                  setSelectedProjectFilter(
                    e.target.value === 'all' ? 'all' : Number(e.target.value),
                  )
                }
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  paddingRight: '2rem',
                }}
              >
                <option value="all" className="bg-neutral text-white">Todos os Projetos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-neutral text-white">
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Categoria</label>
              <select
                value={filters.categoryFilter}
                onChange={(e) => setFilters({ ...filters, categoryFilter: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  paddingRight: '2rem'
                }}
              >
                <option value="all" className="bg-neutral text-white">Todas as Categorias</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id} className="bg-neutral text-white">
                    {cat.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Método de pagamento (Pago por) */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Método pago</label>
              <select
                value={filters.metodoPagoFilter}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    metodoPagoFilter: e.target.value === 'all' ? 'all' : Number(e.target.value),
                  })
                }
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  paddingRight: '2rem',
                }}
              >
                <option value="all" className="bg-neutral text-white">
                  Todos os métodos
                </option>
                {metodosPago.map((m) => (
                  <option key={m.id} value={m.id} className="bg-neutral text-white">
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Tag</label>
              <select
                value={filters.tagFilter}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    tagFilter: e.target.value,
                  })
                }
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  paddingRight: '2rem',
                }}
              >
                <option value="all" className="bg-neutral text-white">
                  Todas as tags
                </option>
                {tagOptions.map((tag) => (
                  <option key={tag} value={tag} className="bg-neutral text-white">
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            {/* Data de Compra - Início */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Data Compra (Início)</label>
              <input
                type="date"
                value={filters.dateCompraInicio}
                onChange={(e) => setFilters({ ...filters, dateCompraInicio: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Data de Compra - Fim */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Data Compra (Fim)</label>
              <input
                type="date"
                value={filters.dateCompraFim}
                onChange={(e) => setFilters({ ...filters, dateCompraFim: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Data de Entrega - Início */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Data Entrega (Início)</label>
              <input
                type="date"
                value={filters.dateEntregaInicio}
                onChange={(e) => setFilters({ ...filters, dateEntregaInicio: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Data de Entrega - Fim */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Data Entrega (Fim)</label>
              <input
                type="date"
                value={filters.dateEntregaFim}
                onChange={(e) => setFilters({ ...filters, dateEntregaFim: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Data do pedido - Início */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Data do pedido (início)</label>
              <input
                type="date"
                value={filters.dateSolicitacaoInicio}
                onChange={(e) => setFilters({ ...filters, dateSolicitacaoInicio: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Data do pedido - Fim */}
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Data do pedido (fim)</label>
              <input
                type="date"
                value={filters.dateSolicitacaoFim}
                onChange={(e) => setFilters({ ...filters, dateSolicitacaoFim: e.target.value })}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm text-white/90 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
