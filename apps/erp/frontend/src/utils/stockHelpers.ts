import type { Cotacao, Purchase, Supplier, Category } from '../types/stock';

// Função para formatar CNPJ
export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length <= 14) {
    return cleaned
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cleaned;
}

// Função para validar CNPJ básico
export function validateCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.length === 14;
}

// Função para obter nome do fornecedor
export function getSupplierName(fornecedorId: number | undefined, suppliers: Supplier[]): string {
  if (!fornecedorId) return '-';
  const supplier = suppliers.find((s) => s.id === fornecedorId);
  return supplier ? supplier.nomeFantasia : '-';
}

export function isSignaturePurchase(p: {
  classe?: string | null;
  categoria?: Category | null;
}): boolean {
  return p.classe === 'ASSINATURA' || Boolean(p.categoria?.isAssinatura);
}

export function isDespesaPurchase(p: {
  classe?: string | null;
  categoria?: Category | null;
}): boolean {
  return p.classe === 'DESPESA' || Boolean(p.categoria?.isDespesa);
}

export function isEstoquePurchase(p: { categoria?: Category | null }): boolean {
  return !isSignaturePurchase(p) && !isDespesaPurchase(p);
}

// Função para obter nome da categoria
export function getCategoryName(categoriaId: number | undefined, categories: Category[]): string {
  if (!categoriaId) return '-';
  const category = categories.find((c) => c.id === categoriaId);
  return category ? category.nome : '-';
}

/** Valor unitário da cotação (UI usa `valorUnitario`; importação/API pode usar `valor`). */
export function getCotacaoValorUnitario(cotacao: Cotacao): number {
  const vu = cotacao.valorUnitario;
  const v = cotacao.valor;
  if (vu != null && !Number.isNaN(Number(vu))) return Number(vu);
  if (v != null && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

/** Converte cotação da API/JSON (ex.: importação com `valor`) para o formato do formulário de compra. */
export function normalizeCotacaoForForm(
  cot: Partial<Cotacao> & { valor?: number },
): Cotacao {
  return {
    valorUnitario: getCotacaoValorUnitario(cot as Cotacao),
    frete: cot.frete ?? 0,
    impostos: cot.impostos ?? 0,
    desconto: cot.desconto ?? 0,
    descontoTipo: cot.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor',
    link: cot.link ?? '',
    fornecedorId: cot.fornecedorId,
    formaPagamento: cot.formaPagamento ?? '',
  };
}

/** Subtotal dos itens: valor unitário × quantidade (frete e impostos entram uma vez na linha). */
export function getCotacaoSubtotalProdutos(cotacao: Cotacao, quantidade: number): number {
  const q = Math.max(0, Number(quantidade) || 0);
  return getCotacaoValorUnitario(cotacao) * q;
}

/** Base antes do desconto: (valor unitário × Q) + frete + impostos. */
export function getCotacaoBaseAntesDesconto(cotacao: Cotacao, quantidade: number): number {
  const fr = Number(cotacao.frete) || 0;
  const imp = Number(cotacao.impostos) || 0;
  return getCotacaoSubtotalProdutos(cotacao, quantidade) + fr + imp;
}

/**
 * Valor total do desconto na linha (R$).
 * - valor: desconto fixo em R$ sobre o pedido (não multiplica pela quantidade).
 * - porcentagem: sobre (VU×Q + frete + impostos).
 */
export function getCotacaoDescontoTotal(cotacao: Cotacao, quantidade: number): number {
  const base = getCotacaoBaseAntesDesconto(cotacao, quantidade);
  const tipo = cotacao.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor';
  const v = Number(cotacao.desconto) || 0;
  if (tipo === 'porcentagem') {
    return base * (v / 100);
  }
  return Math.min(Math.max(0, v), base);
}

/** Valor total da cotação para a quantidade informada (≥ 0). */
export function calculateCotacaoTotal(cotacao: Cotacao, quantidade: number): number {
  const base = getCotacaoBaseAntesDesconto(cotacao, quantidade);
  return Math.max(0, base - getCotacaoDescontoTotal(cotacao, quantidade));
}

/** Fonte mínima para calcular valor de linha de compra (lista, relatório, PDF). */
export type PurchaseValueSource = {
  quantidade?: number;
  valorUnitario?: number;
  cotacoesJson?: Cotacao[] | null;
  cotacaoSelecionadaIndex?: number | null;
};

export function getPurchaseCotacoes(purchase: PurchaseValueSource): Cotacao[] {
  if (!purchase.cotacoesJson || !Array.isArray(purchase.cotacoesJson)) return [];
  return purchase.cotacoesJson.map((c) => normalizeCotacaoForForm(c));
}

/** Índice da cotação usada na aprovação rápida (selecionada ou primeira com valor). */
export function resolvePurchaseApproveCotacaoIndex(purchase: PurchaseValueSource): number | null {
  const cotacoes = getPurchaseCotacoes(purchase);
  if (cotacoes.length === 0) return null;
  const pref = Math.min(Math.max(0, purchase.cotacaoSelecionadaIndex ?? 0), cotacoes.length - 1);
  if (getCotacaoValorUnitario(cotacoes[pref]) > 0) return pref;
  const found = cotacoes.findIndex((c) => getCotacaoValorUnitario(c) > 0);
  return found >= 0 ? found : null;
}

export function canApprovePurchaseWithExistingCotacoes(purchase: PurchaseValueSource): boolean {
  return resolvePurchaseApproveCotacaoIndex(purchase) != null;
}

/** Payload para aprovar solicitação sem alterar cotações (aprovação em massa). */
export function buildQuickApprovePurchasePayload(purchase: Purchase) {
  const cotacoes = getPurchaseCotacoes(purchase);
  const selectedCotacaoIndex = resolvePurchaseApproveCotacaoIndex(purchase);
  const qty = purchase.quantidade;
  if (selectedCotacaoIndex == null || qty == null || qty <= 0) return null;
  return {
    cotacoes,
    selectedCotacaoIndex,
    withChanges: false as const,
    approvedQuantity: qty,
    categoriaId: purchase.categoriaId || undefined,
  };
}

/**
 * Valor total da compra para relatórios e totais.
 * Prioriza a cotação selecionada (`cotacaoSelecionadaIndex`); senão, a menor cotação válida;
 * por último, `valorUnitario × quantidade` (ex.: após aprovação).
 */
export function getPurchaseLineTotal(purchase: PurchaseValueSource): number {
  const qty = Math.max(0, Number(purchase.quantidade) || 0);
  const qCalc = qty > 0 ? qty : 1;
  const cotacoes = getPurchaseCotacoes(purchase);

  if (cotacoes.length > 0) {
    const idx = Math.min(Math.max(0, purchase.cotacaoSelecionadaIndex ?? 0), cotacoes.length - 1);
    const fromSelected = calculateCotacaoTotal(cotacoes[idx], qCalc);
    if (fromSelected > 0) return fromSelected;

    let best = 0;
    for (const cot of cotacoes) {
      const t = calculateCotacaoTotal(cot, qCalc);
      if (t <= 0) continue;
      if (best === 0 || t < best) best = t;
    }
    if (best > 0) return best;
  }

  return (Number(purchase.valorUnitario) || 0) * qty;
}

/** Valor unitário efetivo (total da linha ÷ quantidade). */
export function getPurchaseLineUnitValue(purchase: PurchaseValueSource): number {
  const qty = Math.max(0, Number(purchase.quantidade) || 0);
  const total = getPurchaseLineTotal(purchase);
  if (qty > 0) return total / qty;
  return Number(purchase.valorUnitario) || 0;
}

/**
 * Custo médio por unidade (total da linha ÷ quantidade), para exibição e custo no estoque.
 * Se quantidade ≤ 0, assume 1 unidade para evitar divisão por zero.
 */
export function getCotacaoValorMedioPorUnidade(cotacao: Cotacao, quantidade: number): number {
  const qRaw = Number(quantidade) || 0;
  const q = qRaw > 0 ? qRaw : 1;
  return calculateCotacaoTotal(cotacao, q) / q;
}

// Função para formatar valor em BRL
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Texto curto para células de tabela/cards; use `title={textoCompleto}` no elemento para ver tudo. */
export function truncateDisplayText(
  value: string | null | undefined,
  maxChars = 80,
): string {
  const s = String(value ?? '');
  if (maxChars < 2) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 1)}…`;
}

// Função para formatar data
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR');
}

// Função para formatar data e hora
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('pt-BR');
}

// Função para obter label de status
/** Compras de assinatura: na UI usamos só Pendente / Pago (Pago = ENTREGUE no backend). */
export function getAssinaturaCompraStatusLabel(status: string): string {
  if (status === 'ENTREGUE') return 'Pago';
  return 'Pendente';
}

export function getAssinaturaCompraStatusColor(status: string): string {
  if (status === 'ENTREGUE') {
    return 'bg-green-500/20 text-green-300 border border-green-500/40';
  }
  return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
}

export function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    PENDENTE: 'Pendente',
    COMPRADO_ACAMINHO: 'Comprado/A Caminho',
    ENTREGUE: 'Entregue',
    SOLICITADO: 'Solicitado',
    REPROVADO: 'Reprovado',
    NAO_ENTREGUE: 'Não Entregue',
    PARCIAL: 'Não Entregue',
    CANCELADO: 'Cancelado',
    DISPONIVEL: 'Disponível',
    ALOCADO: 'Alocado',
  };
  return statusMap[status] || status;
}

// Função para obter cor de status
export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    PENDENTE: 'bg-yellow-500/20 text-yellow-400',
    COMPRADO_ACAMINHO: 'bg-blue-500/20 text-blue-400',
    ENTREGUE: 'bg-green-500/20 text-green-400',
    SOLICITADO: 'bg-purple-500/20 text-purple-400',
    REPROVADO: 'bg-red-500/20 text-red-400',
    NAO_ENTREGUE: 'bg-orange-500/20 text-orange-400',
    PARCIAL: 'bg-orange-500/20 text-orange-400',
    CANCELADO: 'bg-gray-500/20 text-gray-400',
    DISPONIVEL: 'bg-green-500/20 text-green-400',
    ALOCADO: 'bg-blue-500/20 text-blue-400',
  };
  return colorMap[status] || 'bg-white/20 text-white';
}

// Função para atualizar cotação em formulário
export function updateCotacao<T extends { cotacoes: Cotacao[] }>(
  form: T,
  setForm: (f: T) => void,
  index: number,
  field: keyof Cotacao,
  value: any
) {
  const newCotacoes = [...form.cotacoes];
  newCotacoes[index] = { ...newCotacoes[index], [field]: value };
  setForm({ ...form, cotacoes: newCotacoes });
}

// Função para adicionar cotação
export function addCotacao<T extends { cotacoes: Cotacao[] }>(
  form: T,
  setForm: (f: T) => void
) {
  setForm({
    ...form,
    cotacoes: [
      ...form.cotacoes,
      { valorUnitario: 0, frete: 0, impostos: 0, desconto: 0, descontoTipo: 'valor', link: '', fornecedorId: undefined, formaPagamento: '' },
    ],
  });
}

// Função para remover cotação
export function removeCotacao<T extends { cotacoes: Cotacao[]; selectedCotacaoIndex?: number }>(
  form: T,
  setForm: (f: T) => void,
  index: number
) {
  if (form.cotacoes.length > 1) {
    const newCotacoes = form.cotacoes.filter((_, i) => i !== index);
    const newSelectedIndex = form.selectedCotacaoIndex !== undefined
      ? Math.min(form.selectedCotacaoIndex, newCotacoes.length - 1)
      : undefined;
    setForm({ ...form, cotacoes: newCotacoes, selectedCotacaoIndex: newSelectedIndex });
  }
}

// Função para comprimir imagem
export async function compressImage(base64: string, maxWidth: number = 800, quality: number = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = base64;
  });
}

// Função para lidar com upload de imagem
export async function handleImageUpload(file: File, maxWidth: number = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      try {
        const compressed = await compressImage(base64, maxWidth);
        resolve(compressed);
      } catch {
        resolve(base64);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
