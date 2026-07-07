import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PushService } from './push.service';

function buildNotificationPath(dto: CreateNotificationDto): string {
  if (dto.etapaId != null) return `/tasks?etapaId=${dto.etapaId}`;
  if (dto.calendarioEventoId != null) return `/calendario?eventoId=${dto.calendarioEventoId}`;
  if (dto.requerimentoId != null) return `/communications?tab=received&id=${dto.requerimentoId}`;
  return '/notifications';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  list(userId: number, unreadOnly = false) {
    return this.prisma.notificacao.findMany({
      where: {
        usuarioId: userId,
        lida: unreadOnly ? false : undefined,
      },
      orderBy: { dataCriacao: 'desc' },
      include: {
        requerimento: true, // Incluir o requerimento linkado
        etapa: {
          select: {
            id: true,
            projetoId: true,
            dataFim: true,
          },
        },
      },
    });
  }

  async create(data: CreateNotificationDto) {
    const created = await this.prisma.notificacao.create({
      data: {
        usuarioId: data.usuarioId,
        titulo: data.titulo,
        mensagem: data.mensagem || '',
        tipo: data.tipo,
        requerimentoId: data.requerimentoId,
        etapaId: data.etapaId,
        calendarioEventoId: data.calendarioEventoId,
      },
    });

    const path = buildNotificationPath(data);
    void this.pushService
      .sendToUser(data.usuarioId, {
        title: data.titulo,
        body: (data.mensagem || '').trim() || 'Nova notificação',
        url: path,
        tag: `erp-notif-${created.id}`,
      })
      .catch(() => undefined);

    return created;
  }

  async markAsRead(id: number, userId: number) {
    // Verifica que a notificação pertence ao usuário antes de marcar
    return this.prisma.notificacao.updateMany({
      where: { id, usuarioId: userId },
      data: { lida: true },
    });
  }

  markAllAsRead(userId: number) {
    return this.prisma.notificacao.updateMany({
      where: { usuarioId: userId, lida: false },
      data: { lida: true },
    });
  }

  clearAll(userId: number) {
    return this.prisma.notificacao.deleteMany({
      where: { usuarioId: userId },
    });
  }
}
