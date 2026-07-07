import { lazy, Suspense, type ComponentType } from 'react';
import type { FilePreviewKind } from '../../utils/filePreview';

type OfficeKind = Extract<FilePreviewKind, 'spreadsheet' | 'document' | 'presentation'>;

type ViewerProps = {
  buffer: ArrayBuffer;
  onError?: (message: string) => void;
};

/** Lazy por tipo — evita carregar Excel ao abrir Word, etc. */
const VIEWER_LOADERS: Record<OfficeKind, () => Promise<{ default: ComponentType<ViewerProps> }>> = {
  spreadsheet: () =>
    import('./OfficeSpreadsheetViewer').then((m) => ({ default: m.OfficeSpreadsheetViewer })),
  document: () =>
    import('./OfficeDocumentViewer').then((m) => ({ default: m.OfficeDocumentViewer })),
  presentation: () =>
    import('./OfficePresentationViewer').then((m) => ({ default: m.OfficePresentationViewer })),
};

const LazyViewers: Record<OfficeKind, ComponentType<ViewerProps>> = {
  spreadsheet: lazy(VIEWER_LOADERS.spreadsheet),
  document: lazy(VIEWER_LOADERS.document),
  presentation: lazy(VIEWER_LOADERS.presentation),
};

type Props = {
  kind: OfficeKind;
  buffer: ArrayBuffer;
  fileKey: string;
  onError?: (message: string) => void;
};

const LOADING_LABEL: Record<OfficeKind, string> = {
  spreadsheet: 'planilha',
  document: 'documento',
  presentation: 'apresentação',
};

/** Visualizador Office unificado (Excel/Word/PowerPoint). */
export function OfficeFileViewer({ kind, buffer, fileKey, onError }: Props) {
  const Viewer = LazyViewers[kind];
  const label = LOADING_LABEL[kind];

  return (
    <Suspense fallback={<p className="text-white/60">Carregando {label}…</p>}>
      <Viewer key={fileKey} buffer={buffer} onError={onError} />
    </Suspense>
  );
}
