import { api } from './api';
import type { RemuneracaoPontoTipo } from './rh';

export interface FinanceiroPagamentoLinha {
  usuarioId: number;
  nome: string;
  remuneracaoPontoTipo: RemuneracaoPontoTipo;
  trabalhadoMin: number;
  horasBasePagasMin: number;
  extraBancoMin: number;
  extrasPagosMin: number;
  saldoAnteriorMin: number;
  saldoMesMin: number;
  saldoAcumuladoMin: number;
  deficitMesMin: number;
  descontoDeficit: number | null;
  fechado: boolean;
  valorHoraEfetivo: number | null;
  valorBase: number | null;
  valorExtras: number | null;
  valorTotal: number | null;
  metaAtingida: boolean | null;
}

export interface FinanceiroPagamentosMensais {
  mes: string;
  linhas: FinanceiroPagamentoLinha[];
}

export async function fetchFinanceiroPagamentosMensais(mes?: string) {
  const { data } = await api.get<FinanceiroPagamentosMensais>('/financeiro/pagamentos-mensais', {
    params: mes ? { mes } : {},
  });
  return data;
}
