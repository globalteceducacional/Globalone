/**
 * Converte data vinda da API (ISO) para o formato exigido por `<input type="date">` (YYYY-MM-DD).
 * Usa componentes UTC para alinhar ao armazenamento típico de “só data” no backend.
 */
export function toDateInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Exibe data “somente dia” em DD/MM/AAAA usando os mesmos componentes UTC que {@link toDateInputValue}.
 * Evita deslocar um dia ao formatar em fuso local (ex.: Brasil) quando a API envia meia-noite UTC.
 */
export function formatDateOnlyPtBr(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const y = d.getUTCFullYear();
  return `${day}/${month}/${y}`;
}
