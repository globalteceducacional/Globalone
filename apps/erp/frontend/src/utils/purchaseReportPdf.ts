import { jsPDF } from 'jspdf';
import type { Purchase } from '../types/stock';
import { parseAttachmentUrls } from './attachmentUrls';
import { getPurchaseLineTotal, getPurchaseLineUnitValue } from './stockHelpers';

interface BuildPurchaseReportPdfParams {
  purchases: Purchase[];
  getStatusLabel: (status: string) => string;
  /** Título principal do PDF (padrão: RELATÓRIO DE COMPRAS). */
  title?: string;
  /** Texto extra abaixo da data (ex.: competência do relatório de assinaturas). */
  subtitle?: string;
  /** Prefixo do arquivo ao salvar (sem extensão). */
  fileNamePrefix?: string;
}

export function buildPurchaseReportPdf({
  purchases,
  getStatusLabel,
  title = 'RELATÓRIO DE COMPRAS',
  subtitle,
  fileNamePrefix,
}: BuildPurchaseReportPdfParams): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;

  const ensurePage = (nextHeight = 8) => {
    if (y + nextHeight > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
  };

  const totalValor = purchases.reduce((sum, p) => sum + getPurchaseLineTotal(p), 0);
  const totalQtd = purchases.reduce((sum, p) => sum + (p.quantidade || 0), 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, y);
  y += 6;
  if (subtitle?.trim()) {
    doc.text(subtitle.trim(), 14, y);
    y += 6;
  }
  doc.text(`Itens: ${purchases.length} | Quantidade: ${totalQtd}`, 14, y);
  y += 6;
  doc.text(
    `Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    14,
    y,
  );
  y += 10;

  purchases.forEach((p, index) => {
    ensurePage(22);
    const total = getPurchaseLineTotal(p);
    const unit = getPurchaseLineUnitValue(p);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${p.item || 'Item'}`, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (p.projeto?.nome) {
      doc.text(`Projeto: ${p.projeto.nome}`, 14, y);
      y += 4;
    }
    if (p.solicitadoPor?.nome) {
      const cargo = p.solicitadoPor.cargo?.nome ? ` (${p.solicitadoPor.cargo.nome})` : '';
      doc.text(`Solicitado por: ${p.solicitadoPor.nome}${cargo}`, 14, y);
      y += 4;
    }
    if (p.descricao?.trim()) {
      const motivo = p.descricao.length > 110 ? `${p.descricao.slice(0, 107)}...` : p.descricao;
      doc.text(`Motivo: ${motivo}`, 14, y);
      y += 4;
    }
    doc.text(`Status: ${getStatusLabel(p.status)} | Qtd: ${p.quantidade || 0}`, 14, y);
    y += 5;
    doc.text(
      `Valor unitário: ${unit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      14,
      y,
    );
    y += 5;
    const nfUrls = parseAttachmentUrls(p.nfUrl);
    const compUrls = parseAttachmentUrls(p.comprovantePagamentoUrl);
    if (nfUrls.length > 0) {
      const label = nfUrls.length > 1 ? 'NFs' : 'NF';
      const joined = nfUrls.join(' | ');
      const nf = joined.length > 90 ? `${joined.slice(0, 87)}...` : joined;
      doc.text(`${label}: ${nf}`, 14, y);
      y += 4;
    }
    if (compUrls.length > 0) {
      const label = compUrls.length > 1 ? 'Comprovantes' : 'Comprovante';
      const joined = compUrls.join(' | ');
      const c = joined.length > 80 ? `${joined.slice(0, 77)}...` : joined;
      doc.text(`${label}: ${c}`, 14, y);
      y += 4;
    }
    y += 4;
  });

  ensurePage(24);
  y += 4;
  doc.setDrawColor(180, 180, 180);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RESUMO FINAL', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total de itens: ${purchases.length}`, 14, y);
  y += 6;
  doc.text(`Quantidade total: ${totalQtd}`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Valor total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    14,
    y,
  );
  doc.setFont('helvetica', 'normal');

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Página ${i} de ${pages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  const day = new Date().toISOString().split('T')[0];
  const base =
    fileNamePrefix?.trim() ||
    (subtitle?.trim() ? `relatorio-assinaturas-mensal-${day}` : `relatorio-compras-${day}`);
  doc.save(`${base}.pdf`);
}
