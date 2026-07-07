/** Rótulos do termo de confidencialidade (tipo interno: estagiario). */
export const TERMO_CONFIDENCIALIDADE = {
  titulo: 'Termo de Confidencialidade',
  tituloCurto: 'Termo Confidencialidade',
  publico: 'Funcionários, estagiários e pesquisadores',
  descricao:
    'Termo autônomo de confidencialidade, sigilo, proteção de informações, PI, LGPD e segurança da informação para colaboradores.',
  icone: '📋',
} as const;

export type TipoVinculoColaborador = 'funcionario' | 'estagiario' | 'pesquisador';

export const TIPOS_VINCULO: { id: TipoVinculoColaborador; label: string }[] = [
  { id: 'funcionario', label: 'Funcionário' },
  { id: 'estagiario', label: 'Estagiário' },
  { id: 'pesquisador', label: 'Pesquisador' },
];

export function labelTipoVinculo(tipo: TipoVinculoColaborador): string {
  return TIPOS_VINCULO.find((t) => t.id === tipo)?.label ?? tipo;
}
