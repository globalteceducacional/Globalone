import type { MouseEvent, ReactNode } from 'react';
import { urlsToViewerItems, useFileViewer, type FileViewerItem } from '../../contexts/FileViewerContext';
import { fileDisplayName, getFilePreviewKind } from '../../utils/filePreview';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';

type Props = {
  src: string;
  name?: string;
  /** Galeria: todos os arquivos e índice do atual */
  gallery?: { items: FileViewerItem[]; index: number };
  variant?: 'link' | 'thumbnail' | 'chip';
  className?: string;
  children?: ReactNode;
  title?: string;
};

/** Botão/link que abre o visualizador interno de arquivos. */
export function FilePreviewTrigger({
  src,
  name,
  gallery,
  variant = 'link',
  className = '',
  children,
  title,
}: Props) {
  const { openViewer } = useFileViewer();
  const label = name ?? fileDisplayName(src, 0);

  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (gallery && gallery.items.length > 0) {
      openViewer(gallery.items, gallery.index);
      return;
    }
    openViewer([{ src, name: label }], 0);
  };

  if (variant === 'thumbnail' && getFilePreviewKind(src) === 'image') {
    return (
      <button
        type="button"
        onClick={open}
        className={
          className ||
          'group relative rounded-md overflow-hidden border border-white/15 hover:border-primary/80 transition-colors'
        }
        title={title ?? label}
      >
        {children ?? (
          <img
            src={resolvePublicUploadUrl(src)}
            alt={label}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        )}
      </button>
    );
  }

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={open}
        className={
          className ||
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/15 text-[11px] text-white/85 hover:border-primary hover:text-primary'
        }
        title={title ?? label}
      >
        {children ?? (
          <>
            <span aria-hidden>📎</span>
            <span className="max-w-[10rem] truncate">{label}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={className || 'text-primary hover:underline text-sm text-left'}
      title={title ?? label}
    >
      {children ?? label}
    </button>
  );
}

/** Atalho: abre visualizador a partir de várias URLs. */
export function openFilesInViewer(
  openViewer: (items: FileViewerItem[], startIndex?: number) => void,
  urls: string[],
  startIndex = 0,
) {
  const items = urlsToViewerItems(urls);
  if (items.length > 0) openViewer(items, startIndex);
}
