import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SolicitacaoStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FeriasService } from './ferias.service';
import { CriarFeriasDto, DecidirFeriasDto } from './dto/ferias.dto';

@Controller('rh/ferias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeriasController {
  constructor(private readonly service: FeriasService) {}

  @Get('me')
  @Permissions('ferias:solicitar', 'ferias:aprovar')
  meu(@CurrentUser() user: { userId: number }) {
    return this.service.resumoUsuario(user.userId);
  }

  @Post()
  @Permissions('ferias:solicitar')
  criar(@CurrentUser() user: { userId: number }, @Body() dto: CriarFeriasDto) {
    return this.service.criar(user.userId, dto);
  }

  @Get()
  @Permissions('ferias:aprovar')
  listar(@Query('status') status?: SolicitacaoStatus) {
    return this.service.listarTodas(status);
  }

  @Get('usuario/:usuarioId')
  @Permissions('ferias:aprovar')
  porUsuario(@Param('usuarioId', ParseIntPipe) usuarioId: number) {
    return this.service.resumoUsuario(usuarioId);
  }

  @Post(':id/aprovar')
  @Permissions('ferias:aprovar')
  aprovar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidirFeriasDto,
  ) {
    return this.service.aprovar(user.userId, id, dto);
  }

  @Post(':id/reprovar')
  @Permissions('ferias:aprovar')
  reprovar(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidirFeriasDto,
  ) {
    return this.service.reprovar(user.userId, id, dto);
  }
}
