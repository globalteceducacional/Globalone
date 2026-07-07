import { BadRequestException, Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('rh')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('indicadores')
  @Permissions('rh_dashboard:ver')
  indicadores(
    @Query('mes') mes?: string,
    @Query('usuarioId') usuarioIdRaw?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    let usuarioId: number | undefined;
    if (usuarioIdRaw != null && usuarioIdRaw !== '') {
      const n = Number(usuarioIdRaw);
      if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException('usuarioId inválido.');
      }
      usuarioId = n;
    }
    return this.service.indicadores(mes, usuarioId, dataInicio, dataFim);
  }

  @Get('folha/exportar')
  @Permissions('folha:exportar')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportarFolha(
    @Query('mes') mes: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.service.folhaCsv(mes);
    const ts = mes || 'corrente';
    res.setHeader('Content-Disposition', `attachment; filename="folha-${ts}.csv"`);
    return '\uFEFF' + csv;
  }
}
