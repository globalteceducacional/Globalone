import * as XLSX from 'xlsx-js-style';
import type { RegistroPonto, TipoBatida } from '../services/rh';
import { exportarPontoCsv } from '../services/rh';
import { exportarFolhaFrequenciaPdf } from './folhaFrequenciaPdf';
import { filtrosPontoDaCompetencia, rotuloCompetencia } from './pontoCompetencia';

export type PontoBatidasFormato = 'pdf' | 'xlsx' | 'csv' | 'html';

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function rotuloTipo(tipo: TipoBatida): string {
  return tipo === 'ENTRADA' ? 'Entrada' : 'Saída';
}

function filtrarPorUsuarios(registros: RegistroPonto[], usuarioIds?: number[]): RegistroPonto[] {
  if (!usuarioIds?.length) return registros;
  const set = new Set(usuarioIds);
  return registros.filter((r) => set.has(r.usuarioId));
}

function gerarCsvLocal(registros: RegistroPonto[]): string {
  const header = [
    'id',
    'nsr',
    'usuarioId',
    'usuarioNome',
    'email',
    'tipo',
    'dataHora',
    'origem',
    'latitude',
    'longitude',
    'precisaoGps',
    'ip',
    'fotoUrl',
    'observacao',
    'ajustadoPor',
    'justificativa',
    'ajustadoEm',
  ];
  const linhas = registros.map((r) =>
    [
      r.id,
      r.nsr ?? '',
      r.usuarioId,
      r.usuario?.nome ?? '',
      r.usuario?.email ?? '',
      r.tipo,
      r.dataHora,
      r.origem,
      r.latitude ?? '',
      r.longitude ?? '',
      r.precisaoGps ?? '',
      r.ip ?? '',
      r.fotoUrl ?? '',
      r.observacao ?? '',
      r.ajustadoPor?.nome ?? '',
      r.justificativa ?? '',
      r.ajustadoEm ?? '',
    ]
      .map(escapeCsv)
      .join(';'),
  );
  return '\uFEFF' + [header.join(';'), ...linhas].join('\r\n');
}

function baixarBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildHtmlRelatorio(
  registros: RegistroPonto[],
  meta: { competencia: string; escopo: string },
): string {
  const titulo = `Batidas de ponto — ${rotuloCompetencia(meta.competencia)}`;
  const rows = registros
    .map((r) => {
      const nsr = r.nsr;
      return `<tr>
        <td>${r.id}</td>
        <td>${nsr ?? '—'}</td>
        <td>${r.usuario?.nome ?? r.usuarioId}</td>
        <td>${rotuloTipo(r.tipo)}</td>
        <td>${formatDataHora(r.dataHora)}</td>
        <td>${r.origem}</td>
        <td>${r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : '—'}</td>
        <td>${r.observacao ?? '—'}</td>
        <td>${r.ajustadoPor?.nome ?? '—'}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${titulo}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    .meta { font-size: 0.85rem; color: #444; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${titulo}</h1>
  <p class="meta">Escopo: ${meta.escopo} · Gerado em ${new Date().toLocaleString('pt-BR')} · ${registros.length} batida(s)</p>
  <table>
    <thead>
      <tr>
        <th>ID</th><th>NSR</th><th>Colaborador</th><th>Tipo</th><th>Data/hora</th>
        <th>Origem</th><th>Localização</th><th>Observação</th><th>Ajustado por</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="9">Nenhuma batida no período.</td></tr>'}</tbody>
  </table>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

const COLUNAS_EXCEL = [
  'ID',
  'NSR',
  'ID usuário',
  'Colaborador',
  'E-mail',
  'Tipo',
  'Data/hora',
  'Origem',
  'Latitude',
  'Longitude',
  'Precisão GPS (m)',
  'IP',
  'Foto URL',
  'Observação',
  'Ajustado por',
  'Justificativa',
  'Ajustado em',
] as const;

function linhaExcel(r: RegistroPonto): (string | number)[] {
  return [
    r.id,
    r.nsr ?? '',
    r.usuarioId,
    r.usuario?.nome ?? '',
    r.usuario?.email ?? '',
    rotuloTipo(r.tipo),
    formatDataHora(r.dataHora),
    r.origem,
    r.latitude ?? '',
    r.longitude ?? '',
    r.precisaoGps ?? '',
    r.ip ?? '',
    r.fotoUrl ?? '',
    r.observacao ?? '',
    r.ajustadoPor?.nome ?? '',
    r.justificativa ?? '',
    r.ajustadoEm ? formatDataHora(r.ajustadoEm) : '',
  ];
}

export function buildPontoBatidasXlsx(
  registros: RegistroPonto[],
  meta: { competencia: string; escopo: string },
): void {
  const titulo = `Batidas de ponto — ${rotuloCompetencia(meta.competencia)}`;
  const aoa: (string | number)[][] = [
    [titulo],
    ['Competência', meta.competencia],
    ['Escopo', meta.escopo],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['Total de batidas', registros.length],
    [],
    [...COLUNAS_EXCEL],
    ...registros.map(linhaExcel),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 28 },
    { wch: 28 },
    { wch: 10 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 36 },
    { wch: 32 },
    { wch: 22 },
    { wch: 32 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Batidas');
  XLSX.writeFile(workbook, `ponto-batidas-${meta.competencia}.xlsx`);
}

export function abrirRelatorioHtmlImprimivel(
  registros: RegistroPonto[],
  meta: { competencia: string; escopo: string },
): void {
  const html = buildHtmlRelatorio(registros, meta);
  const w = window.open('', '_blank');
  if (!w) {
    throw new Error('O navegador bloqueou a janela. Permita pop-ups para exportar em HTML/PDF.');
  }
  w.document.write(html);
  w.document.close();
}

export async function exportarBatidasCompetencia(opts: {
  competencia: string;
  formato: PontoBatidasFormato;
  registros: RegistroPonto[];
  usuarioIds?: number[];
  escopoLabel: string;
}): Promise<void> {
  const filtrados = filtrarPorUsuarios(
    [...opts.registros].sort(
      (a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime() || a.id - b.id,
    ),
    opts.usuarioIds,
  );
  const meta = { competencia: opts.competencia, escopo: opts.escopoLabel };
  const baseName = `ponto-batidas-${opts.competencia}`;

  if (filtrados.length === 0) {
    throw new Error('Nenhuma batida encontrada para o período e escopo selecionados.');
  }

  switch (opts.formato) {
    case 'pdf':
      await exportarFolhaFrequenciaPdf({
        competencia: opts.competencia,
        usuarioIds: opts.usuarioIds,
        registros: filtrados,
      });
      break;
    case 'xlsx':
      buildPontoBatidasXlsx(filtrados, meta);
      break;
    case 'html':
      abrirRelatorioHtmlImprimivel(filtrados, meta);
      break;
    case 'csv': {
      const umUsuario = opts.usuarioIds?.length === 1 ? opts.usuarioIds[0] : undefined;
      const todosSemFiltro = !opts.usuarioIds?.length;
      if (todosSemFiltro || (opts.usuarioIds?.length === 1 && umUsuario)) {
        await exportarPontoCsv(
          filtrosPontoDaCompetencia(opts.competencia, umUsuario),
          `${baseName}${umUsuario ? `-usuario-${umUsuario}` : ''}.csv`,
        );
      } else {
        const csv = gerarCsvLocal(filtrados);
        baixarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${baseName}-filtrado.csv`);
      }
      break;
    }
    default:
      break;
  }
}
