import type { Cotacao, PagoPorEntry, PurchaseLineItem } from '../types/stock';
import { getCotacaoValorMedioPorUnidade } from './stockHelpers';
import { pagoPorToApiPayload } from './pagoPor';

export function createEmptyPurchaseLineItem(): PurchaseLineItem {
  return {
    item: '',
    descricao: '',
    observacao: '',
    quantidade: 1,
    cotacoes: [createEmptyCotacao()],
    selectedCotacaoIndex: 0,
  };
}

export function createEmptyCotacao(): Cotacao {
  return {
    valorUnitario: 0,
    frete: 0,
    impostos: 0,
    desconto: 0,
    descontoTipo: 'valor',
    link: '',
    fornecedorId: undefined,
    formaPagamento: '',
  };
}

export function sanitizeCotacoesForPayload(cotacoes: Cotacao[]): Cotacao[] {
  return (cotacoes ?? [])
    .map((cot) => {
      const valorUnitario = Number(cot.valorUnitario) || 0;
      const frete = Number(cot.frete) || 0;
      const impostos = Number(cot.impostos) || 0;
      const desconto = Number(cot.desconto) || 0;

      if (valorUnitario <= 0 || frete < 0 || impostos < 0) return null;

      const sanitized: Cotacao = {
        valorUnitario,
        frete,
        impostos,
      };

      if (desconto > 0) {
        sanitized.desconto = desconto;
        sanitized.descontoTipo = cot.descontoTipo || 'valor';
      }

      if (cot.link && cot.link.trim().length > 0) {
        sanitized.link = cot.link.trim();
      }

      if (cot.fornecedorId) {
        sanitized.fornecedorId = Number(cot.fornecedorId);
      }

      if (cot.formaPagamento && cot.formaPagamento.trim().length > 0) {
        sanitized.formaPagamento = cot.formaPagamento.trim();
      }

      return sanitized;
    })
    .filter((cot): cot is Cotacao => cot !== null);
}

/** Custo médio por unidade da cotação (total da linha ÷ quantidade), alinhado a `calculateCotacaoTotal`. */
export function getSelectedCotacaoUnitValue(cotacao?: Cotacao | null, quantidade = 1): number | null {
  if (!cotacao) return null;
  const q = Math.max(1, Number(quantidade) || 1);
  const total = Number(getCotacaoValorMedioPorUnidade(cotacao, q).toFixed(2));
  if (Number.isNaN(total) || total <= 0) return null;
  return total;
}

export type PurchasePayloadShared = {
  projetoId?: number;
  etapaId?: number;
  setorId?: number;
  solicitadoPorId?: number;
  dataCompra?: string;
  categoriaId?: number;
  observacao?: string;
  pagoPor?: PagoPorEntry[];
  imagemUrl?: string;
  nfUrl?: string;
  comprovantePagamentoUrl?: string;
};

/** Monta o body de POST /stock/purchases para uma linha de item. */
export function buildPurchasePayloadFromLine(
  line: PurchaseLineItem,
  shared: PurchasePayloadShared,
  options?: { assinaturaMode?: boolean; classe?: 'ESTOQUE' | 'DESPESA' | 'ASSINATURA' },
): Record<string, unknown> | null {
  const item = line.item?.trim() ?? '';
  if (!item) return null;
  const qCompra = Math.max(1, Number(line.quantidade) || 1);
  const payload: Record<string, unknown> = {
    item,
    quantidade: qCompra,
    valorUnitario: 0,
  };

  if (shared.projetoId) payload.projetoId = Number(shared.projetoId);
  if (shared.etapaId) payload.etapaId = Number(shared.etapaId);
  if (shared.setorId) payload.setorId = Number(shared.setorId);
  if (shared.solicitadoPorId) payload.solicitadoPorId = Number(shared.solicitadoPorId);

  const desc = line.descricao?.trim() || shared.observacao?.trim();
  if (desc) payload.descricao = desc;
  if (line.observacao?.trim()) payload.observacao = line.observacao.trim();

  const pagoPor = pagoPorToApiPayload(shared.pagoPor ?? []);
  if (pagoPor.length > 0) payload.pagoPor = pagoPor;

  if (shared.imagemUrl) payload.imagemUrl = shared.imagemUrl;
  if (shared.nfUrl) payload.nfUrl = shared.nfUrl;
  if (shared.comprovantePagamentoUrl) payload.comprovantePagamentoUrl = shared.comprovantePagamentoUrl;
  if (shared.dataCompra?.trim()) payload.dataCompra = shared.dataCompra.trim();
  if (shared.categoriaId) payload.categoriaId = Number(shared.categoriaId);

  if (options?.classe) {
    payload.classe = options.classe;
  } else if (options?.assinaturaMode) {
    payload.classe = 'ASSINATURA';
  }

  const cotacoesFiltradas = sanitizeCotacoesForPayload(line.cotacoes ?? []);
  if (cotacoesFiltradas.length > 0) {
    const selIdx = Math.min(
      Math.max(0, line.selectedCotacaoIndex ?? 0),
      cotacoesFiltradas.length - 1,
    );
    const selected = cotacoesFiltradas[selIdx];
    const totalPorUnidade = getSelectedCotacaoUnitValue(selected, qCompra);
    if (totalPorUnidade != null) {
      payload.valorUnitario = totalPorUnidade;
    }
    if (options?.assinaturaMode) {
      payload.cotacoes = cotacoesFiltradas.map((cot) => ({
        ...cot,
        frete: 0,
      }));
    } else {
      payload.cotacoes = cotacoesFiltradas;
    }
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== null),
  );
}
