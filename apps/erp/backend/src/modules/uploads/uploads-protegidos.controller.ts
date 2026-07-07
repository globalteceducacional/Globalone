import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Endpoint protegido para servir arquivos sensíveis (LGPD).
 *
 * Substitui o `express.static('/uploads')` para os tipos de anexo que contêm
 * dados pessoais (documentos do colaborador, atestados, etc.).
 *
 * Regras de acesso:
 *  - `docs-rh`: o próprio dono do documento OU quem tem `documentos:ver_todos`/`rh:ver_todos`.
 *  - `afastamentos`: dono OU quem tem `afastamentos:ver_todos`/`rh:ver_todos`.
 *  - `ponto`: dono da batida OU `ponto:ver_todos`/`ponto:ajustar`.
 */
@Controller('uploads-protegido')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsProtegidosController {
  private readonly uploadsRoot: string;

  constructor(private readonly prisma: PrismaService) {
    const env = process.env.UPLOADS_DIR;
    if (env && !env.startsWith('http')) {
      this.uploadsRoot = resolve(env);
    } else {
      this.uploadsRoot = resolve(process.cwd(), 'uploads');
    }
  }

  @Get(':tipo/:filename')
  async servir(
    @CurrentUser() user: { userId: number; permissoes?: string[] },
    @Param('tipo') tipo: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!/^[a-zA-Z0-9_\-.]+$/.test(filename)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const tiposPermitidos = ['docs-rh', 'afastamentos', 'ponto'];
    if (!tiposPermitidos.includes(tipo)) {
      throw new NotFoundException('Tipo de upload não suportado.');
    }

    await this.validarAcesso(user, tipo, filename);

    const filePath = normalize(join(this.uploadsRoot, tipo, filename));
    if (!filePath.startsWith(this.uploadsRoot)) {
      throw new ForbiddenException('Acesso negado.');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.sendFile(filePath);
  }

  private async validarAcesso(
    user: { userId: number; permissions?: string[]; permissoes?: string[] },
    tipo: string,
    filename: string,
  ): Promise<void> {
    // Payload atual do JWT usa `permissions`; mantemos fallback para `permissoes` legada.
    const perms = user.permissions ?? user.permissoes ?? [];
    // Admin global também deve passar nas rotas protegidas de upload.
    const isAdmin =
      perms.includes('rh:ver_todos') ||
      perms.includes('rh:gerenciar_empregador') ||
      perms.includes('sistema:administrar');

    if (tipo === 'docs-rh') {
      if (
        isAdmin ||
        perms.includes('documentos_rh:ver_todos') ||
        perms.includes('documentos_rh:gerenciar')
      ) {
        return;
      }
      const path = `/uploads-protegido/docs-rh/${filename}`;
      const pathLegado = `/uploads/docs-rh/${filename}`;
      const doc = await this.prisma.documentoColaborador.findFirst({
        where: { OR: [{ arquivoUrl: path }, { arquivoUrl: pathLegado }] },
        select: { usuarioId: true },
      });
      if (!doc) throw new NotFoundException('Arquivo não encontrado.');
      if (doc.usuarioId !== user.userId) throw new ForbiddenException('Sem permissão.');
      return;
    }

    if (tipo === 'afastamentos') {
      if (isAdmin || perms.includes('afastamentos:ver_todos')) return;
      const path = `/uploads-protegido/afastamentos/${filename}`;
      const pathLegado = `/uploads/afastamentos/${filename}`;
      const af = await this.prisma.afastamento.findFirst({
        where: { OR: [{ anexoUrl: path }, { anexoUrl: pathLegado }] },
        select: { usuarioId: true },
      });
      if (!af) throw new NotFoundException('Arquivo não encontrado.');
      if (af.usuarioId !== user.userId) throw new ForbiddenException('Sem permissão.');
      return;
    }

    if (tipo === 'ponto') {
      if (
        isAdmin ||
        perms.includes('ponto:ver_todos') ||
        perms.includes('ponto:ajustar')
      ) {
        return;
      }
      const path = `/uploads-protegido/ponto/${filename}`;
      const pathLegado = `/uploads/ponto/${filename}`;
      const reg = await this.prisma.registroPonto.findFirst({
        where: { OR: [{ fotoUrl: path }, { fotoUrl: pathLegado }] },
        select: { usuarioId: true },
      });
      if (!reg) throw new NotFoundException('Arquivo não encontrado.');
      if (reg.usuarioId !== user.userId) throw new ForbiddenException('Sem permissão.');
      return;
    }

    throw new NotFoundException('Tipo não suportado.');
  }
}
