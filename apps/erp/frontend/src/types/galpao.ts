import type { Category } from './stock';

export interface GalpaoProduto {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  dataCriacao: string;
}

export interface LivroDisponivel {
  isbn: string;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidadeTotal: number;
  quantidadeDisponivel: number;
  quantidadeReservadaTotal: number;
  quantidadeAvariasTotal?: number;
  valorMedio: number;
  descontoMedio: number;
  valorTotal: number;
  autor?: string | null;
  editora?: string | null;
  anoPublicacao?: string | null;
}

export interface LivroDisponivelPorFornecedor {
  fornecedorId: number;
  fornecedorNome: string;
  quantidadeDisponivel: number;
}

export interface LivroReservado {
  isbn: string;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidade: number;
  fornecedorId?: number | null;
  fornecedorNome?: string | null;
  valorMedio?: number;
  descontoMedio?: number;
  valorTotal?: number;
}

export interface LivroAlocadoReport {
  id: number;
  isbn: string;
  titulo: string;
  autor?: string | null;
  editora?: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidade: number;
  produto?: { id: number; nome: string } | null;
  fornecedor?: { id: number; nome: string } | null;
  dataReserva: string;
}

export interface LivroAvariaReport {
  id: number;
  isbn: string;
  titulo: string;
  autor?: string | null;
  editora?: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidade: number;
  justificativa: string;
  produto?: { id: number; nome: string } | null;
  fornecedor?: { id: number; nome: string } | null;
  projeto?: { id: number; nome: string } | null;
  dataCriacao: string;
}

export interface OutrosItemDisponivel {
  id: number;
  item: string;
  descricao?: string | null;
  imagemUrl?: string | null;
  quantidade?: number;
  valorUnitario: number;
  categoriaId?: number | null;
  categoria?: Category | null;
  quantidadeDisponivel: number;
  quantidadeAlocada: number;
}

export interface OutrosItemAlocado {
  id: number;
  estoqueId: number;
  quantidade: number;
  projetoId: number | null;
  etapaId: number | null;
  usuarioId: number | null;
  estoque: OutrosItemDisponivel;
}

export interface OutrosItemAvaria {
  id: number;
  estoqueId: number;
  galpaoProdutoId: number | null;
  quantidade: number;
  justificativa: string;
  dataCriacao: string;
  galpaoProduto?: { id: number; nome: string } | null;
}

/** Orçamento de curadoria em "Comprado / A caminho" (lista no almoxarifado). */
export interface CuradoriaOrcamentoACaminhoRow {
  id: number;
  nome: string;
  dataCriacao: string;
  projeto: { id: number; nome: string } | null;
  fornecedor: { id: number; nomeFantasia: string; razaoSocial: string } | null;
  quantidadeItens: number;
}

