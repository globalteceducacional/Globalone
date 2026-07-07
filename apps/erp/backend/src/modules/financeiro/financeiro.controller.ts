import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FinanceiroService } from './financeiro.service';

type JwtUser = { userId: number; permissions?: string[] };

@Controller('financeiro')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('resumo')
  @Permissions(
    'financeiro:visualizar',
    'financeiro:visao',
    'financeiro:ponto',
    'financeiro:pagamentos',
    'financeiro:projetos',
    'financeiro:curadoria',
    'financeiro:compras',
  )
  resumo(@CurrentUser() user: JwtUser) {
    return this.financeiroService.getResumo(user.userId, user.permissions ?? []);
  }

  /** Espelho do mês + projeção de custo conforme remuneração cadastrada na jornada (RH). */
  @Get('ponto-planejamento')
  @Permissions(
    'financeiro:visualizar',
    'financeiro:ponto',
    'banco_horas:ver_todos',
    'banco_horas:fechar',
    'jornada:configurar',
  )
  pontoPlanejamento(@Query('mes') mes?: string) {
    return this.financeiroService.getPontoPlanejamento(mes);
  }

  /** Pagamentos do mês: base conforme jornada + extras só com solicitação aprovada (banco de horas). */
  @Get('pagamentos-mensais')
  @Permissions(
    'financeiro:visualizar',
    'financeiro:pagamentos',
    'banco_horas:ver_todos',
    'banco_horas:fechar',
    'jornada:configurar',
  )
  pagamentosMensais(@Query('mes') mes?: string) {
    return this.financeiroService.getPagamentosMensais(mes);
  }

  @Get('projetos')
  @Permissions('financeiro:visualizar', 'financeiro:projetos')
  projetos(@CurrentUser() user: JwtUser) {
    return this.financeiroService.getProjetos(user.userId, user.permissions ?? []);
  }
}
