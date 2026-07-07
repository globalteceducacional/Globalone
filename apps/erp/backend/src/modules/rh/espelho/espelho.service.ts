import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AfastamentoTipo, SolicitacaoStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeriadosService } from '../feriados/feriados.service';
import { JornadaService } from '../jornada/jornada.service';
import {
  boundsMes,
  boundsMesAteHoje,
  calcularEspelhoPeriodo,
  calcularEspelhoMes,
  CoberturaDia,
  EspelhoMes,
} from './espelho.calculator';

@Injectable()
export class EspelhoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jornadaService: JornadaService,
    private readonly feriadosService: FeriadosService,
  ) {}

  /** Valida formato YYYY-MM. */
  private validarMes(mes?: string): string {
    if (!mes) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      throw new BadRequestException('mes deve estar no formato YYYY-MM.');
    }
    return mes;
  }

  /** Mapeia AfastamentoTipo para o status do espelho. */
  private mapearAfastamentoStatus(
    tipo: AfastamentoTipo,
  ): CoberturaDia['status'] {
    // O enum atual é flexível; usamos heurística por nome.
    const t = String(tipo).toUpperCase();
    if (t.includes('ATESTADO')) return 'ATESTADO';
    if (t.includes('LICENC') || t.includes('MATERNIDADE') || t.includes('PATERNIDADE')) {
      return 'LICENCA';
    }
    if (t.includes('ABONAD')) return 'FALTA_ABONADA';
    if (t.includes('HOME')) return 'HOME_OFFICE';
    return 'LICENCA';
  }

  /** Itera dias entre [inicio, fim] (inclusivo) e devolve YYYY-MM-DD. */
  private *iterarDias(inicio: Date, fim: Date): Generator<{ key: string; date: Date }> {
    const cur = new Date(inicio);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(fim);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      yield { key: `${y}-${m}-${d}`, date: new Date(cur) };
      cur.setDate(cur.getDate() + 1);
    }
  }

  /** Carrega afastamentos + férias aprovadas que cobrem dias do mês. */
  private async carregarCoberturas(
    usuarioId: number,
    inicio: Date,
    fim: Date,
  ): Promise<CoberturaDia[]> {
    const fimInclusive = new Date(fim);
    fimInclusive.setMilliseconds(-1);

    const [afastamentos, ferias] = await Promise.all([
      this.prisma.afastamento.findMany({
        where: {
          usuarioId,
          dataInicio: { lte: fimInclusive },
          dataFim: { gte: inicio },
        },
      }),
      this.prisma.feriasSolicitacao.findMany({
        where: {
          usuarioId,
          status: SolicitacaoStatus.APROVADO,
          dataInicio: { lte: fimInclusive },
          dataFim: { gte: inicio },
        },
      }),
    ]);

    const cobs: CoberturaDia[] = [];

    for (const a of afastamentos) {
      const start = a.dataInicio < inicio ? inicio : a.dataInicio;
      const end = a.dataFim > fimInclusive ? fimInclusive : a.dataFim;
      const status = this.mapearAfastamentoStatus(a.tipo);
      for (const { key } of this.iterarDias(start, end)) {
        cobs.push({ data: key, status, motivo: a.motivo ?? `Afastamento: ${a.tipo}` });
      }
    }
    for (const f of ferias) {
      const start = f.dataInicio < inicio ? inicio : f.dataInicio;
      const end = f.dataFim > fimInclusive ? fimInclusive : f.dataFim;
      for (const { key } of this.iterarDias(start, end)) {
        cobs.push({ data: key, status: 'FERIAS', motivo: f.observacao ?? 'Férias aprovadas' });
      }
    }

    const feriados = await this.feriadosService.coberturasNoPeriodo(inicio, fimInclusive);
    cobs.push(...feriados);

    return cobs;
  }

  async espelhoUsuario(usuarioId: number, mesParam?: string): Promise<EspelhoMes> {
    const mes = this.validarMes(mesParam);
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const jornada = await this.jornadaService.ensure(usuarioId);
    const { inicio, fim } = boundsMes(mes);
    const registros = await this.prisma.registroPonto.findMany({
      where: { usuarioId, dataHora: { gte: inicio, lt: fim } },
      orderBy: { dataHora: 'asc' },
      select: { tipo: true, dataHora: true },
    });
    const coberturas = await this.carregarCoberturas(usuarioId, inicio, fim);

    return calcularEspelhoMes(mes, usuarioId, jornada, registros, coberturas);
  }

  /** Espelho parcial entre duas datas civis (inclusivo). */
  async espelhoUsuarioPorPeriodo(
    usuarioId: number,
    dataInicio: string,
    dataFim: string,
  ): Promise<EspelhoMes> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
      throw new BadRequestException('dataInicio e dataFim devem ser YYYY-MM-DD.');
    }
    const [yi, mi, di] = dataInicio.split('-').map(Number);
    const [yf, mf, df] = dataFim.split('-').map(Number);
    const inicio = new Date(yi, mi - 1, di, 0, 0, 0, 0);
    const fimInclusive = new Date(yf, mf - 1, df, 0, 0, 0, 0);
    if (fimInclusive.getTime() < inicio.getTime()) {
      throw new BadRequestException('dataInicio não pode ser posterior a dataFim.');
    }
    const fimExclusive = new Date(fimInclusive);
    fimExclusive.setDate(fimExclusive.getDate() + 1);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const jornada = await this.jornadaService.ensure(usuarioId);
    const registros = await this.prisma.registroPonto.findMany({
      where: {
        usuarioId,
        dataHora: { gte: inicio, lt: fimExclusive },
      },
      orderBy: { dataHora: 'asc' },
      select: { tipo: true, dataHora: true },
    });
    const coberturas = await this.carregarCoberturas(usuarioId, inicio, fimInclusive);
    const mesLabel = `${dataInicio}_${dataFim}`;

    return calcularEspelhoPeriodo(
      inicio,
      fimExclusive,
      mesLabel,
      usuarioId,
      jornada,
      registros,
      coberturas,
    );
  }

  /**
   * Espelho parcial: **somente dias já encerrados no calendário** até o começo de hoje
   * (exclui o dia civil atual e futuros do mês). Evita saldo negativo cheio no banco de horas
   * quando ainda só há entrada (INCOMPLETO) em dia em curso.
   */
  async espelhoUsuarioAteHoje(usuarioId: number, mesParam?: string): Promise<EspelhoMes> {
    const mes = this.validarMes(mesParam);
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const jornada = await this.jornadaService.ensure(usuarioId);
    const { inicio, fimExclusive } = boundsMesAteHoje(mes);
    const { fim } = boundsMes(mes);
    const registros = await this.prisma.registroPonto.findMany({
      where: { usuarioId, dataHora: { gte: inicio, lt: fim } },
      orderBy: { dataHora: 'asc' },
      select: { tipo: true, dataHora: true },
    });
    const coberturas = await this.carregarCoberturas(usuarioId, inicio, fim);

    return calcularEspelhoPeriodo(
      inicio,
      fimExclusive,
      mes,
      usuarioId,
      jornada,
      registros,
      coberturas,
    );
  }

  /** Devolve string CSV do espelho (para exportação). */
  async exportarCsv(usuarioId: number, mesParam?: string): Promise<string> {
    const espelho = await this.espelhoUsuario(usuarioId, mesParam);
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'data',
      'diaSemana',
      'diaUtil',
      'entrada',
      'saida',
      'almocoDeducaoMin',
      'almocoIntervaloInicio',
      'almocoIntervaloFim',
      'trabalhadoMin',
      'esperadoMin',
      'atrasoMin',
      'extraMin',
      'saldoMin',
      'status',
    ];
    const linhas = espelho.dias.map((d) =>
      [
        d.data,
        d.diaSemana,
        d.diaUtil ? 'SIM' : 'NAO',
        d.entrada ?? '',
        d.saida ?? '',
        d.almocoDeducaoMin,
        d.almocoIntervaloInicio ?? '',
        d.almocoIntervaloFim ?? '',
        d.trabalhadoMin,
        d.esperadoMin,
        d.atrasoMin,
        d.extraMin,
        d.saldoMin,
        d.status,
      ]
        .map(escape)
        .join(';'),
    );
    return [header.join(';'), ...linhas].join('\r\n');
  }
}
