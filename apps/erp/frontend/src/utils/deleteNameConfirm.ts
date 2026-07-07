/** Remove zero-width e caracteres invisíveis comuns em cópia/colar. */
const INVISIBLE = /[\u200B-\u200D\uFEFF\u2060\u00AD]/g;

/**
 * Comparação tolerante: espaços/hífens unicode, ignora acentos e caixa (pt-BR),
 * remove caracteres invisíveis e **colapsa vários espaços seguidos** em um só
 * (ex.: nome cadastrado com "-  " e digitação com "- ").
 */
export function normalizeNameForDeleteConfirm(value: string): string {
  const base = String(value ?? '')
    .replace(INVISIBLE, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return base.toLocaleLowerCase('pt-BR');
}

export function namesMatchForDeleteConfirm(a: string, b: string): boolean {
  return normalizeNameForDeleteConfirm(a) === normalizeNameForDeleteConfirm(b);
}
