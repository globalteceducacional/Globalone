import { api } from '../services/api';

/** Campos de anexo em formulários de compra (estoque). */
export type PurchaseAttachmentField = 'imagemUrl' | 'nfUrl' | 'comprovantePagamentoUrl';

export interface UploadResult {
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
}

const DISPLAY_NAME_QUERY = 'fn';

/** Remove metadado de nome de exibição da URL (path real do arquivo no servidor). */
export function stripDisplayFileName(url: string): string {
  const t = url.trim();
  const q = t.indexOf('?');
  if (q === -1) return t;
  const base = t.slice(0, q);
  const params = new URLSearchParams(t.slice(q + 1));
  params.delete(DISPLAY_NAME_QUERY);
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

/** Nome amigável embutido na query string (`?fn=...`). */
export function extractDisplayFileName(url: string): string | null {
  const q = url.indexOf('?');
  if (q === -1) return null;
  try {
    const fn = new URLSearchParams(url.slice(q + 1)).get(DISPLAY_NAME_QUERY);
    if (!fn) return null;
    return decodeURIComponent(fn);
  } catch {
    return null;
  }
}

/** Preserva o nome original do arquivo na URL persistida, sem alterar o path no servidor. */
export function withDisplayFileName(url: string, originalName?: string | null): string {
  const cleanUrl = stripDisplayFileName(url);
  const name = originalName?.trim();
  if (!name) return cleanUrl;
  const sep = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${sep}${DISPLAY_NAME_QUERY}=${encodeURIComponent(name)}`;
}

/**
 * Envia um ou mais arquivos via FormData para POST /uploads.
 * Retorna a lista de URLs públicas persistidas no storage do servidor.
 */
export async function uploadFiles(files: File[]): Promise<UploadResult[]> {
  if (files.length === 0) return [];

  const form = new FormData();
  for (const f of files) {
    form.append('files', f);
  }

  const { data } = await api.post<UploadResult[]>('/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data.map((item) => ({
    ...item,
    url: withDisplayFileName(item.url, item.originalName),
  }));
}

/**
 * Envia um único arquivo e retorna a URL pública.
 * Retorna `null` se o arquivo for nulo/undefined.
 */
export async function uploadSingleFile(
  file: File | null | undefined,
): Promise<string | null> {
  if (!file) return null;
  const results = await uploadFiles([file]);
  return results[0]?.url ?? null;
}

/**
 * Verifica se o valor já é uma URL persistida (não precisa re-upload).
 */
export function isPersistedUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = stripDisplayFileName(value.trim());
  return (
    v.startsWith('/uploads/') ||
    v.startsWith('http://') ||
    v.startsWith('https://')
  );
}

/**
 * URL absoluta para abrir ou exibir arquivo servido pelo backend.
 * Evita `<a href="/uploads/...">` no Vite (5173), que navega para o front e “reinicia” a SPA.
 */
export function resolvePublicUploadUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return '';
  const p = pathOrUrl.trim();
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) {
    return p;
  }
  if (!p.startsWith('/')) {
    return p;
  }

  const base = api.defaults.baseURL || '';
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base.replace(/\/+$/, '')}${p}`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin.replace(/\/+$/, '')}${p}`;
  }
  return p;
}

/** URL para requisição ao arquivo no servidor (sem metadado de nome na query). */
export function resolveUploadFetchUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return '';
  return resolvePublicUploadUrl(stripDisplayFileName(pathOrUrl.trim()));
}
