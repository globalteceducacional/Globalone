import type { Usuario } from '../types';
import { getPaginasPermitidas, userHasAnyPermission } from './projectAccess';

/** Permissões por aba do Financeiro e Planejamento. */
export const FINANCEIRO_PERMS = {
  todas: 'financeiro:visualizar',
  visao: 'financeiro:visao',
  ponto: 'financeiro:ponto',
  pagamentos: 'financeiro:pagamentos',
  projetos: 'financeiro:projetos',
  curadoria: 'financeiro:curadoria',
  compras: 'financeiro:compras',
} as const;

const CHAVES_ABAS = [
  FINANCEIRO_PERMS.visao,
  FINANCEIRO_PERMS.ponto,
  FINANCEIRO_PERMS.pagamentos,
  FINANCEIRO_PERMS.projetos,
  FINANCEIRO_PERMS.curadoria,
  FINANCEIRO_PERMS.compras,
] as const;

export function temFinanceiroCompleto(user: Usuario | null): boolean {
  return userHasAnyPermission(user, FINANCEIRO_PERMS.todas, 'sistema:administrar');
}

/** Acesso à rota /financeiro (menu lateral). */
export function temAcessoFinanceiro(user: Usuario | null): boolean {
  if (!user) return false;
  if (getPaginasPermitidas(user).includes('/financeiro')) return true;
  return userHasAnyPermission(user, FINANCEIRO_PERMS.todas, ...CHAVES_ABAS);
}

/** Uma ou mais abas do financeiro (financeiro:visualizar libera todas). */
export function temAbaFinanceiro(user: Usuario | null, ...abaPerms: string[]): boolean {
  if (!user) return false;
  if (temFinanceiroCompleto(user)) return true;
  if (getPaginasPermitidas(user).includes('/financeiro')) return true;
  return userHasAnyPermission(user, ...abaPerms);
}

export function temAbaFinanceiroPontoPagamentos(user: Usuario | null): boolean {
  return temAbaFinanceiro(
    user,
    FINANCEIRO_PERMS.ponto,
    FINANCEIRO_PERMS.pagamentos,
    'banco_horas:ver_todos',
    'banco_horas:fechar',
    'jornada:configurar',
  );
}
