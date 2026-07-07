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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BancoHorasService } from './banco-horas.service';

class LancarManualDto {
  @Type(() => Number)
  @IsInt({ message: 'minutos deve ser inteiro (positivo=crédito, negativo=débito).' })
  minutos!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  descricao!: string;

  @IsOptional()
  @IsString()
  competencia?: string;

  /** Dia do ajuste (YYYY-MM-DD), dentro da competência. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dataReferencia deve ser YYYY-MM-DD.' })
  dataReferencia?: string;
}

class ReabrirFechamentoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  palavraDesafio!: string;
}

class PoliticaUsoExtrasDto {
  @IsBoolean()
  permitido!: boolean;

  @ValidateIf((o: PoliticaUsoExtrasDto) => o.permitido === true)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 40)
  limiteMinutos?: number;
}

class SolicitarUsoExtrasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 40)
  minutos!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacao?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'competencia deve ser YYYY-MM.' })
  competencia?: string;
}

class ComentarioOpcionalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comentario?: string;
}

@Controller('rh/banco-horas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BancoHorasController {
  constructor(private readonly service: BancoHorasService) {}

  @Get('me')
  @Permissions('banco_horas:ver_proprio', 'banco_horas:ver_todos')
  meu(
    @CurrentUser() user: { userId: number },
    @Query('competencia') competencia?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.service.extrato(user.userId, competencia, dataInicio, dataFim);
  }

  @Get('me/solicitacoes-uso-extras')
  @Permissions('banco_horas:ver_proprio', 'banco_horas:ver_todos')
  minhasSolicitacoesUsoExtras(@CurrentUser() user: { userId: number }) {
    return this.service.listarMinhasSolicitacoesUsoExtras(user.userId);
  }

  @Post('me/solicitar-uso-extras')
  @Permissions('banco_horas:ver_proprio', 'banco_horas:ver_todos')
  solicitarUsoExtras(@CurrentUser() user: { userId: number }, @Body() dto: SolicitarUsoExtrasDto) {
    return this.service.solicitarUsoExtras(user.userId, dto.minutos, dto.observacao, dto.competencia);
  }

  @Delete('me/solicitacoes-uso-extras/:solicitacaoId')
  @Permissions('banco_horas:ver_proprio', 'banco_horas:ver_todos')
  cancelarMinhaSolicitacaoUsoExtras(
    @CurrentUser() user: { userId: number },
    @Param('solicitacaoId', ParseIntPipe) solicitacaoId: number,
  ) {
    return this.service.cancelarMinhaSolicitacaoUsoExtras(user.userId, solicitacaoId);
  }

  @Get('solicitacoes-uso-extras')
  @Permissions('banco_horas:ver_todos')
  listarSolicitacoesUsoExtras(@Query('status') status?: string) {
    return this.service.listarSolicitacoesUsoExtras(status);
  }

  @Post('solicitacoes-uso-extras/:id/aprovar')
  @Permissions('banco_horas:aprovar_uso_extras', 'banco_horas:fechar')
  aprovarSolicitacaoUsoExtras(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComentarioOpcionalDto,
  ) {
    return this.service.aprovarSolicitacaoUsoExtras(user.userId, id, dto.comentario);
  }

  @Post('solicitacoes-uso-extras/:id/reprovar')
  @Permissions('banco_horas:aprovar_uso_extras', 'banco_horas:fechar')
  reprovarSolicitacaoUsoExtras(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComentarioOpcionalDto,
  ) {
    return this.service.reprovarSolicitacaoUsoExtras(user.userId, id, dto.comentario);
  }

  @Get()
  @Permissions('banco_horas:ver_todos')
  todos(
    @Query('competencia') competencia?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.service.resumoTodos(competencia, dataInicio, dataFim);
  }

  @Post('fechar-em-massa')
  @Permissions('banco_horas:fechar')
  fecharEmMassa(
    @CurrentUser() admin: { userId: number },
    @Body() body: { usuarioIds: number[]; competencia?: string },
    @Req() req: Request,
  ) {
    const ip = this.extrairIp(req);
    return this.service.fecharEmMassa(admin.userId, body.usuarioIds ?? [], body.competencia, ip);
  }

  @Patch(':usuarioId/politica-uso-extras')
  @Permissions('banco_horas:fechar')
  atualizarPoliticaUsoExtras(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: PoliticaUsoExtrasDto,
  ) {
    return this.service.atualizarPoliticaUsoExtras(usuarioId, dto.permitido, dto.limiteMinutos);
  }

  @Get(':usuarioId')
  @Permissions('banco_horas:ver_todos')
  porUsuario(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('competencia') competencia?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.service.extrato(usuarioId, competencia, dataInicio, dataFim);
  }

  @Post(':usuarioId/fechar')
  @Permissions('banco_horas:fechar')
  fechar(
    @CurrentUser() admin: { userId: number },
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Req() req: Request,
    @Query('competencia') competencia?: string,
  ) {
    const ip = this.extrairIp(req);
    return this.service.fechar(admin.userId, usuarioId, competencia, ip);
  }

  @Post(':usuarioId/reabrir-fechamento/desafio')
  @Permissions('banco_horas:fechar')
  gerarDesafioReabrirFechamento(
    @CurrentUser() admin: { userId: number },
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('competencia') competencia?: string,
  ) {
    return this.service.gerarPalavraDesafioReabrir(admin.userId, usuarioId, competencia);
  }

  @Post(':usuarioId/reabrir-fechamento')
  @Permissions('banco_horas:fechar')
  reabrirFechamento(
    @CurrentUser() admin: { userId: number },
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('competencia') competencia: string | undefined,
    @Req() req: Request,
    @Body() dto: ReabrirFechamentoDto,
  ) {
    const ip = this.extrairIp(req);
    return this.service.reabrirFechamento(
      admin.userId,
      usuarioId,
      competencia,
      dto.palavraDesafio,
      ip,
    );
  }

  // ---------- Recibo do mês ----------

  @Get('me/recibo')
  @Permissions('banco_horas:ver_proprio', 'banco_horas:ver_todos')
  meuRecibo(
    @CurrentUser() user: { userId: number },
    @Query('competencia') competencia?: string,
  ) {
    return this.service.obterRecibo(user.userId, competencia);
  }

  @Post('me/recibo/aceitar')
  @Permissions('banco_horas:ver_proprio', 'banco_horas:ver_todos')
  aceitarMeuRecibo(
    @CurrentUser() user: { userId: number },
    @Req() req: Request,
    @Query('competencia') competencia?: string,
  ) {
    const ip = this.extrairIp(req);
    return this.service.aceitarRecibo(user.userId, competencia, ip);
  }

  @Get(':usuarioId/recibo')
  @Permissions('banco_horas:ver_todos')
  reciboPorUsuario(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('competencia') competencia?: string,
  ) {
    return this.service.obterRecibo(usuarioId, competencia);
  }

  private extrairIp(req: Request): string | undefined {
    return (
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined
    );
  }

  @Post(':usuarioId/lancamento')
  @Permissions('banco_horas:fechar')
  lancar(
    @CurrentUser() admin: { userId: number },
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: LancarManualDto,
  ) {
    return this.service.lancarManual(
      admin.userId,
      usuarioId,
      dto.competencia ?? '',
      dto.minutos,
      dto.descricao,
      dto.dataReferencia,
    );
  }

  @Delete(':usuarioId/lancamentos/:lancamentoId')
  @Permissions('banco_horas:fechar')
  excluirLancamento(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Param('lancamentoId', ParseIntPipe) lancamentoId: number,
  ) {
    return this.service.excluirLancamento(usuarioId, lancamentoId);
  }
}
