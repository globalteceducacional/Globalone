import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentosService } from './documentos.service';
import {
  createDocumentoPdfMulterOptions,
  finalizeDocumentoUpload,
} from './documentos-upload.util';

const TIPOS_PUBLICOS = new Set(['fornecedor', 'estagiario']);

/**
 * Endpoints públicos para preenchimento de documentos via link de convite.
 * Não exige autenticação JWT — o token UUID no URL é a credencial de acesso.
 */
@Controller('documentos-publicos')
export class DocumentosPublicosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Get('convite/:token')
  async validarConvite(@Param('token') token: string) {
    const convite = await this.documentosService.buscarConvite(token);
    return {
      tipo: convite.tipo,
      titulo: convite.titulo ?? null,
      criadoPor: convite.criadoPor.nome,
      signatario: convite.usuario?.nome ?? null,
      expiresAt: convite.expiresAt,
    };
  }

  @Post('convite/:token/upload')
  @UseInterceptors(FileInterceptor('file', createDocumentoPdfMulterOptions()))
  async uploadPublico(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('nomeExibicao') nomeExibicao: string,
    @Body('cpfEsperado') cpfEsperado: string | undefined,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!TIPOS_PUBLICOS.has(tipo)) {
      throw new BadRequestException('Tipo inválido.');
    }
    if (!nomeExibicao?.trim()) {
      throw new BadRequestException('Nome do documento é obrigatório.');
    }

    const convite = await this.documentosService.buscarConvite(token);

    await this.documentosService.validarPdfAssinado(
      file,
      tipo as 'fornecedor' | 'estagiario',
      cpfEsperado ?? convite.usuario?.cpf ?? null,
    );

    const nomeArquivo = finalizeDocumentoUpload(file, tipo);

    const doc = await this.documentosService.registrarUploadPublico(
      convite,
      tipo,
      nomeExibicao.trim(),
      nomeArquivo,
    );

    return {
      id: doc.id,
      url: doc.url,
      nomeExibicao: doc.nomeExibicao,
      tipo: doc.tipo,
      criadoEm: doc.criadoEm,
    };
  }
}
