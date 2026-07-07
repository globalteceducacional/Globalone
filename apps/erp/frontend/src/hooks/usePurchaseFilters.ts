import { useState, useMemo, useEffect } from 'react';
import type { Purchase, PurchaseSubTab, SortDirection, PagoPorMetodoOption } from '../types/stock';
import { purchaseMatchesMetodoPago } from '../utils/pagoPor';

export interface PurchaseFilters {
  searchTerm: string;
  categoryFilter: number | 'all';
  metodoPagoFilter: number | 'all';
  tagFilter: string | 'all';
  dateCompraInicio: string;
  dateCompraFim: string;
  dateEntregaInicio: string;
  dateEntregaFim: string;
  dateSolicitacaoInicio: string;
  dateSolicitacaoFim: string;
}

export interface UsePurchaseFiltersReturn {
  // Sub-aba
  subTab: PurchaseSubTab;
  setSubTab: (tab: PurchaseSubTab) => void;
  
  // Filtros
  filters: PurchaseFilters;
  setFilters: React.Dispatch<React.SetStateAction<PurchaseFilters>>;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  
  // Ordenação
  sortColumn: string | null;
  sortDirection: SortDirection;
  handleSort: (column: string) => void;
  
  // Dados filtrados
  filteredPurchases: Purchase[];
  sortedPurchases: Purchase[];
  purchaseCounts: {
    pendente: number;
    'a-caminho': number;
    entregue: number;
    despesas: number;
    assinaturas: number;
  };
}

const INITIAL_FILTERS: PurchaseFilters = {
  searchTerm: '',
  categoryFilter: 'all',
  metodoPagoFilter: 'all',
  tagFilter: 'all',
  dateCompraInicio: '',
  dateCompraFim: '',
  dateEntregaInicio: '',
  dateEntregaFim: '',
  dateSolicitacaoInicio: '',
  dateSolicitacaoFim: '',
};

export function usePurchaseFilters(
  purchases: Purchase[],
  activeTab: 'estoque' | 'compras' | 'solicitacoes',
  selectedProjectFilter: number | 'all',
  searchTerm: string,
  metodosPago: PagoPorMetodoOption[] = [],
): UsePurchaseFiltersReturn {
  const [subTab, setSubTab] = useState<PurchaseSubTab>('pendente');
  const [filters, setFilters] = useState<PurchaseFilters>(INITIAL_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Resetar filtros ao sair da aba de compras
  useEffect(() => {
    if (activeTab !== 'compras') {
      setShowFilters(false);
      setFilters(INITIAL_FILTERS);
    }
  }, [activeTab]);

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchTerm !== '' ||
      filters.categoryFilter !== 'all' ||
      filters.metodoPagoFilter !== 'all' ||
      filters.tagFilter !== 'all' ||
      filters.dateCompraInicio !== '' ||
      filters.dateCompraFim !== '' ||
      filters.dateEntregaInicio !== '' ||
      filters.dateEntregaFim !== '' ||
      filters.dateSolicitacaoInicio !== '' ||
      filters.dateSolicitacaoFim !== ''
    );
  }, [filters]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Contadores para sub-abas
  const purchaseCounts = useMemo(() => ({
    pendente: purchases.filter(
      (p) =>
        p.status === 'PENDENTE' &&
        p.classe !== 'ASSINATURA' &&
        p.classe !== 'DESPESA' &&
        !p.categoria?.isAssinatura &&
        !p.categoria?.isDespesa,
    ).length,
    'a-caminho': purchases.filter(
      (p) =>
        p.status === 'COMPRADO_ACAMINHO' &&
        p.classe !== 'ASSINATURA' &&
        p.classe !== 'DESPESA' &&
        !p.categoria?.isAssinatura &&
        !p.categoria?.isDespesa,
    ).length,
    entregue: purchases.filter(
      (p) =>
        p.status === 'ENTREGUE' &&
        p.classe !== 'ASSINATURA' &&
        p.classe !== 'DESPESA' &&
        !p.categoria?.isAssinatura &&
        !p.categoria?.isDespesa,
    ).length,
    despesas: purchases.filter((p) => p.classe === 'DESPESA' || Boolean(p.categoria?.isDespesa)).length,
    assinaturas: purchases.filter((p) => p.classe === 'ASSINATURA' || Boolean(p.categoria?.isAssinatura)).length,
  }), [purchases]);

  // Filtrar purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      // Excluir REPROVADO de todas as abas
      if (purchase.status === 'REPROVADO') {
        return false;
      }

      // Excluir SOLICITADO da aba Compras
      if (activeTab === 'compras' && purchase.status === 'SOLICITADO') {
        return false;
      }

      // Filtrar por sub-aba na aba Compras
      if (activeTab === 'compras') {
        const isAssinatura =
          purchase.classe === 'ASSINATURA' || Boolean(purchase.categoria?.isAssinatura);
        const isDespesa = purchase.classe === 'DESPESA' || Boolean(purchase.categoria?.isDespesa);
        if (subTab === 'assinaturas') {
          if (!isAssinatura) return false;
        } else if (subTab === 'despesas') {
          if (!isDespesa) return false;
        } else if (isAssinatura || isDespesa) {
          return false;
        }

        if (subTab === 'pendente' && purchase.status !== 'PENDENTE') {
          return false;
        }
        if (subTab === 'a-caminho' && purchase.status !== 'COMPRADO_ACAMINHO') {
          return false;
        }
        if (subTab === 'entregue' && purchase.status !== 'ENTREGUE') {
          return false;
        }
      }

      // Solicitações: somente itens realmente aguardando aprovação
      if (activeTab === 'solicitacoes') {
        if (purchase.status !== 'SOLICITADO') {
          return false;
        }
      }

      // Filtro por projeto
      if (selectedProjectFilter !== 'all') {
        if (purchase.projetoId !== selectedProjectFilter) {
          return false;
        }
      }

      // Filtros específicos da aba de compras
      if (activeTab === 'compras') {
        // Filtro por categoria
        if (filters.categoryFilter !== 'all') {
          if (purchase.categoriaId !== filters.categoryFilter) {
            return false;
          }
        }

        // Filtro por método de pagamento (Pago por)
        if (filters.metodoPagoFilter !== 'all') {
          const mid = filters.metodoPagoFilter;
          const nomeMetodo = metodosPago.find((m) => m.id === mid)?.nome;
          if (!purchaseMatchesMetodoPago(purchase.pagoPorJson, mid, nomeMetodo)) {
            return false;
          }
        }

        // Filtro por tag
        if (filters.tagFilter !== 'all') {
          const tags = Array.isArray(purchase.tagsJson) ? purchase.tagsJson : [];
          const hasTag = tags.some(
            (t) => String(t?.nome || '').toLowerCase() === filters.tagFilter.toLowerCase(),
          );
          if (!hasTag) {
            return false;
          }
        }

        // Filtro por busca
        if (filters.searchTerm.trim()) {
          const searchLower = filters.searchTerm.toLowerCase();
          const itemName = purchase.item?.toLowerCase() || '';
          const itemDesc = purchase.descricao?.toLowerCase() || '';
          const solicitadoPor = purchase.solicitadoPor?.nome?.toLowerCase() || '';
          const tagsTexto = Array.isArray(purchase.tagsJson)
            ? purchase.tagsJson.map((t) => String(t?.nome || '').toLowerCase()).join(' ')
            : '';
          if (
            !itemName.includes(searchLower) &&
            !itemDesc.includes(searchLower) &&
            !solicitadoPor.includes(searchLower) &&
            !tagsTexto.includes(searchLower)
          ) {
            return false;
          }
        }

        // Filtro por data de compra
        if (filters.dateCompraInicio || filters.dateCompraFim) {
          if (!purchase.dataCompra) {
            return false;
          }
          const dataCompra = new Date(purchase.dataCompra);
          if (filters.dateCompraInicio) {
            const inicio = new Date(filters.dateCompraInicio);
            inicio.setHours(0, 0, 0, 0);
            if (dataCompra < inicio) {
              return false;
            }
          }
          if (filters.dateCompraFim) {
            const fim = new Date(filters.dateCompraFim);
            fim.setHours(23, 59, 59, 999);
            if (dataCompra > fim) {
              return false;
            }
          }
        }

        // Filtro por data de entrega
        if (filters.dateEntregaInicio || filters.dateEntregaFim) {
          if (!purchase.dataEntrega) {
            return false;
          }
          const dataEntrega = new Date(purchase.dataEntrega);
          if (filters.dateEntregaInicio) {
            const inicio = new Date(filters.dateEntregaInicio);
            inicio.setHours(0, 0, 0, 0);
            if (dataEntrega < inicio) {
              return false;
            }
          }
          if (filters.dateEntregaFim) {
            const fim = new Date(filters.dateEntregaFim);
            fim.setHours(23, 59, 59, 999);
            if (dataEntrega > fim) {
              return false;
            }
          }
        }

        // Filtro por data de solicitação
        if (filters.dateSolicitacaoInicio || filters.dateSolicitacaoFim) {
          if (!purchase.dataSolicitacao) {
            return false;
          }
          const dataSolicitacao = new Date(purchase.dataSolicitacao);
          if (filters.dateSolicitacaoInicio) {
            const inicio = new Date(filters.dateSolicitacaoInicio);
            inicio.setHours(0, 0, 0, 0);
            if (dataSolicitacao < inicio) {
              return false;
            }
          }
          if (filters.dateSolicitacaoFim) {
            const fim = new Date(filters.dateSolicitacaoFim);
            fim.setHours(23, 59, 59, 999);
            if (dataSolicitacao > fim) {
              return false;
            }
          }
        }
      } else {
        // Filtro por busca (para outras abas)
        if (searchTerm.trim()) {
          const searchLower = searchTerm.toLowerCase();
          const itemName = purchase.item?.toLowerCase() || '';
          const itemDesc = purchase.descricao?.toLowerCase() || '';
          const solicitadoPor = purchase.solicitadoPor?.nome?.toLowerCase() || '';
          const projetoNome = (purchase as any).projeto?.nome?.toLowerCase?.() || '';
          const setorNome = (purchase as any).setor?.nome?.toLowerCase?.() || '';
          if (
            !itemName.includes(searchLower) &&
            !itemDesc.includes(searchLower) &&
            !solicitadoPor.includes(searchLower) &&
            !projetoNome.includes(searchLower) &&
            !setorNome.includes(searchLower)
          ) {
            return false;
          }
        }
      }

      return true;
    });
  }, [purchases, activeTab, subTab, selectedProjectFilter, searchTerm, filters, metodosPago]);

  // Ordenar purchases
  const sortedPurchases = useMemo(() => {
    if (!sortColumn) return filteredPurchases;

    return [...filteredPurchases].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'item':
          aValue = a.item?.toLowerCase() || '';
          bValue = b.item?.toLowerCase() || '';
          break;
        case 'quantidade':
          aValue = a.quantidade || 0;
          bValue = b.quantidade || 0;
          break;
        case 'cotacoes':
          aValue = a.cotacoesJson?.length || 0;
          bValue = b.cotacoesJson?.length || 0;
          break;
        case 'categoria':
          aValue = a.categoriaId || 0;
          bValue = b.categoriaId || 0;
          break;
        case 'solicitadoPor':
          aValue = a.solicitadoPor?.nome?.toLowerCase() || '';
          bValue = b.solicitadoPor?.nome?.toLowerCase() || '';
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'entrega':
          aValue = a.dataEntrega ? new Date(a.dataEntrega).getTime() : a.previsaoEntrega ? new Date(a.previsaoEntrega).getTime() : 0;
          bValue = b.dataEntrega ? new Date(b.dataEntrega).getTime() : b.previsaoEntrega ? new Date(b.previsaoEntrega).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPurchases, sortColumn, sortDirection]);

  return {
    subTab,
    setSubTab,
    filters,
    setFilters,
    showFilters,
    setShowFilters,
    clearFilters,
    hasActiveFilters,
    sortColumn,
    sortDirection,
    handleSort,
    filteredPurchases,
    sortedPurchases,
    purchaseCounts,
  };
}
