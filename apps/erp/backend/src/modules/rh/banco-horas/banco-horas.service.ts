import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BancoHorasOrigem,
  NotificacaoTipo,
  OrigemPonto,
  Prisma,
  SolicitacaoStatus,
  TipoBatida,
} from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertCompetenciaAberta } from '../../../common/utils/competencia-lock.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { EspelhoService } from '../espelho/espelho.service';
import { JornadaService } from '../jornada/jornada.service';
import { boundsMes, type DiaEspelho, type EspelhoMes } from '../espelho/espelho.calculator';

/** Tempo de vida do desafio “digite a palavra” para desfazer fechamento (persistido em DB). */
const DESAFIO_REABRIR_TTL_MS = 10 * 60 * 1000;

/** Evita colisão de `id` entre batidas virtuais e linhas de saldo do dia. */
const VIRTUAL_ID_BATIDA_OFFSET = 1_000_000_000;
const VIRTUAL_ID_SALDO_DIA_OFFSET = 2_000_000_000;

@Injectable()
export class BancoHorasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly espelhoService: EspelhoService,
    private readonly notifications: NotificationsService,
    private readonly jornadaService: JornadaService,
  ) {}

  private validarMes(mes?: string): string {
    if (!mes) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      throw new BadRequestException('competencia deve estar no formato YYYY-MM.');
    }
    return mes;
  }

  private parseDataYmd(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  private fimDoDiaYmd(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }

  private validarPeriodoDatas(dataInicio: string, dataFim: string): {
    inicio: Date;
    fim: Date;
    ymdInicio: string;
    ymdFim: string;
  } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
      throw new BadRequestException('dataInicio e dataFim devem ser YYYY-MM-DD.');
    }
    const inicio = this.parseDataYmd(dataInicio);
    const fim = this.fimDoDiaYmd(dataFim);
    if (inicio.getTime() > fim.getTime()) {
      throw new BadRequestException('dataInicio não pode ser posterior a dataFim.');
    }
    const dias =
      Math.floor((fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dias > 366) {
      throw new BadRequestException('Período máximo de 366 dias.');
    }
    return { inicio, fim, ymdInicio: dataInicio, ymdFim: dataFim };
  }

  private competenciasNoPeriodo(inicio: Date, fim: Date): string[] {
    const comps: string[] = [];
    let y = inicio.getFullYear();
    let m = inicio.getMonth();
    const endY = fim.getFullYear();
    const endM = fim.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      comps.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return comps;
  }

  private filtrarLancamentosPorPeriodo<T extends { data: Date }>(
    lancamentos: T[],
    inicio: Date,
    fim: Date,
  ): T[] {
    return lancamentos.filter((l) => l.data >= inicio && l.data <= fim);
  }

  /** Banco de horas só acumula saldo positivo; déficit zera no fim do mês (abatido no pagamento). */
  private pisoBancoHoras(saldoMin: number): number {
    return Math.max(0, saldoMin);
  }

  /** Movimento bruto da competência (pode ser negativo). */
  async saldoMesBrutoNaCompetencia(usuarioId: number, competencia: string): Promise<number> {
    return this.saldoMesNaCompetencia(usuarioId, competencia);
  }

  /**
   * Saldo do banco ao fim da competência (sempre ≥ 0).
   * Déficit do mês não é carregado — apenas créditos positivos acumulam.
   */
  async saldoBancoAteCompetencia(usuarioId: number, ateCompetencia: string): Promise<number> {
    const comp = this.validarMes(ateCompetencia);

    const ultimoFechado = await this.prisma.bancoHorasFechamento.findFirst({
      where: { usuarioId, competencia: { lte: comp } },
      orderBy: { competencia: 'desc' },
      select: { competencia: true, saldoFinalMin: true },
    });

    let saldo = this.pisoBancoHoras(ultimoFechado?.saldoFinalMin ?? 0);
    let cursor = ultimoFechado
      ? this.competenciaSeguinte(ultimoFechado.competencia)
      : await this.primeiraCompetenciaComPonto(usuarioId, comp);

    while (cursor <= comp) {
      const fechamentoCursor = await this.prisma.bancoHorasFechamento.findUnique({
        where: { usuarioId_competencia: { usuarioId, competencia: cursor } },
        select: { saldoFinalMin: true },
      });
      if (fechamentoCursor) {
        saldo = this.pisoBancoHoras(fechamentoCursor.saldoFinalMin);
      } else {
        const mesBruto = await this.saldoMesNaCompetencia(usuarioId, cursor);
        saldo = this.pisoBancoHoras(saldo + mesBruto);
      }
      if (cursor === comp) break;
      cursor = this.competenciaSeguinte(cursor);
    }

    return saldo;
  }

  /** Alias legado: saldo acumulado exibido = saldo do banco (nunca negativo). */
  async saldoAcumuladoAteCompetencia(usuarioId: number, ateCompetencia: string): Promise<number> {
    return this.saldoBancoAteCompetencia(usuarioId, ateCompetencia);
  }

  private async saldoAcumulado(usuarioId: number, ateCompetencia: string): Promise<number> {
    return this.saldoAcumuladoAteCompetencia(usuarioId, ateCompetencia);
  }

  private competenciaAnterior(competencia: string): string {
    const [yStr, mStr] = competencia.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }

  private competenciaSeguinte(competencia: string): string {
    const [yStr, mStr] = competencia.split('-');
    let y = Number(yStr);
    let m = Number(mStr);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  private mesAtualYmd(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Espelho adequado para saldo: mês passado completo; mês corrente só até ontem. */
  private async espelhoParaSaldoMes(usuarioId: number, competencia: string) {
    if (competencia < this.mesAtualYmd()) {
      return this.espelhoService.espelhoUsuario(usuarioId, competencia);
    }
    return this.espelhoService.espelhoUsuarioAteHoje(usuarioId, competencia);
  }

  /** Saldo líquido da competência (movimento do mês, sem carry-over). */
  private async saldoMesNaCompetencia(usuarioId: number, competencia: string): Promise<number> {
    const fechamento = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
      select: { creditoMin: true, debitoMin: true },
    });
    if (fechamento) {
      return fechamento.creditoMin - fechamento.debitoMin;
    }

    const lancamentos = await this.prisma.bancoHorasLancamento.findMany({
      where: { usuarioId, competencia },
      select: { minutosCredito: true, minutosDebito: true, origem: true },
    });
    const saldoManuais = this.saldoLancamentosManuaisDoMes(lancamentos);
    const espelho = await this.espelhoParaSaldoMes(usuarioId, competencia);
    return espelho.totais.saldoMin + saldoManuais;
  }

  private async primeiraCompetenciaComPonto(
    usuarioId: number,
    ateCompetencia: string,
  ): Promise<string> {
    const primeiraBatida = await this.prisma.registroPonto.findFirst({
      where: { usuarioId },
      orderBy: { dataHora: 'asc' },
      select: { dataHora: true },
    });
    if (!primeiraBatida) return ateCompetencia;
    const d = primeiraBatida.dataHora;
    const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return comp <= ateCompetencia ? comp : ateCompetencia;
  }

  private saldoLancamentosManuaisDoMes(
    lancamentos: Array<{ minutosCredito: number; minutosDebito: number; origem: BancoHorasOrigem }>,
  ): number {
    return lancamentos
      .filter(
        (l) =>
          l.origem === BancoHorasOrigem.AJUSTE || l.origem === BancoHorasOrigem.COMPENSACAO,
      )
      .reduce((acc, l) => acc + l.minutosCredito - l.minutosDebito, 0);
  }

  private textoBatidaPonto(p: {
    tipo: TipoBatida;
    dataHora: Date;
    origem: OrigemPonto;
    observacao: string | null;
  }): string {
    const tipoLabel = p.tipo === TipoBatida.ENTRADA ? 'Entrada' : 'Saída';
    const hh = p.dataHora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts: string[] = [`Batida — ${tipoLabel} às ${hh}`];
    if (p.origem === OrigemPonto.AJUSTE_RH) {
      parts.push('(ajuste RH)');
    }
    if (p.observacao?.trim()) {
      parts.push(`Obs.: ${p.observacao.trim()}`);
    }
    return parts.join(' · ');
  }

  private textoSaldoDiaEspelho(d: DiaEspelho): string {
    const parts: string[] = [`Dia ${d.data} — ${d.status}`];
    if (d.coberturaMotivo?.trim()) {
      parts.push(d.coberturaMotivo.trim());
    }
    if (d.entrada) {
      const he = new Date(d.entrada).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      parts.push(`Entrada ${he}`);
    }
    if (d.saida) {
      const hs = new Date(d.saida).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      parts.push(`Saída ${hs}`);
    }
    if (d.diaUtil && d.esperadoMin > 0) {
      parts.push(`Previsto ${d.esperadoMin} min · Trabalhado ${d.trabalhadoMin} min`);
    }
    if (d.atrasoMin > 0) {
      parts.push(`Atraso na entrada ${d.atrasoMin} min`);
    }
    if (d.saldoMin > 0) {
      parts.push(`Acima da jornada: +${d.saldoMin} min`);
    } else if (d.saldoMin < 0) {
      parts.push(`Abaixo da jornada: ${d.saldoMin} min`);
    }
    return parts.join(' · ');
  }

  /**
   * Enquanto a competência não está fechada, não existem lançamentos `PONTO` persistidos
   * (só após "Fechar mês"). Montamos linhas virtuais: uma por batida e uma por dia útil
   * com saldo do espelho (+ verde / − vermelho), mais os ajustes manuais já gravados.
   */
  private async lancamentosVirtuaisMesAberto(
    usuarioId: number,
    competencia: string,
    espelho: EspelhoMes,
  ): Promise<
    Array<{
      id: number;
      usuarioId: number;
      competencia: string;
      data: Date;
      minutosCredito: number;
      minutosDebito: number;
      origem: string;
      descricao: string | null;
      criadoEm: Date;
    }>
  > {
    const { inicio, fim } = boundsMes(competencia);
    const pontos = await this.prisma.registroPonto.findMany({
      where: { usuarioId, dataHora: { gte: inicio, lt: fim } },
      orderBy: { dataHora: 'asc' },
      select: { id: true, tipo: true, dataHora: true, origem: true, observacao: true, criadoEm: true },
    });

    const porBatida = pontos.map((p) => ({
      id: -(VIRTUAL_ID_BATIDA_OFFSET + p.id),
      usuarioId,
      competencia,
      data: p.dataHora,
      minutosCredito: 0,
      minutosDebito: 0,
      origem: 'BATIDA_PRE',
      descricao: this.textoBatidaPonto(p),
      criadoEm: p.criadoEm,
    }));

    const porDia: typeof porBatida = [];
    for (const d of espelho.dias) {
      if (!d.diaUtil) continue;
      const mostrarLinhaSaldo =
        d.saldoMin !== 0 || d.status === 'FALTA' || d.status === 'INCOMPLETO';
      if (!mostrarLinhaSaldo) continue;

      const credito = d.saldoMin > 0 ? d.saldoMin : 0;
      const debito = d.saldoMin < 0 ? -d.saldoMin : 0;
      const [yy, mm, dd] = d.data.split('-').map(Number);
      const yyyymmdd = yy * 10000 + mm * 100 + dd;
      // Meio-dia UTC no dia civil do espelho: o prefixo ISO YYYY-MM-DD coincide com `d.data`
      // e evita que o front agrupe errado ao usar substring da data (fuso do servidor).
      const dataOrdem = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0, 0));

      porDia.push({
        id: -(VIRTUAL_ID_SALDO_DIA_OFFSET + yyyymmdd),
        usuarioId,
        competencia,
        data: dataOrdem,
        minutosCredito: credito,
        minutosDebito: debito,
        origem: 'SALDO_PRE',
        descricao: this.textoSaldoDiaEspelho(d),
        criadoEm: dataOrdem,
      });
    }

    return [...porBatida, ...porDia];
  }

  async extrato(
    usuarioId: number,
    mesParam?: string,
    dataInicioParam?: string,
    dataFimParam?: string,
  ) {
    if (dataInicioParam?.trim() && dataFimParam?.trim()) {
      return this.extratoPorPeriodo(
        usuarioId,
        dataInicioParam.trim(),
        dataFimParam.trim(),
      );
    }
    return this.extratoPorCompetencia(usuarioId, this.validarMes(mesParam));
  }

  private async extratoPorPeriodo(
    usuarioId: number,
    dataInicio: string,
    dataFim: string,
  ) {
    const { inicio, fim, ymdInicio, ymdFim } = this.validarPeriodoDatas(
      dataInicio,
      dataFim,
    );
    const competencias = this.competenciasNoPeriodo(inicio, fim);
    const competenciaRef = competencias[competencias.length - 1]!;

    const participaBh = await this.jornadaService.participaControlePonto(usuarioId);
    if (!participaBh) {
      return {
        usuarioId,
        competencia: competenciaRef,
        periodo: { dataInicio: ymdInicio, dataFim: ymdFim },
        participaControlePonto: false,
        lancamentos: [],
        saldoMesMin: 0,
        saldoAcumuladoMin: 0,
        fechamento: null,
        jornadaAlmoco: {
          almocoAutomatico: true,
          almocoInicio: '12:00',
          almocoFim: '13:00',
        },
        politicaUsoExtras: {
          permitido: false,
          limiteMinutos: null,
          comprometidoMinutos: 0,
          disponivelMinutos: null,
        },
        solicitacoesUsoExtras: [],
      };
    }

    const lancamentosMesclados: Array<{
      id: number;
      usuarioId: number;
      competencia: string;
      data: Date;
      minutosCredito: number;
      minutosDebito: number;
      origem: string;
      descricao: string | null;
      criadoEm: Date;
    }> = [];
    for (const comp of competencias) {
      const mes = await this.extratoPorCompetencia(usuarioId, comp);
      lancamentosMesclados.push(
        ...this.filtrarLancamentosPorPeriodo(mes.lancamentos, inicio, fim),
      );
    }
    lancamentosMesclados.sort((a, b) => a.data.getTime() - b.data.getTime());

    const saldoMesMin = lancamentosMesclados.reduce(
      (acc, l) => acc + l.minutosCredito - l.minutosDebito,
      0,
    );
    const saldoAcumuladoMin = await this.saldoAcumulado(usuarioId, competenciaRef);
    const base = await this.extratoPorCompetencia(usuarioId, competenciaRef);

    return {
      usuarioId,
      competencia: competenciaRef,
      periodo: { dataInicio: ymdInicio, dataFim: ymdFim },
      participaControlePonto: true,
      lancamentos: lancamentosMesclados,
      saldoMesMin,
      saldoAcumuladoMin,
      fechamento: null,
      jornadaAlmoco: base.jornadaAlmoco,
      politicaUsoExtras: base.politicaUsoExtras,
      solicitacoesUsoExtras: base.solicitacoesUsoExtras,
    };
  }

  private async extratoPorCompetencia(usuarioId: number, competencia: string) {

    const participaBh = await this.jornadaService.participaControlePonto(usuarioId);
    if (!participaBh) {
      return {
        usuarioId,
        competencia,
        participaControlePonto: false,
        lancamentos: [],
        saldoMesMin: 0,
        saldoAcumuladoMin: 0,
        fechamento: null,
        jornadaAlmoco: {
          almocoAutomatico: true,
          almocoInicio: '12:00',
          almocoFim: '13:00',
        },
        politicaUsoExtras: {
          permitido: false,
          limiteMinutos: null,
          comprometidoMinutos: 0,
          disponivelMinutos: null,
        },
        solicitacoesUsoExtras: [],
      };
    }

    const lancamentos = await this.prisma.bancoHorasLancamento.findMany({
      where: { usuarioId, competencia },
      orderBy: { data: 'asc' },
    });
    const fechamento = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
    });
    const espelho = fechamento
      ? await this.espelhoService.espelhoUsuario(usuarioId, competencia)
      : await this.espelhoService.espelhoUsuarioAteHoje(usuarioId, competencia);
    const saldoManuaisMes = this.saldoLancamentosManuaisDoMes(lancamentos);

    let saldoMesMin: number;
    let saldoAteAgora: number;
    let lancamentosResposta: typeof lancamentos;

    if (fechamento) {
      saldoMesMin = fechamento.creditoMin - fechamento.debitoMin;
      saldoAteAgora = await this.saldoBancoAteCompetencia(usuarioId, competencia);
      lancamentosResposta = lancamentos;
    } else {
      saldoMesMin = await this.saldoMesNaCompetencia(usuarioId, competencia);
      saldoAteAgora = await this.saldoBancoAteCompetencia(usuarioId, competencia);

      const virtuais = await this.lancamentosVirtuaisMesAberto(usuarioId, competencia, espelho);
      const manuais = lancamentos.filter(
        (l) =>
          l.origem === BancoHorasOrigem.AJUSTE || l.origem === BancoHorasOrigem.COMPENSACAO,
      );
      lancamentosResposta = [...virtuais, ...manuais].sort(
        (a, b) => a.data.getTime() - b.data.getTime(),
      ) as typeof lancamentos;
    }
    const jornadaRow = await this.prisma.jornadaTrabalho.findUnique({
      where: { usuarioId },
      select: {
        almocoAutomatico: true,
        almocoInicio: true,
        almocoFim: true,
      },
    });
    const jornadaAlmoco = jornadaRow ?? {
      almocoAutomatico: true,
      almocoInicio: '12:00',
      almocoFim: '13:00',
    };

    const politicaRow = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        bancoHorasExtrasUsoPermitido: true,
        bancoHorasExtrasUsoLimiteMinutos: true,
      },
    });
    const comprometidoMin = await this.minutosUsoExtrasComprometidos(usuarioId);
    const permitido = politicaRow?.bancoHorasExtrasUsoPermitido === true;
    const limiteMin = permitido ? politicaRow?.bancoHorasExtrasUsoLimiteMinutos ?? null : null;
    const limiteOk = typeof limiteMin === 'number' && limiteMin > 0;
    const disponivelMin = permitido && limiteOk ? Math.max(0, limiteMin! - comprometidoMin) : null;

    const solicitacoesUsoExtras = await this.prisma.bancoHorasUsoExtrasSolicitacao.findMany({
      where: { usuarioId },
      orderBy: { dataCriacao: 'desc' },
      take: 30,
      include: {
        revisor: { select: { id: true, nome: true } },
        lancamento: { select: { id: true } },
      },
    });

    return {
      usuarioId,
      competencia,
      participaControlePonto: true,
      lancamentos: lancamentosResposta,
      saldoMesMin,
      saldoAcumuladoMin: saldoAteAgora,
      fechamento,
      jornadaAlmoco,
      politicaUsoExtras: {
        permitido,
        limiteMinutos: limiteOk ? limiteMin : null,
        comprometidoMinutos: comprometidoMin,
        disponivelMinutos: disponivelMin,
      },
      solicitacoesUsoExtras,
    };
  }

  /** Soma minutos em solicitações pendentes ou já aprovadas (conta contra o limite). */
  async minutosUsoExtrasComprometidos(usuarioId: number): Promise<number> {
    const agg = await this.prisma.bancoHorasUsoExtrasSolicitacao.aggregate({
      where: {
        usuarioId,
        status: { in: [SolicitacaoStatus.PENDENTE, SolicitacaoStatus.APROVADO] },
      },
      _sum: { minutosSolicitados: true },
    });
    return agg._sum.minutosSolicitados ?? 0;
  }

  async atualizarPoliticaUsoExtras(
    usuarioId: number,
    permitido: boolean,
    limiteMinutos: number | null | undefined,
  ) {
    const u = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    if (!(await this.jornadaService.participaControlePonto(usuarioId))) {
      throw new BadRequestException(
        'Não é possível alterar política de uso de extras para colaborador sem banco de horas.',
      );
    }

    if (permitido) {
      const lim =
        typeof limiteMinutos === 'number' && Number.isFinite(limiteMinutos)
          ? Math.floor(limiteMinutos)
          : NaN;
      if (!Number.isFinite(lim) || lim < 1) {
        throw new BadRequestException(
          'Com uso permitido, informe limiteMinutos (inteiro ≥ 1), máximo de minutos que o colaborador pode solicitar.',
        );
      }
      if (lim > 60 * 24 * 40) {
        throw new BadRequestException('limiteMinutos acima do máximo permitido.');
      }
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: {
          bancoHorasExtrasUsoPermitido: true,
          bancoHorasExtrasUsoLimiteMinutos: lim,
        },
      });
    } else {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: {
          bancoHorasExtrasUsoPermitido: false,
          bancoHorasExtrasUsoLimiteMinutos: null,
        },
      });
    }
    return this.extrato(usuarioId);
  }

  async solicitarUsoExtras(
    usuarioId: number,
    minutos: number,
    observacao: string | undefined,
    competenciaParam?: string,
  ) {
    const competencia = this.validarMes(competenciaParam);
    const u = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        bancoHorasExtrasUsoPermitido: true,
        bancoHorasExtrasUsoLimiteMinutos: true,
      },
    });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    if (!(await this.jornadaService.participaControlePonto(usuarioId))) {
      throw new ForbiddenException('Banco de horas não se aplica a este colaborador.');
    }
    if (!u.bancoHorasExtrasUsoPermitido) {
      throw new ForbiddenException('O RH não habilitou solicitações de uso de horas extras para você.');
    }
    const lim = u.bancoHorasExtrasUsoLimiteMinutos;
    if (typeof lim !== 'number' || lim < 1) {
      throw new BadRequestException('Limite de uso não configurado. Peça ao RH para definir o limite em minutos.');
    }
    const m = Math.floor(minutos);
    if (!Number.isFinite(m) || m < 1) {
      throw new BadRequestException('minutos deve ser um inteiro ≥ 1.');
    }
    const comprometido = await this.minutosUsoExtrasComprometidos(usuarioId);
    if (comprometido + m > lim) {
      throw new BadRequestException(
        `Solicitação excede o limite autorizado. Disponível: ${Math.max(0, lim - comprometido)} min.`,
      );
    }

    return this.prisma.bancoHorasUsoExtrasSolicitacao.create({
      data: {
        usuarioId,
        minutosSolicitados: m,
        competencia,
        observacao: observacao?.trim() ? observacao.trim().slice(0, 4000) : null,
        status: SolicitacaoStatus.PENDENTE,
      },
      include: {
        revisor: { select: { id: true, nome: true } },
        lancamento: { select: { id: true } },
      },
    });
  }

  async listarMinhasSolicitacoesUsoExtras(usuarioId: number) {
    return this.prisma.bancoHorasUsoExtrasSolicitacao.findMany({
      where: { usuarioId },
      orderBy: { dataCriacao: 'desc' },
      include: {
        revisor: { select: { id: true, nome: true } },
        lancamento: { select: { id: true } },
      },
    });
  }

  async listarSolicitacoesUsoExtras(statusParam?: string) {
    const allowed: SolicitacaoStatus[] = [
      SolicitacaoStatus.PENDENTE,
      SolicitacaoStatus.APROVADO,
      SolicitacaoStatus.REPROVADO,
      SolicitacaoStatus.CANCELADO,
    ];
    const status =
      statusParam && (allowed as string[]).includes(statusParam)
        ? (statusParam as SolicitacaoStatus)
        : undefined;
    return this.prisma.bancoHorasUsoExtrasSolicitacao.findMany({
      where: status ? { status } : {},
      orderBy: { dataCriacao: 'desc' },
      take: 200,
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        revisor: { select: { id: true, nome: true } },
        lancamento: { select: { id: true } },
      },
    });
  }

  async cancelarMinhaSolicitacaoUsoExtras(usuarioId: number, solicitacaoId: number) {
    const s = await this.prisma.bancoHorasUsoExtrasSolicitacao.findFirst({
      where: { id: solicitacaoId, usuarioId },
    });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    if (s.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Só é possível cancelar solicitações pendentes.');
    }
    await this.prisma.bancoHorasUsoExtrasSolicitacao.update({
      where: { id: solicitacaoId },
      data: { status: SolicitacaoStatus.CANCELADO, dataDecisao: new Date() },
    });
    return { ok: true };
  }

  async aprovarSolicitacaoUsoExtras(revisorId: number, solicitacaoId: number, comentario?: string) {
    const s = await this.prisma.bancoHorasUsoExtrasSolicitacao.findUnique({
      where: { id: solicitacaoId },
      include: { usuario: { select: { id: true } } },
    });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    if (s.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Esta solicitação não está pendente.');
    }

    const u = await this.prisma.usuario.findUnique({
      where: { id: s.usuarioId },
      select: {
        bancoHorasExtrasUsoPermitido: true,
        bancoHorasExtrasUsoLimiteMinutos: true,
      },
    });
    if (!u?.bancoHorasExtrasUsoPermitido) {
      throw new BadRequestException('Uso de extras não está mais permitido para este colaborador.');
    }
    const lim = u.bancoHorasExtrasUsoLimiteMinutos;
    if (typeof lim !== 'number' || lim < 1) {
      throw new BadRequestException('Limite não configurado para este colaborador.');
    }

    // Lock retroativo: aprovar uso de extras lança um débito; se a competência
    // já está fechada, exigir reabertura primeiro.
    await assertCompetenciaAberta(this.prisma, s.usuarioId, s.competencia);

    const saldoAte = await this.saldoAcumulado(s.usuarioId, s.competencia);
    if (saldoAte < s.minutosSolicitados) {
      throw new BadRequestException(
        `Saldo acumulado até ${s.competencia} (${saldoAte} min) é menor que os ${s.minutosSolicitados} min solicitados.`,
      );
    }

    const [yStr, mStr] = s.competencia.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const dataLanc = new Date(Date.UTC(y, m - 1, 15, 12, 0, 0, 0));

    const coment = comentario?.trim() ? comentario.trim().slice(0, 2000) : null;

    await this.prisma.$transaction(async (tx) => {
      const lanc = await tx.bancoHorasLancamento.create({
        data: {
          usuarioId: s.usuarioId,
          competencia: s.competencia,
          data: dataLanc,
          minutosCredito: 0,
          minutosDebito: s.minutosSolicitados,
          origem: BancoHorasOrigem.COMPENSACAO,
          descricao: `Uso de horas extras (solicitação #${s.id})`,
        },
      });
      await tx.bancoHorasUsoExtrasSolicitacao.update({
        where: { id: s.id },
        data: {
          status: SolicitacaoStatus.APROVADO,
          revisorId,
          comentarioRevisor: coment,
          dataDecisao: new Date(),
          lancamentoId: lanc.id,
        },
      });
    });

    void this.notifications
      .create({
        usuarioId: s.usuarioId,
        titulo: 'Uso de horas extras aprovado',
        mensagem: coment
          ? `Sua solicitação de ${s.minutosSolicitados} min foi aprovada: ${coment}`
          : `Sua solicitação de ${s.minutosSolicitados} min foi aprovada.`,
        tipo: NotificacaoTipo.SUCCESS,
      })
      .catch(() => undefined);

    return this.prisma.bancoHorasUsoExtrasSolicitacao.findUnique({
      where: { id: solicitacaoId },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        revisor: { select: { id: true, nome: true } },
        lancamento: { select: { id: true } },
      },
    });
  }

  async reprovarSolicitacaoUsoExtras(revisorId: number, solicitacaoId: number, comentario?: string) {
    const s = await this.prisma.bancoHorasUsoExtrasSolicitacao.findUnique({ where: { id: solicitacaoId } });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    if (s.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Esta solicitação não está pendente.');
    }
    const coment = comentario?.trim() ? comentario.trim().slice(0, 2000) : null;
    const atualizada = await this.prisma.bancoHorasUsoExtrasSolicitacao.update({
      where: { id: solicitacaoId },
      data: {
        status: SolicitacaoStatus.REPROVADO,
        revisorId,
        comentarioRevisor: coment,
        dataDecisao: new Date(),
      },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        revisor: { select: { id: true, nome: true } },
        lancamento: { select: { id: true } },
      },
    });

    void this.notifications
      .create({
        usuarioId: s.usuarioId,
        titulo: 'Uso de horas extras reprovado',
        mensagem: coment
          ? `Sua solicitação de ${s.minutosSolicitados} min foi reprovada: ${coment}`
          : `Sua solicitação de ${s.minutosSolicitados} min foi reprovada.`,
        tipo: NotificacaoTipo.WARNING,
      })
      .catch(() => undefined);

    return atualizada;
  }

  /**
   * Fecha a competência: gera lançamentos a partir do saldo diário do espelho
   * e cria o snapshot em BancoHorasFechamento. Calcula recibo (hash SHA-256
   * do espelho + saldos) e registra evento em BancoHorasFechamentoLog.
   */
  async fechar(adminUserId: number, usuarioId: number, mesParam?: string, ip?: string) {
    const competencia = this.validarMes(mesParam);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    if (!(await this.jornadaService.participaControlePonto(usuarioId))) {
      throw new BadRequestException(
        'Este colaborador está configurado sem controle de ponto/banco de horas na jornada.',
      );
    }

    const fechamentoExistente = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
    });
    if (fechamentoExistente) {
      throw new BadRequestException('Esta competência já foi fechada.');
    }

    const espelho = await this.espelhoService.espelhoUsuario(usuarioId, competencia);

    const [yStr, mStr] = competencia.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const competenciaAnterior =
      m === 1
        ? `${y - 1}-12`
        : `${y}-${String(m - 1).padStart(2, '0')}`;
    const saldoAnteriorMin = await this.saldoBancoAteCompetencia(usuarioId, competenciaAnterior);

    // Faixa de NSR (RegistroPonto) coberta no mês — usada no recibo/AFD.
    const inicioMes = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const fimMes = new Date(y, m, 1, 0, 0, 0, 0);
    const nsrAgg = await this.prisma.registroPonto.aggregate({
      where: { usuarioId, dataHora: { gte: inicioMes, lt: fimMes } },
      _min: { nsr: true },
      _max: { nsr: true },
    });

    let creditoMin = 0;
    let debitoMin = 0;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.bancoHorasLancamento.deleteMany({
          where: {
            usuarioId,
            competencia,
            origem: { in: [BancoHorasOrigem.PONTO, BancoHorasOrigem.FECHAMENTO] },
          },
        });

        for (const dia of espelho.dias) {
          if (dia.saldoMin === 0) continue;
          const credito = dia.saldoMin > 0 ? dia.saldoMin : 0;
          const debito = dia.saldoMin < 0 ? -dia.saldoMin : 0;
          creditoMin += credito;
          debitoMin += debito;
          await tx.bancoHorasLancamento.create({
            data: {
              usuarioId,
              competencia,
              data: new Date(`${dia.data}T12:00:00`),
              minutosCredito: credito,
              minutosDebito: debito,
              origem: BancoHorasOrigem.PONTO,
              descricao: `Saldo do dia ${dia.data} (${dia.status})`,
            },
          });
        }

        const saldoFinalMin = this.pisoBancoHoras(saldoAnteriorMin + creditoMin - debitoMin);

        const reciboPayload = {
          usuarioId,
          competencia,
          saldoAnteriorMin,
          creditoMin,
          debitoMin,
          saldoFinalMin,
          dias: espelho.dias.map((d) => ({
            data: d.data,
            status: d.status,
            entrada: d.entrada,
            saida: d.saida,
            trabalhadoMin: d.trabalhadoMin,
            esperadoMin: d.esperadoMin,
            saldoMin: d.saldoMin,
            atrasoMin: d.atrasoMin,
            extraMin: d.extraMin,
          })),
          nsrInicial: nsrAgg._min.nsr ?? null,
          nsrFinal: nsrAgg._max.nsr ?? null,
        };
        const reciboHash = createHash('sha256')
          .update(JSON.stringify(reciboPayload), 'utf8')
          .digest('hex');

        const fechamento = await tx.bancoHorasFechamento.create({
          data: {
            usuarioId,
            competencia,
            saldoAnteriorMin,
            creditoMin,
            debitoMin,
            saldoFinalMin,
            fechadoPorId: adminUserId,
            nsrInicial: nsrAgg._min.nsr ?? null,
            nsrFinal: nsrAgg._max.nsr ?? null,
            reciboHash,
          },
        });

        await tx.bancoHorasFechamentoLog.create({
          data: {
            fechamentoId: fechamento.id,
            evento: 'FECHADO',
            executorId: adminUserId,
            motivo: null,
            snapshot: reciboPayload as unknown as Prisma.InputJsonValue,
            ip: ip ?? null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.extrato(usuarioId, competencia);
  }

  /**
   * Gera palavra aleatória de desafio para reabrir fechamento.
   * Persiste em `BancoHorasReaberturaDesafio` (sobrevive a restart e multi-instância).
   * Substitui desafios anteriores não usados para a mesma chave.
   */
  async gerarPalavraDesafioReabrir(
    adminUserId: number,
    usuarioId: number,
    mesParam: string | undefined,
  ): Promise<{ palavraDesafio: string }> {
    const competencia = this.validarMes(mesParam);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const fechamentoExistente = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
    });
    if (!fechamentoExistente) {
      throw new BadRequestException('Esta competência não está fechada.');
    }

    const palavraDesafio = randomBytes(5).toString('hex');
    const hashPalavra = createHash('sha256').update(palavraDesafio, 'utf8').digest('hex');
    const expiraEm = new Date(Date.now() + DESAFIO_REABRIR_TTL_MS);

    // Invalida desafios anteriores não usados desta combinação (idempotência).
    await this.prisma.bancoHorasReaberturaDesafio.updateMany({
      where: {
        adminId: adminUserId,
        usuarioAlvoId: usuarioId,
        competencia,
        usadoEm: null,
      },
      data: { usadoEm: new Date() },
    });

    await this.prisma.bancoHorasReaberturaDesafio.create({
      data: {
        adminId: adminUserId,
        usuarioAlvoId: usuarioId,
        competencia,
        hashPalavra,
        expiraEm,
      },
    });

    return { palavraDesafio };
  }

  /**
   * Remove o fechamento da competência e apaga lançamentos PONTO/FECHAMENTO daquele mês.
   * Mantém AJUSTE/COMPENSAÇÃO. Exige palavra-chave válida (do desafio persistido).
   * Registra evento `REABERTO` em BancoHorasFechamentoLog (audit trail).
   */
  async reabrirFechamento(
    adminUserId: number,
    usuarioId: number,
    mesParam: string | undefined,
    palavraDesafio: string,
    ip?: string,
  ) {
    const competencia = this.validarMes(mesParam);

    if (!palavraDesafio?.trim()) {
      throw new BadRequestException('Informe a palavra de confirmação.');
    }

    const desafio = await this.prisma.bancoHorasReaberturaDesafio.findFirst({
      where: {
        adminId: adminUserId,
        usuarioAlvoId: usuarioId,
        competencia,
        usadoEm: null,
        expiraEm: { gt: new Date() },
      },
      orderBy: { dataCriacao: 'desc' },
    });
    if (!desafio) {
      throw new ForbiddenException(
        'Palavra inválida ou expirada. Use “Desfazer fechamento” para gerar uma nova palavra.',
      );
    }

    const hashDigitado = createHash('sha256').update(palavraDesafio.trim(), 'utf8').digest();
    const hashEsperado = Buffer.from(desafio.hashPalavra, 'hex');
    if (
      hashDigitado.length !== hashEsperado.length ||
      !timingSafeEqual(hashDigitado, hashEsperado)
    ) {
      throw new ForbiddenException('Palavra de confirmação incorreta.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    const fechamentoExistente = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
    });
    if (!fechamentoExistente) {
      throw new BadRequestException('Esta competência não está fechada.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Marca desafio como usado (consumo único).
        await tx.bancoHorasReaberturaDesafio.update({
          where: { id: desafio.id },
          data: { usadoEm: new Date() },
        });

        // Snapshot do estado anterior para auditoria.
        const snapshotLanc = await tx.bancoHorasLancamento.findMany({
          where: {
            usuarioId,
            competencia,
            origem: { in: [BancoHorasOrigem.PONTO, BancoHorasOrigem.FECHAMENTO] },
          },
        });

        await tx.bancoHorasFechamentoLog.create({
          data: {
            fechamentoId: fechamentoExistente.id,
            evento: 'REABERTO',
            executorId: adminUserId,
            motivo: null,
            snapshot: {
              fechamento: {
                saldoAnteriorMin: fechamentoExistente.saldoAnteriorMin,
                creditoMin: fechamentoExistente.creditoMin,
                debitoMin: fechamentoExistente.debitoMin,
                saldoFinalMin: fechamentoExistente.saldoFinalMin,
                reciboHash: fechamentoExistente.reciboHash,
                nsrInicial: fechamentoExistente.nsrInicial,
                nsrFinal: fechamentoExistente.nsrFinal,
              },
              lancamentos: snapshotLanc.map((l) => ({
                id: l.id,
                data: l.data,
                minutosCredito: l.minutosCredito,
                minutosDebito: l.minutosDebito,
                origem: l.origem,
                descricao: l.descricao,
              })),
            } as unknown as Prisma.InputJsonValue,
            ip: ip ?? null,
          },
        });

        await tx.bancoHorasLancamento.deleteMany({
          where: {
            usuarioId,
            competencia,
            origem: { in: [BancoHorasOrigem.PONTO, BancoHorasOrigem.FECHAMENTO] },
          },
        });
        await tx.bancoHorasFechamento.delete({
          where: { usuarioId_competencia: { usuarioId, competencia } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.extrato(usuarioId, competencia);
  }

  /** Remove um lançamento manual (AJUSTE ou COMPENSAÇÃO). Não permite apagar PONTO/FECHAMENTO. */
  async excluirLancamento(usuarioId: number, lancamentoId: number) {
    const l = await this.prisma.bancoHorasLancamento.findFirst({
      where: { id: lancamentoId, usuarioId },
    });
    if (!l) {
      throw new NotFoundException('Lançamento não encontrado.');
    }
    if (l.origem !== BancoHorasOrigem.AJUSTE && l.origem !== BancoHorasOrigem.COMPENSACAO) {
      throw new BadRequestException(
        'Só é permitido excluir lançamentos manuais (AJUSTE ou COMPENSAÇÃO). Para remover o espelho do mês, desfaça o fechamento.',
      );
    }
    await this.prisma.bancoHorasLancamento.delete({
      where: { id: lancamentoId },
    });
    return this.extrato(usuarioId, l.competencia);
  }

  async lancarManual(
    adminUserId: number,
    usuarioId: number,
    competencia: string,
    minutos: number,
    descricao: string,
    dataReferencia?: string,
  ) {
    const compNorm = this.validarMes(competencia);
    if (!(await this.jornadaService.participaControlePonto(usuarioId))) {
      throw new BadRequestException(
        'Colaborador sem controle de ponto/banco de horas não recebe lançamentos manuais por este fluxo.',
      );
    }
    if (!Number.isFinite(minutos) || minutos === 0) {
      throw new BadRequestException('minutos deve ser um número diferente de zero.');
    }
    // Lock retroativo: lançamentos manuais em mês fechado exigem reabertura.
    await assertCompetenciaAberta(this.prisma, usuarioId, compNorm);

    let dataLanc: Date;
    if (dataReferencia) {
      const [ys, ms, ds] = dataReferencia.split('-');
      const y = Number(ys);
      const m = Number(ms);
      const d = Number(ds);
      if (!y || m < 1 || m > 12 || d < 1 || d > 31) {
        throw new BadRequestException('dataReferencia inválida.');
      }
      dataLanc = new Date(y, m - 1, d, 12, 0, 0, 0);
      if (
        dataLanc.getFullYear() !== y ||
        dataLanc.getMonth() !== m - 1 ||
        dataLanc.getDate() !== d
      ) {
        throw new BadRequestException('dataReferencia não existe no calendário.');
      }
      const compDaData = `${y}-${String(m).padStart(2, '0')}`;
      if (compDaData !== compNorm) {
        throw new BadRequestException('A data do ajuste deve estar na mesma competência (mês) selecionada.');
      }
    } else {
      dataLanc = new Date();
    }

    return this.prisma.bancoHorasLancamento.create({
      data: {
        usuarioId,
        competencia: compNorm,
        data: dataLanc,
        minutosCredito: minutos > 0 ? minutos : 0,
        minutosDebito: minutos < 0 ? -minutos : 0,
        origem: BancoHorasOrigem.AJUSTE,
        descricao: `${descricao} (lançado por #${adminUserId})`,
      },
    });
  }

  async resumoTodos(
    competencia?: string,
    dataInicioParam?: string,
    dataFimParam?: string,
  ) {
    if (dataInicioParam?.trim() && dataFimParam?.trim()) {
      return this.resumoTodosPorPeriodo(
        dataInicioParam.trim(),
        dataFimParam.trim(),
      );
    }
    const comp = this.validarMes(competencia);
    const usuarios = await this.prisma.usuario.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, email: true },
    });

    // Pré-carrega bloqueios em batch.
    const [yStr, mStr] = comp.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const inicioMes = new Date(y, m - 1, 1);
    const fimMes = new Date(y, m, 0, 23, 59, 59, 999);

    const [docsAVencer, afastamentosSemAnexo] = await Promise.all([
      this.prisma.documentoColaborador.findMany({
        where: { dataValidade: { gte: inicioMes, lte: fimMes } },
        select: { usuarioId: true, titulo: true },
      }),
      this.prisma.afastamento.findMany({
        where: {
          dataInicio: { lte: fimMes },
          dataFim: { gte: inicioMes },
          anexoUrl: null,
        },
        select: { usuarioId: true, tipo: true, dataInicio: true, dataFim: true },
      }),
    ]);

    const docsPorUser = new Map<number, number>();
    for (const d of docsAVencer) {
      docsPorUser.set(d.usuarioId, (docsPorUser.get(d.usuarioId) ?? 0) + 1);
    }
    const afastSemAnexoPorUser = new Map<number, number>();
    for (const a of afastamentosSemAnexo) {
      afastSemAnexoPorUser.set(a.usuarioId, (afastSemAnexoPorUser.get(a.usuarioId) ?? 0) + 1);
    }

    const result = [] as Array<{
      usuarioId: number;
      nome: string;
      email: string;
      saldoMesMin: number;
      saldoAcumuladoMin: number;
      fechado: boolean;
      bloqueios: {
        documentosVencendo: number;
        afastamentosSemAnexo: number;
        saldoNegativo: boolean;
      };
    }>;
    for (const u of usuarios) {
      if (!(await this.jornadaService.participaControlePonto(u.id))) continue;
      const ext = await this.extrato(u.id, comp);
      result.push({
        usuarioId: u.id,
        nome: u.nome,
        email: u.email,
        saldoMesMin: ext.saldoMesMin,
        saldoAcumuladoMin: ext.saldoAcumuladoMin,
        fechado: !!ext.fechamento,
        bloqueios: {
          documentosVencendo: docsPorUser.get(u.id) ?? 0,
          afastamentosSemAnexo: afastSemAnexoPorUser.get(u.id) ?? 0,
          saldoNegativo: ext.saldoMesMin < 0,
        },
      });
    }
    return { competencia: comp, usuarios: result };
  }

  private async resumoTodosPorPeriodo(dataInicio: string, dataFim: string) {
    const { ymdInicio, ymdFim } = this.validarPeriodoDatas(dataInicio, dataFim);
    const usuarios = await this.prisma.usuario.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, email: true },
    });

    const result = [] as Array<{
      usuarioId: number;
      nome: string;
      email: string;
      saldoMesMin: number;
      saldoAcumuladoMin: number;
      fechado: boolean;
      bloqueios: {
        documentosVencendo: number;
        afastamentosSemAnexo: number;
        saldoNegativo: boolean;
      };
    }>;

    const inicio = this.parseDataYmd(ymdInicio);
    const fim = this.fimDoDiaYmd(ymdFim);

    const [docsAVencer, afastamentosSemAnexo] = await Promise.all([
      this.prisma.documentoColaborador.findMany({
        where: { dataValidade: { gte: inicio, lte: fim } },
        select: { usuarioId: true },
      }),
      this.prisma.afastamento.findMany({
        where: {
          dataInicio: { lte: fim },
          dataFim: { gte: inicio },
          anexoUrl: null,
        },
        select: { usuarioId: true },
      }),
    ]);

    const docsPorUser = new Map<number, number>();
    for (const d of docsAVencer) {
      docsPorUser.set(d.usuarioId, (docsPorUser.get(d.usuarioId) ?? 0) + 1);
    }
    const afastSemAnexoPorUser = new Map<number, number>();
    for (const a of afastamentosSemAnexo) {
      afastSemAnexoPorUser.set(a.usuarioId, (afastSemAnexoPorUser.get(a.usuarioId) ?? 0) + 1);
    }

    for (const u of usuarios) {
      if (!(await this.jornadaService.participaControlePonto(u.id))) continue;
      const ext = await this.extratoPorPeriodo(u.id, ymdInicio, ymdFim);
      result.push({
        usuarioId: u.id,
        nome: u.nome,
        email: u.email,
        saldoMesMin: ext.saldoMesMin,
        saldoAcumuladoMin: ext.saldoAcumuladoMin,
        fechado: false,
        bloqueios: {
          documentosVencendo: docsPorUser.get(u.id) ?? 0,
          afastamentosSemAnexo: afastSemAnexoPorUser.get(u.id) ?? 0,
          saldoNegativo: ext.saldoMesMin < 0,
        },
      });
    }

    return {
      competencia: null,
      periodo: { dataInicio: ymdInicio, dataFim: ymdFim },
      usuarios: result,
    };
  }

  /** Fechamento em massa para uma lista de usuários. Devolve sucessos e falhas. */
  async fecharEmMassa(
    adminUserId: number,
    usuarioIds: number[],
    mesParam?: string,
    ip?: string,
  ): Promise<{
    competencia: string;
    sucessos: number[];
    falhas: Array<{ usuarioId: number; motivo: string }>;
  }> {
    const competencia = this.validarMes(mesParam);
    const sucessos: number[] = [];
    const falhas: Array<{ usuarioId: number; motivo: string }> = [];
    for (const usuarioId of usuarioIds) {
      try {
        await this.fechar(adminUserId, usuarioId, competencia, ip);
        sucessos.push(usuarioId);
      } catch (e: unknown) {
        const motivo = e instanceof Error ? e.message : 'Erro desconhecido';
        falhas.push({ usuarioId, motivo });
      }
    }
    return { competencia, sucessos, falhas };
  }

  /** Recibo do mês para o colaborador conferir e aceitar. */
  async obterRecibo(usuarioId: number, mesParam?: string) {
    const competencia = this.validarMes(mesParam);
    const fechamento = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
      include: {
        usuario: { select: { id: true, nome: true, email: true, cpf: true } },
        fechadoPor: { select: { id: true, nome: true } },
      },
    });
    if (!fechamento) {
      throw new NotFoundException('Competência ainda não foi fechada para este colaborador.');
    }
    const espelho = await this.espelhoService.espelhoUsuario(usuarioId, competencia);
    const empregador = await this.prisma.empregador.findFirst({
      where: { principal: true },
      orderBy: { id: 'asc' },
    });
    return { fechamento, espelho, empregador };
  }

  /** Marca o aceite do colaborador (registra `aceiteEm`/`aceiteIp` e log RECONFIRMADO). */
  async aceitarRecibo(usuarioId: number, mesParam?: string, ip?: string) {
    const competencia = this.validarMes(mesParam);
    const fechamento = await this.prisma.bancoHorasFechamento.findUnique({
      where: { usuarioId_competencia: { usuarioId, competencia } },
    });
    if (!fechamento) {
      throw new NotFoundException('Competência ainda não foi fechada.');
    }
    if (fechamento.aceiteEm) {
      return { jaAceito: true, aceiteEm: fechamento.aceiteEm };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bancoHorasFechamento.update({
        where: { id: fechamento.id },
        data: { aceiteEm: new Date(), aceiteIp: ip ?? null },
      });
      await tx.bancoHorasFechamentoLog.create({
        data: {
          fechamentoId: fechamento.id,
          evento: 'RECONFIRMADO',
          executorId: usuarioId,
          motivo: 'Aceite do colaborador (recibo do mês)',
          ip: ip ?? null,
        },
      });
    });

    return { jaAceito: false, aceiteEm: new Date() };
  }
}
