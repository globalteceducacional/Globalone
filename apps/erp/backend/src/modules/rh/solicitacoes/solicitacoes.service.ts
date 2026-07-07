import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificacaoTipo,
  SolicitacaoStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PontoService } from '../ponto/ponto.service';
import { assertCompetenciaAbertaPorData } from '../../../common/utils/competencia-lock.util';
import {
  CriarSolicitacaoAjusteDto,
  DecidirSolicitacaoDto,
} from './dto/criar-solicitacao.dto';

const include = {
  usuario: { select: { id: true, nome: true, email: true } },
  revisor: { select: { id: true, nome: true } },
};

@Injectable()
export class SolicitacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pontoService: PontoService,
  ) {}

  async criar(usuarioId: number, dto: CriarSolicitacaoAjusteDto) {
    const dataHora = new Date(dto.dataHora);
    if (Number.isNaN(dataHora.getTime())) {
      throw new BadRequestException('dataHora inválida.');
    }

    // Lock retroativo: nem a criação de solicitação faz sentido se o mês está fechado.
    await assertCompetenciaAbertaPorData(this.prisma, usuarioId, dataHora);

    const solicitacao = await this.prisma.solicitacaoAjustePonto.create({
      data: {
        usuarioId,
        tipo: dto.tipo,
        dataHora,
        motivo: dto.motivo.trim(),
        anexoUrl: dto.anexoUrl ?? null,
      },
      include,
    });

    // Notifica todo mundo com permissão de revisar (não vamos consultar todos —
    // criamos apenas a notificação para o usuário e quem tiver acesso lê em /rh/solicitacoes).
    void this.notifications
      .create({
        usuarioId,
        titulo: 'Solicitação de ajuste de ponto enviada',
        mensagem: `Sua solicitação foi enviada e aguarda revisão do RH.`,
        tipo: NotificacaoTipo.INFO,
      })
      .catch(() => undefined);

    return solicitacao;
  }

  listarMinhas(usuarioId: number) {
    return this.prisma.solicitacaoAjustePonto.findMany({
      where: { usuarioId },
      orderBy: [{ status: 'asc' }, { dataCriacao: 'desc' }],
      include,
    });
  }

  listarTodas(filtros: { status?: SolicitacaoStatus }) {
    return this.prisma.solicitacaoAjustePonto.findMany({
      where: { status: filtros.status ?? undefined },
      orderBy: [{ status: 'asc' }, { dataCriacao: 'desc' }],
      include,
    });
  }

  private async notificarDecisao(
    solicitacao: Awaited<ReturnType<SolicitacoesService['criar']>>,
    aprovado: boolean,
    comentario?: string,
  ) {
    void this.notifications
      .create({
        usuarioId: solicitacao.usuarioId,
        titulo: aprovado
          ? 'Ajuste de ponto aprovado'
          : 'Ajuste de ponto reprovado',
        mensagem: comentario
          ? `Sua solicitação foi ${aprovado ? 'aprovada' : 'reprovada'}: ${comentario}`
          : `Sua solicitação foi ${aprovado ? 'aprovada' : 'reprovada'}.`,
        tipo: aprovado ? NotificacaoTipo.SUCCESS : NotificacaoTipo.WARNING,
      })
      .catch(() => undefined);
  }

  async aprovar(revisorId: number, id: number, dto: DecidirSolicitacaoDto) {
    const solicitacao = await this.prisma.solicitacaoAjustePonto.findUnique({ where: { id } });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada.');
    if (solicitacao.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Esta solicitação já foi decidida.');
    }

    // Lock retroativo: aprovação que cai em mês fechado deve ser recusada.
    await assertCompetenciaAbertaPorData(
      this.prisma,
      solicitacao.usuarioId,
      solicitacao.dataHora,
    );

    // Cria o RegistroPonto correspondente como AJUSTE_RH com NSR + cadeia de hash.
    const registro = await this.pontoService.criarRegistroAjustePelaSolicitacao({
      usuarioId: solicitacao.usuarioId,
      tipo: solicitacao.tipo,
      dataHora: solicitacao.dataHora,
      ajustadoPorId: revisorId,
      justificativa: `Solicitação #${solicitacao.id}: ${solicitacao.motivo}`,
    });

    const atualizada = await this.prisma.solicitacaoAjustePonto.update({
      where: { id },
      data: {
        status: SolicitacaoStatus.APROVADO,
        revisorId,
        comentarioRevisor: dto.comentario?.trim() || null,
        dataDecisao: new Date(),
        registroPontoId: registro.id,
      },
      include,
    });

    void this.notificarDecisao(atualizada, true, dto.comentario?.trim());
    return atualizada;
  }

  async reprovar(revisorId: number, id: number, dto: DecidirSolicitacaoDto) {
    const solicitacao = await this.prisma.solicitacaoAjustePonto.findUnique({ where: { id } });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada.');
    if (solicitacao.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Esta solicitação já foi decidida.');
    }

    const atualizada = await this.prisma.solicitacaoAjustePonto.update({
      where: { id },
      data: {
        status: SolicitacaoStatus.REPROVADO,
        revisorId,
        comentarioRevisor: dto.comentario?.trim() || null,
        dataDecisao: new Date(),
      },
      include,
    });

    void this.notificarDecisao(atualizada, false, dto.comentario?.trim());
    return atualizada;
  }

  async cancelar(usuarioId: number, id: number) {
    const solicitacao = await this.prisma.solicitacaoAjustePonto.findUnique({ where: { id } });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada.');
    if (solicitacao.usuarioId !== usuarioId) {
      throw new BadRequestException('Apenas o autor pode cancelar a própria solicitação.');
    }
    if (solicitacao.status !== SolicitacaoStatus.PENDENTE) {
      throw new BadRequestException('Apenas solicitações pendentes podem ser canceladas.');
    }
    return this.prisma.solicitacaoAjustePonto.update({
      where: { id },
      data: { status: SolicitacaoStatus.CANCELADO },
      include,
    });
  }
}
