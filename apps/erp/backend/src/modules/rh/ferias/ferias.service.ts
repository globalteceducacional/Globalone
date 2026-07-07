import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificacaoTipo, SolicitacaoStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { competenciaDeLocal } from '../../../common/utils/competencia-lock.util';
import { CriarFeriasDto, DecidirFeriasDto } from './dto/ferias.dto';

const include = {
  usuario: { select: { id: true, nome: true, email: true } },
  revisor: { select: { id: true, nome: true } },
  periodoAquisitivo: true,
};

@Injectable()
export class FeriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Garante a existência do período aquisitivo corrente baseado em dataEntrada. */
  async garantirPeriodos(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, dataEntrada: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    if (!usuario.dataEntrada) return [];

    const existentes = await this.prisma.periodoAquisitivo.findMany({
      where: { usuarioId },
      orderBy: { inicio: 'asc' },
    });
    const inicio = new Date(usuario.dataEntrada);
    const hoje = new Date();
    const periodos = [...existentes];

    let cursor = new Date(inicio);
    while (cursor < hoje) {
      const fim = new Date(cursor);
      fim.setFullYear(fim.getFullYear() + 1);
      const ja = periodos.find((p) => p.inicio.getTime() === cursor.getTime());
      if (!ja) {
        const novo = await this.prisma.periodoAquisitivo.create({
          data: { usuarioId, inicio: cursor, fim },
        });
        periodos.push(novo);
      }
      cursor = fim;
    }
    return periodos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  async resumoUsuario(usuarioId: number) {
    const periodos = await this.garantirPeriodos(usuarioId);
    const solicitacoes = await this.prisma.feriasSolicitacao.findMany({
      where: { usuarioId },
      orderBy: { dataInicio: 'desc' },
      include,
    });
    const reservadosPorPeriodo = new Map<number, number>();
    for (const s of solicitacoes) {
      if (s.status === SolicitacaoStatus.PENDENTE && s.periodoAquisitivoId) {
        const cur = reservadosPorPeriodo.get(s.periodoAquisitivoId) ?? 0;
        reservadosPorPeriodo.set(
          s.periodoAquisitivoId,
          cur + s.diasSolicitados + (s.abonoPecuniario ?? 0),
        );
      }
    }
    const saldoDias = periodos.reduce(
      (acc, p) => acc + (p.diasDireito - p.diasUsados - (reservadosPorPeriodo.get(p.id) ?? 0)),
      0,
    );
    const saldoReservado = Array.from(reservadosPorPeriodo.values()).reduce((a, b) => a + b, 0);
    return { saldoDias, saldoReservado, periodos, solicitacoes };
  }

  private contarDias(inicio: Date, fim: Date): number {
    return Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / (24 * 3600 * 1000)) + 1);
  }

  async criar(usuarioId: number, dto: CriarFeriasDto) {
    const dataInicio = new Date(dto.dataInicio);
    const dataFim = new Date(dto.dataFim);
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (dataFim < dataInicio) {
      throw new BadRequestException('dataFim deve ser posterior a dataInicio.');
    }
    const dias = this.contarDias(dataInicio, dataFim);
    const abono = dto.abonoPecuniario ?? 0;

    // CLT: a soma de dias gozados + abono não pode passar de 30 do período aquisitivo.
    if (dto.periodoAquisitivoId) {
      const periodo = await this.prisma.periodoAquisitivo.findUnique({
        where: { id: dto.periodoAquisitivoId },
      });
      if (!periodo || periodo.usuarioId !== usuarioId) {
        throw new BadRequestException('Período aquisitivo inválido.');
      }
      const reservados = await this.calcularDiasReservados(usuarioId, dto.periodoAquisitivoId);
      const saldoLivre = periodo.diasDireito - periodo.diasUsados - reservados;
      if (dias + abono > saldoLivre) {
        throw new BadRequestException(
          `Saldo insuficiente no período aquisitivo. Disponível: ${saldoLivre} dias (gozo + abono).`,
        );
      }
    }

    const solicitacao = await this.prisma.feriasSolicitacao.create({
      data: {
        usuarioId,
        dataInicio,
        dataFim,
        diasSolicitados: dias,
        abonoPecuniario: abono,
        observacao: dto.observacao?.trim() || null,
        periodoAquisitivoId: dto.periodoAquisitivoId ?? null,
      },
      include,
    });

    void this.notifications
      .create({
        usuarioId,
        titulo: 'Solicitação de férias enviada',
        mensagem: `Aguardando aprovação do RH (${dias} dias${abono ? ` + ${abono} abono` : ''}).`,
        tipo: NotificacaoTipo.INFO,
      })
      .catch(() => undefined);

    return solicitacao;
  }

  /** Soma os dias reservados (PENDENTES) por período aquisitivo, para reservar saldo. */
  private async calcularDiasReservados(usuarioId: number, periodoAquisitivoId: number): Promise<number> {
    const pendentes = await this.prisma.feriasSolicitacao.findMany({
      where: { usuarioId, periodoAquisitivoId, status: SolicitacaoStatus.PENDENTE },
      select: { diasSolicitados: true, abonoPecuniario: true },
    });
    return pendentes.reduce((acc, p) => acc + p.diasSolicitados + (p.abonoPecuniario ?? 0), 0);
  }

  listarTodas(filtro?: SolicitacaoStatus) {
    return this.prisma.feriasSolicitacao.findMany({
      where: { status: filtro ?? undefined },
      orderBy: [{ status: 'asc' }, { dataInicio: 'desc' }],
      include,
    });
  }

  async aprovar(revisorId: number, id: number, dto: DecidirFeriasDto) {
    const sol = await this.prisma.feriasSolicitacao.findUnique({ where: { id } });
    if (!sol) throw new NotFoundException('Solicitação não encontrada.');
    if (sol.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Esta solicitação já foi decidida.');
    }

    // Lock retroativo: se o intervalo cobrir competência fechada, recusa.
    const competencias = new Set<string>();
    const cur = new Date(sol.dataInicio);
    cur.setDate(1);
    while (cur <= sol.dataFim) {
      competencias.add(competenciaDeLocal(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    const fechadas = await this.prisma.bancoHorasFechamento.findMany({
      where: { usuarioId: sol.usuarioId, competencia: { in: Array.from(competencias) } },
      select: { competencia: true },
    });
    if (fechadas.length) {
      throw new BadRequestException(
        `Não é possível aprovar férias que cruzam competência(s) fechada(s): ${fechadas.map((f) => f.competencia).join(', ')}. Reabra primeiro.`,
      );
    }

    // Validações CLT
    if (dto.dataPagamento) {
      const dp = new Date(dto.dataPagamento);
      if (Number.isNaN(dp.getTime())) {
        throw new BadRequestException('dataPagamento inválida.');
      }
      if (dp >= sol.dataInicio) {
        throw new BadRequestException(
          'Conforme CLT, o pagamento das férias deve ocorrer ANTES do início do período de gozo.',
        );
      }
    }

    const atualizada = await this.prisma.feriasSolicitacao.update({
      where: { id },
      data: {
        status: SolicitacaoStatus.APROVADO,
        revisorId,
        comentarioRevisor: dto.comentario?.trim() || null,
        dataDecisao: new Date(),
        dataPagamento: dto.dataPagamento ? new Date(dto.dataPagamento) : null,
        tercoConstitucional: dto.tercoConstitucional ?? null,
      },
      include,
    });

    if (sol.periodoAquisitivoId) {
      // Computa gozo + abono nos dias usados.
      const incremento = sol.diasSolicitados + (sol.abonoPecuniario ?? 0);
      await this.prisma.periodoAquisitivo.update({
        where: { id: sol.periodoAquisitivoId },
        data: { diasUsados: { increment: incremento } },
      });
    }

    void this.notifications
      .create({
        usuarioId: sol.usuarioId,
        titulo: 'Férias aprovadas',
        mensagem: dto.comentario?.trim() || 'Sua solicitação de férias foi aprovada.',
        tipo: NotificacaoTipo.SUCCESS,
      })
      .catch(() => undefined);

    return atualizada;
  }

  async reprovar(revisorId: number, id: number, dto: DecidirFeriasDto) {
    const sol = await this.prisma.feriasSolicitacao.findUnique({ where: { id } });
    if (!sol) throw new NotFoundException('Solicitação não encontrada.');
    if (sol.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Esta solicitação já foi decidida.');
    }
    const atualizada = await this.prisma.feriasSolicitacao.update({
      where: { id },
      data: {
        status: SolicitacaoStatus.REPROVADO,
        revisorId,
        comentarioRevisor: dto.comentario?.trim() || null,
        dataDecisao: new Date(),
      },
      include,
    });

    void this.notifications
      .create({
        usuarioId: sol.usuarioId,
        titulo: 'Férias reprovadas',
        mensagem: dto.comentario?.trim() || 'Sua solicitação de férias foi reprovada.',
        tipo: NotificacaoTipo.WARNING,
      })
      .catch(() => undefined);

    return atualizada;
  }
}
