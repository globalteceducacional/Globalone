import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FileViewerItem } from '../../contexts/FileViewerContext';
import {
  fileDisplayName,
  fileKindLabel,
  getFilePreviewKind,
  isModel3dPreviewKind,
  isOfficePreviewKind,
  type FilePreviewKind,
} from '../../utils/filePreview';
import {
  fetchUploadAsArrayBuffer,
  loadViewerSource,
  type LoadedViewerSource,
} from '../../utils/fileViewerSource';
import { resolvePublicUploadUrl } from '../../utils/uploadFile';
import { OfficeFileViewer } from './OfficeFileViewer';
import { btn } from '../../utils/buttonStyles';

const Model3dViewer = lazy(() =>
  import('./Model3dViewer').then((m) => ({ default: m.Model3dViewer })),
);

const MarkdownFileViewer = lazy(() =>
  import('./MarkdownFileViewer').then((m) => ({ default: m.MarkdownFileViewer })),
);

const PdfFileViewer = lazy(() =>
  import('./PdfFileViewer').then((m) => ({ default: m.PdfFileViewer })),
);

type Props = {
  items: FileViewerItem[];
  initialIndex: number;
  onClose: () => void;
};

export function FileViewerModal({ items, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedViewerSource | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [officeBuffer, setOfficeBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [model3dBuffer, setModel3dBuffer] = useState<ArrayBuffer | null>(null);

  const revokeRef = useRef<(() => void) | null>(null);
  /** Início do gesto horizontal para trocar de arquivo (toque ou mouse). */
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const current = items[index];
  const name = current?.name || fileDisplayName(current?.src ?? '', index);

  const cleanup = useCallback(() => {
    revokeRef.current?.();
    revokeRef.current = null;
    setLoaded(null);
    setTextContent(null);
    setOfficeBuffer(null);
    setPdfBuffer(null);
    setModel3dBuffer(null);
  }, []);

  const loadBinaryPreview = useCallback(async (src: string, displayUrl: string) => {
    const buffer =
      displayUrl.startsWith('blob:') || displayUrl.startsWith('data:')
        ? await fetchUploadAsArrayBuffer(displayUrl)
        : await fetchUploadAsArrayBuffer(src);
    return buffer;
  }, []);

  const loadCurrent = useCallback(async () => {
    if (!current?.src) return;
    const incomingKind = getFilePreviewKind(current.src);

    setLoading(true);
    setError(null);
    revokeRef.current?.();
    revokeRef.current = null;
    setTextContent(null);
    if (!isOfficePreviewKind(incomingKind)) setOfficeBuffer(null);
    if (incomingKind !== 'pdf') setPdfBuffer(null);
    if (!isModel3dPreviewKind(incomingKind)) setModel3dBuffer(null);

    try {
      const result = await loadViewerSource(current.src);
      revokeRef.current = result.revoke ?? null;
      setLoaded(result);

      if (result.kind === 'text' || result.kind === 'markdown') {
        try {
          if (result.displayUrl.startsWith('blob:') || result.displayUrl.startsWith('data:')) {
            const res = await fetch(result.displayUrl);
            const text = await res.text();
            setTextContent(text.slice(0, 500_000));
          } else {
            const buf = await fetchUploadAsArrayBuffer(current.src);
            const text = new TextDecoder().decode(buf);
            setTextContent(text.slice(0, 500_000));
          }
        } catch {
          setTextContent(null);
        }
      } else if (isOfficePreviewKind(result.kind)) {
        const buf = await loadBinaryPreview(current.src, result.displayUrl);
        setOfficeBuffer(buf);
      } else if (result.kind === 'pdf') {
        const buf = await loadBinaryPreview(current.src, result.displayUrl);
        setPdfBuffer(buf);
      } else if (isModel3dPreviewKind(result.kind)) {
        const buf = await loadBinaryPreview(current.src, result.displayUrl);
        setModel3dBuffer(buf);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o arquivo');
    } finally {
      setLoading(false);
    }
  }, [current?.src, loadBinaryPreview]);

  useEffect(() => {
    void loadCurrent();
    return () => cleanup();
  }, [index, loadCurrent, cleanup]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) setIndex((i) => i + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose]);

  const canSwipeGallery = items.length > 1;

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) setIndex((i) => i + 1);
  }, [index, items.length]);

  const onSwipePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      if (!canSwipeGallery) return;
      swipeStartRef.current = { x: clientX, y: clientY };
    },
    [canSwipeGallery],
  );

  const onSwipePointerUp = useCallback(
    (clientX: number, clientY: number) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || !canSwipeGallery) return;

      const dx = clientX - start.x;
      const dy = clientY - start.y;
      const minDistance = 48;

      if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy)) return;

      if (dx < 0) goNext();
      else goPrev();
    },
    [canSwipeGallery, goNext, goPrev],
  );

  const downloadUrl = loaded?.displayUrl ?? resolvePublicUploadUrl(current?.src ?? '');

  function renderBody(kind: FilePreviewKind, url: string) {
    switch (kind) {
      case 'image':
        return (
          <img
            src={url}
            alt={name}
            draggable={false}
            className="max-w-full max-h-[calc(90vh-8rem)] object-contain rounded-lg shadow-lg select-none touch-pan-y"
          />
        );
      case 'video':
        return (
          <video
            src={url}
            controls
            className="max-w-full max-h-[calc(90vh-8rem)] rounded-lg bg-black"
            playsInline
          >
            Seu navegador não suporta reprodução de vídeo.
          </video>
        );
      case 'audio':
        return (
          <div className="w-full max-w-lg rounded-xl bg-white/5 border border-white/10 p-8">
            <p className="text-center text-white/70 text-sm mb-4 truncate">{name}</p>
            <audio src={url} controls className="w-full">
              Seu navegador não suporta áudio.
            </audio>
          </div>
        );
      case 'pdf':
        if (!pdfBuffer) {
          return <p className="text-white/60">Carregando PDF…</p>;
        }
        return (
          <div className="w-full max-w-6xl mx-auto flex flex-col min-h-0 self-stretch">
            <Suspense fallback={<p className="text-white/60">Carregando PDF…</p>}>
              <PdfFileViewer
                key={current?.src ?? String(index)}
                buffer={pdfBuffer}
                fileName={name}
                externalUrl={url}
                onError={(msg) => setError(msg)}
              />
            </Suspense>
          </div>
        );
      case 'text':
        return (
          <pre className="w-full max-w-4xl max-h-[calc(90vh-8rem)] overflow-auto rounded-lg bg-black/40 border border-white/10 p-4 text-sm text-white/90 whitespace-pre-wrap break-words font-mono">
            {textContent ?? 'Carregando texto…'}
          </pre>
        );
      case 'markdown':
        return (
          <div className="w-full max-w-5xl max-h-[calc(90vh-8rem)] overflow-auto rounded-lg border border-[#30363d] shadow-lg">
            <Suspense fallback={<p className="p-8 text-white/60">Carregando Markdown…</p>}>
              {textContent != null ? (
                <MarkdownFileViewer content={textContent} />
              ) : (
                <p className="p-8 text-white/60">Carregando Markdown…</p>
              )}
            </Suspense>
          </div>
        );
      case 'spreadsheet':
      case 'document':
      case 'presentation':
        if (!officeBuffer) {
          return <p className="text-white/60">Carregando {fileKindLabel(kind).toLowerCase()}…</p>;
        }
        return (
          <div className="w-full flex flex-col min-h-0">
            <OfficeFileViewer
              kind={kind}
              buffer={officeBuffer}
              fileKey={current?.src ?? String(index)}
              onError={(msg) => setError(msg)}
            />
          </div>
        );
      case 'model3d':
        if (!model3dBuffer) {
          return <p className="text-white/60">Carregando modelo 3D…</p>;
        }
        return (
          <div className="w-full flex flex-col min-h-0">
            <Suspense fallback={<p className="text-white/60">Carregando modelo 3D…</p>}>
              <Model3dViewer
                key={current?.src ?? String(index)}
                buffer={model3dBuffer}
                fileName={name}
                onError={(msg) => setError(msg)}
              />
            </Suspense>
          </div>
        );
      default:
        return (
          <div className="text-center text-white/70 space-y-4 px-4">
            <p className="text-lg">Pré-visualização não disponível para este tipo de arquivo.</p>
            <p className="text-sm text-white/50">{name}</p>
            <a
              href={downloadUrl}
              download={name}
              target="_blank"
              rel="noopener noreferrer"
              className={btn.primary}
            >
              Baixar arquivo
            </a>
          </div>
        );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizador: ${name}`}
      onClick={onClose}
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium truncate">{name}</p>
          <p className="text-xs text-white/50">
            {fileKindLabel(loaded?.kind ?? 'unsupported')}
            {items.length > 1 ? ` · ${index + 1} de ${items.length}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {items.length > 1 && (
            <>
              <button
                type="button"
                disabled={index <= 0}
                onClick={goPrev}
                className="px-3 py-1.5 rounded-md bg-white/10 text-white text-sm disabled:opacity-40 hover:bg-white/20"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={index >= items.length - 1}
                onClick={goNext}
                className="px-3 py-1.5 rounded-md bg-white/10 text-white text-sm disabled:opacity-40 hover:bg-white/20"
              >
                Próximo
              </button>
            </>
          )}
          <a
            href={downloadUrl}
            download={name}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md bg-white/10 text-white text-sm hover:bg-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            Baixar
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-white/10 text-white text-lg leading-none hover:bg-white/20"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </header>

      <div
        className="flex-1 flex items-center justify-center p-4 overflow-auto min-h-0 touch-pan-y w-full"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) onSwipePointerDown(t.clientX, t.clientY);
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          if (t) onSwipePointerUp(t.clientX, t.clientY);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') return;
          onSwipePointerDown(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') return;
          onSwipePointerUp(e.clientX, e.clientY);
        }}
      >
        {loading && <p className="text-white/70">Carregando…</p>}
        {!loading && error && (
          <div className="text-center space-y-3">
            <p className="text-danger">{error}</p>
            <button type="button" className={btn.primarySoft} onClick={() => void loadCurrent()}>
              Tentar novamente
            </button>
          </div>
        )}
        {!loading && !error && loaded && renderBody(loaded.kind, loaded.displayUrl)}
      </div>
    </div>
  );
}
