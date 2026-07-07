// Tipos e interfaces relacionados ao módulo de Estoque

/** Método de pagamento cadastrado (lista em «Pago por»). */
export interface PagoPorMetodoOption {
  id: number;
  nome: string;
}

/** Quem efetivou o pagamento ou método usado (lista na compra). */
export type PagoPorEntry =
  | { tipo: 'usuario'; usuarioId: number; nome: string }
  | { tipo: 'pessoa'; nome: string }
  /** metodoId 0 = ainda não selecionado; descricao espelha o nome exibido (e legado só-texto). */
  | { tipo: 'metodo'; metodoId: number; descricao: string };

export interface Cotacao {
  valorUnitario?: number;
  /** Mesmo significado que `valorUnitario` (ex.: importação em lote grava `valor`). */
  valor?: number;
  frete?: number;
  impostos?: number;
  desconto?: number;
  /** 'valor' = desconto fixo em R$ na linha; 'porcentagem' = sobre (valorUnitario×Q + frete + impostos) */
  descontoTipo?: 'valor' | 'porcentagem';
  link?: string;
  fornecedorId?: number;
  /** Texto do fornecedor (importação / cotação sem ID). */
  fornecedor?: string;
  formaPagamento?: string;
}

export interface SimpleUser {
  id: number;
  nome: string;
}

/** Compra vinculada a uma entrada de estoque (snapshot ao entregar). */
export interface StockItemEntradaCompra {
  id: number;
  dataCompra?: string | null;
  dataEntrega?: string | null;
  dataSolicitacao?: string | null;
  dataConfirmacao?: string | null;
  status?: string;
}

/** Uma entrega de compra que incrementou o estoque (mesmo item em datas diferentes). */
export interface StockItemEntrada {
  id: number;
  compraId: number;
  quantidade: number;
  valorUnitario: number;
  cotacoesJson?: Cotacao[] | null;
  nfUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  formaPagamento?: string | null;
  observacao?: string | null;
  dataEntrada: string;
  compra?: StockItemEntradaCompra | null;
}

export interface StockItem {
  id: number;
  item: string;
  quantidade: number;
  valorUnitario: number;
  status: string;
  descricao?: string | null;
  imagemUrl?: string | null;
  /** Preenchido na edição manual ou ao consolidar compra entregue no estoque. */
  nfUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  cotacoesJson?: Cotacao[] | null;
  projetoId?: number | null;
  etapaId?: number | null;
  quantidadeAlocada?: number;
  quantidadeDisponivel?: number;
  /** Histórico de entradas a partir de compras entregues (API inclui após migração). */
  entradas?: StockItemEntrada[];
}

export type CompraClasse = 'ESTOQUE' | 'DESPESA' | 'ASSINATURA';

export interface Purchase {
  id: number;
  item: string;
  quantidade: number;
  valorUnitario: number;
  status: string;
  /** Classe do lançamento (estoque, despesa ou assinatura), independente da categoria. */
  classe?: CompraClasse;
  projetoId: number;
  setorId?: number | null;
  setor?: { id: number; nome: string } | null;
  descricao?: string | null;
  imagemUrl?: string | null;
  nfUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  cotacoesJson?: Cotacao[] | null;
  dataCompra?: string | null;
  dataSolicitacao?: string | null;
  dataConfirmacao?: string | null;
  formaPagamento?: string | null;
  statusEntrega?: string | null;
  previsaoEntrega?: string | null;
  dataEntrega?: string | null;
  enderecoEntrega?: string | null;
  recebidoPor?: string | null;
  observacao?: string | null;
  pagoPorJson?: PagoPorEntry[] | null;
  solicitadoPorId?: number | null;
  /** Preenchido quando SOLICITADO → PENDENTE; permite «Editar aprovação». */
  solicitacaoAprovadaEm?: string | null;
  cotacaoSelecionadaIndex?: number | null;
  solicitadoPor?: { id: number; nome: string; cargo?: { nome: string } } | null;
  categoriaId?: number | null;
  projeto?: Projeto | null;
  categoria?: Category | null;
  motivoRejeicao?: string | null;
  tagsJson?: PurchaseTag[] | null;
  assinaturaConfirmadaMes?: string | null;
  /** Preenchido quando a lista de compras é carregada com `mesReferenciaAssinatura`. */
  assinaturaMesSelecionado?: SignatureMonthEntry | null;
}

/** Registro mensal de NF/comprovante da assinatura (competência YYYY-MM). */
export interface SignatureMonthEntry {
  id: number;
  compraId: number;
  mesReferencia: string;
  nfUrl?: string | null;
  comprovantePagamentoUrl?: string | null;
  confirmadoEm?: string;
  confirmadoPorId?: number | null;
  observacao?: string | null;
}

/** Resposta de GET /stock/purchases/signatures/report — só itens com NF e comprovante do mês. */
export interface SignatureMonthReportResponse {
  mesReferencia: string;
  totalItens: number;
  itens: Array<{
    compra: Purchase;
    mes: {
      mesReferencia: string;
      nfUrl: string | null;
      comprovantePagamentoUrl: string | null;
      observacao?: string | null;
      confirmadoEm?: string;
    };
  }>;
}

export interface PurchaseTag {
  nome: string;
  cor: string;
}

export interface Projeto {
  id: number;
  nome: string;
}

export interface Etapa {
  id: number;
  nome: string;
}

export interface Supplier {
  id: number;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  ativo: boolean;
}

export interface Category {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  tipo?: 'ITEM' | 'LIVRO';
  entraNoEstoque?: boolean;
  permiteAlocacao?: boolean;
  isAssinatura?: boolean;
  /** Despesa avulsa (passagem, maquiagem, etc.) — sem estoque e sem recorrência. */
  isDespesa?: boolean;
  recorrenciaMensal?: boolean;
}

export interface Alocacao {
  id: number;
  estoqueId: number;
  projetoId?: number | null;
  etapaId?: number | null;
  usuarioId?: number | null;
  quantidade: number;
  projeto?: Projeto | null;
  etapa?: Etapa | null;
  usuario?: SimpleUser | null;
}

export interface CreateItemForm {
  item: string;
  codigo?: string;
  categoria?: string;
  descricao: string;
  /** `null` = campo vazio no formulário (usuário apagou o valor). */
  quantidade: number | null;
  valorUnitario: number | null;
  unidadeMedida?: string;
  localizacao?: string;
  imagemUrl: string;
  categoriaId?: number;
  nfUrl?: string;
  comprovantePagamentoUrl?: string;
  cotacoes?: Cotacao[];
  selectedCotacaoIndex?: number;
}

/** Uma linha de item em solicitação / nova compra (vários itens no mesmo envio). */
export interface PurchaseLineItem {
  item: string;
  descricao?: string;
  observacao?: string;
  quantidade: number | null;
  cotacoes: Cotacao[];
  selectedCotacaoIndex?: number;
  projetoId?: number;
  categoriaId?: number;
  setorId?: number;
}

export interface CreatePurchaseForm extends Omit<
  CreateItemForm,
  'valorUnitario' | 'imagemUrl' | 'nfUrl' | 'comprovantePagamentoUrl'
> {
  projetoId: number;
  setorId?: number;
  /** Usuário vinculado como solicitante; se omitido na criação, usa o usuário logado. */
  solicitadoPorId?: number;
  cotacoes: Cotacao[];
  selectedCotacaoIndex: number;
  dataCompra?: string;
  categoriaId?: number;
  observacao?: string;
  pagoPor?: PagoPorEntry[];
  /** URLs já persistidas (parseadas do campo único da API). */
  imagemUrls: string[];
  nfUrls: string[];
  comprovanteUrls: string[];
}

export interface AlocacaoForm {
  projetoId?: number;
  etapaId?: number;
  usuarioId?: number;
  quantidade: number;
}

export interface SupplierForm {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  contato: string;
  ativo: boolean;
}

export interface CategoryForm {
  nome: string;
  descricao: string;
  tipo?: 'ITEM' | 'LIVRO';
  /** Categoria usada para compras tipo assinatura (mensal, sem estoque). */
  isAssinatura?: boolean;
  /** Categoria de despesa operacional (sem estoque, sem assinatura). */
  isDespesa?: boolean;
}

// Tipos para abas
export type StockTab = 'estoque' | 'compras' | 'solicitacoes';
export type PurchaseSubTab = 'pendente' | 'a-caminho' | 'entregue' | 'despesas' | 'assinaturas';

export type PurchaseModalMode = 'compra' | 'assinatura' | 'despesa';
export type SortDirection = 'asc' | 'desc';

// Status de compra
export type PurchaseStatus = 
  | 'PENDENTE' 
  | 'COMPRADO_ACAMINHO' 
  | 'ENTREGUE' 
  | 'SOLICITADO' 
  | 'REPROVADO';

// Status de entrega
export type DeliveryStatus = 
  | 'NAO_ENTREGUE' 
  | 'ENTREGUE' 
  | 'CANCELADO';
