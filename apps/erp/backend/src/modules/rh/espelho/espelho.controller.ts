import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { EspelhoService } from './espelho.service';

@Controller('rh/espelho')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EspelhoController {
  constructor(private readonly espelhoService: EspelhoService) {}

  @Get()
  @Permissions(
    'espelho:ver_proprio',
    'espelho:ver_todos',
    'ponto:exportar',
    'ponto:ver_proprios',
    'banco_horas:ver_proprio',
    'banco_horas:ver_todos',
    'banco_horas:fechar',
  )
  async obter(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Query('mes') mes?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('usuarioId') usuarioIdRaw?: string,
  ) {
    const perms = user.permissions ?? [];
    const podeVerTodos =
      perms.includes('espelho:ver_todos') ||
      perms.includes('ponto:exportar') ||
      perms.includes('banco_horas:ver_todos') ||
      perms.includes('banco_horas:fechar') ||
      perms.includes('sistema:administrar');
    const usuarioId =
      usuarioIdRaw && podeVerTodos ? Number(usuarioIdRaw) : user.userId;
    if (dataInicio?.trim() && dataFim?.trim()) {
      return this.espelhoService.espelhoUsuarioPorPeriodo(
        usuarioId,
        dataInicio.trim(),
        dataFim.trim(),
      );
    }
    return this.espelhoService.espelhoUsuario(usuarioId, mes);
  }

  @Get('exportar')
  @Permissions('espelho:exportar')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportar(
    @CurrentUser() user: { userId: number },
    @Query('mes') mes: string | undefined,
    @Query('usuarioId') usuarioIdRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const usuarioId = usuarioIdRaw ? Number(usuarioIdRaw) : user.userId;
    const csv = await this.espelhoService.exportarCsv(usuarioId, mes);
    const mesArquivo = mes || 'corrente';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="espelho-${usuarioId}-${mesArquivo}.csv"`,
    );
    return '\uFEFF' + csv;
  }
}
