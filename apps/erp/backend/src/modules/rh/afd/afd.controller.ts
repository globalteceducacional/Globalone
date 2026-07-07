import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AfdService } from './afd.service';

@Controller('rh/afd')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AfdController {
  constructor(private readonly service: AfdService) {}

  /**
   * Gera o AFD no layout adotado pelo sistema (Portaria 671/2021).
   * Aceita filtros por data ou por faixa de NSR.
   */
  @Get('exportar')
  @Permissions('ponto:exportar_afd')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async exportar(
    @Query('inicio') inicio: string | undefined,
    @Query('fim') fim: string | undefined,
    @Query('nsrInicial') nsrInicial: string | undefined,
    @Query('nsrFinal') nsrFinal: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const r = await this.service.gerar({
      inicio,
      fim,
      nsrInicial: nsrInicial ? Number(nsrInicial) : undefined,
      nsrFinal: nsrFinal ? Number(nsrFinal) : undefined,
    });
    res.setHeader('Content-Disposition', `attachment; filename="${r.nomeArquivo}"`);
    return r.conteudo;
  }
}
