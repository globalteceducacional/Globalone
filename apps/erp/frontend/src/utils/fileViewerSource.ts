import { api } from '../services/api';
import {
  getFilePreviewKind,
  isModel3dPreviewKind,
  isOfficePreviewKind,
  type FilePreviewKind,
} from './filePreview';
import { resolvePublicUploadUrl, stripDisplayFileName } from './uploadFile';

export type LoadedViewerSource = {
  displayUrl: string;
  kind: FilePreviewKind;
  mimeType: string;
  revoke?: () => void;
};

/** Extrai `/uploads/...` ou `/uploads-protegido/...` de path relativo ou URL absoluta do backend. */
export function resolveUploadPath(src: string): string | null {
  const trimmed = stripDisplayFileName(src.trim());
  if (!trimmed || trimmed.startsWith('data:')) return null;

  if (trimmed.startsWith('/uploads-protegido/') || trimmed.startsWith('/uploads/')) {
    return trimmed;
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    const rel = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    if (rel.startsWith('/uploads-protegido/') || rel.startsWith('/uploads/')) return rel;
    return null;
  }

  try {
    const u = new URL(trimmed);
    const path = u.pathname + u.search;
    if (path.startsWith('/uploads-protegido/') || path.startsWith('/uploads/')) return path;
  } catch {
    /* ignore */
  }
  return null;
}

/** Em dev, uploads passam pelo proxy do Vite (mesma origem) para evitar CORS em arquivos estáticos. */
function uploadRequestConfig(path: string): { baseURL?: string } {
  const isUpload =
    path.startsWith('/uploads-protegido/') || path.startsWith('/uploads/');
  if (!isUpload) return {};

  if (import.meta.env.DEV) return { baseURL: '' };

  const base = api.defaults.baseURL || '';
  if (base === '/api' || base === '') return { baseURL: '' };
  return {};
}

async function loadAsBlob(path: string): Promise<LoadedViewerSource> {
  const { data } = await api.get<Blob>(path, {
    responseType: 'blob',
    ...uploadRequestConfig(path),
  });
  const objectUrl = URL.createObjectURL(data);
  const mime = data.type || 'application/octet-stream';
  return {
    displayUrl: objectUrl,
    kind: getFilePreviewKind(path, mime),
    mimeType: mime,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

/**
 * Resolve URL/path do ERP para exibição no visualizador interno.
 * Rotas protegidas usam blob autenticado; públicas usam URL direta ou blob quando necessário.
 */
export async function loadViewerSource(src: string): Promise<LoadedViewerSource> {
  const trimmed = src.trim();
  if (!trimmed) {
    throw new Error('Arquivo inválido');
  }

  if (trimmed.startsWith('data:')) {
    const mime = trimmed.match(/^data:([^;,]+)/)?.[1] ?? '';
    return {
      displayUrl: trimmed,
      kind: getFilePreviewKind(trimmed, mime),
      mimeType: mime,
    };
  }

  const rel = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? resolveUploadPath(trimmed) ?? trimmed
    : trimmed.startsWith('/')
      ? trimmed
      : `/${trimmed}`;

  if (rel.includes('/uploads-protegido/')) {
    return loadAsBlob(rel);
  }

  const publicUrl = resolvePublicUploadUrl(trimmed);
  const kind = getFilePreviewKind(trimmed);
  const uploadPath = resolveUploadPath(trimmed) ?? resolveUploadPath(publicUrl);

  if (
    uploadPath &&
    (kind === 'pdf' ||
      kind === 'text' ||
      kind === 'markdown' ||
      isOfficePreviewKind(kind) ||
      isModel3dPreviewKind(kind) ||
      kind === 'unsupported')
  ) {
    try {
      return await loadAsBlob(uploadPath);
    } catch (err) {
      if (isOfficePreviewKind(kind) || isModel3dPreviewKind(kind)) {
        throw err instanceof Error ? err : new Error('Não foi possível carregar o arquivo');
      }
    }
  }

  return {
    displayUrl: publicUrl,
    kind,
    mimeType: '',
  };
}

/** Carrega bytes de upload (ou blob/data URL) sem fetch cross-origin. */
export async function fetchUploadAsArrayBuffer(src: string): Promise<ArrayBuffer> {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const res = await fetch(src);
    if (!res.ok) throw new Error('Não foi possível carregar o arquivo');
    return res.arrayBuffer();
  }

  const path = resolveUploadPath(src);
  if (!path) throw new Error('Não foi possível carregar o arquivo');

  const { data } = await api.get<Blob>(path, {
    responseType: 'blob',
    ...uploadRequestConfig(path),
  });
  return data.arrayBuffer();
}
