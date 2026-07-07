import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_LIMITS } from '../../../common/constants/upload-limits';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PontoService } from './ponto.service';
import { BaterPontoDto } from './dto/bater-ponto.dto';
import { BaterBatchDto } from './dto/bater-batch.dto';
import { CriarAjustePontoDto, EditarPontoDto, RemoverPontoDto } from './dto/ajustar-ponto.dto';
import { ListarPontoDto } from './dto/listar-ponto.dto';

/**
 * Resolve o diretório de upload de fotos do ponto, criando se necessário.
 * Segue o mesmo padrão do `users.controller` para profile-photo.
 */
function ensurePontoUploadDir(): string {
  const env = process.env.UPLOADS_DIR;
  const base =
    env && !/^https?:\/\//i.test(env)
      ? env.startsWith('.')
        ? join(process.cwd(), env)
        : env
      : join(process.cwd(), 'uploads');
  const dir = join(base, 'ponto');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const ALLOWED_FOTO_MIMES = /^image\/(jpeg|jpg|png|webp)$/i;

@Controller('rh/ponto')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PontoController {
  constructor(private readonly pontoService: PontoService) {}

  // ---------- Endpoints do colaborador ----------

  @Post('bater')
  @Permissions('ponto:bater')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensurePontoUploadDir());
        },
        filename: (req, file, cb) => {
          const userId = (req as { user?: { userId: number } }).user?.userId ?? 0;
          const ext = (extname(file.originalname) || '.jpg').toLowerCase();
          const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
          const ts = Date.now();
          const rnd = Math.round(Math.random() * 1e9);
          cb(null, `ponto-${userId}-${ts}-${rnd}${safeExt}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_FOTO_MIMES.test(file.mimetype)) {
          cb(new BadRequestException('A foto deve estar em JPEG, PNG ou WebP.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  baterPonto(
    @CurrentUser() user: { userId: number },
    @Body() dto: BaterPontoDto,
    @UploadedFile() foto: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!foto) {
      throw new BadRequestException(
        'Selfie obrigatória. Habilite a câmera para registrar o ponto.',
      );
    }
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    return this.pontoService.baterPonto(user.userId, dto, foto, ip);
  }

  /**
   * Sincronização em lote de batidas offline (mobile).
   * Cliente envia batidas acumuladas (sem foto) com `dataHoraCliente`.
   * O servidor preserva o instante quando dentro de [now-24h, now+5min].
   */
  @Post('bater-batch')
  @Permissions('ponto:bater')
  baterBatch(
    @CurrentUser() user: { userId: number },
    @Body() dto: BaterBatchDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    return this.pontoService.baterBatch(user.userId, dto.batidas, ip);
  }

  @Get('hoje')
  @Permissions('ponto:bater', 'ponto:ver_proprios', 'ponto:ver_todos')
  hoje(@CurrentUser() user: { userId: number }) {
    return this.pontoService.statusHoje(user.userId);
  }

  @Get('meus')
  @Permissions('ponto:bater', 'ponto:ver_proprios', 'ponto:ver_todos')
  meusRegistros(@CurrentUser() user: { userId: number }, @Query() filtros: ListarPontoDto) {
    return this.pontoService.listarMeus(user.userId, filtros);
  }

  // ---------- Endpoints do RH/admin ----------

  @Get()
  @Permissions('ponto:ver_todos')
  listar(@Query() filtros: ListarPontoDto) {
    return this.pontoService.listarTodos(filtros);
  }

  @Post('ajuste')
  @Permissions('ponto:ajustar')
  criarAjuste(@CurrentUser() user: { userId: number }, @Body() dto: CriarAjustePontoDto) {
    return this.pontoService.criarAjuste(user.userId, dto);
  }

  @Patch(':id')
  @Permissions('ponto:ajustar')
  editar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarPontoDto,
  ) {
    return this.pontoService.editar(user.userId, id, dto);
  }

  @Delete(':id')
  @Permissions('ponto:ajustar')
  remover(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemoverPontoDto,
  ) {
    return this.pontoService.remover(user.userId, id, dto);
  }

  @Get('exportar')
  @Permissions('ponto:exportar')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportar(
    @Query() filtros: ListarPontoDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.pontoService.exportarCsv(filtros);
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="ponto-${ts}.csv"`);
    return '\uFEFF' + csv;
  }

  // ---------- Comprovante REP-P (Portaria 671/2021) ----------

  /**
   * Comprovante de batida (HTML imprimível) com NSR, hash e QR-code.
   * Formato leve, sem dependências de PDF — o navegador imprime como PDF.
   */
  @Get(':id/comprovante')
  @Permissions('ponto:bater', 'ponto:ver_proprios', 'ponto:ver_todos', 'ponto:ajustar')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async comprovante(
    @CurrentUser() user: { userId: number; permissoes?: string[] },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<string> {
    const dados = await this.pontoService.obterComprovante(id);
    const podeVerTodos =
      user.permissoes?.includes('ponto:ver_todos') ||
      user.permissoes?.includes('ponto:ajustar');
    if (dados.registro.usuarioId !== user.userId && !podeVerTodos) {
      throw new NotFoundException('Comprovante não encontrado.');
    }
    return this.pontoService.renderComprovanteHtml(dados);
  }
}

/**
 * Endpoint público (sem JWT) para conferência de comprovante via QR-code.
 * Mantido em controller separado para não compartilhar `@UseGuards` do controller principal.
 */
@Controller('rh/comprovante')
export class ComprovantePublicoController {
  constructor(private readonly pontoService: PontoService) {}

  @Get('conferir/:comprovanteId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async conferir(@Param('comprovanteId') comprovanteId: string): Promise<string> {
    const dados = await this.pontoService.obterComprovantePorPublicId(comprovanteId);
    return this.pontoService.renderComprovanteHtml(dados, { conferencia: true });
  }
}
