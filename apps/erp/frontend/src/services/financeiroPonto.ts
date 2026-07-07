import { api } from './api';
import type { RemuneracaoPontoTipo } from './rh';

export interface FinanceiroPontoLinha {
  usuarioId: number;
  nome: string;
  trabalhadoMin: number;
  horarioFlexivel: boolean;
  remuneracaoPontoTipo: RemuneracaoPontoTipo;
  valorHora: number | null;
  valorMensal: number | null;
  metaHorasMensalMin: number | null;
  valorEstimado: number | null;
  metaAtingida: boolean | null;
}

export interface FinanceiroPontoPlanejamento {
  mes: string;
  linhas: FinanceiroPontoLinha[];
}

export async function fetchFinanceiroPontoPlanejamento(mes?: string) {
  const { data } = await api.get<FinanceiroPontoPlanejamento>('/financeiro/ponto-planejamento', {
    params: mes ? { mes } : {},
  });
  return data;
}
