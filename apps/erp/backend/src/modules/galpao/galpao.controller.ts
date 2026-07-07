import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GalpaoService } from './galpao.service';
import { CreateGalpaoProdutoDto } from './dto/create-galpao-produto.dto';
import { UpdateGalpaoProdutoDto } from './dto/update-galpao-produto.dto';
import { EntradaGalpaoLivroDto } from './dto/entrada-galpao-livro.dto';
import { AlocarGalpaoLivroDto } from './dto/alocar-galpao-livro.dto';
import { BaixaGalpaoLivroDto } from './dto/baixa-galpao-livro.dto';
import { AvariaGalpaoLivroDto } from './dto/avaria-galpao-livro.dto';
import { AlocarGalpaoOutroItemDto } from './dto/alocar-galpao-outro-item.dto';
import { EntradaGalpaoOutroItemDto } from './dto/entrada-galpao-outro-item.dto';
import { BaixaGalpaoOutroItemDto } from './dto/baixa-galpao-outro-item.dto';
import { AvariaGalpaoOutroItemDto } from './dto/avaria-galpao-outro-item.dto';
import { UpdateGalpaoAvariaJustificativaDto } from './dto/update-galpao-avaria-justificativa.dto';

/** Leituras: legado estoque ou permissões específicas do almoxarifado. */
const GALPAO_READ = [
  'estoque:visualizar',
  'estoque:movimentar',
  'almoxarifado:visualizar',
  'almoxarifado:movimentar',
] as const;

/** Escritas: movimentação em estoque ou no almoxarifado. */
const GALPAO_WRITE = ['estoque:movimentar', 'almoxarifado:movimentar'] as const;

@Controller('galpao')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GalpaoController {
  constructor(private readonly galpaoService: GalpaoService) {}

  @Get('produtos')
  @Permissions(...GALPAO_READ)
  listProdutos(@Query('search') search?: string) {
    return this.galpaoService.listProdutos({ search });
  }

  @Post('produtos')
  @Permissions(...GALPAO_WRITE)
  createProduto(
    @Body() dto: CreateGalpaoProdutoDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.galpaoService.createProduto(dto, user.userId);
  }

  @Patch('produtos/:id')
  @Permissions(...GALPAO_WRITE)
  updateProduto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGalpaoProdutoDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.galpaoService.updateProduto(id, dto, user.userId);
  }

  @Delete('produtos/:id')
  @Permissions(...GALPAO_WRITE)
  deleteProduto(@Param('id', ParseIntPipe) id: number) {
    return this.galpaoService.deleteProduto(id);
  }

  // ── Livros (compartilhados) ───────────────────────────────────────────────

  @Get('produtos/:id/livros-disponiveis')
  @Permissions(...GALPAO_READ)
  listLivrosDisponiveis(
    @Param('id', ParseIntPipe) produtoId: number,
    @Query('search') search?: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    return this.galpaoService.listLivrosDisponiveis({
      produtoId,
      search,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
    });
  }

  @Get('livros-disponiveis')
  @Permissions(...GALPAO_READ)
  listLivrosDisponiveisGlobal(
    @Query('search') search?: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    return this.galpaoService.listLivrosDisponiveis({
      search,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
    });
  }

  @Get('produtos/:id/livros-reservados')
  @Permissions(...GALPAO_READ)
  listLivrosReservados(@Param('id', ParseIntPipe) produtoId: number) {
    return this.galpaoService.listLivrosReservados(produtoId);
  }

  @Get('livros-disponiveis-por-fornecedor')
  @Permissions(...GALPAO_READ)
  listLivrosDisponiveisPorFornecedor(
    @Query('isbn') isbn: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    return this.galpaoService.listLivrosDisponiveisPorFornecedor({
      isbn,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
    });
  }

  @Post('produtos/:id/livros/entrada')
  @Permissions(...GALPAO_WRITE)
  entradaLivros(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: EntradaGalpaoLivroDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.galpaoService.entradaLivros(produtoId, dto, user.userId);
  }

  @Post('produtos/:id/livros/alocar')
  @Permissions(...GALPAO_WRITE)
  alocarLivros(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: AlocarGalpaoLivroDto,
  ) {
    return this.galpaoService.alocarLivros(produtoId, dto);
  }

  @Post('produtos/:id/livros/baixa')
  @Permissions(...GALPAO_WRITE)
  baixarLivros(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: BaixaGalpaoLivroDto,
  ) {
    return this.galpaoService.baixarLivros(produtoId, dto);
  }

  @Post('produtos/:id/livros/avaria')
  @Permissions(...GALPAO_WRITE)
  avariaLivros(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: AvariaGalpaoLivroDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.galpaoService.avariaLivros(produtoId, dto, user.userId);
  }

  // Avaria de livros causada no transporte/armazenagem (não depende de produto do galpão)
  @Post('livros/avaria')
  @Permissions(...GALPAO_WRITE)
  avariaLivrosGlobal(
    @Body() dto: AvariaGalpaoLivroDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.galpaoService.avariaLivros(null, dto, user.userId);
  }

  @Get('livros/avarias')
  @Permissions(...GALPAO_READ)
  listLivroAvarias(
    @Query('isbn') isbn: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    return this.galpaoService.listLivroAvarias({
      isbn,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
    });
  }

  @Patch('livros/avarias/:id')
  @Permissions(...GALPAO_WRITE)
  updateLivroAvariaJustificativa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGalpaoAvariaJustificativaDto,
  ) {
    return this.galpaoService.updateLivroAvariaJustificativa(id, dto.justificativa);
  }

  @Delete('livros/avarias/:id')
  @Permissions(...GALPAO_WRITE)
  deleteLivroAvaria(@Param('id', ParseIntPipe) id: number) {
    return this.galpaoService.deleteLivroAvaria(id);
  }

  @Get('livros-alocados')
  @Permissions(...GALPAO_READ)
  listLivrosAlocadosReport(
    @Query('search') search?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('produtoId') produtoId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    const produtoIdNumber = produtoId ? Number(produtoId) : undefined;
    return this.galpaoService.listLivrosAlocadosReport({
      search,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
      produtoId: Number.isFinite(produtoIdNumber as number) ? produtoIdNumber : undefined,
    });
  }

  @Get('livros/avarias-relatorio')
  @Permissions(...GALPAO_READ)
  listLivroAvariasReport(
    @Query('search') search?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('produtoId') produtoId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    const produtoIdNumber = produtoId ? Number(produtoId) : undefined;
    return this.galpaoService.listLivroAvariasReport({
      search,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
      produtoId: Number.isFinite(produtoIdNumber as number) ? produtoIdNumber : undefined,
    });
  }

  @Delete('livros-disponiveis/:isbn')
  @Permissions(...GALPAO_WRITE)
  deleteLivroCadastro(
    @Param('isbn') isbn: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    const categoriaIdNumber = categoriaId ? Number(categoriaId) : undefined;
    return this.galpaoService.deleteLivroCadastro({
      isbn,
      categoriaId: Number.isFinite(categoriaIdNumber as number) ? categoriaIdNumber : undefined,
    });
  }

  // ── Outros itens ──────────────────────────────────────────────────────────

  @Get('produtos/:id/outros-itens-disponiveis')
  @Permissions(...GALPAO_READ)
  listOutrosItensDisponiveis(
    @Param('id', ParseIntPipe) produtoId: number,
    @Query('search') search?: string,
  ) {
    return this.galpaoService.listOutrosItensDisponiveis({ produtoId, search });
  }

  @Get('outros-itens-disponiveis')
  @Permissions(...GALPAO_READ)
  listOutrosItensDisponiveisGlobal(@Query('search') search?: string) {
    return this.galpaoService.listOutrosItensDisponiveis({ search });
  }

  @Get('produtos/:id/outros-itens-alocados')
  @Permissions(...GALPAO_READ)
  listOutrosItensAlocados(@Param('id', ParseIntPipe) produtoId: number) {
    return this.galpaoService.listOutrosItensAlocados(produtoId);
  }

  @Post('produtos/:id/outros-itens/entrada')
  @Permissions(...GALPAO_WRITE)
  entradaOutroItem(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: EntradaGalpaoOutroItemDto,
  ) {
    return this.galpaoService.entradaOutroItem(produtoId, dto);
  }

  @Post('produtos/:id/outros-itens/alocar')
  @Permissions(...GALPAO_WRITE)
  alocarOutroItem(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: AlocarGalpaoOutroItemDto,
  ) {
    return this.galpaoService.alocarOutroItem(produtoId, dto);
  }

  @Post('produtos/:id/outros-itens/baixa')
  @Permissions(...GALPAO_WRITE)
  baixarOutroItem(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: BaixaGalpaoOutroItemDto,
  ) {
    return this.galpaoService.baixarOutroItem(produtoId, dto);
  }

  @Post('produtos/:id/outros-itens/avaria')
  @Permissions(...GALPAO_WRITE)
  avariaOutroItem(
    @Param('id', ParseIntPipe) produtoId: number,
    @Body() dto: AvariaGalpaoOutroItemDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.galpaoService.avariaOutroItem(produtoId, dto, user.userId);
  }

  @Get('outros-itens/:estoqueId/avarias')
  @Permissions(...GALPAO_READ)
  listAvariasOutroItem(@Param('estoqueId', ParseIntPipe) estoqueId: number) {
    return this.galpaoService.listAvariasOutroItem(estoqueId);
  }

  @Patch('outros-itens/avarias/:id')
  @Permissions(...GALPAO_WRITE)
  updateOutroItemAvariaJustificativa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGalpaoAvariaJustificativaDto,
  ) {
    return this.galpaoService.updateOutroItemAvariaJustificativa(id, dto.justificativa);
  }

  @Delete('outros-itens/avarias/:id')
  @Permissions(...GALPAO_WRITE)
  deleteOutroItemAvaria(@Param('id', ParseIntPipe) id: number) {
    return this.galpaoService.deleteOutroItemAvaria(id);
  }

  @Delete('outros-itens/:estoqueId')
  @Permissions(...GALPAO_WRITE)
  deleteOutroItemCadastro(@Param('estoqueId', ParseIntPipe) estoqueId: number) {
    return this.galpaoService.deleteOutroItemCadastro(estoqueId);
  }

  @Get('curadoria-orcamentos/a-caminho')
  @Permissions(...GALPAO_READ)
  listCuradoriaOrcamentosACaminho() {
    return this.galpaoService.listCuradoriaOrcamentosACaminho();
  }

  @Post('curadoria-orcamentos/:id/marcar-entregue')
  @Permissions(...GALPAO_WRITE)
  marcarCuradoriaOrcamentoEntregue(@Param('id', ParseIntPipe) id: number) {
    return this.galpaoService.marcarCuradoriaOrcamentoEntregue(id);
  }
}

