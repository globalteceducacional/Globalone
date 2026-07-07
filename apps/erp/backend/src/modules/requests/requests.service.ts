import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { CompraStatus, Requerimento } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async getUserPermissionKeys(userId: number): Promise<Set<string>> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: { cargo: { include: { permissions: { include: { permission: true } } } } },
    });
    const keys = new Set<string>();
    for (const cp of usuario?.cargo?.permissions ?? []) {
      keys.add(`${cp.permission.modulo}:${cp.permission.acao}`);
    }
    return keys;
  }

  private async userHasComprasInboxAccess(userId: number): Promise<boolean> {
    const perms = await this.getUserPermissionKeys(userId);
    return (
      perms.has('compras:aprovar') ||
      perms.has('compras:visualizar') ||
      perms.has('sistema:administrar')
    );
  }

  private async userCanRespondCompra(userId: number): Promise<boolean> {
    const perms = await this.getUserPermissionKeys(userId);
    return perms.has('compras:aprovar') || perms.has('sistema:administrar');
  }

  private async findComprasApproverUserIds(): Promise<number[]> {
    const users = await this.prisma.usuario.findMany({
      where: {
        ativo: true,
        cargo: {
          permissions: {
            some: { permission: { modulo: 'compras', acao: 'aprovar' } },
          },
        },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async userMayAccessRequerimento(
    requerimento: { usuarioId: number; destinatarioId: number | null; tipo: string },
    usuarioId: number,
  ): Promise<boolean> {
    if (requerimento.usuarioId === usuarioId) return true;
    if (requerimento.destinatarioId === usuarioId) return true;
    if (requerimento.tipo === 'COMPRA' && (await this.userHasComprasInboxAccess(usuarioId))) {
      return true;
    }
    return false;
  }

  private async userMayRespondRequerimento(
    requerimento: { destinatarioId: number | null; tipo: string },
    usuarioId: number,
  ): Promise<boolean> {
    if (requerimento.destinatarioId === usuarioId) return true;
    if (requerimento.tipo === 'COMPRA' && (await this.userCanRespondCompra(usuarioId))) {
      return true;
    }
    return false;
  }

  async create(usuarioId: number, data: CreateRequestDto) {
    if (data.etapaId) {
      await this.ensureTaskExists(data.etapaId);
    }

    // Se for tipo COMPRA, buscar destinatário automaticamente (cargo de compras)
    let destinatarioId = data.destinatarioId;
    if (data.tipo === 'COMPRA') {
      // Validar que itensCompra foi fornecido
      if (!data.itensCompra || data.itensCompra.length === 0) {
        throw new BadRequestException('Itens de compra são obrigatórios para requerimentos do tipo COMPRA');
      }
      // Validar que pelo menos uma cotação tenha link em cada item
      if (data.itensCompra && data.itensCompra.length > 0) {
        for (const item of data.itensCompra) {
          if (!item.cotacoes || item.cotacoes.length === 0) {
            throw new BadRequestException(`O item "${item.item}" deve ter pelo menos uma cotação`);
          }

          const temLink = item.cotacoes.some((cotacao) => cotacao.link && cotacao.link.trim().length > 0);
          if (!temLink) {
            throw new BadRequestException(`O item "${item.item}" deve ter pelo menos uma cotação com link`);
          }
        }
      }

      // Requerimentos de compra vão para o setor (sem destinatário individual).
      destinatarioId = undefined;
    }

    // Se for tipo COMPRA, criar as compras primeiro
    if (data.tipo === 'COMPRA' && data.itensCompra && data.itensCompra.length > 0) {
      // Criar o requerimento
      const requerimento = await this.prisma.requerimento.create({
        data: {
          usuarioId,
          destinatarioId: destinatarioId || null,
          etapaId: data.etapaId,
          texto: data.texto || '',
          tipo: data.tipo,
          anexo: data.anexo,
        },
      });

      const comprasApproverIds = await this.findComprasApproverUserIds();
      await Promise.all(
        comprasApproverIds.map((destId) =>
          this.notificationsService.create({
            usuarioId: destId,
            titulo: 'Novo requerimento de compra',
            mensagem: 'O setor de compras recebeu um novo requerimento para análise.',
            tipo: 'INFO',
            requerimentoId: requerimento.id,
          }),
        ),
      );

      // Criar as compras para cada item
      const compras = await Promise.all(
        data.itensCompra.map((item) => {
          const createData: any = {
            item: item.item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            status: CompraStatus.SOLICITADO,
            solicitadoPorId: usuarioId,
            imagemUrl: item.imagemUrl,
            categoriaId: item.categoriaId,
            projetoId: item.projetoId || null,
            etapaId: data.etapaId || null,
            observacao: item.observacao,
          };

          // Adicionar cotações se existirem
          if (item.cotacoes && item.cotacoes.length > 0) {
            createData.cotacoesJson = item.cotacoes;
          }

          return this.prisma.compra.create({
            data: createData,
          });
        })
      );

      return {
        requerimento,
        compras,
      };
    }

    const recipientIds = (() => {
      const fromArray = (data.destinatarioIds ?? []).filter(
        (id) => Number.isInteger(id) && id > 0,
      );
      if (fromArray.length > 0) {
        return [...new Set(fromArray)];
      }
      if (destinatarioId) {
        return [destinatarioId];
      }
      return [];
    })();

    if (recipientIds.length === 0) {
      throw new BadRequestException('Informe ao menos um destinatário para este tipo de requerimento');
    }

    const usuariosValidos = await this.prisma.usuario.findMany({
      where: { id: { in: recipientIds }, ativo: true },
      select: { id: true },
    });
    if (usuariosValidos.length !== recipientIds.length) {
      throw new BadRequestException('Um ou mais destinatários são inválidos ou inativos');
    }

    const requerimentos: Requerimento[] = [];
    for (const destId of recipientIds) {
      const requerimento = await this.prisma.requerimento.create({
        data: {
          usuarioId,
          destinatarioId: destId,
          etapaId: data.etapaId,
          texto: data.texto || '',
          tipo: data.tipo || 'OUTRO',
          anexo: data.anexo,
        },
      });
      await this.notificationsService.create({
        usuarioId: destId,
        titulo: 'Novo requerimento',
        mensagem: 'Você recebeu um novo requerimento. Acesse Requerimentos para visualizar.',
        tipo: 'INFO',
        requerimentoId: requerimento.id,
      });
      requerimentos.push(requerimento);
    }

    return { requerimentos, count: requerimentos.length };
  }

  listSent(usuarioId: number) {
    return this.prisma.requerimento.findMany({
      where: { usuarioId },
      orderBy: { dataCriacao: 'desc' },
      include: { destinatario: true, etapa: true },
    });
  }

  async listReceived(usuarioId: number) {
    const hasComprasInbox = await this.userHasComprasInboxAccess(usuarioId);
    return this.prisma.requerimento.findMany({
      where: hasComprasInbox
        ? {
            OR: [{ destinatarioId: usuarioId }, { tipo: 'COMPRA' }],
          }
        : { destinatarioId: usuarioId },
      orderBy: { dataCriacao: 'desc' },
      include: { usuario: true, etapa: true, destinatario: true },
    });
  }

  async findOne(id: number, usuarioId: number) {
    let requerimento = await this.prisma.requerimento.findUnique({
      where: { id },
      include: {
        usuario: true,
        destinatario: true,
        etapa: true,
      },
    });

    if (!requerimento) {
      throw new NotFoundException('Requerimento não encontrado');
    }

    if (!(await this.userMayAccessRequerimento(requerimento, usuarioId))) {
      throw new BadRequestException('Você não tem permissão para visualizar este requerimento');
    }

    const podeMarcarLeitura =
      requerimento.destinatarioId === usuarioId ||
      (requerimento.tipo === 'COMPRA' && (await this.userHasComprasInboxAccess(usuarioId)));

    // Destinatário / setor de compras: primeira abertura marca como lido (lista exibe «Lida»).
    if (podeMarcarLeitura && !requerimento.dataLeituraDestinatario) {
      requerimento = await this.prisma.requerimento.update({
        where: { id },
        data: { dataLeituraDestinatario: new Date() },
        include: {
          usuario: true,
          destinatario: true,
          etapa: true,
        },
      });
    }

    // Se for tipo COMPRA, buscar as compras relacionadas
    if (requerimento.tipo === 'COMPRA') {
      // Buscar compras criadas pelo mesmo usuário em uma janela de 1 hora
      // Como não há relação direta, vamos buscar por solicitadoPorId e data próxima
      const dataInicio = new Date(requerimento.dataCriacao);
      dataInicio.setMinutes(dataInicio.getMinutes() - 30); // 30 minutos antes
      const dataFim = new Date(requerimento.dataCriacao);
      dataFim.setMinutes(dataFim.getMinutes() + 30); // 30 minutos depois

      const whereClause: any = {
        solicitadoPorId: requerimento.usuarioId,
        dataSolicitacao: {
          gte: dataInicio,
          lte: dataFim,
        },
      };

      // Se houver etapaId, incluir na busca para maior precisão
      if (requerimento.etapaId) {
        whereClause.etapaId = requerimento.etapaId;
      }

      const compras = await this.prisma.compra.findMany({
        where: whereClause,
        include: {
          categoria: true,
          projeto: true,
          etapa: true,
        },
        orderBy: { dataSolicitacao: 'asc' },
      });

      return {
        ...requerimento,
        compras,
      };
    }

    return requerimento;
  }

  async respond(id: number, usuarioId: number, data: RespondRequestDto) {
    const request = await this.prisma.requerimento.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Requerimento não encontrado');
    }

    if (!(await this.userMayRespondRequerimento(request, usuarioId))) {
      throw new BadRequestException('Somente o destinatário pode responder o requerimento');
    }

    return this.prisma.requerimento.update({
      where: { id },
      data: {
        resposta: data.resposta,
        anexoResposta: data.anexoResposta,
        status: 'respondida',
        dataResposta: new Date(),
        ...(!request.dataLeituraDestinatario ? { dataLeituraDestinatario: new Date() } : {}),
      },
    });
  }

  async remove(id: number, usuarioId: number) {
    const requerimento = await this.prisma.requerimento.findUnique({
      where: { id },
    });

    if (!requerimento) {
      throw new NotFoundException('Requerimento não encontrado');
    }

    if (!(await this.userMayAccessRequerimento(requerimento, usuarioId))) {
      throw new BadRequestException('Você não tem permissão para deletar este requerimento');
    }

    return this.prisma.requerimento.delete({
      where: { id },
    });
  }

  private async ensureTaskExists(id: number) {
    const task = await this.prisma.etapa.findUnique({ where: { id } });
    if (!task) {
      throw new BadRequestException('Etapa informada não existe');
    }
  }
}
