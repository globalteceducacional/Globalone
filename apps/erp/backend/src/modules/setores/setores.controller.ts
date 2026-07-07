import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { SetoresService } from './setores.service';
import { CreateSetorDto } from './dto/create-setor.dto';
import { UpdateSetorDto } from './dto/update-setor.dto';
import { UpdateSetorMembersDto } from './dto/update-setor-members.dto';
import { CreateSetorPatrimonioMaterialDto } from './dto/create-setor-patrimonio-material.dto';
import { UpdateSetorPatrimonioMaterialDto } from './dto/update-setor-patrimonio-material.dto';
import { CreateSetorPatrimonioImaterialDto } from './dto/create-setor-patrimonio-imaterial.dto';
import { UpdateSetorPatrimonioImaterialDto } from './dto/update-setor-patrimonio-imaterial.dto';

@Controller('setores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SetoresController {
  constructor(private readonly setoresService: SetoresService) {}

  @Get('options')
  @Permissions(
    'setores:visualizar',
    'setores:criar',
    'setores:editar',
    'setores:gerenciar',
    'projetos:criar',
    'projetos:editar',
    'compras:solicitar',
    'compras:aprovar',
    'curadoria:criar',
    'curadoria:editar',
    'curadoria:gerenciar',
  )
  listOptions() {
    return this.setoresService.listOptions();
  }

  @Get()
  @Permissions(
    'setores:visualizar',
    'setores:criar',
    'setores:editar',
    'setores:gerenciar',
    'projetos:criar',
    'projetos:editar',
  )
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.setoresService.findAll(includeInactive === 'true');
  }

  /** Rotas mais específicas antes de `:id`. */

  @Post(':id/patrimonio-material')
  @Permissions('setores:editar', 'setores:gerenciar')
  createPatrimonioMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSetorPatrimonioMaterialDto,
  ) {
    return this.setoresService.createPatrimonioMaterial(id, body);
  }

  @Patch(':id/patrimonio-material/:itemId')
  @Permissions('setores:editar', 'setores:gerenciar')
  updatePatrimonioMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: UpdateSetorPatrimonioMaterialDto,
  ) {
    return this.setoresService.updatePatrimonioMaterial(id, itemId, body);
  }

  @Delete(':id/patrimonio-material/:itemId')
  @Permissions('setores:editar', 'setores:gerenciar')
  @HttpCode(200)
  removePatrimonioMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.setoresService.removePatrimonioMaterial(id, itemId);
  }

  @Post(':id/patrimonio-imaterial')
  @Permissions('setores:editar', 'setores:gerenciar')
  createPatrimonioImaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSetorPatrimonioImaterialDto,
  ) {
    return this.setoresService.createPatrimonioImaterial(id, body);
  }

  @Patch(':id/patrimonio-imaterial/:itemId')
  @Permissions('setores:editar', 'setores:gerenciar')
  updatePatrimonioImaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: UpdateSetorPatrimonioImaterialDto,
  ) {
    return this.setoresService.updatePatrimonioImaterial(id, itemId, body);
  }

  @Delete(':id/patrimonio-imaterial/:itemId')
  @Permissions('setores:editar', 'setores:gerenciar')
  @HttpCode(200)
  removePatrimonioImaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.setoresService.removePatrimonioImaterial(id, itemId);
  }

  @Get(':id')
  @Permissions('setores:visualizar', 'setores:criar', 'setores:editar', 'setores:gerenciar')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.setoresService.findOne(id);
  }

  @Post()
  @Permissions('setores:criar', 'setores:gerenciar')
  create(@Body() body: CreateSetorDto) {
    return this.setoresService.create(body);
  }

  @Patch(':id/members')
  @Permissions('setores:editar', 'setores:gerenciar')
  updateMembers(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSetorMembersDto,
  ) {
    return this.setoresService.updateMembers(id, body.userIds);
  }

  @Patch(':id')
  @Permissions('setores:editar', 'setores:gerenciar')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSetorDto) {
    return this.setoresService.update(id, body);
  }

  @Delete(':id')
  @Permissions('setores:excluir', 'setores:gerenciar')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.setoresService.remove(id);
  }
}
