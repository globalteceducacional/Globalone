import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AfastamentoTipo, NotificacaoTipo } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { competenciaDeLocal } from '../../../common/utils/competencia-lock.util';

const include = {
  usuario: { select: { id: true, nome: true, email: true } },
  registradoPor: { select: { id: true, nome: true } },
};

@Injectable()
export class AfastamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Verifica se algum dia do intervalo cai em competência fechada.
   * Lança exceção (BadRequest) listando as competências bloqueadas.
   */
  private async verificarCompetenciasFechadas(
    usuarioId: number,
    dataInicio: Date,
    dataFim: Date,
  ): Promise<void> {
    const competencias = new Set<string>();
    const cur = new Date(dataInicio);
    cur.setDate(1);
    while (cur <= dataFim) {
      competencias.add(competenciaDeLocal(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    if (competencias.size === 0) return;
    const fechadas = await this.prisma.bancoHorasFechamento.findMany({
      where: { usuarioId, competencia: { in: Array.from(competencias) } },
      select: { competencia: true },
    });
    if (fechadas.length) {
      throw new BadRequestException(
        `Não é possível registrar afastamento que cruze competência(s) já fechada(s): ${fechadas.map((f) => f.competencia).join(', ')}. Reabra primeiro.`,
      );
    }
  }

  async criar(
    registradoPorId: number,
    data: {
      usuarioId: number;
      tipo: AfastamentoTipo;
      dataInicio: string | Date;
      dataFim: string | Date;
      motivo?: string;
      anexoUrl?: string | null;
    },
  ) {
    const dataInicio = new Date(data.dataInicio);
    const dataFim = new Date(data.dataFim);
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (dataFim < dataInicio) {
      throw new BadRequestException('dataFim deve ser posterior a dataInicio.');
    }
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: data.usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');

    await this.verificarCompetenciasFechadas(data.usuarioId, dataInicio, dataFim);

    const criado = await this.prisma.afastamento.create({
      data: {
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        dataInicio,
        dataFim,
        motivo: data.motivo?.trim() || null,
        anexoUrl: data.anexoUrl ?? null,
        registradoPorId: registradoPorId,
      },
      include,
    });

    void this.notifications
      .create({
        usuarioId: data.usuarioId,
        titulo: 'Afastamento registrado',
        mensagem: `Foi registrado um afastamento (${data.tipo}) de ${dataInicio.toLocaleDateString('pt-BR')} a ${dataFim.toLocaleDateString('pt-BR')}.`,
        tipo: NotificacaoTipo.INFO,
      })
      .catch(() => undefined);

    return criado;
  }

  listarMeus(usuarioId: number) {
    return this.prisma.afastamento.findMany({
      where: { usuarioId },
      orderBy: { dataInicio: 'desc' },
      include,
    });
  }

  listarTodos(filtros: { usuarioId?: number; tipo?: AfastamentoTipo }) {
    return this.prisma.afastamento.findMany({
      where: {
        usuarioId: filtros.usuarioId,
        tipo: filtros.tipo,
      },
      orderBy: { dataInicio: 'desc' },
      include,
    });
  }

  async remover(id: number) {
    const ex = await this.prisma.afastamento.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Afastamento não encontrado.');
    await this.prisma.afastamento.delete({ where: { id } });
    return { ok: true };
  }
}
