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
  Query,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CategoriaCompraTipo } from '@prisma/client';

const READ_PERMS = [
  'compras:visualizar',
  'compras:solicitar',
  'compras:aprovar',
  'estoque:visualizar',
  'estoque:movimentar',
  'sistema:administrar',
] as const;

const WRITE_PERMS = [
  'compras:aprovar',
  'sistema:administrar',
] as const;

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Permissions(...READ_PERMS)
  findAll(@Query('tipo') tipo?: CategoriaCompraTipo) {
    return this.categoriesService.findAll(tipo);
  }

  @Get('all')
  @Permissions(...READ_PERMS)
  findAllIncludingInactive(@Query('tipo') tipo?: CategoriaCompraTipo) {
    return this.categoriesService.findAllIncludingInactive(tipo);
  }

  @Get(':id')
  @Permissions(...READ_PERMS)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Permissions(...WRITE_PERMS)
  create(@Body() body: CreateCategoryDto) {
    return this.categoriesService.create(body);
  }

  @Patch(':id')
  @Permissions(...WRITE_PERMS)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCategoryDto) {
    return this.categoriesService.update(id, body);
  }

  @Patch(':id/toggle-active')
  @Permissions(...WRITE_PERMS)
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.toggleActive(id);
  }

  @Delete(':id')
  @Permissions(...WRITE_PERMS)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
