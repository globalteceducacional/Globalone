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
import { AfastamentoTipo } from '@prisma/client';
import { extname, join } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AfastamentosService } from './afastamentos.service';

function ensureAfastamentosUploadDir(): string {
  const env = process.env.UPLOADS_DIR;
  const base =
    env && !/^https?:\/\//i.test(env)
      ? env.startsWith('.')
        ? join(process.cwd(), env)
        : env
      : join(process.cwd(), 'uploads');
  const dir = join(base, 'afastamentos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const ALLOWED = /^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/i;
const UPLOADS_URL_PREFIX = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');

@Controller('rh/afastamentos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AfastamentosController {
  constructor(private readonly service: AfastamentosService) {}

  @Get('me')
  @Permissions('afastamentos:registrar', 'afastamentos:ver_todos')
  meus(@CurrentUser() user: { userId: number }) {
    return this.service.listarMeus(user.userId);
  }

  @Get()
  @Permissions('afastamentos:ver_todos')
  listar(
    @Query('usuarioId') usuarioIdRaw?: string,
    @Query('tipo') tipo?: AfastamentoTipo,
  ) {
    return this.service.listarTodos({
      usuarioId: usuarioIdRaw ? Number(usuarioIdRaw) : undefined,
      tipo,
    });
  }

  @Post()
  @Permissions('afastamentos:registrar')
  @UseInterceptors(
    FileInterceptor('anexo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureAfastamentosUploadDir()),
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rnd = Math.round(Math.random() * 1e9);
          const ext = (extname(file.originalname) || '').toLowerCase();
          cb(null, `afast-${ts}-${rnd}${ext}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED.test(file.mimetype)) {
          cb(new BadRequestException('Anexo deve ser PDF ou imagem.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async criar(
    @CurrentUser() user: { userId: number },
    @UploadedFile() anexo: Express.Multer.File | undefined,
    @Body() body: {
      usuarioId: string | number;
      tipo: AfastamentoTipo;
      dataInicio: string;
      dataFim: string;
      motivo?: string;
    },
  ) {
    if (!body?.tipo || !body.dataInicio || !body.dataFim) {
      throw new BadRequestException('Campos obrigatórios: tipo, dataInicio, dataFim.');
    }
    // Anexos protegidos (LGPD): servidos via JwtAuthGuard em /uploads-protegido/...
    const anexoUrl = anexo ? `/uploads-protegido/afastamentos/${anexo.filename}` : null;
    return this.service.criar(user.userId, {
      usuarioId: Number(body.usuarioId) || user.userId,
      tipo: body.tipo,
      dataInicio: body.dataInicio,
      dataFim: body.dataFim,
      motivo: body.motivo,
      anexoUrl,
    });
  }

  @Delete(':id')
  @Permissions('afastamentos:registrar')
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.service.remover(id);
  }
}
