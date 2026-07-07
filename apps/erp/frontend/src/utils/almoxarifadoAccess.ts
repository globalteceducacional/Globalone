/**
 * Permissões do módulo Almoxarifado (/galpao). Compatível com o legado `estoque:*`,
 * que também liberava o galpão antes da separação em `almoxarifado:*`.
 */
const VIEW_KEYS = new Set([
  'estoque:visualizar',
  'estoque:movimentar',
  'almoxarifado:visualizar',
  'almoxarifado:movimentar',
]);

const EDIT_KEYS = new Set(['estoque:movimentar', 'almoxarifado:movimentar']);

function toArray(keys: Set<string> | string[]): string[] {
  return keys instanceof Set ? [...keys] : keys;
}

/** Acesso à UI e GETs do almoxarifado (menu, relatórios, listagens). */
export function userCanViewAlmoxarifado(permissionKeys: Set<string> | string[]): boolean {
  return toArray(permissionKeys).some((k) => VIEW_KEYS.has(k));
}

/** Entradas, alocações, baixas e demais mutações no almoxarifado. */
export function userCanEditAlmoxarifado(permissionKeys: Set<string> | string[]): boolean {
  return toArray(permissionKeys).some((k) => EDIT_KEYS.has(k));
}
