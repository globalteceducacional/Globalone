import jsPreviewExcel from '@js-preview/excel';
import type { JsExcelPreview } from '@js-preview/excel/lib/index.d';
import '@js-preview/excel/lib/index.css';
import { useOfficePreviewMount } from './useOfficePreviewMount';

type Props = {
  buffer: ArrayBuffer;
  onError?: (message: string) => void;
};

/** Excel (.xlsx, .xls) — @js-preview/excel (exceljs + x-data-spreadsheet). */
export function OfficeSpreadsheetViewer({ buffer, onError }: Props) {
  const mountRef = useOfficePreviewMount(
    buffer,
    (mountEl) => {
      const previewer: JsExcelPreview = jsPreviewExcel.init(mountEl, {
        minColLength: 0,
        showContextmenu: false,
      });
      return previewer;
    },
    onError,
  );

  return (
    <div
      className="office-excel-preview w-full min-h-[320px] rounded-lg overflow-hidden bg-white"
      style={{ height: 'calc(90vh - 8rem)', maxHeight: 'calc(90vh - 8rem)' }}
    >
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}
