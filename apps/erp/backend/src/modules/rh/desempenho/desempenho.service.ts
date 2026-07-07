import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AvaliacaoStatus, CicloAvaliacaoStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const cicloInclude = {
  criador: { select: { id: true, nome: true } },
  _count: { select: { avaliacoes: true } },
};

const avalInclude = {
  ciclo: { select: { id: true, nome: true, status: true } },
  avaliado: { select: { id: true, nome: true } },
  avaliador: { select: { id: true, nome: true } },
};

@Injectable()
export class DesempenhoService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Ciclos ─────────────────────────────────────────────────────────────

  listarCiclos() {
    return this.prisma.cicloAvaliacao.findMany({
      orderBy: { dataInicio: 'desc' },
      include: cicloInclude,
    });
  }

  async criarCiclo(criadorId: number, data: {
    nome: string;
    descricao?: string;
    dataInicio: string | Date;
    dataFim: string | Date;
    roteiroJson?: any;
  }) {
    const dataInicio = new Date(data.dataInicio);
    const dataFim = new Date(data.dataFim);
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (dataFim < dataInicio) {
      throw new BadRequestException('dataFim deve ser posterior a dataInicio.');
    }
    return this.prisma.cicloAvaliacao.create({
      data: {
        nome: data.nome.trim(),
        descricao: data.descricao?.trim() || null,
        dataInicio,
        dataFim,
        roteiroJson: data.roteiroJson ?? null,
        criadorId,
      },
      include: cicloInclude,
    });
  }

  async mudarStatusCiclo(id: number, status: CicloAvaliacaoStatus) {
    const c = await this.prisma.cicloAvaliacao.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Ciclo não encontrado.');
    return this.prisma.cicloAvaliacao.update({
      where: { id },
      data: { status },
      include: cicloInclude,
    });
  }

  // ─── Avaliações ─────────────────────────────────────────────────────────

  /** Cria avaliações em massa (avaliadores -> avaliados). */
  async distribuirAvaliacoes(cicloId: number, pares: { avaliadorId: number; avaliadoId: number }[]) {
    const ciclo = await this.prisma.cicloAvaliacao.findUnique({ where: { id: cicloId } });
    if (!ciclo) throw new NotFoundException('Ciclo não encontrado.');

    const result: Awaited<ReturnType<typeof this.prisma.avaliacaoDesempenho.create>>[] = [];
    for (const p of pares) {
      if (p.avaliadorId === p.avaliadoId) continue;
      try {
        const a = await this.prisma.avaliacaoDesempenho.create({
          data: { cicloId, avaliadorId: p.avaliadorId, avaliadoId: p.avaliadoId },
          include: avalInclude,
        });
        result.push(a);
      } catch {
        // unique violado: par já existe — ignoramos.
      }
    }
    return result;
  }

  async minhasAvaliacoes(usuarioId: number) {
    const [aFazer, recebidas] = await Promise.all([
      this.prisma.avaliacaoDesempenho.findMany({
        where: { avaliadorId: usuarioId, status: AvaliacaoStatus.PENDENTE },
        orderBy: { dataCriacao: 'desc' },
        include: avalInclude,
      }),
      this.prisma.avaliacaoDesempenho.findMany({
        where: { avaliadoId: usuarioId },
        orderBy: { dataCriacao: 'desc' },
        include: avalInclude,
      }),
    ]);
    return { aFazer, recebidas };
  }

  async responder(usuarioId: number, id: number, payload: {
    respostasJson: any;
    notaFinal?: number;
    comentario?: string;
  }) {
    const av = await this.prisma.avaliacaoDesempenho.findUnique({ where: { id } });
    if (!av) throw new NotFoundException('Avaliação não encontrada.');
    if (av.avaliadorId !== usuarioId) {
      throw new BadRequestException('Apenas o avaliador pode responder esta avaliação.');
    }
    return this.prisma.avaliacaoDesempenho.update({
      where: { id },
      data: {
        respostasJson: payload.respostasJson,
        notaFinal: payload.notaFinal ?? null,
        comentario: payload.comentario?.trim() || null,
        status: AvaliacaoStatus.RESPONDIDA,
        dataResposta: new Date(),
      },
      include: avalInclude,
    });
  }

  // ─── Metas / PDI ────────────────────────────────────────────────────────

  listarMetas(usuarioId: number) {
    return this.prisma.metaIndividual.findMany({
      where: { usuarioId },
      orderBy: [{ status: 'asc' }, { prazo: 'asc' }],
    });
  }

  criarMeta(usuarioId: number, data: { titulo: string; descricao?: string; peso?: number; prazo?: string }) {
    return this.prisma.metaIndividual.create({
      data: {
        usuarioId,
        titulo: data.titulo.trim(),
        descricao: data.descricao?.trim() || null,
        peso: data.peso ?? 1,
        prazo: data.prazo ? new Date(data.prazo) : null,
      },
    });
  }

  async atualizarMeta(id: number, data: { titulo?: string; descricao?: string; peso?: number; status?: string; prazo?: string | null }) {
    const ex = await this.prisma.metaIndividual.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Meta não encontrada.');
    return this.prisma.metaIndividual.update({
      where: { id },
      data: {
        titulo: data.titulo?.trim() ?? undefined,
        descricao: data.descricao !== undefined ? data.descricao?.trim() || null : undefined,
        peso: data.peso ?? undefined,
        status: data.status?.toUpperCase() ?? undefined,
        prazo:
          data.prazo === undefined
            ? undefined
            : data.prazo === null
              ? null
              : new Date(data.prazo),
      },
    });
  }

  async removerMeta(id: number) {
    const ex = await this.prisma.metaIndividual.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Meta não encontrada.');
    await this.prisma.metaIndividual.delete({ where: { id } });
    return { ok: true };
  }
}
