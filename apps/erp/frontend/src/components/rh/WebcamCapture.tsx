import { useEffect, useRef, useState } from 'react';

interface WebcamCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob, dataUrl: string) => void;
  /** Largura final (px) da imagem JPEG enviada — economiza banda. */
  maxWidth?: number;
  /** Qualidade JPEG (0..1). */
  quality?: number;
}

/**
 * Modal de captura de selfie via getUserMedia.
 *
 * - Pede permissão da câmera frontal ao abrir.
 * - Em caso de negação ou indisponibilidade, exibe instrução clara.
 * - Gera um JPEG redimensionado e devolve via `onCapture`.
 */
export function WebcamCapture({
  open,
  onClose,
  onCapture,
  maxWidth = 640,
  quality = 0.7,
}: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const capturandoRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setReady(false);
    setCapturando(false);
    capturandoRef.current = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Seu navegador não suporta acesso à câmera. Atualize ou use outro dispositivo.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          setReady(true);
        }
      } catch (err) {
        const e = err as DOMException;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setError(
            'Permissão de câmera negada. Habilite o acesso nas configurações do navegador para registrar o ponto.',
          );
        } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
          setError('Nenhuma câmera frontal disponível neste dispositivo.');
        } else {
          setError(`Não foi possível acessar a câmera: ${e.message || e.name}`);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setReady(false);
    };
  }, [open]);

  function handleCapture() {
    if (capturandoRef.current) return;
    const video = videoRef.current;
    if (!video || !ready) return;

    capturandoRef.current = true;
    setCapturando(true);

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (sourceWidth === 0 || sourceHeight === 0) return;

    const targetWidth = Math.min(maxWidth, sourceWidth);
    const ratio = targetWidth / sourceWidth;
    const targetHeight = Math.round(sourceHeight * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          capturandoRef.current = false;
          setCapturando(false);
          return;
        }
        onCapture(blob, dataUrl);
      },
      'image/jpeg',
      quality,
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-neutral text-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-white/10">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Selfie da batida</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="rounded-lg bg-red-500/15 border border-red-400/40 text-red-100 p-4 text-sm">
              {error}
            </div>
          ) : (
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            </div>
          )}

          <p className="text-xs text-white/60 mt-3">
            A foto será enviada junto da sua localização ao confirmar.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-white/10 flex justify-end gap-2 bg-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready || !!error || capturando}
            className="px-4 py-2 rounded-md bg-primary text-neutral font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {capturando ? 'Enviando...' : 'Capturar e confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
