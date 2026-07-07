import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PatentesDocumentosService } from './patentes-documentos.service';
import {
  createPatenteDocumentoMulterOptions,
  finalizePatenteDocumentoUpload,
} from './patentes-documentos-upload.util';

type JwtUser = { userId: number };

@Controller('patentes-documentos')
@UseGuards(JwtAuthGuard)
export class PatentesDocumentosController {
  constructor(private readonly service: PatentesDocumentosService) {}

  @Get('pastas')
  listarPastas() {
    return this.service.listarPastas();
  }

  @Post('pastas')
  criarPasta(
    @Body('nome') nome: string,
    @Body('descricao') descricao: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.criarPasta(nome, user.userId, descricao);
  }

  @Get('pastas/:pastaId')
  obterPasta(@Param('pastaId', ParseIntPipe) pastaId: number) {
    return this.service.obterPasta(pastaId);
  }

  @Get('pastas/:pastaId/documentos')
  listarDocumentosDaPasta(@Param('pastaId', ParseIntPipe) pastaId: number) {
    return this.service.listarDocumentosDaPasta(pastaId);
  }

  @Post('pastas/:pastaId/upload')
  @UseInterceptors(FileInterceptor('file', createPatenteDocumentoMulterOptions()))
  async uploadNaPasta(
    @Param('pastaId', ParseIntPipe) pastaId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('nomeExibicao') nomeExibicao: string,
    @Body('descricao') descricao: string | undefined,
    @Body('numeroReferencia') numeroReferencia: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!nomeExibicao?.trim()) {
      throw new BadRequestException('Nome do documento é obrigatório.');
    }

    const nomeArquivo = finalizePatenteDocumentoUpload(file, pastaId, this.service);

    return this.service.salvarUploadNaPasta(
      pastaId,
      nomeExibicao.trim(),
      nomeArquivo,
      user.userId,
      descricao,
      numeroReferencia,
    );
  }

  @Delete('pastas/:pastaId')
  deletarPasta(@Param('pastaId', ParseIntPipe) pastaId: number) {
    return this.service.deletarPasta(pastaId);
  }

  @Delete('documentos/:id')
  deletarDocumento(@Param('id', ParseIntPipe) id: number) {
    return this.service.deletarDocumento(id);
  }

  @Post('arquivar-gerado')
  arquivarGerado(
    @Body('documentoGlobaltecId') documentoGlobaltecId: number,
    @Body('pastaId') pastaId: number | undefined,
    @Body('novaPastaNome') novaPastaNome: string | undefined,
    @Body('novaPastaDescricao') novaPastaDescricao: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const docId = Number(documentoGlobaltecId);
    if (!Number.isFinite(docId) || docId < 1) {
      throw new BadRequestException('documentoGlobaltecId inválido.');
    }
    if (pastaId == null && !novaPastaNome?.trim()) {
      throw new BadRequestException('Informe pastaId ou novaPastaNome.');
    }
    if (pastaId != null) {
      const pid = Number(pastaId);
      if (!Number.isFinite(pid) || pid < 1) {
        throw new BadRequestException('pastaId inválido.');
      }
    }

    return this.service.arquivarDocumentoGerado(docId, user.userId, {
      pastaId: pastaId != null ? Number(pastaId) : undefined,
      novaPastaNome,
      novaPastaDescricao,
    });
  }
}
