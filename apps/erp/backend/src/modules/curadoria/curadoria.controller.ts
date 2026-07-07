import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CuradoriaService } from './curadoria.service';
import { CreateCuradoriaItemDto, CreateCuradoriaOrcamentoDto } from './dto/create-curadoria-orcamento.dto';
import { ImportCuradoriaXlsxDto } from './dto/import-curadoria-xlsx.dto';
import { UpdateCuradoriaOrcamentoDto } from './dto/update-curadoria-orcamento.dto';
import { UpdateCuradoriaItemDto } from './dto/update-curadoria-item.dto';

@Controller('curadoria')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CuradoriaController {
  constructor(private readonly curadoriaService: CuradoriaService) {}

  @Get('orcamentos')
  @Permissions('curadoria:visualizar', 'curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  listOrcamentos(@Query('search') search?: string) {
    return this.curadoriaService.listOrcamentos(search);
  }

  @Get('estoque')
  @Permissions('curadoria:visualizar', 'curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  listEstoque(@Query('search') search?: string) {
    return this.curadoriaService.listEstoqueCuradoria(search);
  }

  @Get('estoque/livro-avarias')
  @Permissions('curadoria:visualizar', 'curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  listLivroAvariasDetalhe(@Query('isbn') isbn: string, @Query('categoriaId') categoriaId?: string) {
    let cat: number | null = null;
    if (categoriaId !== undefined && categoriaId !== '') {
      const n = Number(categoriaId);
      cat = Number.isFinite(n) ? n : null;
    }
    return this.curadoriaService.listLivroAvariasCuradoria(isbn, cat);
  }

  @Delete('estoque/:isbn')
  @Permissions('curadoria:excluir', 'curadoria:gerenciar')
  clearEstoque(
    @Param('isbn') isbn: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    return this.curadoriaService.clearEstoqueCuradoria(
      isbn,
      Number.isFinite(categoriaIdNumber as number) ? (categoriaIdNumber as number) : undefined,
    );
  }

  @Get('estoque/:isbn/cotacoes')
  @Permissions('curadoria:visualizar', 'curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  listCotacoesByIsbn(@Param('isbn') isbn: string) {
    return this.curadoriaService.listCotacoesByIsbn(isbn);
  }

  @Get('orcamentos/:id')
  @Permissions('curadoria:visualizar', 'curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  getOrcamentoById(@Param('id', ParseIntPipe) id: number) {
    return this.curadoriaService.getOrcamentoById(id);
  }

  @Post('orcamentos')
  @Permissions('curadoria:criar', 'curadoria:gerenciar')
  createOrcamento(
    @CurrentUser() user: { userId: number },
    @Body() body: CreateCuradoriaOrcamentoDto,
  ) {
    return this.curadoriaService.createOrcamento(body, user.userId);
  }

  @Delete('orcamentos/:id')
  @Permissions('curadoria:excluir', 'curadoria:gerenciar')
  deleteOrcamento(
    @Param('id', ParseIntPipe) id: number,
    @Query('deleteStock') deleteStock?: string,
  ) {
    const shouldDeleteStock = String(deleteStock ?? '').toLowerCase() === 'true';
    return this.curadoriaService.deleteOrcamento(id, shouldDeleteStock);
  }

  @Patch('orcamentos/:id')
  @Permissions('curadoria:editar', 'curadoria:gerenciar')
  updateOrcamento(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCuradoriaOrcamentoDto,
  ) {
    return this.curadoriaService.updateOrcamento(id, body);
  }

  @Post('orcamentos/:id/itens')
  @Permissions('curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateCuradoriaItemDto,
  ) {
    return this.curadoriaService.addItem(id, body);
  }

  @Patch('orcamentos/:id/itens/:itemId')
  @Permissions('curadoria:editar', 'curadoria:gerenciar')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: UpdateCuradoriaItemDto,
  ) {
    return this.curadoriaService.updateItem(id, itemId, body);
  }

  @Delete('orcamentos/:id/itens/:itemId')
  @Permissions('curadoria:excluir', 'curadoria:gerenciar')
  deleteItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.curadoriaService.deleteItem(id, itemId);
  }

  @Post('orcamentos/import-xlsx')
  @Permissions('curadoria:criar', 'curadoria:gerenciar')
  @UseInterceptors(FileInterceptor('file'))
  importXlsx(
    @CurrentUser() user: { userId: number },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportCuradoriaXlsxDto,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo XLSX não enviado.');
    }
    const isXlsx =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!isXlsx) {
      throw new BadRequestException('Formato inválido. Envie somente arquivo .xlsx');
    }

    return this.curadoriaService.importXlsx(file.buffer, body, user.userId);
  }

  @Get('books/isbn/:isbn')
  @Permissions('curadoria:visualizar', 'curadoria:criar', 'curadoria:editar', 'curadoria:gerenciar')
  fetchBookByIsbn(@Param('isbn') isbn: string) {
    return this.curadoriaService.fetchBookByIsbn(isbn);
  }
}

