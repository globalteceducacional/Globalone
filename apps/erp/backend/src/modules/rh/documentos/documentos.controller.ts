import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_LIMITS } from '../../../common/constants/upload-limits';
import { diskStorage } from 'multer';
import { DocumentoColaboradorTipo } from '@prisma/client';
import { extname, join } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DocumentosService } from './documentos.service';

function ensureDocsUploadDir(): string {
  const env = process.env.UPLOADS_DIR;
  const base =
    env && !/^https?:\/\//i.test(env)
      ? env.startsWith('.')
        ? join(process.cwd(), env)
        : env
      : join(process.cwd(), 'uploads');
  const dir = join(base, 'docs-rh');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const ALLOWED = /^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/i;
const UPLOADS_URL_PREFIX = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');

@Controller('rh/documentos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentosController {
  constructor(private readonly service: DocumentosService) {}

  @Get('me')
  @Permissions('documentos_rh:ver_proprios', 'documentos_rh:gerenciar')
  meus(@CurrentUser() user: { userId: number }) {
    return this.service.listarPorUsuario(user.userId);
  }

  @Get('a-vencer')
  @Permissions('documentos_rh:gerenciar')
  aVencer(@Query('dias') diasRaw?: string) {
    const dias = diasRaw ? Math.max(1, Math.min(365, Number(diasRaw))) : 30;
    return this.service.aVencer(dias);
  }

  @Get('usuario/:usuarioId')
  @Permissions('documentos_rh:gerenciar')
  porUsuario(@Param('usuarioId', ParseIntPipe) usuarioId: number) {
    return this.service.listarPorUsuario(usuarioId);
  }

  @Post()
  @Permissions('documentos_rh:gerenciar')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureDocsUploadDir()),
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rnd = Math.round(Math.random() * 1e9);
          const ext = (extname(file.originalname) || '').toLowerCase();
          cb(null, `doc-${ts}-${rnd}${ext}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED.test(file.mimetype)) {
          cb(new BadRequestException('Arquivo deve ser PDF ou imagem.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async criar(
    @CurrentUser() user: { userId: number },
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body() body: {
      usuarioId: string | number;
      tipo: DocumentoColaboradorTipo;
      titulo: string;
      dataValidade?: string;
      observacao?: string;
    },
  ) {
    if (!arquivo) {
      throw new BadRequestException('Arquivo obrigatório.');
    }
    if (!body?.usuarioId || !body.tipo || !body.titulo) {
      throw new BadRequestException('Campos obrigatórios: usuarioId, tipo, titulo.');
    }
    return this.service.criar(user.userId, {
      usuarioId: Number(body.usuarioId),
      tipo: body.tipo,
      titulo: body.titulo,
      // Anexos protegidos (LGPD): servidos via JwtAuthGuard em /uploads-protegido/...
      arquivoUrl: `/uploads-protegido/docs-rh/${arquivo.filename}`,
      dataValidade: body.dataValidade || null,
      observacao: body.observacao || null,
    });
  }

  @Delete(':id')
  @Permissions('documentos_rh:gerenciar')
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.service.remover(id);
  }
}
