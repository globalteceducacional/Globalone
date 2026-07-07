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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FeriadosService } from './feriados.service';
import { AtualizarFeriadoDto, CriarFeriadoDto } from './dto/feriado.dto';

@Controller('rh/feriados')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeriadosController {
  constructor(private readonly service: FeriadosService) {}

  @Get()
  @Permissions(
    'jornada:configurar',
    'banco_horas:ver_proprio',
    'banco_horas:ver_todos',
    'espelho:ver_proprio',
    'espelho:ver_todos',
  )
  listar(@Query('ano') anoRaw?: string) {
    const ano = anoRaw ? Number(anoRaw) : undefined;
    return this.service.listar(Number.isFinite(ano) ? ano : undefined);
  }

  @Post()
  @Permissions('jornada:configurar')
  criar(@CurrentUser() user: { userId: number }, @Body() dto: CriarFeriadoDto) {
    return this.service.criar(user.userId, dto);
  }

  @Patch(':id')
  @Permissions('jornada:configurar')
  atualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: AtualizarFeriadoDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  @Permissions('jornada:configurar')
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.service.remover(id);
  }
}
