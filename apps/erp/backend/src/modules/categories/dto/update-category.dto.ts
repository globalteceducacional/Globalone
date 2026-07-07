import { IsString, IsOptional, IsBoolean, MaxLength, IsEnum } from 'class-validator';
import { CategoriaCompraTipo } from '@prisma/client';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsEnum(CategoriaCompraTipo)
  tipo?: CategoriaCompraTipo;

  @IsOptional()
  @IsBoolean()
  entraNoEstoque?: boolean;

  @IsOptional()
  @IsBoolean()
  permiteAlocacao?: boolean;

  @IsOptional()
  @IsBoolean()
  isAssinatura?: boolean;

  @IsOptional()
  @IsBoolean()
  isDespesa?: boolean;

  @IsOptional()
  @IsBoolean()
  recorrenciaMensal?: boolean;
}
