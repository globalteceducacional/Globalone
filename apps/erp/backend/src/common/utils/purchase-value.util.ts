type CotacaoLike = {
  valorUnitario?: number | null;
  frete?: number | null;
  impostos?: number | null;
  desconto?: number | null;
  descontoTipo?: string | null;
};

export type PurchaseValueSource = {
  quantidade?: number | null;
  valorUnitario?: number | null;
  cotacoesJson?: unknown;
  cotacaoSelecionadaIndex?: number | null;
};

function cotacaoBaseAntesDesconto(c: CotacaoLike, quantidade: number): number {
  const vu = Number(c?.valorUnitario ?? 0);
  const q = Math.max(0, Math.floor(Number(quantidade) || 0));
  const fr = Number(c?.frete ?? 0);
  const im = Number(c?.impostos ?? 0);
  return vu * q + fr + im;
}

function descontoTotalCotacao(c: CotacaoLike, quantidade: number): number {
  const base = cotacaoBaseAntesDesconto(c, quantidade);
  const tipo = c?.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor';
  const v = Number(c?.desconto ?? 0);
  if (tipo === 'porcentagem') {
    return base * (v / 100);
  }
  return Math.min(Math.max(0, v), base);
}

function calculateCotacaoTotal(c: CotacaoLike, quantidade: number): number {
  const base = cotacaoBaseAntesDesconto(c, quantidade);
  return Math.max(0, base - descontoTotalCotacao(c, quantidade));
}

function getPurchaseCotacoes(purchase: PurchaseValueSource): CotacaoLike[] {
  if (!purchase.cotacoesJson || !Array.isArray(purchase.cotacoesJson)) return [];
  return purchase.cotacoesJson as CotacaoLike[];
}

/** Valor total da linha de compra (mesma regra do frontend `getPurchaseLineTotal`). */
export function getPurchaseLineTotal(purchase: PurchaseValueSource): number {
  const qty = Math.max(0, Number(purchase.quantidade) || 0);
  const qCalc = qty > 0 ? qty : 1;
  const cotacoes = getPurchaseCotacoes(purchase);

  if (cotacoes.length > 0) {
    const idx = Math.min(
      Math.max(0, purchase.cotacaoSelecionadaIndex ?? 0),
      cotacoes.length - 1,
    );
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
