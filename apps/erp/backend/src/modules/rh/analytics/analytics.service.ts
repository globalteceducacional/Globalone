import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SolicitacaoStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { JornadaService } from '../jornada/jornada.service';
import {
  boundsMes,
  boundsMesAteHoje,
  calcularEspelhoMes,
  calcularEspelhoPeriodo,
  startOfTomorrow,
} from '../espelho/espelho.calculator';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jornadaService: JornadaService,
  ) {}

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

  private fmtDataPtBr(d: Date): string {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private parseDataLocalYmd(s: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new BadRequestException('Datas devem estar no formato YYYY-MM-DD.');
    }
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  /**
   * Período dos indicadores: datas explícitas ou mês com corte em “hoje” (não conta dias futuros como falta).
   */
  private resolverPeriodoIndicadores(
    mesParam: string | undefined,
    dataInicio?: string,
    dataFim?: string,
  ): { inicio: Date; fimExclusive: Date; periodoDescricao: string; mes: string } {
    if (dataInicio && dataFim) {
      const di = this.parseDataLocalYmd(dataInicio);
      const df = this.parseDataLocalYmd(dataFim);
      if (df.getTime() < di.getTime()) {
        throw new BadRequestException('dataFim deve ser maior ou igual a dataInicio.');
      }
      const fimExclusiveRaw = new Date(df);
      fimExclusiveRaw.setDate(fimExclusiveRaw.getDate() + 1);
      const tomorrow = startOfTomorrow();
      const fimCap =
        fimExclusiveRaw.getTime() <= tomorrow.getTime() ? fimExclusiveRaw : tomorrow;
      if (di.getTime() >= fimCap.getTime()) {
        const mesFallback = this.validarMes(
          mesParam ?? `${di.getFullYear()}-${String(di.getMonth() + 1).padStart(2, '0')}`,
        );
        return {
          inicio: di,
          fimExclusive: di,
          periodoDescricao: 'Sem dias no período (intervalo no futuro)',
          mes: mesFallback,
        };
      }
      const mes = this.validarMes(`${di.getFullYear()}-${String(di.getMonth() + 1).padStart(2, '0')}`);
      const ultimoDia = new Date(fimCap);
      ultimoDia.setDate(ultimoDia.getDate() - 1);
      return {
        inicio: di,
        fimExclusive: fimCap,
        periodoDescricao: `${this.fmtDataPtBr(di)} – ${this.fmtDataPtBr(ultimoDia)}`,
        mes,
      };
    }

    const mes = this.validarMes(mesParam);
    const { inicio, fimExclusive } = boundsMesAteHoje(mes);
    if (inicio.getTime() >= fimExclusive.getTime()) {
      return {
        inicio,
        fimExclusive,
        periodoDescricao: 'Sem dias no período (mês futuro)',
        mes,
      };
    }
    const ultimoDia = new Date(fimExclusive);
    ultimoDia.setDate(ultimoDia.getDate() - 1);
    return {
      inicio,
      fimExclusive,
      periodoDescricao: `${this.fmtDataPtBr(inicio)} – ${this.fmtDataPtBr(ultimoDia)}`,
      mes,
    };
  }

  /** KPIs principais para o dashboard de RH em uma competência (um colaborador ou consolidado). */
  async indicadores(mesParam?: string, usuarioId?: number, dataInicio?: string, dataFim?: string) {
    const { inicio, fimExclusive, periodoDescricao, mes } = this.resolverPeriodoIndicadores(
      mesParam,
      dataInicio,
      dataFim,
    );

    if (usuarioId != null) {
      return this.indicadoresUmColaborador(mes, inicio, fimExclusive, periodoDescricao, usuarioId);
    }

    const usuarios = await this.prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, cargoId: true, cargo: { select: { id: true, nome: true } } },
    });

    let trabalhadoMin = 0;
    let extraMin = 0;
    let atrasoMin = 0;
    let faltas = 0;
    let totalDiasUteis = 0;

    for (const u of usuarios) {
      const jornada = await this.jornadaService.ensure(u.id);
      const registros = await this.prisma.registroPonto.findMany({
        where: { usuarioId: u.id, dataHora: { gte: inicio, lt: fimExclusive } },
        select: { tipo: true, dataHora: true },
        orderBy: { dataHora: 'asc' },
      });
      const espelho = calcularEspelhoPeriodo(inicio, fimExclusive, mes, u.id, jornada, registros);
      trabalhadoMin += espelho.totais.trabalhadoMin;
      extraMin += espelho.totais.extraMin;
      atrasoMin += espelho.totais.atrasoMin;
      faltas += espelho.totais.faltas;
      totalDiasUteis += espelho.totais.diasUteis;
    }

    const afastamentosCount = await this.prisma.afastamento.count({
      where: { dataInicio: { lt: fimExclusive }, dataFim: { gte: inicio } },
    });

    const feriasPendentes = await this.prisma.feriasSolicitacao.count({
      where: { status: SolicitacaoStatus.PENDENTE },
    });

    const documentosVencendo = await this.prisma.documentoColaborador.count({
      where: {
        dataValidade: {
          not: null,
          lte: new Date(new Date().setDate(new Date().getDate() + 30)),
        },
      },
    });

    const totalUsuariosAtivos = usuarios.length;
    const absenteismo =
      totalDiasUteis > 0 ? Math.round((faltas / Math.max(1, totalDiasUteis)) * 1000) / 10 : 0;

    return {
      mes,
      periodoDescricao,
      totalUsuariosAtivos,
      trabalhadoMin,
      extraMin,
      atrasoMin,
      faltas,
      diasUteis: totalDiasUteis,
      absenteismoPct: absenteismo,
      afastamentosNoMes: afastamentosCount,
      feriasPendentes,
      documentosVencendo,
      porCargo: this.agruparPorCargo(usuarios),
    };
  }

  private async indicadoresUmColaborador(
    mes: string,
    inicio: Date,
    fimExclusive: Date,
    periodoDescricao: string,
    usuarioId: number,
  ) {
    const u = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, ativo: true },
      select: { id: true, cargoId: true, cargo: { select: { id: true, nome: true } } },
    });
    if (!u) {
      throw new NotFoundException('Colaborador não encontrado ou inativo.');
    }

    const jornada = await this.jornadaService.ensure(u.id);
    const registros = await this.prisma.registroPonto.findMany({
      where: { usuarioId: u.id, dataHora: { gte: inicio, lt: fimExclusive } },
      select: { tipo: true, dataHora: true },
      orderBy: { dataHora: 'asc' },
    });
    const espelho = calcularEspelhoPeriodo(inicio, fimExclusive, mes, u.id, jornada, registros);
    const totalDiasUteis = espelho.totais.diasUteis;
    const faltas = espelho.totais.faltas;
    const absenteismo =
      totalDiasUteis > 0 ? Math.round((faltas / Math.max(1, totalDiasUteis)) * 1000) / 10 : 0;

    const afastamentosCount = await this.prisma.afastamento.count({
      where: {
        usuarioId: u.id,
        dataInicio: { lt: fimExclusive },
        dataFim: { gte: inicio },
      },
    });

    const feriasPendentes = await this.prisma.feriasSolicitacao.count({
      where: { usuarioId: u.id, status: SolicitacaoStatus.PENDENTE },
    });

    const documentosVencendo = await this.prisma.documentoColaborador.count({
      where: {
        usuarioId: u.id,
        dataValidade: {
          not: null,
          lte: new Date(new Date().setDate(new Date().getDate() + 30)),
        },
      },
    });

    return {
      mes,
      periodoDescricao,
      totalUsuariosAtivos: 1,
      trabalhadoMin: espelho.totais.trabalhadoMin,
      extraMin: espelho.totais.extraMin,
      atrasoMin: espelho.totais.atrasoMin,
      faltas,
      diasUteis: totalDiasUteis,
      absenteismoPct: absenteismo,
      afastamentosNoMes: afastamentosCount,
      feriasPendentes,
      documentosVencendo,
      porCargo: [{ cargoId: u.cargo.id, nome: u.cargo.nome, total: 1 }],
    };
  }

  private agruparPorCargo(usuarios: { cargo: { id: number; nome: string } }[]) {
    const map = new Map<number, { cargoId: number; nome: string; total: number }>();
    for (const u of usuarios) {
      const cur = map.get(u.cargo.id) ?? { cargoId: u.cargo.id, nome: u.cargo.nome, total: 0 };
      cur.total += 1;
      map.set(u.cargo.id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  /** Gera CSV para folha — uma linha por colaborador no mês. */
  async folhaCsv(mesParam?: string): Promise<string> {
    const mes = this.validarMes(mesParam);
    const { inicio, fim } = boundsMes(mes);

    const usuarios = await this.prisma.usuario.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, email: true },
    });

    const header = [
      'usuarioId',
      'nome',
      'email',
      'mes',
      'diasUteis',
      'faltas',
      'incompletos',
      'trabalhadoMin',
      'esperadoMin',
      'extraMin',
      'atrasoMin',
      'saldoMin',
    ];
    const linhas: string[] = [];

    for (const u of usuarios) {
      const jornada = await this.jornadaService.ensure(u.id);
      const registros = await this.prisma.registroPonto.findMany({
        where: { usuarioId: u.id, dataHora: { gte: inicio, lt: fim } },
        select: { tipo: true, dataHora: true },
      });
      const e = calcularEspelhoMes(mes, u.id, jornada, registros);
      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      linhas.push(
        [
          u.id,
          u.nome,
          u.email,
          mes,
          e.totais.diasUteis,
          e.totais.faltas,
          e.totais.incompletos,
          e.totais.trabalhadoMin,
          e.totais.esperadoMin,
          e.totais.extraMin,
          e.totais.atrasoMin,
          e.totais.saldoMin,
        ]
          .map(escape)
          .join(';'),
      );
    }

    return [header.join(';'), ...linhas].join('\r\n');
  }
}
