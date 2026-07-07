import { attachmentDisplayName, parseAttachments } from '../../utils/attachmentUrls';
import { getFilePreviewKind } from '../../utils/filePreview';
import { urlsToViewerItems, useFileViewer } from '../../contexts/FileViewerContext';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';

type Props = {
  /** Campo único, JSON array ou lista de URLs */
  raw?: string | string[] | null;
  title?: string;
  /** list = links; grid = miniaturas para imagens + links para o resto */
  variant?: 'list' | 'grid';
  className?: string;
};

export function AttachmentList({
  raw,
  title = 'Anexos',
  variant = 'list',
  className = '',
}: Props) {
  const { openViewer } = useFileViewer();

  const attachments = Array.isArray(raw)
    ? raw
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter(Boolean)
        .map((url) => ({ url }))
    : parseAttachments(typeof raw === 'string' ? raw : null);

  if (attachments.length === 0) return null;

  const items = urlsToViewerItems(
    attachments.map((a) => a.url),
    (_, i) => attachmentDisplayName(attachments[i]!, i, title === 'Imagens' ? 'Imagem' : 'Arquivo'),
  );

  const openAt = (index: number) => {
    openViewer(items, index);
  };

  if (variant === 'grid') {
    return (
      <div className={`space-y-2 ${className}`}>
        {title ? <span className="text-white/60 text-sm block">{title}</span> : null}
        <div className="flex flex-wrap gap-2">
          {attachments.map((entry, i) => {
            const u = entry.url;
            const kind = getFilePreviewKind(u);
            const label = attachmentDisplayName(entry, i, title === 'Imagens' ? 'Imagem' : 'Arquivo');
            if (kind === 'image') {
              return (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  onClick={() => openAt(i)}
                  className="group relative w-16 h-16 rounded-md overflow-hidden border border-white/15 hover:border-primary/80 transition-colors"
                  title={label}
                >
                  <img
                    src={resolvePublicUploadUrl(u)}
                    alt={label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </button>
              );
            }
            return (
              <button
                key={`${u}-${i}`}
                type="button"
                onClick={() => openAt(i)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 border border-white/15 text-[11px] text-white/85 hover:border-primary hover:text-primary"
                title={label}
              >
                <span aria-hidden>📎</span>
                <span className="max-w-[8rem] truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-4 space-y-2 ${className}`}>
      {title ? <span className="text-white/60 text-sm block">{title}</span> : null}
      <ul className="space-y-1.5">
        {attachments.map((entry, i) => {
          const u = entry.url;
          return (
          <li key={`${u}-${i}`}>
            <button
              type="button"
              onClick={() => openAt(i)}
              className="text-primary hover:underline text-sm text-left break-all"
            >
              {attachmentDisplayName(entry, i)}
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
