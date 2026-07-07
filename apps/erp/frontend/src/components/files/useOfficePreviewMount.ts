import { useEffect, useRef } from 'react';

export type OfficePreviewHandle = {
  preview: (buffer: ArrayBuffer) => Promise<unknown>;
  destroy: () => void;
};

/**
 * Ciclo de vida seguro para libs Office (init → preview → destroy após promise).
 * Evita race com React StrictMode (ex.: loadData em instância nula no @js-preview/excel).
 */
export function useOfficePreviewMount(
  buffer: ArrayBuffer,
  createPreviewer: (mountEl: HTMLElement) => OfficePreviewHandle,
  onError?: (message: string) => void,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const createRef = useRef(createPreviewer);
  createRef.current = createPreviewer;

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    let cancelled = false;
    let previewer: OfficePreviewHandle | null = null;
    let previewPromise: Promise<unknown> | null = null;
    let frameId = 0;

    const teardown = () => {
      if (!previewer) return;
      try {
        previewer.destroy();
      } catch {
        /* destroy enquanto preview async ainda roda */
      }
      previewer = null;
    };

    frameId = requestAnimationFrame(() => {
      if (cancelled || !mountRef.current) return;

      mountEl.innerHTML = '';
      previewer = createRef.current(mountEl);
      previewPromise = previewer.preview(buffer).catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Não foi possível exibir o arquivo.';
        onErrorRef.current?.(msg);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (previewer) {
        if (previewPromise) {
          void previewPromise.finally(() => teardown());
        } else {
          teardown();
        }
      }
    };
  }, [buffer]);

  return mountRef;
}
