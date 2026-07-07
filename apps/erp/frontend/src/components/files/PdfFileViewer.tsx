import { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import { btn } from '../../utils/buttonStyles';
import { isErpMobileWebView, openUrlInErpMobile } from '../../utils/erpMobile';
import { setupPdfJsWorker } from '../../utils/pdfJsSetup';

setupPdfJsWorker();

type Props = {
  buffer: ArrayBuffer;
  fileName?: string;
  /** URL para abrir externamente (blob ou absoluta). */
  externalUrl?: string;
  onError?: (message: string) => void;
};

function fallbackContainerWidth(): number {
  if (typeof window === 'undefined') return 900;
  return Math.min(Math.max(window.innerWidth - 96, 320), 1200);
}

export function PdfFileViewer({ buffer, fileName, externalUrl, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    (async () => {
      setLoading(true);
      setDoc(null);
      setPage(1);
      setTotalPages(0);

      try {
        setupPdfJsWorker();
        loadingTask = getDocument({ data: new Uint8Array(buffer.slice(0)) });
        const pdfDoc = await loadingTask.promise;
        loadingTask = null;

        if (cancelled) {
          await pdfDoc.destroy();
          return;
        }

        setDoc(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setPage(1);
      } catch (e) {
        if (!cancelled) {
          onErrorRef.current?.(
            e instanceof Error ? e.message : 'Não foi possível abrir o PDF',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void (async () => {
        if (loadingTask) {
          await loadingTask.destroy();
        }
      })();
    };
  }, [buffer]);

  useEffect(() => {
    if (!doc) return;
    return () => {
      void doc.destroy();
    };
  }, [doc]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };

    measure();
    const raf = requestAnimationFrame(measure);

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [doc, loading]);

  useEffect(() => {
    if (!doc || loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderTask: { cancel?: () => void } | null = null;

    const effectiveWidth =
      containerWidth > 0 ? containerWidth : fallbackContainerWidth();

    (async () => {
      setRendering(true);
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const displayScale = Math.min(effectiveWidth / baseViewport.width, 3);
        const viewport = pdfPage.getViewport({ scale: displayScale });

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas não disponível neste dispositivo');
        }

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Não foi possível renderizar a página';
          if (!message.includes('Rendering cancelled')) {
            onErrorRef.current?.(message);
          }
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [doc, page, loading, containerWidth]);

  const canOpenExternal = Boolean(externalUrl?.trim()) && isErpMobileWebView();

  if (loading) {
    return <p className="text-white/60">Abrindo PDF…</p>;
  }

  if (!doc) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-3 min-h-0 self-stretch">
      <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
        <button
          type="button"
          disabled={page <= 1 || rendering}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1.5 rounded-md bg-white/10 text-white text-sm disabled:opacity-40 hover:bg-white/20"
        >
          Página anterior
        </button>
        <span className="text-sm text-white/70 tabular-nums px-2">
          {page} / {totalPages || 1}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || rendering}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="px-3 py-1.5 rounded-md bg-white/10 text-white text-sm disabled:opacity-40 hover:bg-white/20"
        >
          Próxima página
        </button>
        {canOpenExternal && (
          <button
            type="button"
            className={btn.primarySoft}
            onClick={() => openUrlInErpMobile(externalUrl!)}
          >
            Abrir no sistema
          </button>
        )}
      </div>

      {fileName ? (
        <p className="text-center text-xs text-white/45 truncate px-2">{fileName}</p>
      ) : null}

      {rendering ? (
        <p className="text-center text-white/50 text-sm py-2">Renderizando…</p>
      ) : null}

      <div
        ref={scrollRef}
        className="w-full flex justify-center overflow-auto max-h-[calc(90vh-11rem)] min-h-[240px] touch-pan-y"
      >
        <canvas
          ref={canvasRef}
          className="rounded-lg shadow-lg bg-white"
          aria-label={fileName ? `Página ${page} de ${fileName}` : `Página ${page} do PDF`}
        />
      </div>
    </div>
  );
}
