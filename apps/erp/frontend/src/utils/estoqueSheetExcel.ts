import * as XLSX from 'xlsx-js-style';

/** Cabeçalhos idênticos ao modelo de importação (Compras & Estoque). */
export const ESTOQUE_SHEET_IMPORT_HEADERS = [
  'item *',
  'quantidade *',
  'valor unitario',
  'descricao',
  'categoria *',
  'projeto',
  'alocacoes',
] as const;

export const ESTOQUE_SHEET_COL_WIDTHS = [
  { wch: 28 },
  { wch: 12 },
  { wch: 16 },
  { wch: 36 },
  { wch: 22 },
  { wch: 24 },
  { wch: 52 },
];

const borderStyle = {
  top: { style: 'thin', color: { rgb: 'D1D5DB' } },
  bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
  left: { style: 'thin', color: { rgb: 'D1D5DB' } },
  right: { style: 'thin', color: { rgb: 'D1D5DB' } },
};

/** Mesmo visual do botão «Baixar modelo da planilha» na tela de estoque. */
export function buildStyledEstoqueSheetWorkbook(
  aoa: (string | number | null | undefined)[][],
  sheetName: string,
): XLSX.WorkBook {
  const normalized = aoa.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell)),
  );
  const ws = XLSX.utils.aoa_to_sheet(normalized);
  ws['!cols'] = [...ESTOQUE_SHEET_COL_WIDTHS];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = ws[cellAddress];
      if (!cell) continue;
      if (row === 0) {
        cell.s = {
          fill: { fgColor: { rgb: '1E40AF' } },
          font: { color: { rgb: 'FFFFFF' }, bold: true },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: borderStyle as any,
        };
      } else {
        cell.s = {
          border: borderStyle as any,
        };
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}
