// Constantes relacionadas ao módulo de Estoque

// Opções de status de entrega
export const STATUS_ENTREGA_OPTIONS = [
  { value: 'NAO_ENTREGUE', label: 'Não Entregue' },
  { value: 'ENTREGUE', label: 'Entregue' },
  { value: 'CANCELADO', label: 'Cancelado' },
] as const;

// Opções de forma de pagamento
export const FORMAS_PAGAMENTO = [
  'Cartão de Crédito',
  'Cartão de Débito',
  'Pix',
  'Boleto',
  'Transferência Bancária',
  'Dinheiro',
  'Bônus',
  'Outro',
] as const;

// Status de compra com labels
export const PURCHASE_STATUS = {
  PENDENTE: { value: 'PENDENTE', label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400' },
  COMPRADO_ACAMINHO: { value: 'COMPRADO_ACAMINHO', label: 'Comprado/A Caminho', color: 'bg-blue-500/20 text-blue-400' },
  ENTREGUE: { value: 'ENTREGUE', label: 'Entregue', color: 'bg-green-500/20 text-green-400' },
  SOLICITADO: { value: 'SOLICITADO', label: 'Solicitado', color: 'bg-purple-500/20 text-purple-400' },
  REPROVADO: { value: 'REPROVADO', label: 'Reprovado', color: 'bg-red-500/20 text-red-400' },
} as const;

// Valores iniciais para formulários
export const INITIAL_COTACAO = {
  valorUnitario: 0,
  frete: 0,
  impostos: 0,
  desconto: 0,
  descontoTipo: 'valor' as const,
  link: '',
  fornecedorId: undefined,
  formaPagamento: '',
};

export const INITIAL_ITEM_FORM = {
  item: '',
  codigo: '',
  categoriaId: undefined,
  descricao: '',
  quantidade: 1,
  valorUnitario: 0,
  unidadeMedida: 'UN',
  localizacao: '',
  imagemUrl: '',
};

export const INITIAL_PURCHASE_FORM = {
  item: '',
  codigo: '',
  categoria: '',
  descricao: '',
  quantidade: 1,
  unidadeMedida: 'UN',
  localizacao: '',
  imagemUrls: [] as string[],
  nfUrls: [] as string[],
  comprovanteUrls: [] as string[],
  cotacoes: [{ ...INITIAL_COTACAO }],
  projetoId: 0,
  selectedCotacaoIndex: 0,
  dataCompra: '',
  categoriaId: undefined,
  observacao: '',
};

export const INITIAL_SUPPLIER_FORM = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  endereco: '',
  contato: '',
  ativo: true,
};

export const INITIAL_CATEGORY_FORM = {
  nome: '',
  descricao: '',
  tipo: 'ITEM' as const,
  isAssinatura: false,
  isDespesa: false,
};

export const INITIAL_ALOCACAO_FORM = {
  projetoId: undefined,
  etapaId: undefined,
  usuarioId: undefined,
  quantidade: 1,
};

// Unidades de medida
export const UNIDADES_MEDIDA = [
  'UN',
  'KG',
  'G',
  'L',
  'ML',
  'M',
  'CM',
  'M²',
  'M³',
  'CX',
  'PCT',
  'ROL',
  'FD',
  'PAR',
  'JG',
] as const;
