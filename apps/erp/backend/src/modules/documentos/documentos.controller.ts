import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentosService } from './documentos.service';
import {
  createDocumentoPdfMulterOptions,
  finalizeDocumentoUpload,
} from './documentos-upload.util';
import { validarUploadAssinadoSeNecessario } from './documentos-upload-validation.util';

const TIPOS_VALIDOS = new Set(['certificado', 'fornecedor', 'estagiario']);

type JwtUser = { userId: number; permissions?: string[] };

@Controller('documentos')
@UseGuards(JwtAuthGuard)
export class DocumentosController {
  constructor(
    private readonly documentosService: DocumentosService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('confidencialidade/usuario/:usuarioId')
  getConfidencialidade(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.documentosService.getConfidencialidadeUsuario(user, usuarioId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', createDocumentoPdfMulterOptions()))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('nomeExibicao') nomeExibicao: string,
    @Body('usuarioId') usuarioIdRaw: string | undefined,
    @Body('cpfEsperado') cpfEsperado: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!TIPOS_VALIDOS.has(tipo)) {
      throw new BadRequestException('Tipo inválido. Use: certificado, fornecedor ou estagiario.');
    }
    if (!nomeExibicao?.trim()) {
      throw new BadRequestException('Nome do documento é obrigatório.');
    }

    let usuarioId: number | undefined;
    if (usuarioIdRaw != null && String(usuarioIdRaw).trim() !== '') {
      usuarioId = Number.parseInt(String(usuarioIdRaw), 10);
      if (!Number.isFinite(usuarioId) || usuarioId < 1) {
        throw new BadRequestException('usuarioId inválido.');
      }
      const self = Number(user.userId) === usuarioId;
      const perms = user.permissions ?? [];
      const podeVincular =
        self ||
        perms.includes('sistema:administrar') ||
        perms.includes('usuarios:gerenciar') ||
        perms.includes('documentos_rh:gerenciar');
      if (!podeVincular) {
        throw new ForbiddenException('Sem permissão para vincular documento a outro usuário.');
      }
    }

    await validarUploadAssinadoSeNecessario(file, tipo as 'certificado' | 'fornecedor' | 'estagiario', {
      cpfEsperado,
      usuarioId,
      prisma: this.prisma,
    });

    const nomeArquivo = finalizeDocumentoUpload(file, tipo);

    const doc = await this.documentosService.salvar(
      tipo as 'certificado' | 'fornecedor' | 'estagiario',
      nomeExibicao.trim(),
      nomeArquivo,
      user.userId,
      usuarioId,
    );

    return {
      id: doc.id,
      url: doc.url,
      nomeExibicao: doc.nomeExibicao,
      tipo: doc.tipo,
      usuarioId: doc.usuarioId,
      criadoEm: doc.criadoEm,
    };
  }

  @Get()
  listar(@Query('tipo') tipo?: string) {
    return this.documentosService.listar(tipo);
  }

  @Get('convites')
  listarConvites(@CurrentUser() user: JwtUser) {
    return this.documentosService.listarConvites(user.userId);
  }

  @Post('convite')
  async criarConvite(
    @Body('tipo') tipo: string,
    @Body('titulo') titulo: string | undefined,
    @Body('usuarioId') usuarioIdRaw: number | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    if (tipo !== 'fornecedor' && tipo !== 'estagiario') {
      throw new BadRequestException('Tipo inválido. Use: fornecedor ou estagiario.');
    }

    let usuarioId: number | undefined;
    if (usuarioIdRaw != null) {
      usuarioId = Number(usuarioIdRaw);
      if (!Number.isFinite(usuarioId) || usuarioId < 1) {
        throw new BadRequestException('usuarioId inválido.');
      }
    }

    return this.documentosService.criarConvite(tipo, titulo, user.userId, usuarioId);
  }

  @Delete(':id')
  deletar(@Param('id', ParseIntPipe) id: number) {
    return this.documentosService.deletar(id);
  }
}
