import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CargosService } from './cargos.service';
import { CreateCargoDto } from './dto/create-cargo.dto';
import { UpdateCargoDto } from './dto/update-cargo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('cargos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CargosController {
  constructor(private readonly cargosService: CargosService) {}

  @Get()
  @Permissions('usuarios:visualizar', 'usuarios:criar', 'usuarios:editar', 'usuarios:gerenciar', 'sistema:administrar')
  findAll() {
    return this.cargosService.findAll();
  }

  @Get('all')
  @Permissions('usuarios:visualizar', 'usuarios:criar', 'usuarios:editar', 'usuarios:gerenciar', 'sistema:administrar')
  findAllIncludingInactive() {
    return this.cargosService.findAllIncludingInactive();
  }

  @Get('permissions')
  @Permissions('usuarios:editar', 'usuarios:gerenciar', 'sistema:administrar')
  listPermissions() {
    return this.cargosService.listPermissions();
  }

  @Get(':id')
  @Permissions('usuarios:visualizar', 'usuarios:editar', 'usuarios:gerenciar', 'sistema:administrar')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cargosService.findOne(id);
  }

  @Post()
  @Permissions('usuarios:criar', 'usuarios:gerenciar')
  create(@Body() body: CreateCargoDto) {
    return this.cargosService.create(body);
  }

  @Patch(':id')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCargoDto) {
    return this.cargosService.update(id, body);
  }

  @Delete(':id')
  @Permissions('usuarios:excluir', 'usuarios:gerenciar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cargosService.remove(id);
  }
}

