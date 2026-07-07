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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarioEventosService } from './calendario-eventos.service';
import { CreateCalendarioEventoDto } from './dto/create-calendario-evento.dto';
import { UpdateCalendarioEventoDto } from './dto/update-calendario-evento.dto';

@Controller('calendario/eventos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarioEventosController {
  constructor(private readonly calendarioEventosService: CalendarioEventosService) {}

  @Get()
  @Permissions('calendario:visualizar', 'calendario:ver_todos', 'calendario:eventos')
  findAll(
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Query('projetoId') projetoId?: string,
  ) {
    const parsedProjetoId = projetoId ? Number(projetoId) : undefined;
    return this.calendarioEventosService.findVisible(
      user.userId,
      user.permissions ?? [],
      parsedProjetoId,
    );
  }

  @Post()
  @Permissions('calendario:eventos')
  create(
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateCalendarioEventoDto,
  ) {
    return this.calendarioEventosService.create(user.userId, dto);
  }

  @Patch(':id')
  @Permissions('calendario:eventos')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number; permissions?: string[] },
    @Body() dto: UpdateCalendarioEventoDto,
  ) {
    return this.calendarioEventosService.update(id, user.userId, user.permissions ?? [], dto);
  }

  @Delete(':id')
  @Permissions('calendario:eventos')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number; permissions?: string[] },
  ) {
    return this.calendarioEventosService.remove(id, user.userId, user.permissions ?? []);
  }
}
