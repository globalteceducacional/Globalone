import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatriculaTreinamentoStatus, TreinamentoItemTipo } from '@prisma/client';
import { createReadStream, promises as fsPromises } from 'fs';
import { join, basename } from 'path';
import type { Response } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTreinamentosUploadDir } from './treinamentos-video.util';
import {
  questaoJsonParaParticipante,
  validarQuestaoJson,
  type TreinamentoQuestaoJson,
} from './treinamento-questao.util';

const include = {
  criador: { select: { id: true, nome: true } },
  cargosObrigatorios: { include: { cargo: { select: { id: true, nome: true } } } },
  _count: { select: { matriculas: true, itens: true } },
} as const;

const treinamentoPlayerSelect = {
  id: true,
  titulo: true,
  descricao: true,
  cargaHoraria: true,
  videoUrl: true,
  videoNome: true,
  videoTamanhoBytes: true,
  videoMimeType: true,
} as const;

@Injectable()
export class TreinamentosService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Treinamentos ───────────────────────────────────────────────────────

  listar() {
    return this.prisma.treinamento.findMany({
      where: { ativo: true },
      orderBy: { dataCriacao: 'desc' },
      include,
    });
  }

  async buscarPorId(id: number) {
    const t = await this.prisma.treinamento.findUnique({
      where: { id },
      include,
    });
    if (!t || !t.ativo) throw new NotFoundException('Treinamento não encontrado.');
    return t;
  }

  private uploadsPrefix(): string {
    return (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');
  }

  private videoPathFromUrl(videoUrl: string | null | undefined): string | null {
    if (!videoUrl?.trim()) return null;
    const prefix = `${this.uploadsPrefix()}/treinamentos/`;
    if (!videoUrl.startsWith(prefix)) return null;
    const filename = videoUrl.slice(prefix.length);
    if (!filename || filename.includes('..') || filename.includes('/')) return null;
    return join(resolveTreinamentosUploadDir(), filename);
  }

  private async proximaOrdemItem(treinamentoId: number): Promise<number> {
    const agg = await this.prisma.treinamentoItem.aggregate({
      where: { treinamentoId },
      _max: { ordem: true },
    });
    return (agg._max.ordem ?? 0) + 1;
  }

  private async compactarOrdensItens(treinamentoId: number): Promise<void> {
    const itens = await this.prisma.treinamentoItem.findMany({
      where: { treinamentoId },
      orderBy: { ordem: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction(
      itens.map((item, idx) =>
        this.prisma.treinamentoItem.update({
          where: { id: item.id },
          data: { ordem: idx + 1 },
        }),
      ),
    );
  }

  async treinamentoTemConteudoAssistivel(treinamentoId: number): Promise<boolean> {
    const questoes = await this.prisma.treinamentoItem.count({
      where: { treinamentoId, tipo: TreinamentoItemTipo.QUESTAO },
    });
    if (questoes > 0) return true;

    const videosItens = await this.prisma.treinamentoItem.count({
      where: {
        treinamentoId,
        tipo: TreinamentoItemTipo.VIDEO,
        videoUrl: { not: null },
      },
    });
    if (videosItens > 0) return true;

    const t = await this.prisma.treinamento.findUnique({
      where: { id: treinamentoId },
      select: { videoUrl: true },
    });
    return Boolean(t?.videoUrl?.trim());
  }

  private itemProntoParaParticipante(item: {
    tipo: TreinamentoItemTipo;
    videoUrl: string | null;
    questaoJson: unknown;
  }): boolean {
    if (item.tipo === TreinamentoItemTipo.VIDEO) {
      return Boolean(item.videoUrl?.trim());
    }
    if (item.tipo === TreinamentoItemTipo.QUESTAO) {
      try {
        validarQuestaoJson(item.questaoJson);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private async obterMatriculaParticipante(
    treinamentoId: number,
    usuarioId: number,
    permissions: string[],
  ) {
    const pode = await this.usuarioPodeAssistirVideo(treinamentoId, usuarioId, permissions);
    if (!pode) {
      throw new ForbiddenException('Você não tem acesso a este treinamento.');
    }
    await this.syncMatriculasObrigatoriasParaUsuario(usuarioId);

    let matricula = await this.prisma.treinamentoMatricula.findUnique({
      where: { treinamentoId_usuarioId: { treinamentoId, usuarioId } },
    });
    if (!matricula) {
      try {
        matricula = await this.prisma.treinamentoMatricula.create({
          data: { treinamentoId, usuarioId },
        });
      } catch {
        matricula = await this.prisma.treinamentoMatricula.findUnique({
          where: { treinamentoId_usuarioId: { treinamentoId, usuarioId } },
        });
      }
    }
    if (!matricula) {
      throw new NotFoundException('Não foi possível registrar sua participação neste treinamento.');
    }
    return matricula;
  }

  async obterTrilhaParticipante(
    treinamentoId: number,
    usuarioId: number,
    permissions: string[],
  ) {
    const temConteudo = await this.treinamentoTemConteudoAssistivel(treinamentoId);
    if (!temConteudo) {
      throw new BadRequestException(
        'Este treinamento ainda não possui conteúdo disponível na trilha.',
      );
    }

    const matricula = await this.obterMatriculaParticipante(treinamentoId, usuarioId, permissions);
    const treinamento = await this.prisma.treinamento.findUnique({
      where: { id: treinamentoId },
      select: treinamentoPlayerSelect,
    });
    if (!treinamento) throw new NotFoundException('Treinamento não encontrado.');

    const itensDb = await this.prisma.treinamentoItem.findMany({
      where: { treinamentoId },
      orderBy: { ordem: 'asc' },
    });
    const prontos = itensDb.filter((i) => this.itemProntoParaParticipante(i));

    const progressos = await this.prisma.treinamentoItemProgresso.findMany({
      where: { matriculaId: matricula.id },
    });
    const progByItem = new Map(progressos.map((p) => [p.itemId, p]));

    const itens = prontos.map((item) => {
      const prog = progByItem.get(item.id);
      const base = {
        id: item.id,
        ordem: item.ordem,
        tipo: item.tipo,
        titulo: item.titulo,
        videoNome: item.tipo === TreinamentoItemTipo.VIDEO ? item.videoNome : null,
        progresso: {
          concluido: prog?.concluido ?? false,
          respostaCorreta: prog?.respostaCorreta ?? null,
          respostaIndice: prog?.respostaIndice ?? null,
        },
      };
      if (item.tipo === TreinamentoItemTipo.QUESTAO && item.questaoJson) {
        const q = validarQuestaoJson(item.questaoJson);
        return {
          ...base,
          questao: questaoJsonParaParticipante(q),
        };
      }
      return base;
    });

    let indiceAtual = itens.findIndex((i) => !i.progresso.concluido);
    if (indiceAtual < 0 && itens.length > 0) indiceAtual = itens.length - 1;
    if (itens.length === 0) indiceAtual = 0;

    const modoLegado = itens.length === 0 && Boolean(treinamento.videoUrl?.trim());

    return {
      matricula: {
        id: matricula.id,
        treinamentoId: matricula.treinamentoId,
        status: matricula.status,
        dataConclusao: matricula.dataConclusao,
      },
      treinamento,
      itens,
      indiceAtual,
      modoLegado,
    };
  }

  async concluirItemVideo(
    treinamentoId: number,
    itemId: number,
    usuarioId: number,
    permissions: string[],
  ) {
    const matricula = await this.obterMatriculaParticipante(treinamentoId, usuarioId, permissions);
    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo !== TreinamentoItemTipo.VIDEO) {
      throw new BadRequestException('Este item não é um vídeo.');
    }
    if (!item.videoUrl?.trim()) {
      throw new BadRequestException('O vídeo desta etapa ainda não foi publicado.');
    }

    await this.garantirOrdemItem(matricula.id, treinamentoId, itemId);

    await this.prisma.treinamentoItemProgresso.upsert({
      where: { matriculaId_itemId: { matriculaId: matricula.id, itemId } },
      create: {
        matriculaId: matricula.id,
        itemId,
        concluido: true,
        dataConclusao: new Date(),
      },
      update: {
        concluido: true,
        dataConclusao: new Date(),
      },
    });

    return this.syncMatriculaStatusFromProgress(matricula.id);
  }

  async responderItemQuestao(
    treinamentoId: number,
    itemId: number,
    respostaIndice: number,
    usuarioId: number,
    permissions: string[],
  ) {
    if (!Number.isInteger(respostaIndice) || respostaIndice < 0) {
      throw new BadRequestException('Resposta inválida.');
    }

    const matricula = await this.obterMatriculaParticipante(treinamentoId, usuarioId, permissions);
    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo !== TreinamentoItemTipo.QUESTAO) {
      throw new BadRequestException('Este item não é uma questão.');
    }
    const questao = validarQuestaoJson(item.questaoJson);
    if (respostaIndice >= questao.alternativas.length) {
      throw new BadRequestException('Alternativa inválida.');
    }

    await this.garantirOrdemItem(matricula.id, treinamentoId, itemId);

    const existente = await this.prisma.treinamentoItemProgresso.findUnique({
      where: { matriculaId_itemId: { matriculaId: matricula.id, itemId } },
    });
    if (existente?.concluido) {
      return {
        correta: existente.respostaCorreta === true,
        concluido: true,
        matricula: await this.prisma.treinamentoMatricula.findUnique({
          where: { id: matricula.id },
          include: { treinamento: { select: treinamentoPlayerSelect } },
        }),
      };
    }

    const correta = questao.alternativas[respostaIndice]?.correta === true;

    await this.prisma.treinamentoItemProgresso.upsert({
      where: { matriculaId_itemId: { matriculaId: matricula.id, itemId } },
      create: {
        matriculaId: matricula.id,
        itemId,
        concluido: correta,
        respostaIndice,
        respostaCorreta: correta,
        dataConclusao: correta ? new Date() : null,
      },
      update: {
        concluido: correta,
        respostaIndice,
        respostaCorreta: correta,
        dataConclusao: correta ? new Date() : undefined,
      },
    });

    const matriculaAtualizada = correta
      ? await this.syncMatriculaStatusFromProgress(matricula.id)
      : await this.prisma.treinamentoMatricula.update({
          where: { id: matricula.id },
          data: { status: MatriculaTreinamentoStatus.EM_ANDAMENTO },
          include: { treinamento: { select: treinamentoPlayerSelect } },
        });

    return {
      correta,
      concluido: correta,
      matricula: matriculaAtualizada,
    };
  }

  private async garantirOrdemItem(
    matriculaId: number,
    treinamentoId: number,
    itemId: number,
  ): Promise<void> {
    const itens = await this.prisma.treinamentoItem.findMany({
      where: { treinamentoId },
      orderBy: { ordem: 'asc' },
    });
    const prontos = itens.filter((i) => this.itemProntoParaParticipante(i));
    const alvoIdx = prontos.findIndex((i) => i.id === itemId);
    if (alvoIdx < 0) {
      throw new NotFoundException('Etapa não disponível.');
    }

    const progressos = await this.prisma.treinamentoItemProgresso.findMany({
      where: { matriculaId, itemId: { in: prontos.map((i) => i.id) } },
    });
    const concluido = new Set(
      progressos.filter((p) => p.concluido).map((p) => p.itemId),
    );

    for (let i = 0; i < alvoIdx; i += 1) {
      if (!concluido.has(prontos[i].id)) {
        throw new BadRequestException('Conclua as etapas anteriores antes de avançar.');
      }
    }
  }

  private async syncMatriculaStatusFromProgress(matriculaId: number) {
    const matricula = await this.prisma.treinamentoMatricula.findUnique({
      where: { id: matriculaId },
    });
    if (!matricula) throw new NotFoundException('Matrícula não encontrada.');

    const itens = await this.prisma.treinamentoItem.findMany({
      where: { treinamentoId: matricula.treinamentoId },
      orderBy: { ordem: 'asc' },
    });
    const prontos = itens.filter((i) => this.itemProntoParaParticipante(i));

    if (prontos.length === 0) {
      return this.prisma.treinamentoMatricula.findUnique({
        where: { id: matriculaId },
        include: { treinamento: { select: treinamentoPlayerSelect } },
      });
    }

    const progressos = await this.prisma.treinamentoItemProgresso.findMany({
      where: {
        matriculaId,
        itemId: { in: prontos.map((i) => i.id) },
        concluido: true,
      },
    });

    const todosConcluidos = progressos.length === prontos.length;
    const algumProgresso = progressos.length > 0;

    return this.prisma.treinamentoMatricula.update({
      where: { id: matriculaId },
      data: {
        status: todosConcluidos
          ? MatriculaTreinamentoStatus.CONCLUIDO
          : algumProgresso
            ? MatriculaTreinamentoStatus.EM_ANDAMENTO
            : MatriculaTreinamentoStatus.PENDENTE,
        dataConclusao: todosConcluidos ? new Date() : null,
      },
      include: { treinamento: { select: treinamentoPlayerSelect } },
    });
  }

  async listarItens(treinamentoId: number) {
    await this.buscarPorId(treinamentoId);
    return this.prisma.treinamentoItem.findMany({
      where: { treinamentoId },
      orderBy: { ordem: 'asc' },
    });
  }

  async criarItemVideo(treinamentoId: number, titulo?: string) {
    await this.buscarPorId(treinamentoId);
    const ordem = await this.proximaOrdemItem(treinamentoId);
    return this.prisma.treinamentoItem.create({
      data: {
        treinamentoId,
        ordem,
        tipo: TreinamentoItemTipo.VIDEO,
        titulo: titulo?.trim() || null,
      },
    });
  }

  async criarItemQuestao(
    treinamentoId: number,
    questao: TreinamentoQuestaoJson,
    titulo?: string,
  ) {
    await this.buscarPorId(treinamentoId);
    const questaoJson = validarQuestaoJson(questao);
    const ordem = await this.proximaOrdemItem(treinamentoId);
    return this.prisma.treinamentoItem.create({
      data: {
        treinamentoId,
        ordem,
        tipo: TreinamentoItemTipo.QUESTAO,
        titulo: titulo?.trim() || null,
        questaoJson,
      },
    });
  }

  async atualizarItemQuestao(
    treinamentoId: number,
    itemId: number,
    data: { titulo?: string; questao: TreinamentoQuestaoJson },
  ) {
    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo !== TreinamentoItemTipo.QUESTAO) {
      throw new BadRequestException('Este item não é uma questão.');
    }
    const questaoJson = validarQuestaoJson(data.questao);
    return this.prisma.treinamentoItem.update({
      where: { id: itemId },
      data: {
        titulo: data.titulo !== undefined ? data.titulo?.trim() || null : undefined,
        questaoJson,
      },
    });
  }

  async reordenarItens(treinamentoId: number, itemIds: number[]) {
    await this.buscarPorId(treinamentoId);
    if (!itemIds.length) {
      throw new BadRequestException('Informe a ordem dos itens.');
    }
    const itens = await this.prisma.treinamentoItem.findMany({
      where: { treinamentoId },
      select: { id: true },
    });
    const idsSet = new Set(itens.map((i) => i.id));
    if (itemIds.length !== itens.length) {
      throw new BadRequestException('A lista de itens está incompleta ou inválida.');
    }
    for (const id of itemIds) {
      if (!idsSet.has(id)) {
        throw new BadRequestException('Item não pertence a este treinamento.');
      }
    }
    await this.prisma.$transaction(
      itemIds.map((id, idx) =>
        this.prisma.treinamentoItem.update({
          where: { id },
          data: { ordem: idx + 1 },
        }),
      ),
    );
    return this.listarItens(treinamentoId);
  }

  async removerItem(treinamentoId: number, itemId: number) {
    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo === TreinamentoItemTipo.VIDEO && item.videoUrl) {
      const path = this.videoPathFromUrl(item.videoUrl);
      if (path) await fsPromises.unlink(path).catch(() => undefined);
    }
    await this.prisma.treinamentoItem.delete({ where: { id: itemId } });
    await this.compactarOrdensItens(treinamentoId);
    return { ok: true };
  }

  private async buscarItemDoTreinamento(treinamentoId: number, itemId: number) {
    const item = await this.prisma.treinamentoItem.findFirst({
      where: { id: itemId, treinamentoId },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');
    return item;
  }

  async uploadVideoItem(
    treinamentoId: number,
    itemId: number,
    file: Express.Multer.File,
  ) {
    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo !== TreinamentoItemTipo.VIDEO) {
      throw new BadRequestException('Este item não é um vídeo.');
    }
    const prefix = this.uploadsPrefix();
    const videoUrl = `${prefix}/treinamentos/${file.filename}`;
    const oldPath = this.videoPathFromUrl(item.videoUrl);

    const atualizado = await this.prisma.treinamentoItem.update({
      where: { id: itemId },
      data: {
        videoUrl,
        videoNome: file.originalname,
        videoTamanhoBytes: file.size,
        videoMimeType: file.mimetype,
      },
    });

    if (oldPath && oldPath !== join(resolveTreinamentosUploadDir(), file.filename)) {
      await fsPromises.unlink(oldPath).catch(() => undefined);
    }

    if (item.ordem === 1) {
      await this.prisma.treinamento.update({
        where: { id: treinamentoId },
        data: {
          videoUrl: atualizado.videoUrl,
          videoNome: atualizado.videoNome,
          videoTamanhoBytes: atualizado.videoTamanhoBytes,
          videoMimeType: atualizado.videoMimeType,
        },
      });
    }

    return atualizado;
  }

  async removerVideoItem(treinamentoId: number, itemId: number) {
    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo !== TreinamentoItemTipo.VIDEO) {
      throw new BadRequestException('Este item não é um vídeo.');
    }
    const path = this.videoPathFromUrl(item.videoUrl);
    if (path) await fsPromises.unlink(path).catch(() => undefined);

    const atualizado = await this.prisma.treinamentoItem.update({
      where: { id: itemId },
      data: {
        videoUrl: null,
        videoNome: null,
        videoTamanhoBytes: null,
        videoMimeType: null,
      },
    });

    if (item.ordem === 1) {
      await this.prisma.treinamento.update({
        where: { id: treinamentoId },
        data: {
          videoUrl: null,
          videoNome: null,
          videoTamanhoBytes: null,
          videoMimeType: null,
        },
      });
    }

    return atualizado;
  }

  async streamVideoItem(
    treinamentoId: number,
    itemId: number,
    usuarioId: number,
    permissions: string[],
    rangeHeader: string | undefined,
    res: Response,
  ) {
    const pode = await this.usuarioPodeAssistirVideo(treinamentoId, usuarioId, permissions);
    if (!pode) {
      throw new ForbiddenException('Você não tem acesso a este vídeo de treinamento.');
    }

    const item = await this.buscarItemDoTreinamento(treinamentoId, itemId);
    if (item.tipo !== TreinamentoItemTipo.VIDEO || !item.videoUrl) {
      throw new NotFoundException('Vídeo não encontrado neste item.');
    }

    const filePath = this.videoPathFromUrl(item.videoUrl);
    if (!filePath) {
      throw new NotFoundException('Arquivo de vídeo não encontrado.');
    }

    let stat;
    try {
      stat = await fsPromises.stat(filePath);
    } catch {
      throw new NotFoundException('Arquivo de vídeo não encontrado no servidor.');
    }

    const fileSize = stat.size;
    const contentType = item.videoMimeType || 'video/mp4';

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start >= fileSize || end >= fileSize) {
        res.status(416).set({ 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${basename(item.videoNome || 'video.mp4')}"`,
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.set({
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${basename(item.videoNome || 'video.mp4')}"`,
    });
    createReadStream(filePath).pipe(res);
  }

  async usuarioPodeAssistirVideo(
    treinamentoId: number,
    usuarioId: number,
    permissions: string[],
  ): Promise<boolean> {
    if (permissions.includes('treinamentos:gerenciar')) return true;

    const treinamento = await this.prisma.treinamento.findUnique({
      where: { id: treinamentoId },
      select: {
        ativo: true,
        cargosObrigatorios: { select: { cargoId: true } },
      },
    });
    if (!treinamento?.ativo) return false;

    const matricula = await this.prisma.treinamentoMatricula.findUnique({
      where: {
        treinamentoId_usuarioId: { treinamentoId, usuarioId },
      },
    });
    if (matricula) return true;

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { cargoId: true },
    });
    if (!usuario) return false;

    return treinamento.cargosObrigatorios.some((c) => c.cargoId === usuario.cargoId);
  }

  async uploadVideo(treinamentoId: number, file: Express.Multer.File) {
    const treinamento = await this.buscarPorId(treinamentoId);
    const prefix = this.uploadsPrefix();
    const videoUrl = `${prefix}/treinamentos/${file.filename}`;

    const oldPath = this.videoPathFromUrl(treinamento.videoUrl);
    const updated = await this.prisma.treinamento.update({
      where: { id: treinamentoId },
      data: {
        videoUrl,
        videoNome: file.originalname,
        videoTamanhoBytes: file.size,
        videoMimeType: file.mimetype,
      },
      include,
    });

    if (oldPath && oldPath !== join(resolveTreinamentosUploadDir(), file.filename)) {
      await fsPromises.unlink(oldPath).catch(() => undefined);
    }

    const itensCount = await this.prisma.treinamentoItem.count({
      where: { treinamentoId },
    });
    if (itensCount === 0) {
      await this.prisma.treinamentoItem.create({
        data: {
          treinamentoId,
          ordem: 1,
          tipo: TreinamentoItemTipo.VIDEO,
          titulo: updated.titulo,
          videoUrl: updated.videoUrl,
          videoNome: updated.videoNome,
          videoTamanhoBytes: updated.videoTamanhoBytes,
          videoMimeType: updated.videoMimeType,
        },
      });
    } else {
      const primeiro = await this.prisma.treinamentoItem.findFirst({
        where: { treinamentoId, ordem: 1, tipo: TreinamentoItemTipo.VIDEO },
      });
      if (primeiro && !primeiro.videoUrl) {
        await this.prisma.treinamentoItem.update({
          where: { id: primeiro.id },
          data: {
            videoUrl: updated.videoUrl,
            videoNome: updated.videoNome,
            videoTamanhoBytes: updated.videoTamanhoBytes,
            videoMimeType: updated.videoMimeType,
          },
        });
      }
    }

    return updated;
  }

  async removerVideo(treinamentoId: number) {
    const treinamento = await this.buscarPorId(treinamentoId);
    const path = this.videoPathFromUrl(treinamento.videoUrl);
    if (path) {
      await fsPromises.unlink(path).catch(() => undefined);
    }
    return this.prisma.treinamento.update({
      where: { id: treinamentoId },
      data: {
        videoUrl: null,
        videoNome: null,
        videoTamanhoBytes: null,
        videoMimeType: null,
      },
      include,
    });
  }

  async streamVideo(
    treinamentoId: number,
    usuarioId: number,
    permissions: string[],
    rangeHeader: string | undefined,
    res: Response,
  ) {
    const pode = await this.usuarioPodeAssistirVideo(treinamentoId, usuarioId, permissions);
    if (!pode) {
      throw new ForbiddenException('Você não tem acesso a este vídeo de treinamento.');
    }

    const treinamento = await this.buscarPorId(treinamentoId);
    if (!treinamento.videoUrl) {
      throw new NotFoundException('Este treinamento não possui vídeo.');
    }

    const filePath = this.videoPathFromUrl(treinamento.videoUrl);
    if (!filePath) {
      throw new NotFoundException('Arquivo de vídeo não encontrado.');
    }

    let stat;
    try {
      stat = await fsPromises.stat(filePath);
    } catch {
      throw new NotFoundException('Arquivo de vídeo não encontrado no servidor.');
    }

    const fileSize = stat.size;
    const contentType = treinamento.videoMimeType || 'video/mp4';

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`,
        });
        res.end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${basename(treinamento.videoNome || 'video.mp4')}"`,
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.set({
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${basename(treinamento.videoNome || 'video.mp4')}"`,
    });
    createReadStream(filePath).pipe(res);
  }

  async criar(criadorId: number, data: {
    titulo: string;
    descricao?: string;
    cargaHoraria?: number;
    anexosJson?: any;
    cargosObrigatoriosIds?: number[];
  }) {
    const treinamento = await this.prisma.treinamento.create({
      data: {
        titulo: data.titulo.trim(),
        descricao: data.descricao?.trim() || null,
        cargaHoraria: data.cargaHoraria ?? 0,
        anexosJson: data.anexosJson ?? null,
        criadorId,
        cargosObrigatorios: data.cargosObrigatoriosIds?.length
          ? { create: data.cargosObrigatoriosIds.map((cargoId) => ({ cargoId })) }
          : undefined,
      },
      include,
    });
    if (data.cargosObrigatoriosIds?.length) {
      await this.syncMatriculasObrigatoriasParaTreinamento(
        treinamento.id,
        data.cargosObrigatoriosIds,
      );
    }
    return treinamento;
  }

  async atualizar(id: number, data: {
    titulo?: string;
    descricao?: string;
    cargaHoraria?: number;
    ativo?: boolean;
    cargosObrigatoriosIds?: number[];
  }) {
    const ex = await this.prisma.treinamento.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Treinamento não encontrado.');

    const treinamento = await this.prisma.treinamento.update({
      where: { id },
      data: {
        titulo: data.titulo?.trim() ?? undefined,
        descricao:
          data.descricao !== undefined ? data.descricao?.trim() || null : undefined,
        cargaHoraria: data.cargaHoraria ?? undefined,
        ativo: data.ativo ?? undefined,
        cargosObrigatorios: data.cargosObrigatoriosIds
          ? {
              deleteMany: {},
              create: data.cargosObrigatoriosIds.map((cargoId) => ({ cargoId })),
            }
          : undefined,
      },
      include,
    });
    if (data.cargosObrigatoriosIds?.length) {
      await this.syncMatriculasObrigatoriasParaTreinamento(id, data.cargosObrigatoriosIds);
    }
    return treinamento;
  }

  async remover(id: number) {
    const ex = await this.prisma.treinamento.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Treinamento não encontrado.');
    await this.prisma.treinamento.update({ where: { id }, data: { ativo: false } });
    return { ok: true };
  }

  // ─── Matrículas ─────────────────────────────────────────────────────────

  async matricular(treinamentoId: number, usuarioIds: number[]) {
    const result: Awaited<ReturnType<typeof this.prisma.treinamentoMatricula.create>>[] = [];
    for (const usuarioId of usuarioIds) {
      try {
        const m = await this.prisma.treinamentoMatricula.create({
          data: { treinamentoId, usuarioId },
        });
        result.push(m);
      } catch {
        // ignora duplicados (unique violation)
      }
    }
    return result;
  }

  async minhasMatriculas(usuarioId: number) {
    await this.syncMatriculasObrigatoriasParaUsuario(usuarioId);
    return this.prisma.treinamentoMatricula.findMany({
      where: { usuarioId },
      orderBy: { dataCriacao: 'desc' },
      include: {
        treinamento: { select: treinamentoPlayerSelect },
      },
    });
  }

  /**
   * Garante matrícula (se elegível) e devolve dados para o player no front.
   */
  async ingressar(treinamentoId: number, usuarioId: number, permissions: string[]) {
    const pode = await this.usuarioPodeAssistirVideo(treinamentoId, usuarioId, permissions);
    if (!pode) {
      throw new ForbiddenException('Você não tem acesso a este treinamento.');
    }

    await this.syncMatriculasObrigatoriasParaUsuario(usuarioId);

    let matricula = await this.prisma.treinamentoMatricula.findUnique({
      where: {
        treinamentoId_usuarioId: { treinamentoId, usuarioId },
      },
      include: {
        treinamento: { select: treinamentoPlayerSelect },
      },
    });

    if (!matricula) {
      try {
        matricula = await this.prisma.treinamentoMatricula.create({
          data: { treinamentoId, usuarioId },
          include: {
            treinamento: { select: treinamentoPlayerSelect },
          },
        });
      } catch {
        matricula = await this.prisma.treinamentoMatricula.findUnique({
          where: {
            treinamentoId_usuarioId: { treinamentoId, usuarioId },
          },
          include: {
            treinamento: { select: treinamentoPlayerSelect },
          },
        });
      }
    }

    if (!matricula) {
      throw new NotFoundException('Não foi possível registrar sua participação neste treinamento.');
    }

    const temConteudo = await this.treinamentoTemConteudoAssistivel(treinamentoId);
    if (!temConteudo) {
      throw new BadRequestException(
        'Este treinamento ainda não possui conteúdo disponível (vídeos na trilha).',
      );
    }

    return matricula;
  }

  matriculasDoTreinamento(treinamentoId: number) {
    return this.prisma.treinamentoMatricula.findMany({
      where: { treinamentoId },
      orderBy: { status: 'asc' },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async atualizarMatricula(
    id: number,
    data: { status?: MatriculaTreinamentoStatus; certificadoUrl?: string; notaAvaliacao?: number },
    actor?: { userId: number; permissions?: string[] },
  ) {
    const m = await this.prisma.treinamentoMatricula.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Matrícula não encontrada.');

    const podeGerenciar = actor?.permissions?.includes('treinamentos:gerenciar') ?? false;
    if (actor && !podeGerenciar && m.usuarioId !== actor.userId) {
      throw new ForbiddenException('Você só pode atualizar a sua própria matrícula.');
    }
    if (actor && !podeGerenciar) {
      if (data.certificadoUrl !== undefined || data.notaAvaliacao !== undefined) {
        throw new ForbiddenException('Apenas o RH pode alterar certificado ou nota.');
      }
    }

    const patch: {
      status?: MatriculaTreinamentoStatus;
      certificadoUrl?: string;
      notaAvaliacao?: number;
      dataConclusao?: Date | null;
    } = {
      status: data.status ?? undefined,
      certificadoUrl: data.certificadoUrl ?? undefined,
      notaAvaliacao: data.notaAvaliacao ?? undefined,
    };
    if (data.status === MatriculaTreinamentoStatus.CONCLUIDO) {
      patch.dataConclusao = new Date();
    } else if (
      data.status === MatriculaTreinamentoStatus.EM_ANDAMENTO ||
      data.status === MatriculaTreinamentoStatus.PENDENTE
    ) {
      patch.dataConclusao = null;
    }

    return this.prisma.treinamentoMatricula.update({
      where: { id },
      data: patch,
      include: {
        treinamento: { select: { id: true, titulo: true } },
      },
    });
  }

  /**
   * Retorna treinamentos pendentes para o usuário com base nas trilhas obrigatórias do cargo.
   * Útil para alerta no dashboard pessoal.
   */
  async pendentesObrigatorios(usuarioId: number) {
    await this.syncMatriculasObrigatoriasParaUsuario(usuarioId);
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { cargoId: true },
    });
    if (!usuario) throw new BadRequestException('Usuário não encontrado.');
    const obrigatorios = await this.prisma.cargoTreinamento.findMany({
      where: { cargoId: usuario.cargoId },
      include: {
        treinamento: {
          select: { ...treinamentoPlayerSelect, ativo: true },
        },
      },
    });
    const ativos = obrigatorios.filter((o) => o.treinamento.ativo);
    if (ativos.length === 0) return [];
    const matriculas = await this.prisma.treinamentoMatricula.findMany({
      where: { usuarioId, treinamentoId: { in: ativos.map((o) => o.treinamentoId) } },
    });
    return ativos
      .map((o) => ({
        treinamento: o.treinamento,
        matricula: matriculas.find((m) => m.treinamentoId === o.treinamentoId) ?? null,
      }))
      .filter((x) => !x.matricula || x.matricula.status !== MatriculaTreinamentoStatus.CONCLUIDO);
  }

  /**
   * Cria matrícula PENDENTE para colaboradores dos cargos obrigatórios do treinamento
   * (sem ação manual do RH).
   */
  private async syncMatriculasObrigatoriasParaTreinamento(
    treinamentoId: number,
    cargoIds: number[],
  ): Promise<void> {
    if (cargoIds.length === 0) return;

    const usuarios = await this.prisma.usuario.findMany({
      where: { cargoId: { in: cargoIds }, ativo: true },
      select: { id: true },
    });
    if (usuarios.length === 0) return;

    const usuarioIds = usuarios.map((u) => u.id);
    const existentes = await this.prisma.treinamentoMatricula.findMany({
      where: { treinamentoId, usuarioId: { in: usuarioIds } },
      select: { usuarioId: true },
    });
    const existSet = new Set(existentes.map((e) => e.usuarioId));

    for (const usuarioId of usuarioIds) {
      if (existSet.has(usuarioId)) continue;
      try {
        await this.prisma.treinamentoMatricula.create({
          data: { treinamentoId, usuarioId },
        });
      } catch {
        /* duplicata em corrida */
      }
    }
  }

  /** Garante matrícula nos treinamentos obrigatórios do cargo do usuário. */
  private async syncMatriculasObrigatoriasParaUsuario(usuarioId: number): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { cargoId: true },
    });
    if (!usuario) return;

    const obrigatorios = await this.prisma.cargoTreinamento.findMany({
      where: { cargoId: usuario.cargoId },
      include: { treinamento: { select: { id: true, ativo: true } } },
    });

    const treinamentoIds = obrigatorios
      .filter((o) => o.treinamento.ativo)
      .map((o) => o.treinamentoId);
    if (treinamentoIds.length === 0) return;

    const existentes = await this.prisma.treinamentoMatricula.findMany({
      where: { usuarioId, treinamentoId: { in: treinamentoIds } },
      select: { treinamentoId: true },
    });
    const existSet = new Set(existentes.map((e) => e.treinamentoId));

    for (const treinamentoId of treinamentoIds) {
      if (existSet.has(treinamentoId)) continue;
      try {
        await this.prisma.treinamentoMatricula.create({
          data: { treinamentoId, usuarioId },
        });
      } catch {
        /* duplicata em corrida */
      }
    }
  }
}
