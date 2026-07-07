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
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompraStatus } from '@prisma/client';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { UpdatePurchaseStatusDto } from './dto/update-purchase-status.dto';
import { BatchPurchaseToAcaminhoDto } from './dto/batch-purchase-to-acaminho.dto';
import { ApprovePurchaseDto } from './dto/approve-purchase.dto';
import { RejectPurchaseDto } from './dto/reject-purchase.dto';
import { CreateAlocacaoDto } from './dto/create-alocacao.dto';
import { UpdateAlocacaoDto } from './dto/update-alocacao.dto';
import { ReassignAlocacaoDto } from './dto/reassign-alocacao.dto';
import { ImportPurchasesXlsxDto } from './dto/import-purchases-xlsx.dto';
import { ImportPurchaseSheetDto } from './dto/import-purchase-sheet.dto';
import { CreateCuradoriaRegisterDto } from './dto/create-curadoria-register.dto';
import { CreateMetodoPagoCompraDto } from './dto/create-metodo-pago-compra.dto';
import { ApplyPurchaseTagDto } from './dto/apply-purchase-tag.dto';
import { RemovePurchaseTagDto } from './dto/remove-purchase-tag.dto';
import { BatchDeleteStockItemsDto } from './dto/batch-delete-stock-items.dto';
import { BatchExportStockItemsDto } from './dto/batch-export-stock-items.dto';
import { BatchDeletePurchasesDto } from './dto/batch-delete-purchases.dto';
import { ImportEstoqueSheetDto } from './dto/import-estoque-sheet.dto';
import { ConfirmSignatureMonthDto } from './dto/confirm-signature-month.dto';
import { UpsertSignatureMonthDto } from './dto/upsert-signature-month.dto';
import { SignatureMonthReportQueryDto } from './dto/signature-month-report-query.dto';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  // ── Estoque ──────────────────────────────────────────────────────────────

  @Get('items')
  @Permissions(
    'estoque:visualizar',
    'estoque:movimentar',
    'setores:visualizar',
    'setores:editar',
    'setores:gerenciar',
    'projetos:visualizar',
    'projetos:editar',
  )
  listItems(@Query('search') search?: string) {
    return this.stockService.listItems({ search });
  }

  @Post('items')
  @Permissions('estoque:criar', 'estoque:movimentar')
  createItem(@Body() body: CreateStockItemDto) {
    return this.stockService.createItem(body);
  }

  @Patch('items/:id')
  @Permissions('estoque:movimentar')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStockItemDto,
  ) {
    return this.stockService.updateItem(id, body);
  }

  @Delete('items/:id')
  @Permissions('estoque:excluir', 'estoque:movimentar')
  deleteItem(@Param('id', ParseIntPipe) id: number) {
    return this.stockService.deleteItem(id);
  }

  @Post('items/batch-delete')
  @Permissions('estoque:excluir', 'estoque:movimentar')
  deleteItemsBatch(@Body() body: BatchDeleteStockItemsDto) {
    return this.stockService.deleteItemsBatch(body.ids);
  }

  @Post('items/import-sheet')
  @Permissions('estoque:criar', 'estoque:movimentar')
  @UseInterceptors(FileInterceptor('file'))
  importEstoqueSheet(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportEstoqueSheetDto,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo XLSX não enviado');
    }
    const isXlsx =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    if (!isXlsx) {
      throw new BadRequestException('Formato inválido. Envie somente arquivo .xlsx');
    }
    return this.stockService.importEstoqueSheet(file.buffer, body);
  }

  @Post('items/export-sheet')
  @Permissions('estoque:visualizar', 'estoque:movimentar')
  async exportEstoqueSheet(@Body() body: BatchExportStockItemsDto) {
    const rows = await this.stockService.getEstoqueExportSheetRows(body.ids);
    return { rows };
  }

  // ── Compras ───────────────────────────────────────────────────────────────

  @Get('purchases')
  @Permissions('compras:visualizar', 'compras:solicitar', 'compras:aprovar', 'trabalhos:visualizar')
  listPurchases(
    @Query('status') status?: CompraStatus,
    @Query('projetoId') projetoId?: string,
    @Query('etapaId') etapaId?: string,
    @Query('excludeSolicitado') excludeSolicitado?: string,
    @Query('mesReferenciaAssinatura') mesReferenciaAssinatura?: string,
  ) {
    return this.stockService.listPurchases({
      status,
      projetoId: projetoId ? Number(projetoId) : undefined,
      etapaId: etapaId ? Number(etapaId) : undefined,
      excludeSolicitado: excludeSolicitado === 'true',
      mesReferenciaAssinatura: mesReferenciaAssinatura?.trim() || undefined,
    });
  }

  @Get('purchases/signatures/alerts')
  @Permissions('compras:visualizar', 'compras:solicitar', 'compras:aprovar', 'trabalhos:visualizar')
  listSignatureAlerts(@Query('mesReferencia') mesReferencia?: string) {
    return this.stockService.listSignatureMonthlyAlerts(mesReferencia);
  }

  @Get('purchases/signatures/report')
  @Permissions('compras:visualizar', 'compras:solicitar', 'compras:aprovar', 'trabalhos:visualizar')
  listSignatureMonthReport(@Query() query: SignatureMonthReportQueryDto) {
    return this.stockService.listSignatureMonthReport(query);
  }

  @Get('books/isbn/:isbn')
  @Permissions('compras:visualizar', 'compras:solicitar', 'compras:aprovar', 'trabalhos:visualizar')
  fetchBookByIsbn(@Param('isbn') isbn: string) {
    return this.stockService.fetchBookByIsbn(isbn);
  }

  @Get('pago-por-metodos')
  @Permissions(
    'compras:visualizar',
    'compras:solicitar',
    'compras:aprovar',
    'trabalhos:visualizar',
    'projetos:editar',
  )
  listMetodosPagoCompra() {
    return this.stockService.listMetodosPagoCompra();
  }

  @Post('pago-por-metodos')
  @Permissions('compras:solicitar', 'compras:aprovar')
  createMetodoPagoCompra(@Body() body: CreateMetodoPagoCompraDto) {
    return this.stockService.createMetodoPagoCompra(body.nome);
  }

  @Post('purchases')
  @Permissions('compras:solicitar', 'compras:aprovar')
  createPurchase(
    @CurrentUser() user: { userId: number },
    @Body() body: CreatePurchaseDto,
  ) {
    return this.stockService.createPurchase(body, user.userId);
  }

  @Post('purchases/curadoria-register')
  @Permissions('compras:solicitar', 'compras:aprovar')
  createCuradoriaRegister(
    @CurrentUser() user: { userId: number },
    @Body() body: CreateCuradoriaRegisterDto,
  ) {
    return this.stockService.createCuradoriaRegister(body, user.userId);
  }

  @Post('purchases/import-xlsx')
  @Permissions('compras:solicitar', 'compras:aprovar')
  @UseInterceptors(FileInterceptor('file'))
  importPurchasesXlsx(
    @CurrentUser() user: { userId: number },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportPurchasesXlsxDto,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo XLSX não enviado');
    }
    const isXlsx =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    if (!isXlsx) {
      throw new BadRequestException('Formato inválido. Envie somente arquivo .xlsx');
    }

    return this.stockService.importPurchasesFromXlsx(file.buffer, body, user.userId);
  }

  @Post('purchases/import-sheet')
  @Permissions('compras:solicitar', 'compras:aprovar')
  @UseInterceptors(FileInterceptor('file'))
  importPurchasesSheet(
    @CurrentUser() user: { userId: number },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportPurchaseSheetDto,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo XLSX não enviado');
    }
    const isXlsx =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    if (!isXlsx) {
      throw new BadRequestException('Formato inválido. Envie somente arquivo .xlsx');
    }
    return this.stockService.importPurchasesSheet(file.buffer, body, user.userId);
  }

  @Patch('purchases/:id/status')
  @Permissions('compras:aprovar')
  updatePurchaseStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePurchaseStatusDto,
  ) {
    return this.stockService.updatePurchaseStatus(id, body);
  }

  @Patch('purchases/batch-acaminho')
  @Permissions('compras:aprovar')
  batchPurchaseToAcaminho(@Body() body: BatchPurchaseToAcaminhoDto) {
    return this.stockService.batchPurchaseToAcaminho(body);
  }

  @Patch('purchases/tags/apply')
  @Permissions('compras:solicitar', 'compras:aprovar')
  applyTagToPurchases(@Body() body: ApplyPurchaseTagDto) {
    return this.stockService.applyTagToPurchases(body.purchaseIds, body.nome, body.cor);
  }

  @Patch('purchases/tags/remove')
  @Permissions('compras:solicitar', 'compras:aprovar')
  removeTagFromPurchases(@Body() body: RemovePurchaseTagDto) {
    return this.stockService.removeTagFromPurchases(body.purchaseIds, body.nome);
  }

  @Patch('purchases/:id')
  @Permissions('compras:solicitar', 'compras:aprovar')
  updatePurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePurchaseDto,
  ) {
    return this.stockService.updatePurchase(id, body);
  }

  @Patch('purchases/:id/signatures/confirm-month')
  @Permissions('compras:solicitar', 'compras:aprovar')
  confirmSignatureMonth(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConfirmSignatureMonthDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.stockService.confirmSignatureMonth(id, body.mesReferencia, user.userId);
  }

  @Patch('purchases/:id/signatures/month-entry')
  @Permissions('compras:solicitar', 'compras:aprovar')
  upsertSignatureMonthEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertSignatureMonthDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.stockService.upsertSignatureMonth(id, body, user.userId);
  }

  @Delete('purchases/:id')
  @Permissions('compras:excluir', 'compras:solicitar', 'compras:aprovar')
  deletePurchase(@Param('id', ParseIntPipe) id: number) {
    return this.stockService.deletePurchase(id);
  }

  @Post('purchases/batch-delete')
  @Permissions('compras:excluir', 'compras:solicitar', 'compras:aprovar')
  deletePurchasesBatch(@Body() body: BatchDeletePurchasesDto) {
    return this.stockService.deletePurchasesBatch(body.ids);
  }

  @Post('purchases/:id/approve')
  @Permissions('compras:aprovar')
  approvePurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApprovePurchaseDto,
  ) {
    return this.stockService.approvePurchase(id, body);
  }

  @Post('purchases/:id/revise-approval')
  @Permissions('compras:aprovar')
  reviseApprovalPurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApprovePurchaseDto,
  ) {
    return this.stockService.reviseApprovalPurchase(id, body);
  }

  @Post('purchases/:id/reject')
  @Permissions('compras:aprovar')
  rejectPurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectPurchaseDto,
  ) {
    return this.stockService.rejectPurchase(id, body.motivoRejeicao);
  }

  // ── Alocações ─────────────────────────────────────────────────────────────

  @Post('alocacoes')
  @Permissions(
    'estoque:movimentar',
    'estoque:visualizar',
    'setores:editar',
    'setores:gerenciar',
    'projetos:editar',
  )
  createAlocacao(@Body() body: CreateAlocacaoDto) {
    return this.stockService.createAlocacao(body);
  }

  @Get('alocacoes')
  @Permissions(
    'estoque:visualizar',
    'estoque:movimentar',
    'setores:visualizar',
    'setores:editar',
    'setores:gerenciar',
    'projetos:visualizar',
    'projetos:editar',
  )
  listAlocacoes(
    @Query('estoqueId') estoqueId?: string,
    @Query('projetoId') projetoId?: string,
    @Query('etapaId') etapaId?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('setorId') setorId?: string,
    @Query('contextSetorId') contextSetorId?: string,
  ) {
    return this.stockService.listAlocacoes(
      estoqueId ? Number(estoqueId) : undefined,
      projetoId ? Number(projetoId) : undefined,
      etapaId ? Number(etapaId) : undefined,
      usuarioId ? Number(usuarioId) : undefined,
      setorId ? Number(setorId) : undefined,
      contextSetorId ? Number(contextSetorId) : undefined,
    );
  }

  @Patch('alocacoes/:id')
  @Permissions('estoque:movimentar', 'setores:editar', 'setores:gerenciar', 'projetos:editar')
  updateAlocacao(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAlocacaoDto,
  ) {
    if (!body.quantidade) {
      throw new BadRequestException('Quantidade é obrigatória');
    }
    return this.stockService.updateAlocacao(id, body.quantidade);
  }

  @Patch('alocacoes/:id/reassign')
  @Permissions('estoque:movimentar', 'setores:editar', 'setores:gerenciar', 'projetos:editar')
  reassignAlocacao(@Param('id', ParseIntPipe) id: number, @Body() body: ReassignAlocacaoDto) {
    return this.stockService.reassignAlocacaoDestino(id, body);
  }

  @Delete('alocacoes/:id')
  @Permissions('estoque:movimentar', 'setores:editar', 'setores:gerenciar', 'projetos:editar')
  deleteAlocacao(@Param('id', ParseIntPipe) id: number) {
    return this.stockService.deleteAlocacao(id);
  }
}
