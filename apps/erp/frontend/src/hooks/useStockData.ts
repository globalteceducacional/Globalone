import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { toast, formatApiError } from '../utils/toast';
import type { 
  StockItem, 
  Purchase, 
  Projeto, 
  Etapa, 
  Supplier, 
  Category, 
  SimpleUser,
  Alocacao,
  PagoPorMetodoOption,
} from '../types/stock';

export interface UseStockDataReturn {
  // Dados
  items: StockItem[];
  purchases: Purchase[];
  projects: Projeto[];
  etapas: Etapa[];
  suppliers: Supplier[];
  categories: Category[];
  users: SimpleUser[];
  metodosPago: PagoPorMetodoOption[];
  
  // Estados de carregamento
  loading: boolean;
  error: string | null;
  
  // Funções de carregamento
  load: () => Promise<void>;
  loadUsers: () => Promise<void>;
  loadMetodosPago: () => Promise<void>;
  loadEtapas: (projetoId: number) => Promise<Etapa[]>;
  loadAlocacoes: (estoqueId: number) => Promise<Alocacao[]>;
  
  // Setters
  setItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
  setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>;
  setEtapas: React.Dispatch<React.SetStateAction<Etapa[]>>;
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
}

export function useStockData(): UseStockDataReturn {
  const [items, setItems] = useState<StockItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [metodosPago, setMetodosPago] = useState<PagoPorMetodoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, purchasesRes, projectsRes, suppliersRes, categoriesRes] = await Promise.all([
        api.get<StockItem[]>('/stock/items'),
        api.get<Purchase[]>('/stock/purchases'),
        api.get<Projeto[]>('/projects/options?todas=1'),
        api.get<Supplier[]>('/suppliers'),
        api.get<Category[]>('/categories?tipo=ITEM'),
      ]);
      setItems(itemsRes.data);
      setPurchases(purchasesRes.data);
      setProjects(projectsRes.data);
      setSuppliers(suppliersRes.data);
      setCategories(categoriesRes.data);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get<SimpleUser[]>('/users/options');
      setUsers(data);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  }, []);

  const loadMetodosPago = useCallback(async () => {
    try {
      const { data } = await api.get<PagoPorMetodoOption[]>('/stock/pago-por-metodos');
      setMetodosPago(data);
    } catch (err) {
      console.error('Erro ao carregar métodos de pagamento:', err);
    }
  }, []);

  const loadEtapas = useCallback(async (projetoId: number): Promise<Etapa[]> => {
    try {
      const { data } = await api.get(`/projects/${projetoId}`);
      const etapasData = data?.etapas || [];
      setEtapas(etapasData);
      return etapasData;
    } catch (err) {
      console.error('Erro ao carregar etapas:', err);
      setEtapas([]);
      return [];
    }
  }, []);

  const loadAlocacoes = useCallback(async (estoqueId: number): Promise<Alocacao[]> => {
    try {
      const { data } = await api.get<Alocacao[]>(`/stock/items/${estoqueId}/alocacoes`);
      return data;
    } catch (err) {
      console.error('Erro ao carregar alocações:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    load();
    loadUsers();
    loadMetodosPago();
  }, [load, loadUsers, loadMetodosPago]);

  return {
    items,
    purchases,
    projects,
    etapas,
    suppliers,
    categories,
    users,
    metodosPago,
    loading,
    error,
    load,
    loadUsers,
    loadMetodosPago,
    loadEtapas,
    loadAlocacoes,
    setItems,
    setPurchases,
    setEtapas,
    setSuppliers,
    setCategories,
  };
}
