import { init as initPptxPreview } from 'pptx-preview';
import { useOfficePreviewMount } from './useOfficePreviewMount';

type Props = {
  buffer: ArrayBuffer;
  onError?: (message: string) => void;
};

/** PowerPoint (.pptx) — pptx-preview (mesma base do @vue-office/pptx). */
export function OfficePresentationViewer({ buffer, onError }: Props) {
  const mountRef = useOfficePreviewMount(
    buffer,
    (mountEl) => {
      const width = Math.min(960, mountEl.clientWidth || 960);
      const previewer = initPptxPreview(mountEl, {
        width,
        height: Math.min(540, Math.floor((width * 9) / 16)),
      });
      return previewer;
    },
    onError,
  );

  return (
    <div
      className="office-pptx-preview w-full max-w-5xl min-h-[320px] rounded-lg overflow-auto bg-neutral-900/80 border border-white/10 flex justify-center py-4"
      style={{ height: 'calc(90vh - 8rem)', maxHeight: 'calc(90vh - 8rem)' }}
    >
      <div ref={mountRef} className="h-full w-full flex justify-center" />
    </div>
  );
}
