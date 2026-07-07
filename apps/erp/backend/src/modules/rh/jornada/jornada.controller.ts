import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JornadaService } from './jornada.service';
import { UpdateJornadaDto } from './dto/update-jornada.dto';
import { BulkControlePontoDto } from './dto/bulk-controle-ponto.dto';
@Controller('rh/jornada')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JornadaController {
  constructor(private readonly jornadaService: JornadaService) {}

  @Get('me')
  @Permissions('jornada:ver_propria', 'jornada:configurar')
  async meuPerfil(@CurrentUser() user: { userId: number }) {
    return this.jornadaService.ensure(user.userId);
  }

  @Get()
  @Permissions(
    'jornada:configurar',
    'ponto:exportar',
    'banco_horas:ver_todos',
    'banco_horas:fechar',
  )
  listarTodas() {
    return this.jornadaService.listarTodas();
  }

  /** Deve ficar antes de `@Get(':usuarioId')` para não interpretar "bulk" como id. */
  @Put('bulk/controle-ponto')
  @Permissions('jornada:configurar')
  bulkControlePonto(@Body() dto: BulkControlePontoDto) {
    return this.jornadaService.bulkControlePonto(dto.usuarioIds, dto.controlePonto);
  }

  @Get(':usuarioId')
  @Permissions(
    'jornada:configurar',
    'jornada:ver_propria',
    'ponto:exportar',
    'banco_horas:ver_proprio',
    'banco_horas:ver_todos',
    'banco_horas:fechar',
  )
  obter(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    const perms = user.permissions ?? [];
    const podeVerOutros =
      perms.includes('jornada:configurar') ||
      perms.includes('ponto:exportar') ||
      perms.includes('banco_horas:ver_todos') ||
      perms.includes('banco_horas:fechar') ||
      perms.includes('sistema:administrar');
    if (usuarioId !== user.userId && !podeVerOutros) {
      throw new ForbiddenException('Sem permissão para consultar a jornada de outro colaborador.');
    }
    return this.jornadaService.ensure(usuarioId);
  }

  @Put(':usuarioId')
  @Permissions('jornada:configurar')
  atualizar(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: UpdateJornadaDto,
  ) {
    return this.jornadaService.update(usuarioId, dto);
  }
}
