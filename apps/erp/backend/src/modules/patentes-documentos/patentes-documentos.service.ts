import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import { join } from 'path';
import { DocumentoGlobaltec } from '@prisma/client';

export type CategoriaPatenteDocumento =
  | 'patente'
  | 'aplicacao'
  | 'certificado'
  | 'termo'
  | 'outro';

const CATEGORIAS_VALIDAS = new Set<CategoriaPatenteDocumento>([
  'patente',
  'aplicacao',
  'certificado',
  'termo',
  'outro',
]);

function resolveUploadsBase(): string {
  const env = process.env.UPLOADS_DIR;
  if (env && !/^https?:\/\//i.test(env)) {
    return env.startsWith('.') ? join(process.cwd(), env) : env;
  }
  return join(process.cwd(), 'uploads');
}

function categoriaDeTipoDocumento(tipo: string): CategoriaPatenteDocumento {
  if (tipo === 'certificado') return 'certificado';
  if (tipo === 'fornecedor' || tipo === 'estagiario') return 'termo';
  return 'outro';
}

@Injectable()
export class PatentesDocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  resolvePastaDir(pastaId: number): string {
    const dir = join(resolveUploadsBase(), 'patentes-documentos', 'pastas', String(pastaId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  buildPastaUrl(pastaId: number, filename: string): string {
    const prefix = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');
    return `${prefix}/patentes-documentos/pastas/${pastaId}/${filename}`;
  }

  isCategoriaValida(categoria: string): categoria is CategoriaPatenteDocumento {
    return CATEGORIAS_VALIDAS.has(categoria as CategoriaPatenteDocumento);
  }

  private async registrarEmPasta(doc: DocumentoGlobaltec, pastaId: number) {
    const existente = await this.prisma.documentoPatenteAplicacao.findUnique({
      where: { documentoGlobaltecId: doc.id },
    });
    if (existente) {
      throw new BadRequestException('Este documento já está arquivado em uma pasta.');
    }

    const pasta = await this.prisma.patenteDocumentoPasta.findFirst({
      where: { id: pastaId, sistema: false },
    });
    if (!pasta) throw new NotFoundException('Pasta não encontrada.');

    return this.prisma.documentoPatenteAplicacao.create({
      data: {
        categoria: categoriaDeTipoDocumento(doc.tipo),
        nomeExibicao: doc.nomeExibicao,
        nomeArquivo: doc.nomeArquivo,
        url: doc.url,
        origem: 'gerado',
        pastaId,
        documentoGlobaltecId: doc.id,
        criadoPorId: doc.criadoPorId,
        criadoEm: doc.criadoEm,
      },
      include: {
        pasta: { select: { id: true, nome: true } },
      },
    });
  }

  async arquivarDocumentoGerado(
    documentoGlobaltecId: number,
    userId: number,
    opts: { pastaId?: number; novaPastaNome?: string; novaPastaDescricao?: string },
  ) {
    const doc = await this.prisma.documentoGlobaltec.findUnique({
      where: { id: documentoGlobaltecId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');

    const existente = await this.prisma.documentoPatenteAplicacao.findUnique({
      where: { documentoGlobaltecId: doc.id },
    });
    if (existente) {
      throw new BadRequestException('Este documento já está arquivado em uma pasta.');
    }

    if (Number(doc.criadoPorId) !== Number(userId)) {
      throw new ForbiddenException('Sem permissão para arquivar este documento.');
    }

    let pastaId = opts.pastaId;
    if (pastaId == null) {
      const nome = opts.novaPastaNome?.trim();
      if (!nome) {
        throw new BadRequestException('Informe uma pasta existente ou o nome de uma nova pasta.');
      }
      const pasta = await this.criarPasta(nome, userId, opts.novaPastaDescricao);
      pastaId = pasta.id;
    }

    return this.registrarEmPasta(doc, pastaId);
  }

  async listarPastas() {
    const pastas = await this.prisma.patenteDocumentoPasta.findMany({
      where: { sistema: false },
      orderBy: { nome: 'asc' },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        _count: { select: { documentos: true } },
      },
    });

    return pastas.map(({ _count, ...pasta }) => ({
      ...pasta,
      totalDocumentos: _count.documentos,
    }));
  }

  async obterPasta(pastaId: number) {
    const pasta = await this.prisma.patenteDocumentoPasta.findFirst({
      where: { id: pastaId, sistema: false },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        _count: { select: { documentos: true } },
      },
    });
    if (!pasta) throw new NotFoundException('Pasta não encontrada.');

    const { _count, ...rest } = pasta;
    return { ...rest, totalDocumentos: _count.documentos };
  }

  async listarDocumentosDaPasta(pastaId: number) {
    await this.obterPasta(pastaId);

    return this.prisma.documentoPatenteAplicacao.findMany({
      where: { pastaId },
      orderBy: { criadoEm: 'desc' },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        documentoGlobaltec: {
          select: { id: true, tipo: true, usuarioId: true },
        },
      },
    });
  }

  async criarPasta(nome: string, criadoPorId: number, descricao?: string) {
    const nomeNorm = nome.trim();
    if (!nomeNorm) {
      throw new BadRequestException('Informe o nome da pasta.');
    }
    if (nomeNorm.length > 120) {
      throw new BadRequestException('Nome da pasta muito longo (máx. 120 caracteres).');
    }

    const duplicada = await this.prisma.patenteDocumentoPasta.findFirst({
      where: { nome: { equals: nomeNorm, mode: 'insensitive' }, sistema: false },
    });
    if (duplicada) {
      throw new BadRequestException('Já existe uma pasta com este nome.');
    }

    const pasta = await this.prisma.patenteDocumentoPasta.create({
      data: {
        nome: nomeNorm,
        descricao: descricao?.trim() || null,
        criadoPorId,
      },
      include: {
        criadoPor: { select: { id: true, nome: true } },
      },
    });

    this.resolvePastaDir(pasta.id);
    return { ...pasta, totalDocumentos: 0 };
  }

  async deletarPasta(pastaId: number) {
    const pasta = await this.prisma.patenteDocumentoPasta.findFirst({
      where: { id: pastaId, sistema: false },
      include: { documentos: true },
    });
    if (!pasta) throw new NotFoundException('Pasta não encontrada.');

    for (const doc of pasta.documentos) {
      if (doc.origem === 'upload') {
        const filepath = join(this.resolvePastaDir(pastaId), doc.nomeArquivo);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
    }

    const dir = join(resolveUploadsBase(), 'patentes-documentos', 'pastas', String(pastaId));
    await this.prisma.patenteDocumentoPasta.delete({ where: { id: pastaId } });
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    return { message: 'Pasta removida com sucesso.' };
  }

  async salvarUploadNaPasta(
    pastaId: number,
    nomeExibicao: string,
    nomeArquivo: string,
    criadoPorId: number,
    descricao?: string,
    numeroReferencia?: string,
  ) {
    await this.obterPasta(pastaId);

    const url = this.buildPastaUrl(pastaId, nomeArquivo);
    return this.prisma.documentoPatenteAplicacao.create({
      data: {
        categoria: 'outro',
        nomeExibicao: nomeExibicao.trim(),
        descricao: descricao?.trim() || null,
        numeroReferencia: numeroReferencia?.trim() || null,
        nomeArquivo,
        url,
        origem: 'upload',
        pastaId,
        criadoPorId,
      },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        pasta: { select: { id: true, nome: true } },
      },
    });
  }

  async deletarDocumento(id: number) {
    const doc = await this.prisma.documentoPatenteAplicacao.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');

    if (doc.origem === 'gerado') {
      throw new BadRequestException(
        'Documentos gerados pelo módulo Documentos devem ser removidos em Documentos oficiais.',
      );
    }

    if (doc.pastaId) {
      const filepath = join(this.resolvePastaDir(doc.pastaId), doc.nomeArquivo);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    await this.prisma.documentoPatenteAplicacao.delete({ where: { id } });
    return { message: 'Documento removido.' };
  }
}
