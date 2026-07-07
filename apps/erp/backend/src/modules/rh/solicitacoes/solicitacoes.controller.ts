import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SolicitacaoStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SolicitacoesService } from './solicitacoes.service';
import { CriarSolicitacaoAjusteDto, DecidirSolicitacaoDto } from './dto/criar-solicitacao.dto';

@Controller('rh/solicitacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SolicitacoesController {
  constructor(private readonly service: SolicitacoesService) {}

  @Post()
  @Permissions('solicitacoes_ponto:abrir')
  criar(@CurrentUser() user: { userId: number }, @Body() dto: CriarSolicitacaoAjusteDto) {
    return this.service.criar(user.userId, dto);
  }

  @Get('minhas')
  @Permissions('solicitacoes_ponto:abrir')
  minhas(@CurrentUser() user: { userId: number }) {
    return this.service.listarMinhas(user.userId);
  }

  @Get()
  @Permissions('solicitacoes_ponto:revisar')
  listar(@Query('status') status?: SolicitacaoStatus) {
    return this.service.listarTodas({ status });
  }

  @Post(':id/aprovar')
  @Permissions('solicitacoes_ponto:revisar')
  aprovar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidirSolicitacaoDto,
  ) {
    return this.service.aprovar(user.userId, id, dto);
  }

  @Post(':id/reprovar')
  @Permissions('solicitacoes_ponto:revisar')
  reprovar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidirSolicitacaoDto,
  ) {
    return this.service.reprovar(user.userId, id, dto);
  }

  @Delete(':id')
  @Permissions('solicitacoes_ponto:abrir')
  cancelar(@CurrentUser() user: { userId: number }, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancelar(user.userId, id);
  }
}
