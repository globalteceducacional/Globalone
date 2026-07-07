import { jsPDF } from 'jspdf';
import {
  getEspelho,
  getJornadaColaborador,
  getMinhaJornada,
  listarJornadas,
  type EspelhoDia,
  type EspelhoMes,
  type Jornada,
  type JornadaUsuario,
  type RegistroPonto,
} from '../services/rh';
import { boundsDatasCompetencia } from './pontoCompetencia';

const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;
const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

export interface FolhaFrequenciaColaborador {
  usuarioId: number;
  nome: string;
  funcao: string;
  matricula: string;
  horarioTrabalho: string;
  espelho: EspelhoMes;
  jornada: Jornada | null;
  /** Dias a listar na grade (padrão: mês civil de `espelho.mes` quando YYYY-MM). */
  diasExibicao?: string[];
  /** Texto do período no cabeçalho/resumo (ex.: 01/06/2026 – 05/06/2026). */
  rotuloPeriodo?: string;
  resumoTitulo?: string;
}

function hhmm(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function hhmmComSegundos(h: string): string {
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(h)) return h;
  if (/^\d{1,2}:\d{2}$/.test(h)) return `${h}:00`;
  return h;
}

function rotuloDiasUteis(diasUteis: Record<string, boolean>): string {
  const segSex = [1, 2, 3, 4, 5].every((d) => diasUteis[String(d)] === true);
  const sab = diasUteis['6'] === true;
  const dom = diasUteis['0'] === true;
  if (segSex && !sab && !dom) return 'SEG A SEX';
  const nomes = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const ativos = [0, 1, 2, 3, 4, 5, 6].filter((d) => diasUteis[String(d)]).map((d) => nomes[d]);
  return ativos.length ? ativos.join(', ') : '—';
}

export function formatHorarioTrabalho(jornada: Jornada | null): string {
  if (!jornada) return '—';
  const dias = rotuloDiasUteis(jornada.diasUteis ?? {});
  const ini = hhmmComSegundos(jornada.inicioPadrao);
  const fim = jornada.fimPadrao.length === 5 ? jornada.fimPadrao : jornada.fimPadrao.slice(0, 5);
  return `${dias} ${ini} A ${fim}`;
}

/** Saldo do dia no banco de horas (crédito/débito). */
function saldoBancoHorasDia(dia: EspelhoDia | undefined): string {
  if (!dia) return '';
  if (!dia.diaUtil && dia.registros === 0) return '';
  return formatMinutosTotal(dia.saldoMin);
}

function intervaloDoDia(dia: EspelhoDia, jornada: Jornada | null): string {
  if (dia.almocoIntervaloInicio && dia.almocoIntervaloFim) {
    return `${hhmm(dia.almocoIntervaloInicio)} - ${hhmm(dia.almocoIntervaloFim)}`;
  }
  if (dia.entrada && dia.saida && jornada?.almocoAutomatico) {
    return `${jornada.almocoInicio} - ${jornada.almocoFim}`;
  }
  return '';
}

/** Formata minutos para totais (ex.: 8h30, -1h15). */
function formatMinutosTotal(min: number): string {
  if (!Number.isFinite(min)) return '0h';
  const sinal = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (m === 0) return `${sinal}${h}h`;
  return `${sinal}${h}h${String(m).padStart(2, '0')}`;
}

function dataLinha(ymd: string): { data: string; semana: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const mesAbr = MESES_ABR[m - 1] ?? String(m).padStart(2, '0');
  return {
    data: `${String(d).padStart(2, '0')}/${mesAbr}`,
    semana: DIAS_SEMANA[dt.getDay()],
  };
}

function diasDoMes(competencia: string): string[] {
  const { min, max } = boundsDatasCompetencia(competencia);
  return diasEntreYmd(min, max);
}

function diasEntreYmd(min: string, max: string): string[] {
  const [y0, m0, d0] = min.split('-').map(Number);
  const [y1, m1, d1] = max.split('-').map(Number);
  const out: string[] = [];
  const cur = new Date(y0, m0 - 1, d0);
  const end = new Date(y1, m1 - 1, d1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function rotuloPeriodoBr(dataInicio: string, dataFim: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  };
  return dataInicio === dataFim ? fmt(dataInicio) : `${fmt(dataInicio)} – ${fmt(dataFim)}`;
}

function diasParaFolha(col: FolhaFrequenciaColaborador): string[] {
  if (col.diasExibicao?.length) return col.diasExibicao;
  if (/^\d{4}-\d{2}$/.test(col.espelho.mes)) return diasDoMes(col.espelho.mes);
  if (col.espelho.dias.length > 0) return col.espelho.dias.map((d) => d.data.slice(0, 10));
  return [];
}

function mapaDiasEspelho(espelho: EspelhoMes): Map<string, EspelhoDia> {
  const m = new Map<string, EspelhoDia>();
  for (const d of espelho.dias) m.set(d.data.slice(0, 10), d);
  return m;
}

function desenharFolha(doc: jsPDF, col: FolhaFrequenciaColaborador, arquivoLabel: string): void {
  const margin = 8;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const innerW = pageW - margin * 2;
  let y = margin;

  const box = (x: number, yy: number, w: number, h: number, stroke = true) => {
    if (stroke) doc.setDrawColor(0);
    doc.rect(x, yy, w, h);
  };

  const txt = (
    text: string,
    x: number,
    yy: number,
    w: number,
    h: number,
    opts?: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right' },
  ) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 7);
    const align = opts?.align ?? 'left';
    const lines = doc.splitTextToSize(text || '', w - 2);
    const lineH = (opts?.size ?? 7) * 0.35;
    let ty = yy + 2.5;
    for (const line of lines.slice(0, Math.floor(h / lineH))) {
      doc.text(line, x + (align === 'center' ? w / 2 : align === 'right' ? w - 1 : 1), ty, {
        align,
      });
      ty += lineH;
    }
  };

  // ── Cabeçalho ──
  const headerH = col.rotuloPeriodo ? 37 : 32;
  box(margin, y, innerW, headerH);

  const logoW = 42;
  box(margin, y, logoW, headerH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('GLOBALTEC', margin + logoW / 2, y + 10, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('EDUCACIONAL', margin + logoW / 2, y + 15, { align: 'center' });

  const tituloX = margin + logoW;
  const tituloW = innerW - logoW;
  txt('FOLHA DE FREQUÊNCIA', tituloX, y + 2, tituloW, 10, { bold: true, size: 12, align: 'center' });

  const infoY = y + 12;
  const half = tituloW / 2;
  txt(`NOME: ${col.nome}`, tituloX + 2, infoY, tituloW - 4, 5, { size: 7 });
  txt(`FUNÇÃO: ${col.funcao || '—'}`, tituloX + 2, infoY + 5, half - 2, 5, { size: 7 });
  txt(`Matrícula: ${col.matricula || '—'}`, tituloX + half, infoY + 5, half - 2, 5, { size: 7 });
  txt(`HORÁRIO DE TRABALHO: ${col.horarioTrabalho}`, tituloX + 2, infoY + 10, tituloW - 4, 6, { size: 6.5 });
  if (col.rotuloPeriodo) {
    txt(`PERÍODO: ${col.rotuloPeriodo}`, tituloX + 2, infoY + 15, tituloW - 4, 5, { size: 6.5 });
  }

  y += headerH;

  // ── Larguras das colunas (mm) — sem assinatura/justificativa por linha ──
  const wData = 16;
  const wSem = 12;
  const wEnt = 22;
  const wInt = 26;
  const wSai = 22;
  const wBancoHoras = 28;

  const resumoH = 24;
  const assinaturaBlocoH = 30;
  const bottomReserve = resumoH + assinaturaBlocoH + margin;

  const rowH = 5.2;
  const headH1 = 6;
  const headH2 = 5;

  const x0 = margin;
  let x = x0;

  // Cabeçalho da tabela — linha 1
  const yHead1 = y;
  box(x, y, wData + wSem, headH1 + headH2);
  txt('DATA', x, yHead1, wData + wSem, headH1, { bold: true, size: 6, align: 'center' });
  x += wData + wSem;

  const wJornada = wEnt + wInt + wSai;
  box(x, y, wJornada, headH1);
  txt('JORNADA DE TRABALHO', x, yHead1, wJornada, headH1, { bold: true, size: 6, align: 'center' });
  const xJorn = x;
  x += wJornada;

  box(x, y, wBancoHoras, headH1);
  txt('BANCO DE HORAS', x, yHead1, wBancoHoras, headH1, { bold: true, size: 6, align: 'center' });
  const xBanco = x;

  // Cabeçalho — linha 2
  y += headH1;
  x = x0;
  box(x, y, wData, headH2);
  txt('Dia', x, y, wData, headH2, { size: 5, align: 'center' });
  x += wData;
  box(x, y, wSem, headH2);
  txt('Sem', x, y, wSem, headH2, { size: 5, align: 'center' });
  x = xJorn;
  box(x, y, wEnt, headH2);
  txt('ENTRADA', x, y, wEnt, headH2, { size: 5, align: 'center' });
  x += wEnt;
  box(x, y, wInt, headH2);
  txt('INTERVALO', x, y, wInt, headH2, { size: 5, align: 'center' });
  x += wInt;
  box(x, y, wSai, headH2);
  txt('SAÍDA', x, y, wSai, headH2, { size: 5, align: 'center' });
  x = xBanco;
  box(x, y, wBancoHoras, headH2);
  txt('Saldo dia', x, y, wBancoHoras, headH2, { size: 5, align: 'center' });

  y += headH2;

  const mapa = mapaDiasEspelho(col.espelho);
  const yMeses = diasParaFolha(col);
  void arquivoLabel;

  for (const ymd of yMeses) {
    if (y + rowH > pageH - bottomReserve) break;
    const dia = mapa.get(ymd);
    const { data, semana } = dataLinha(ymd);
    x = x0;

    box(x, y, wData, rowH);
    txt(data, x, y, wData, rowH, { size: 6, align: 'center' });
    x += wData;
    box(x, y, wSem, rowH);
    txt(semana, x, y, wSem, rowH, { size: 6, align: 'center' });
    x += wSem;

    const entrada = dia ? hhmm(dia.entrada) : '';
    const intervalo = dia ? intervaloDoDia(dia, col.jornada) : '';
    const saida = dia ? hhmm(dia.saida) : '';
    const saldoBh = saldoBancoHorasDia(dia);

    box(x, y, wEnt, rowH);
    txt(entrada, x, y, wEnt, rowH, { size: 6, align: 'center' });
    x += wEnt;
    box(x, y, wInt, rowH);
    txt(intervalo, x, y, wInt, rowH, { size: 5.5, align: 'center' });
    x += wInt;
    box(x, y, wSai, rowH);
    txt(saida, x, y, wSai, rowH, { size: 6, align: 'center' });
    x += wSai;
    box(x, y, wBancoHoras, rowH);
    txt(saldoBh, x, y, wBancoHoras, rowH, { size: 6, align: 'center' });

    y += rowH;
  }

  // ── Resumo do mês (totais do espelho) ──
  const t = col.espelho.totais;
  y += 2;
  box(margin, y, innerW, resumoH);
  txt(col.resumoTitulo ?? 'RESUMO DO MÊS', margin + 2, y + 1, innerW - 4, 5, { bold: true, size: 8 });

  const col1X = margin + 3;
  const col2X = margin + innerW / 2 + 2;
  const meioW = innerW / 2 - 5;
  const linhaResumo = 4.2;
  let ry = y + 7;
  const linhasResumo: [string, string][] = [
    ['Horas trabalhadas', formatMinutosTotal(t.trabalhadoMin)],
    ['Horas esperadas', formatMinutosTotal(t.esperadoMin)],
    ['Saldo banco de horas (período)', formatMinutosTotal(t.saldoMin)],
    ['Atrasos', formatMinutosTotal(t.atrasoMin)],
    ['Dias úteis', String(t.diasUteis)],
    ['Dias com batida', String(t.diasComBatida)],
    ['Faltas / incompletos', `${t.faltas} / ${t.incompletos}`],
  ];
  for (let i = 0; i < linhasResumo.length; i += 2) {
    const [l1, v1] = linhasResumo[i];
    txt(`${l1}: ${v1}`, col1X, ry, meioW, linhaResumo, { size: 6.5 });
    const par = linhasResumo[i + 1];
    if (par) {
      const [l2, v2] = par;
      txt(`${l2}: ${v2}`, col2X, ry, meioW, linhaResumo, { size: 6.5 });
    }
    ry += linhaResumo;
  }
  y += resumoH;

  // ── Data e assinaturas (colaborador + supervisor) ──
  y += 3;
  box(margin, y, innerW, assinaturaBlocoH);
  txt('Data das assinaturas: ____/____/________', margin + 2, y + 2, innerW - 4, 6, { size: 7 });

  const assY = y + 10;
  const gapAss = 6;
  const wAssCol = (innerW - gapAss) / 2;
  const linhaAssY = assY + 11;

  doc.line(margin + 2, linhaAssY, margin + 2 + wAssCol - 4, linhaAssY);
  txt('Assinatura do colaborador', margin, linhaAssY + 1.5, wAssCol, 5, { size: 6.5, align: 'center' });

  const xSup = margin + wAssCol + gapAss;
  doc.line(xSup + 2, linhaAssY, xSup + wAssCol - 2, linhaAssY);
  txt('Assinatura do supervisor', xSup, linhaAssY + 1.5, wAssCol, 5, { size: 6.5, align: 'center' });
}

function desenharPaginaFolha(doc: jsPDF, col: FolhaFrequenciaColaborador, arquivoLabel: string, primeira: boolean) {
  if (!primeira) doc.addPage('a4', 'portrait');
  desenharFolha(doc, col, arquivoLabel);
}

export async function carregarJornadaParaFolha(
  usuarioId: number,
  usuarioIdAtual?: number,
): Promise<Jornada | null> {
  try {
    if (usuarioIdAtual != null && usuarioId === usuarioIdAtual) {
      return await getMinhaJornada();
    }
    return await getJornadaColaborador(usuarioId);
  } catch {
    return null;
  }
}

export async function carregarDadosFolhaFrequencia(
  competencia: string,
  usuarioIds: number[],
  registros: RegistroPonto[],
): Promise<FolhaFrequenciaColaborador[]> {
  const ids =
    usuarioIds.length > 0
      ? [...new Set(usuarioIds)]
      : [...new Set(registros.map((r) => r.usuarioId))];

  if (ids.length === 0) return [];

  const [jornadas, ...espelhos] = await Promise.all([
    listarJornadas().catch(() => [] as JornadaUsuario[]),
    ...ids.map((id) => getEspelho({ mes: competencia, usuarioId: id })),
  ]);

  const jornadaPorUsuario = new Map(jornadas.map((j) => [j.usuarioId, j]));
  const nomePorId = new Map<number, string>();
  for (const r of registros) {
    if (r.usuario?.nome) nomePorId.set(r.usuarioId, r.usuario.nome);
  }
  for (const j of jornadas) nomePorId.set(j.usuarioId, j.nome);

  return ids.map((usuarioId, i) => {
    const jLinha = jornadaPorUsuario.get(usuarioId);
    const jornada = jLinha?.jornada ?? null;
    const nome = nomePorId.get(usuarioId) ?? jLinha?.nome ?? `Colaborador #${usuarioId}`;
    const funcao = jLinha?.funcao?.trim() || jLinha?.cargo?.nome || '';
    return {
      usuarioId,
      nome,
      funcao,
      matricula: String(usuarioId),
      horarioTrabalho: formatHorarioTrabalho(jornada),
      espelho: espelhos[i] as EspelhoMes,
      jornada,
    };
  });
}

export async function buildFolhasFrequenciaPdf(
  arquivoLabel: string,
  colaboradores: FolhaFrequenciaColaborador[],
): Promise<void> {
  if (!colaboradores.length) {
    throw new Error('Nenhum colaborador para gerar a folha de frequência.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  colaboradores.forEach((col, i) => {
    desenharPaginaFolha(doc, col, arquivoLabel, i === 0);
  });

  const safe = arquivoLabel.replace(/[^\dA-Za-z_-]+/g, '-');
  const sufixo =
    colaboradores.length === 1
      ? `-${colaboradores[0].usuarioId}`
      : colaboradores.length <= 3
        ? colaboradores.map((c) => c.usuarioId).join('-')
        : `-${colaboradores.length}-colab`;
  doc.save(`folha-frequencia-${safe}${sufixo}.pdf`);
}

export async function exportarFolhaFrequenciaPdf(opts: {
  competencia: string;
  usuarioIds?: number[];
  registros: RegistroPonto[];
}): Promise<void> {
  const colaboradores = await carregarDadosFolhaFrequencia(
    opts.competencia,
    opts.usuarioIds ?? [],
    opts.registros,
  );
  await buildFolhasFrequenciaPdf(opts.competencia, colaboradores);
}

export type ExportarFolhaPontoParams =
  | {
      modo: 'mes';
      competencia: string;
      usuarioId: number;
      nome: string;
      funcao?: string;
      usuarioIdAtual?: number;
    }
  | {
      modo: 'periodo';
      dataInicio: string;
      dataFim: string;
      usuarioId: number;
      nome: string;
      funcao?: string;
      usuarioIdAtual?: number;
    };

/** Folha de frequência (PDF) — competência mensal ou intervalo de datas. */
export async function exportarFolhaPontoPdf(opts: ExportarFolhaPontoParams): Promise<void> {
  const espelho =
    opts.modo === 'mes'
      ? await getEspelho({ mes: opts.competencia, usuarioId: opts.usuarioId })
      : await getEspelho({
          dataInicio: opts.dataInicio,
          dataFim: opts.dataFim,
          usuarioId: opts.usuarioId,
        });

  const jornada = await carregarJornadaParaFolha(opts.usuarioId, opts.usuarioIdAtual);

  const colaborador: FolhaFrequenciaColaborador =
    opts.modo === 'mes'
      ? {
          usuarioId: opts.usuarioId,
          nome: opts.nome,
          funcao: opts.funcao?.trim() || '',
          matricula: String(opts.usuarioId),
          horarioTrabalho: formatHorarioTrabalho(jornada),
          espelho,
          jornada,
          resumoTitulo: 'RESUMO DO MÊS',
        }
      : {
          usuarioId: opts.usuarioId,
          nome: opts.nome,
          funcao: opts.funcao?.trim() || '',
          matricula: String(opts.usuarioId),
          horarioTrabalho: formatHorarioTrabalho(jornada),
          espelho,
          jornada,
          diasExibicao: diasEntreYmd(opts.dataInicio, opts.dataFim),
          rotuloPeriodo: rotuloPeriodoBr(opts.dataInicio, opts.dataFim),
          resumoTitulo: 'RESUMO DO PERÍODO',
        };

  const arquivoLabel =
    opts.modo === 'mes' ? opts.competencia : `${opts.dataInicio}_${opts.dataFim}`;

  await buildFolhasFrequenciaPdf(arquivoLabel, [colaborador]);
}

/** @deprecated Use exportarFolhaPontoPdf */
export async function exportarMinhaFolhaPontoCompetencia(opts: {
  competencia: string;
  usuarioId: number;
  nome: string;
  funcao?: string;
  usuarioIdAtual?: number;
}): Promise<void> {
  await exportarFolhaPontoPdf({
    modo: 'mes',
    competencia: opts.competencia,
    usuarioId: opts.usuarioId,
    nome: opts.nome,
    funcao: opts.funcao,
    usuarioIdAtual: opts.usuarioIdAtual,
  });
}
