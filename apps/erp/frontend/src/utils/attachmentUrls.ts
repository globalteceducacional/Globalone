/**
 * Anexos de compra/estoque: um único URL legado, JSON `["url1","url2"]`
 * ou `[{"url":"...","name":"arquivo.pdf"}]` no mesmo campo TEXT.
 */

import { extractDisplayFileName } from './uploadFile';
import { fileDisplayName } from './filePreview';

export type AttachmentEntry = {
  url: string;
  name?: string;
};

function normalizeAttachmentEntry(value: unknown): AttachmentEntry | null {
  if (typeof value === 'string') {
    const url = value.trim();
    if (!url) return null;
    const name = extractDisplayFileName(url) ?? undefined;
    return name ? { url, name } : { url };
  }
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
    const url = String((value as { url: string }).url).trim();
    if (!url) return null;
    const explicitName =
      typeof (value as { name?: unknown }).name === 'string'
        ? String((value as { name: string }).name).trim()
        : '';
    const name = explicitName || extractDisplayFileName(url) || undefined;
    return name ? { url, name } : { url };
  }
  return null;
}

export function parseAttachments(value: string | null | undefined): AttachmentEntry[] {
  if (value == null) return [];
  const t = String(value).trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const p = JSON.parse(t) as unknown;
      if (!Array.isArray(p)) return [];
      return p
        .map((item) => normalizeAttachmentEntry(item))
        .filter((item): item is AttachmentEntry => item !== null);
    } catch {
      return [];
    }
  }
  const single = normalizeAttachmentEntry(t);
  return single ? [single] : [];
}

export function parseAttachmentUrls(value: string | null | undefined): string[] {
  return parseAttachments(value).map((item) => item.url);
}

export function attachmentDisplayName(entry: AttachmentEntry, index = 0, fallbackPrefix = 'Arquivo'): string {
  if (entry.name?.trim()) return entry.name.trim();
  return fileDisplayName(entry.url, index, fallbackPrefix);
}

/** Persistência: 0 → null; 1 → string única (compatível com registros antigos); N → JSON array. */
export function serializeAttachmentUrls(urls: (string | null | undefined)[] | null | undefined): string | null {
  if (!urls?.length) return null;
  const cleaned = urls.map((u) => String(u ?? '').trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0]!;
  return JSON.stringify(cleaned);
}

export function hasAnyAttachmentUrl(value: string | null | undefined): boolean {
  return parseAttachmentUrls(value).length > 0;
}

/** Primeira URL útil para miniatura (imagem). */
export function firstDisplayableImageUrl(raw: string | null | undefined): string | null {
  for (const u of parseAttachmentUrls(raw)) {
    if (
      u.startsWith('data:image/') ||
      u.startsWith('http://') ||
      u.startsWith('https://') ||
      u.startsWith('/uploads/')
    ) {
      return u;
    }
  }
  return null;
}
