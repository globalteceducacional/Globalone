import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarioEventoAlvo, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCalendarioEventoDto } from './dto/create-calendario-evento.dto';
import { UpdateCalendarioEventoDto } from './dto/update-calendario-evento.dto';

const eventoInclude = {
  criador: { select: { id: true, nome: true } },
  projeto: { select: { id: true, nome: true } },
  participantes: { include: { usuario: { select: { id: true, nome: true } } } },
} satisfies Prisma.CalendarioEventoInclude;

@Injectable()
export class CalendarioEventosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertDates(inicio: Date, fim: Date) {
    const a = new Date(inicio).getTime();
    const b = new Date(fim).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) {
      throw new BadRequestException('dataFim deve ser igual ou posterior a dataInicio.');
    }
  }

  private async recipientUserIds(
    alvo: CalendarioEventoAlvo,
    usuarioIds: number[],
  ): Promise<number[]> {
    if (alvo === CalendarioEventoAlvo.TODOS_USUARIOS) {
      const rows = await this.prisma.usuario.findMany({
        where: { ativo: true },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    const unique = [...new Set(usuarioIds)];
    if (unique.length === 0) {
      throw new BadRequestException('Informe ao menos um integrante.');
    }
    const count = await this.prisma.usuario.count({
      where: { id: { in: unique }, ativo: true },
    });
    if (count !== unique.length) {
      throw new BadRequestException('Um ou mais usuários são inválidos ou inativos.');
    }
    return unique;
  }

  private formatPeriod(inicio: Date, fim: Date): string {
    const a = new Date(inicio);
    const b = new Date(fim);
    const legacyMidday =
      a.getUTCHours() === 12 &&
      a.getUTCMinutes() === 0 &&
      b.getUTCHours() === 12 &&
      b.getUTCMinutes() === 0;
    const allDay =
      legacyMidday ||
      (a.getHours() === 0 &&
        a.getMinutes() === 0 &&
        b.getHours() === 23 &&
        b.getMinutes() === 59);

    const dateFmt = (d: Date) => d.toLocaleDateString('pt-BR');
    const timeFmt = (d: Date) =>
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (allDay) {
      const di = dateFmt(a);
      const df = dateFmt(b);
      return di === df ? `${di} (dia inteiro)` : `${di} — ${df} (dias inteiros)`;
    }

    const sameDay =
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (sameDay) {
      return `${dateFmt(a)} · ${timeFmt(a)} — ${timeFmt(b)}`;
    }
    return `${dateFmt(a)} ${timeFmt(a)} → ${dateFmt(b)} ${timeFmt(b)}`;
  }

  private buildMessage(
    titulo: string,
    descricao: string | null | undefined,
    inicio: Date,
    fim: Date,
    prefix: string,
  ): string {
    const periodo = this.formatPeriod(inicio, fim);
    const d = descricao?.trim();
    return `${prefix}: ${titulo}${d ? `\n${d}` : ''}\nPeríodo: ${periodo}`;
  }

  private async notifyRecipients(
    eventoId: number,
    titulo: string,
    descricao: string | null | undefined,
    inicio: Date,
    fim: Date,
    userIds: number[],
    isUpdate: boolean,
  ) {
    const prefix = isUpdate ? 'Evento atualizado no calendário' : 'Novo evento no calendário';
    const mensagem = this.buildMessage(titulo, descricao, inicio, fim, prefix);
    const notifTitulo = isUpdate ? `Calendário (atualizado): ${titulo}` : `Calendário: ${titulo}`;
    for (const uid of userIds) {
      await this.notifications.create({
        usuarioId: uid,
        titulo: notifTitulo,
        mensagem,
        tipo: 'INFO',
        calendarioEventoId: eventoId,
      });
    }
  }

  private canEdit(
    permissions: string[],
    userId: number,
    criadorId: number,
  ): boolean {
    if (permissions.includes('sistema:administrar')) return true;
    return permissions.includes('calendario:eventos') && criadorId === userId;
  }

  private async resolveProjetoId(projetoId?: number): Promise<number | null> {
    if (!Number.isInteger(projetoId) || !projetoId || projetoId < 1) {
      return null;
    }
    const exists = await this.prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Projeto informado não existe.');
    }
    return projetoId;
  }

  async findVisible(userId: number, permissions: string[], projetoId?: number) {
    const hasVerTodos = permissions.includes('calendario:ver_todos');
    const hasAdmin = permissions.includes('sistema:administrar');
    const filtroProjetoId = await this.resolveProjetoId(projetoId);
    const whereProjeto = filtroProjetoId ? { projetoId: filtroProjetoId } : {};

    if (hasVerTodos || hasAdmin) {
      return this.prisma.calendarioEvento.findMany({
        where: whereProjeto,
        include: eventoInclude,
        orderBy: { dataInicio: 'asc' },
      });
    }

    return this.prisma.calendarioEvento.findMany({
      where: {
        ...whereProjeto,
        OR: [
          { criadorId: userId },
          { alvo: CalendarioEventoAlvo.TODOS_USUARIOS },
          { participantes: { some: { usuarioId: userId } } },
        ],
      },
      include: eventoInclude,
      orderBy: { dataInicio: 'asc' },
    });
  }

  async create(userId: number, dto: CreateCalendarioEventoDto) {
    this.assertDates(dto.dataInicio, dto.dataFim);
    if (dto.alvo === CalendarioEventoAlvo.SELECIONADOS && (!dto.usuarioIds || dto.usuarioIds.length === 0)) {
      throw new BadRequestException('Selecione ao menos um integrante ou use todos os usuários.');
    }

    const recipients = await this.recipientUserIds(
      dto.alvo,
      dto.alvo === CalendarioEventoAlvo.SELECIONADOS ? dto.usuarioIds! : [],
    );

    const projetoId = await this.resolveProjetoId(dto.projetoId);

    const created = await this.prisma.calendarioEvento.create({
      data: {
        titulo: dto.titulo.trim(),
        descricao: dto.descricao?.trim() || null,
        dataInicio: dto.dataInicio,
        dataFim: dto.dataFim,
        alvo: dto.alvo,
        criadorId: userId,
        projetoId,
        participantes:
          dto.alvo === CalendarioEventoAlvo.SELECIONADOS
            ? {
                create: dto.usuarioIds!.map((uid) => ({ usuarioId: uid })),
              }
            : undefined,
      },
      include: eventoInclude,
    });

    await this.notifyRecipients(
      created.id,
      created.titulo,
      created.descricao,
      created.dataInicio,
      created.dataFim,
      recipients,
      false,
    );

    return created;
  }

  async update(
    id: number,
    userId: number,
    permissions: string[],
    dto: UpdateCalendarioEventoDto,
  ) {
    const existing = await this.prisma.calendarioEvento.findUnique({
      where: { id },
      include: { participantes: { select: { usuarioId: true } } },
    });
    if (!existing) throw new NotFoundException('Evento não encontrado.');
    if (existing.feriadoId) {
      throw new ForbiddenException(
        'Este evento está vinculado a um feriado. Edite em RH > Ponto > Feriados.',
      );
    }
    if (!this.canEdit(permissions, userId, existing.criadorId)) {
      throw new ForbiddenException('Sem permissão para editar este evento.');
    }

    const finalAlvo = dto.alvo ?? existing.alvo;
    const inicio = dto.dataInicio ?? existing.dataInicio;
    const fim = dto.dataFim ?? existing.dataFim;
    this.assertDates(inicio, fim);

    const projetoId = dto.projetoId !== undefined ? await this.resolveProjetoId(dto.projetoId) : undefined;

    let participanteIds: number[];
    if (finalAlvo === CalendarioEventoAlvo.TODOS_USUARIOS) {
      participanteIds = [];
    } else if (dto.usuarioIds != null) {
      participanteIds = dto.usuarioIds;
    } else {
      participanteIds = existing.participantes.map((p) => p.usuarioId);
    }

    if (finalAlvo === CalendarioEventoAlvo.SELECIONADOS && participanteIds.length === 0) {
      throw new BadRequestException('Selecione ao menos um integrante ou use todos os usuários.');
    }

    const recipients = await this.recipientUserIds(
      finalAlvo,
      finalAlvo === CalendarioEventoAlvo.SELECIONADOS ? participanteIds : [],
    );

    const titulo = dto.titulo !== undefined ? dto.titulo.trim() : existing.titulo;
    const descricao =
      dto.descricao !== undefined ? dto.descricao?.trim() || null : existing.descricao;

    const data: Prisma.CalendarioEventoUncheckedUpdateInput = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.descricao !== undefined) data.descricao = dto.descricao?.trim() || null;
    if (dto.dataInicio !== undefined) data.dataInicio = dto.dataInicio;
    if (dto.dataFim !== undefined) data.dataFim = dto.dataFim;
    if (dto.alvo !== undefined) data.alvo = dto.alvo;
    if (dto.projetoId !== undefined) data.projetoId = projetoId;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.calendarioEventoParticipante.deleteMany({ where: { eventoId: id } });

      return tx.calendarioEvento.update({
        where: { id },
        data: {
          ...data,
          ...(finalAlvo === CalendarioEventoAlvo.SELECIONADOS
            ? {
                participantes: {
                  create: participanteIds.map((uid) => ({ usuarioId: uid })),
                },
              }
            : {}),
        },
        include: eventoInclude,
      });
    });

    await this.notifyRecipients(
      updated.id,
      titulo,
      descricao,
      updated.dataInicio,
      updated.dataFim,
      recipients,
      true,
    );

    return updated;
  }

  async remove(id: number, userId: number, permissions: string[]) {
    const existing = await this.prisma.calendarioEvento.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evento não encontrado.');
    if (existing.feriadoId) {
      throw new ForbiddenException(
        'Este evento está vinculado a um feriado. Exclua o feriado em RH > Ponto > Feriados.',
      );
    }
    if (!this.canEdit(permissions, userId, existing.criadorId)) {
      throw new ForbiddenException('Sem permissão para excluir este evento.');
    }
    await this.prisma.calendarioEvento.delete({ where: { id } });
    return { ok: true };
  }
}
