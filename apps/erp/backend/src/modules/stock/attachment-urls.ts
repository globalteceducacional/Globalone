/** Mesma convenção do front: um URL ou JSON `["a","b"]` no campo TEXT. */

export function parseAttachmentUrls(value: string | null | undefined): string[] {
  if (value == null) return [];
  const t = String(value).trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const p = JSON.parse(t) as unknown;
      if (!Array.isArray(p)) return [];
      return p
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim());
    } catch {
      return [];
    }
  }
  return [t];
}

export function assinaturaMesTemNfEComprovante(
  nfUrl: string | null | undefined,
  comprovantePagamentoUrl: string | null | undefined,
): boolean {
  return (
    parseAttachmentUrls(nfUrl).length > 0 &&
    parseAttachmentUrls(comprovantePagamentoUrl).length > 0
  );
}
