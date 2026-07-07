import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOccurrenceDto } from './dto/create-occurrence.dto';

@Injectable()
export class OccurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  create(usuarioId: number, data: CreateOccurrenceDto) {
    return this.prisma.ocorrencia.create({
      data: {
        usuarioId,
        destinatarioId: data.destinatarioId,
        texto: data.texto,
        anexo: data.anexo,
      },
    });
  }

  listSent(usuarioId: number) {
    return this.prisma.ocorrencia.findMany({
      where: { usuarioId },
      orderBy: { dataCriacao: 'desc' },
      include: { destinatario: true },
    });
  }

  listReceived(usuarioId: number) {
    return this.prisma.ocorrencia.findMany({
      where: { destinatarioId: usuarioId },
      orderBy: { dataCriacao: 'desc' },
      include: { usuario: true },
    });
  }
}
