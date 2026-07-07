import { api } from '../services/api';

/**
 * URL para arquivos públicos do backend (`/uploads/...`).
 * Em dev, o API costuma ser outra origem (ex.: :3000); em produção, `/uploads` costuma estar na mesma origem do site (não sob `/api`).
 */
export function resolvePublicAssetUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const p = path.trim();
  if (p.startsWith('http://') || p.startsWith('https://')) return p;

  if (p.startsWith('/uploads')) {
    // Arquivos estáticos ficam em /uploads (proxy Vite em dev, Nginx em prod) — não sob /api.
    return p;
  }

  const base = (api.defaults.baseURL ?? '').replace(/\/+$/, '');
  if (!base) return p.startsWith('/') ? p : `/${p}`;
  return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`;
}
