import * as XLSX from 'xlsx-js-style';
import type { Category, Purchase } from '../types/stock';
import {
  getCategoryName,
  getPurchaseLineTotal,
  getPurchaseLineUnitValue,
  isDespesaPurchase,
  isSignaturePurchase,
  getStatusLabel,
} from './stockHelpers';

function assinaturaStatusLabel(status: string): string {
  if (status === 'ENTREGUE') return 'Pago';
  return 'Pendente';
}

export function exportFinanceiroComprasMes(
  mes: string,
  linhas: Purchase[],
  categories: Category[],
): void {
  const headers = [
    'Mês competência',
    'Tipo',
    'Projeto',
    'Item',
    'Categoria',
    'Quantidade',
    'Valor unitário',
    'Valor total',
    'Status',
    'Data referência',
    'Solicitado por',
    'Descrição',
    'Observações',
  ];

  const tableData: unknown[][] = [headers];
  let totalQtd = 0;
  let totalValor = 0;

  for (const p of linhas) {
    const valorTotal = getPurchaseLineTotal(p);
    const valorUnit = getPurchaseLineUnitValue(p);
    const qtd = p.quantidade || 0;
    totalQtd += qtd;
    totalValor += valorTotal;

    const rawRef =
      p.dataCompra ?? p.dataConfirmacao ?? p.solicitacaoAprovadaEm ?? p.dataSolicitacao ?? null;
    const dataRef = isSignaturePurchase(p)
      ? `Assinatura recorrente (${mes})`
      : rawRef
        ? new Date(rawRef).toLocaleDateString('pt-BR')
        : '—';

    tableData.push([
      mes,
      isSignaturePurchase(p) ? 'Assinatura' : isDespesaPurchase(p) ? 'Despesa' : 'Compra (estoque)',
      p.projeto?.nome ?? 'Sem projeto',
      p.item,
      p.categoria?.nome ?? getCategoryName(p.categoriaId ?? undefined, categories),
      qtd,
      valorUnit,
      valorTotal,
      isSignaturePurchase(p) ? assinaturaStatusLabel(p.status) : getStatusLabel(p.status),
      dataRef,
      p.solicitadoPor?.nome ?? '—',
      p.descricao ?? '—',
      p.observacao ?? '—',
    ]);
  }

  if (linhas.length > 0) {
    tableData.push([]);
    tableData.push([
      '',
      '',
      '',
      'TOTAL GERAL',
      '',
      totalQtd,
      '',
      totalValor,
      `${linhas.length} item(ns)`,
      '',
      '',
      '',
      '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(tableData);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const headerStyle = {
    fill: { fgColor: { rgb: '1E3A8A' } },
    font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };

  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Compras');
  XLSX.writeFile(wb, `financeiro-compras-${mes}.xlsx`);
}
