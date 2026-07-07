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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

const READ_PERMS = [
  'compras:visualizar',
  'compras:solicitar',
  'compras:aprovar',
  'estoque:visualizar',
  'estoque:movimentar',
  'sistema:administrar',
] as const;

const WRITE_PERMS = [
  'compras:solicitar',
  'compras:aprovar',
  'sistema:administrar',
] as const;

const MANAGE_PERMS = [
  'compras:aprovar',
  'sistema:administrar',
] as const;

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get('cnpj/:cnpj')
  @Permissions(...WRITE_PERMS)
  async fetchCNPJData(@Param('cnpj') cnpj: string) {
    return this.suppliersService.fetchCNPJData(cnpj);
  }

  @Get('all')
  @Permissions(...READ_PERMS)
  findAllIncludingInactive() {
    return this.suppliersService.findAllIncludingInactive();
  }

  @Get()
  @Permissions(...READ_PERMS)
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @Permissions(...READ_PERMS)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @Permissions(...WRITE_PERMS)
  create(@Body() body: CreateSupplierDto) {
    return this.suppliersService.create(body);
  }

  @Patch(':id')
  @Permissions(...WRITE_PERMS)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSupplierDto) {
    return this.suppliersService.update(id, body);
  }

  @Patch(':id/toggle-active')
  @Permissions(...MANAGE_PERMS)
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.toggleActive(id);
  }

  @Delete(':id')
  @Permissions(...MANAGE_PERMS)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.remove(id);
  }
}
