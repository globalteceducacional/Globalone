import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { join } from 'path';
import { validarUploadAssinadoSeNecessario } from './documentos-upload-validation.util';

function resolveUploadsDir(subdir: string): string {
  const env = process.env.UPLOADS_DIR;
  const base =
    env && !/^https?:\/\//i.test(env)
      ? env.startsWith('.')
        ? join(process.cwd(), env)
        : env
      : join(process.cwd(), 'uploads');
  const dir = join(base, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export type TipoDocumento = 'certificado' | 'fornecedor' | 'estagiario';
const TIPOS_VALIDOS: TipoDocumento[] = ['certificado', 'fornecedor', 'estagiario'];

type JwtUser = { userId: number; permissions?: string[] };

@Injectable()
export class DocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  resolveSubdir(tipo: TipoDocumento): string {
    return `documentos/${tipo}`;
  }

  resolveDir(tipo: TipoDocumento): string {
    return resolveUploadsDir(this.resolveSubdir(tipo));
  }

  buildUrl(tipo: TipoDocumento, filename: string): string {
    const prefix = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');
    return `${prefix}/documentos/${tipo}/${filename}`;
  }

  isTipoValido(tipo: string): tipo is TipoDocumento {
    return TIPOS_VALIDOS.includes(tipo as TipoDocumento);
  }

  assertPodeVerUsuario(requester: JwtUser, usuarioId: number) {
    const self = Number(requester.userId) === Number(usuarioId);
    const perms = requester.permissions ?? [];
    const podeVer =
      self ||
      perms.includes('sistema:administrar') ||
      perms.includes('usuarios:visualizar') ||
      perms.includes('usuarios:editar') ||
      perms.includes('usuarios:gerenciar') ||
      perms.includes('documentos_rh:gerenciar');
    if (!podeVer) {
      throw new ForbiddenException('Sem permissão para visualizar documentos deste usuário.');
    }
  }

  async salvar(
    tipo: TipoDocumento,
    nomeExibicao: string,
    nomeArquivo: string,
    criadoPorId: number,
    usuarioId?: number,
  ) {
    const url = this.buildUrl(tipo, nomeArquivo);
    const doc = await this.prisma.documentoGlobaltec.create({
      data: { tipo, nomeExibicao, nomeArquivo, url, criadoPorId, usuarioId: usuarioId ?? null },
    });

    if (usuarioId && (tipo === 'estagiario' || tipo === 'fornecedor')) {
      await this.marcarConvitesPendentesComoUsados(usuarioId, tipo, doc.id);
    }

    return doc;
  }

  private async marcarConvitesPendentesComoUsados(
    usuarioId: number,
    tipo: string,
    documentoId: number,
  ) {
    const agora = new Date();
    const pendentes = await this.prisma.documentoConvite.findMany({
      where: {
        usuarioId,
        tipo,
        usadoEm: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }],
      },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    });
    if (pendentes.length === 0) return;

    await this.prisma.documentoConvite.update({
      where: { id: pendentes[0].id },
      data: { usadoEm: agora, documentoId },
    });

    if (pendentes.length > 1) {
      await this.prisma.documentoConvite.updateMany({
        where: { id: { in: pendentes.slice(1).map((p) => p.id) } },
        data: { usadoEm: agora },
      });
    }
  }

  async listar(tipo?: string) {
    const where = tipo && this.isTipoValido(tipo) ? { tipo } : undefined;
    return this.prisma.documentoGlobaltec.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        usuario: { select: { id: true, nome: true } },
      },
    });
  }

  async deletar(id: number) {
    const doc = await this.prisma.documentoGlobaltec.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');

    const dir = resolveUploadsDir(`documentos/${doc.tipo}`);
    const filepath = join(dir, doc.nomeArquivo);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    await this.prisma.documentoGlobaltec.delete({ where: { id } });
    return { message: 'Documento removido com sucesso.' };
  }

  // ─── Confidencialidade vinculada ao perfil ──────────────────────────────────

  async getConfidencialidadeUsuario(requester: JwtUser, usuarioId: number) {
    this.assertPodeVerUsuario(requester, usuarioId);

    const agora = new Date();
    const [documento, convitePendente] = await Promise.all([
      this.prisma.documentoGlobaltec.findFirst({
        where: { usuarioId, tipo: 'estagiario' },
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true,
          nomeExibicao: true,
          url: true,
          criadoEm: true,
        },
      }),
      this.prisma.documentoConvite.findFirst({
        where: {
          usuarioId,
          tipo: 'estagiario',
          usadoEm: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }],
        },
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true,
          token: true,
          titulo: true,
          criadoEm: true,
          expiresAt: true,
        },
      }),
    ]);

    return { documento, convitePendente };
  }

  // ─── Convites públicos ──────────────────────────────────────────────────────

  async criarConvite(
    tipo: 'fornecedor' | 'estagiario',
    titulo: string | undefined,
    criadoPorId: number,
    usuarioId?: number,
    diasValidade = 30,
  ) {
    if (usuarioId) {
      const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
      if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000);
    return this.prisma.documentoConvite.create({
      data: { token, tipo, titulo, criadoPorId, usuarioId: usuarioId ?? null, expiresAt },
      include: {
        usuario: { select: { id: true, nome: true } },
      },
    });
  }

  async buscarConvite(token: string) {
    const convite = await this.prisma.documentoConvite.findUnique({
      where: { token },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        usuario: { select: { id: true, nome: true, formacao: true, cpf: true } },
      },
    });
    if (!convite) throw new NotFoundException('Link inválido ou inexistente.');
    if (convite.usadoEm) throw new GoneException('Este link já foi utilizado.');
    if (convite.expiresAt && convite.expiresAt < new Date()) {
      throw new GoneException('Este link expirou.');
    }
    return convite;
  }

  async validarPdfAssinado(
    file: Express.Multer.File,
    tipo: 'fornecedor' | 'estagiario',
    cpfEsperado?: string | null,
  ) {
    await validarUploadAssinadoSeNecessario(file, tipo, {
      cpfEsperado,
      usuarioId: undefined,
      prisma: this.prisma,
    });
  }

  async registrarUploadPublico(
    convite: Awaited<ReturnType<DocumentosService['buscarConvite']>>,
    tipo: string,
    nomeExibicao: string,
    nomeArquivo: string,
  ) {
    if (convite.tipo !== tipo) {
      throw new BadRequestException('Tipo de documento incompatível com o convite.');
    }

    const url = this.buildUrl(tipo as TipoDocumento, nomeArquivo);

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentoGlobaltec.create({
        data: {
          tipo,
          nomeExibicao,
          nomeArquivo,
          url,
          criadoPorId: convite.criadoPorId,
          usuarioId: convite.usuarioId,
        },
      });

      await tx.documentoConvite.update({
        where: { token: convite.token },
        data: { usadoEm: new Date(), documentoId: doc.id },
      });

      return doc;
    });
  }

  async listarConvites(criadoPorId: number) {
    return this.prisma.documentoConvite.findMany({
      where: { criadoPorId },
      orderBy: { criadoEm: 'desc' },
      include: {
        documento: { select: { id: true, nomeExibicao: true } },
        usuario: { select: { id: true, nome: true } },
      },
    });
  }
}
