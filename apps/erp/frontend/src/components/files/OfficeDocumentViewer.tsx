import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

type Props = {
  buffer: ArrayBuffer;
  onError?: (message: string) => void;
};

/**
 * Word (.docx) — docx-preview (mesmo motor do @js-preview/docx, compatível com Vite/browser).
 */
export function OfficeDocumentViewer({ buffer, onError }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    let cancelled = false;
    let frameId = 0;
    const styleEl = styleRef.current;

    setLoading(true);
    bodyEl.innerHTML = '';
    if (styleEl) styleEl.innerHTML = '';

    frameId = requestAnimationFrame(() => {
      if (cancelled || !bodyRef.current) return;

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      renderAsync(blob, bodyEl, styleEl ?? bodyEl, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        className: 'docx',
        renderHeaders: true,
        renderFooters: true,
      })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg =
            err instanceof Error ? err.message : 'Não foi possível exibir o documento.';
          onErrorRef.current?.(msg);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      bodyEl.innerHTML = '';
      if (styleEl) styleEl.innerHTML = '';
    };
  }, [buffer]);

  return (
    <div
      className="office-docx-preview w-full max-w-4xl min-h-[320px] rounded-lg overflow-hidden bg-white flex flex-col"
      style={{ height: 'calc(90vh - 8rem)', maxHeight: 'calc(90vh - 8rem)' }}
    >
      <div ref={styleRef} className="docx-style-host shrink-0" aria-hidden />
      {loading ? (
        <p className="text-neutral-500 text-sm p-6">Carregando documento…</p>
      ) : null}
      <div ref={bodyRef} className="docx-body-host flex-1 overflow-auto text-neutral-900 p-2" />
    </div>
  );
}
