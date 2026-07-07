import { Usuario } from '../types';
import { getPaginasPermitidas, TASKS_ROUTE } from './projectAccess';
import { userCanViewAlmoxarifado } from './almoxarifadoAccess';

/**
 * Retorna a primeira página permitida para o usuário baseado nas permissões do cargo
 */
export function getFirstAllowedPage(user: Usuario | null): string {
  if (!user) {
    return '/login';
  }

  let paginasPermitidas = [...getPaginasPermitidas(user)];

  // Se o usuário tiver permissões para o Galpão, garantimos uma rota inicial para `/galpao`.
  if (typeof user.cargo !== 'string') {
    const permissionKeys = Array.isArray(user.cargo.permissions)
      ? user.cargo.permissions.map((p) => p.chave ?? `${p.modulo}:${p.acao}`)
      : [];
    const hasGalpao = userCanViewAlmoxarifado(permissionKeys);
    if (hasGalpao && !paginasPermitidas.includes('/galpao')) {
      paginasPermitidas = ['/galpao', ...paginasPermitidas];
    }
  }

  if (paginasPermitidas.length === 0) {
    return TASKS_ROUTE;
  }

  if (paginasPermitidas.includes('/dashboard')) {
    return '/dashboard';
  }

  return paginasPermitidas[0];
}
