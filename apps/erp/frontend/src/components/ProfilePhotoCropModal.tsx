import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { btn } from '../utils/buttonStyles';
import { getCroppedAvatarBlob } from '../utils/cropImage';

type Props = {
  imageSrc: string;
  open: boolean;
  onClose: () => void;
  /** Rejeitar em caso de erro (ex.: falha no upload) para manter o modal aberto. */
  onConfirm: (file: File) => void | Promise<void>;
};

export function ProfilePhotoCropModal({ imageSrc, open, onClose, onConfirm }: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setWorking(false);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels || !imageSrc) return;
    setWorking(true);
    try {
      const blob = await getCroppedAvatarBlob(imageSrc, croppedAreaPixels);
      const file = new File([blob], 'foto-perfil.jpg', { type: 'image/jpeg' });
      await onConfirm(file);
      onClose();
    } finally {
      setWorking(false);
    }
  }

  if (!open || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      role="presentation"
      onClick={() => !working && onClose()}
    >
      <div
        className="bg-neutral border border-white/20 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-photo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/15">
          <h2 id="crop-photo-title" className="text-lg font-bold text-white">
            Ajustar foto de perfil
          </h2>
          <p className="text-sm text-white/55 mt-1">
            Mova e amplie a imagem para escolher a área visível no perfil.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative w-full aspect-square max-h-[min(55vh,360px)] mx-auto rounded-xl overflow-hidden bg-black border border-white/10">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">Zoom</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary h-2"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={working}
              className={`${btn.secondary} rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={working || !croppedAreaPixels}
              className={`${btn.primary} rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50`}
            >
              {working ? 'Salvando…' : 'Usar esta área'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
