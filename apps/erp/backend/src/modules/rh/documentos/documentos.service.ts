import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentoColaboradorTipo } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const include = {
  uploadPor: { select: { id: true, nome: true } },
};

@Injectable()
export class DocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(uploadPorId: number, data: {
    usuarioId: number;
    tipo: DocumentoColaboradorTipo;
    titulo: string;
    arquivoUrl: string;
    dataValidade?: Date | string | null;
    observacao?: string | null;
  }) {
    return this.prisma.documentoColaborador.create({
      data: {
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        titulo: data.titulo.trim(),
        arquivoUrl: data.arquivoUrl,
        dataValidade: data.dataValidade ? new Date(data.dataValidade) : null,
        observacao: data.observacao?.trim() || null,
        uploadPorId,
      },
      include,
    });
  }

  listarPorUsuario(usuarioId: number) {
    return this.prisma.documentoColaborador.findMany({
      where: { usuarioId },
      orderBy: [{ tipo: 'asc' }, { dataCriacao: 'desc' }],
      include,
    });
  }

  /** Lista documentos prestes a vencer (próximos N dias) — usado em alertas e dashboard. */
  async aVencer(diasJanela = 30) {
    const limite = new Date();
    limite.setDate(limite.getDate() + diasJanela);
    return this.prisma.documentoColaborador.findMany({
      where: {
        dataValidade: { not: null, lte: limite },
      },
      orderBy: { dataValidade: 'asc' },
      include: {
        ...include,
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async remover(id: number) {
    const ex = await this.prisma.documentoColaborador.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Documento não encontrado.');
    await this.prisma.documentoColaborador.delete({ where: { id } });
    return { ok: true };
  }
}
