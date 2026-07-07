import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { EmpregadorService } from './empregador.service';

class CriarEmpregadorDto {
  @IsOptional()
  @IsInt()
  tipoIdentificador?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  identificador!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  razaoSocial!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cei?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  endereco?: string | null;

  @IsOptional()
  @IsBoolean()
  principal?: boolean;

  // Geocerca usada na batida de ponto (usuário precisa estar dentro do raio).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitudeReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitudeReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10) // 10 m mínimo: evita raio sem sentido por GPS impreciso
  @Max(10_000) // 10 km máximo: cobre canteiros e fábricas grandes
  raioMetros?: number | null;
}

class AtualizarEmpregadorDto {
  @IsOptional() @IsInt() tipoIdentificador?: number;
  @IsOptional() @IsString() @MaxLength(20) identificador?: string;
  @IsOptional() @IsString() @MaxLength(255) razaoSocial?: string;
  @IsOptional() @IsString() @MaxLength(20) cei?: string | null;
  @IsOptional() @IsString() @MaxLength(500) endereco?: string | null;
  @IsOptional() @IsBoolean() principal?: boolean;

  /** Aceite `null` em qualquer um dos 3 para DESABILITAR a geocerca. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitudeReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitudeReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(10_000)
  raioMetros?: number | null;
}

@Controller('rh/empregadores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmpregadorController {
  constructor(private readonly service: EmpregadorService) {}

  @Get()
  @Permissions('rh:gerenciar_empregador', 'ponto:exportar_afd', 'ponto:ver_todos')
  listar() {
    return this.service.listar();
  }

  @Get('principal')
  @Permissions('rh:gerenciar_empregador', 'ponto:exportar_afd', 'ponto:ver_todos')
  principal() {
    return this.service.obterPrincipal();
  }

  @Post()
  @Permissions('rh:gerenciar_empregador')
  criar(@Body() dto: CriarEmpregadorDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  @Permissions('rh:gerenciar_empregador')
  atualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: AtualizarEmpregadorDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  @Permissions('rh:gerenciar_empregador')
  remover(@Param('id', ParseIntPipe) id: number) {
    return this.service.remover(id);
  }
}
