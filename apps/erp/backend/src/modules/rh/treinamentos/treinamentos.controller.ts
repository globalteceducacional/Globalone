import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MatriculaTreinamentoStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TreinamentosService } from './treinamentos.service';
import { UPLOAD_LIMITS } from '../../../common/constants/upload-limits';
import {
  resolveTreinamentosUploadDir,
  TREINAMENTO_VIDEO_MIMES,
} from './treinamentos-video.util';

@Controller('rh/treinamentos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TreinamentosController {
  constructor(private readonly service: TreinamentosService) {}

  @Get()
  @Permissions('treinamentos:gerenciar', 'treinamentos:participar')
  listar() {
    return this.service.listar();
  }

  @Post()
  @Permissions('treinamentos:gerenciar')
  criar(
    @CurrentUser() user: { userId: number },
    @Body()
    dto: {
      titulo: string;
      descricao?: string;
      cargaHoraria?: number;
      anexosJson?: any;
      cargosObrigatoriosIds?: number[];
    },
  ) {
    return this.service.criar(user.userId, dto);
  }

  @Get('me')
  @Permissions('treinamentos:participar', 'treinamentos:gerenciar')
  minhas(@CurrentUser() user: { userId: number }) {
    return this.service.minhasMatriculas(user.userId);
  }

  @Get('me/pendentes')
  @Permissions('treinamentos:participar', 'treinamentos:gerenciar')
  pendentes(@CurrentUser() user: { userId: number }) {
    return this.service.pendentesObrigatorios(user.userId);
  }

  @Post(':id/ingressar')
  @Permissions('treinamentos:participar', 'treinamentos:gerenciar')
  ingressar(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.ingressar(id, user.userId, user.permissions ?? []);
  }

  @Get(':id/trilha')
  @Permissions('treinamentos:participar', 'treinamentos:gerenciar')
  trilhaParticipante(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.obterTrilhaParticipante(id, user.userId, user.permissions ?? []);
  }

  @Post(':id/itens/:itemId/concluir-video')
  @Permissions('treinamentos:participar', 'treinamentos:gerenciar')
  concluirVideoItem(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.service.concluirItemVideo(id, itemId, user.userId, user.permissions ?? []);
  }

  @Post(':id/itens/:itemId/responder')
  @Permissions('treinamentos:participar', 'treinamentos:gerenciar')
  responderQuestaoItem(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: { respostaIndice: number },
  ) {
    return this.service.responderItemQuestao(
      id,
      itemId,
      dto.respostaIndice,
      user.userId,
      user.permissions ?? [],
    );
  }

  @Patch('matriculas/:id')
  @Permissions('treinamentos:gerenciar', 'treinamentos:participar')
  atualizarMatricula(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      status?: MatriculaTreinamentoStatus;
      certificadoUrl?: string;
      notaAvaliacao?: number;
    },
  ) {
    return this.service.atualizarMatricula(id, dto, user);
  }

  @Get(':id')
  @Permissions('treinamentos:gerenciar', 'treinamentos:participar')
  buscar(@Param('id', ParseIntPipe) id: number) {
    return this.service.buscarPorId(id);
  }

  @Get(':id/itens')
  @Permissions('treinamentos:gerenciar')
  listarItens(@Param('id', ParseIntPipe) id: number) {
    return this.service.listarItens(id);
  }

  @Post(':id/itens/video')
  @Permissions('treinamentos:gerenciar')
  criarItemVideo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { titulo?: string },
  ) {
    return this.service.criarItemVideo(id, dto.titulo);
  }

  @Post(':id/itens/questao')
  @Permissions('treinamentos:gerenciar')
  criarItemQuestao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { titulo?: string; questao: unknown },
  ) {
    return this.service.criarItemQuestao(id, dto.questao as any, dto.titulo);
  }

  @Patch(':id/itens/ordem')
  @Permissions('treinamentos:gerenciar')
  reordenarItens(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { itemIds: number[] },
  ) {
    return this.service.reordenarItens(id, dto.itemIds ?? []);
  }

  @Patch(':id/itens/:itemId')
  @Permissions('treinamentos:gerenciar')
  atualizarItemQuestao(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: { titulo?: string; questao: unknown },
  ) {
    return this.service.atualizarItemQuestao(id, itemId, {
      titulo: dto.titulo,
      questao: dto.questao as any,
    });
  }

  @Delete(':id/itens/:itemId')
  @Permissions('treinamentos:gerenciar')
  removerItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.service.removerItem(id, itemId);
  }

  @Get(':id/itens/:itemId/video')
  @Permissions('treinamentos:gerenciar', 'treinamentos:participar')
  async assistirVideoItem(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.service.streamVideoItem(
      id,
      itemId,
      user.userId,
      user.permissions ?? [],
      req.headers.range,
      res,
    );
  }

  @Post(':id/itens/:itemId/video')
  @Permissions('treinamentos:gerenciar')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, resolveTreinamentosUploadDir());
        },
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rnd = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || '.mp4';
          cb(null, `treinamento-${ts}-${rnd}${ext}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.treinamento.maxBytes },
      fileFilter: (_req, file, cb) => {
        if (TREINAMENTO_VIDEO_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Formato não permitido (${file.mimetype}). Use MP4, WebM, MOV, AVI ou MKV.`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadVideoItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum vídeo enviado.');
    }
    return this.service.uploadVideoItem(id, itemId, file);
  }

  @Delete(':id/itens/:itemId/video')
  @Permissions('treinamentos:gerenciar')
  removerVideoItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.service.removerVideoItem(id, itemId);
  }

  @Get(':id/video')
  @Permissions('treinamentos:gerenciar', 'treinamentos:participar')
  async assistirVideo(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.service.streamVideo(
      id,
      user.userId,
      user.permissions ?? [],
      req.headers.range,
      res,
    );
  }

  @Post(':id/video')
  @Permissions('treinamentos:gerenciar')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, resolveTreinamentosUploadDir());
        },
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rnd = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || '.mp4';
          cb(null, `treinamento-${ts}-${rnd}${ext}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.treinamento.maxBytes },
      fileFilter: (_req, file, cb) => {
        if (TREINAMENTO_VIDEO_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Formato não permitido (${file.mimetype}). Use MP4, WebM, MOV, AVI ou MKV.`,
            ),
            false,
          );
        }
      },
    }),
  )
  uploadVideo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum vídeo enviado.');
    }
    return this.service.uploadVideo(id, file);
  }

  @Delete(':id/video')
  @Permissions('treinamentos:gerenciar')
  removerVideo(@Param('id', ParseIntPipe) id: number) {
    return this.service.removerVideo(id);
  }

  @Patch(':id')
  @Permissions('treinamentos:gerenciar')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      titulo?: string;
      descricao?: string;
      cargaHoraria?: number;
      ativo?: boolean;
      cargosObrigatoriosIds?: number[];
    },
  ) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  @Permissions('treinamentos:gerenciar')
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.service.remover(id);
  }

  @Get(':id/matriculas')
  @Permissions('treinamentos:gerenciar')
  matriculas(@Param('id', ParseIntPipe) id: number) {
    return this.service.matriculasDoTreinamento(id);
  }

  @Post(':id/matriculas')
  @Permissions('treinamentos:gerenciar')
  matricular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { usuarioIds: number[] },
  ) {
    return this.service.matricular(id, dto.usuarioIds ?? []);
  }
}
