import { api } from '../services/api';
import { formatApiError, toast } from './toast';

/**
 * Abre arquivo do RH em nova aba.
 * Rotas `/uploads-protegido/...` exigem JWT — não dá para usar `<a href>` em produção
 * (nova aba não envia Bearer). Fazemos GET com axios e abrimos um blob URL.
 * Rotas públicas `/uploads/...` abrem na mesma origem (Nginx deve repassar ao backend).
 */
export async function openRhFileInNewTab(path: string | null | undefined): Promise<void> {
  const p = path?.trim();
  if (!p) return;

  if (p.startsWith('http://') || p.startsWith('https://')) {
    window.open(p, '_blank', 'noopener,noreferrer');
    return;
  }

  const rel = p.startsWith('/') ? p : `/${p}`;

  if (rel.includes('/uploads-protegido/')) {
    try {
      const { data } = await api.get<Blob>(rel, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(data);
      const w = window.open(blobUrl, '_blank', 'noopener,noreferrer');
      if (!w) {
        toast.error('Permita pop-ups para ver o arquivo.');
        URL.revokeObjectURL(blobUrl);
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
    } catch (e) {
      toast.error(formatApiError(e));
    }
    return;
  }

  const url = `${window.location.origin}${rel}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
