import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SetorPatrimonioMaterialCategoria } from '@prisma/client';

export class UpdateSetorPatrimonioMaterialDto {
  @IsOptional()
  @IsEnum(SetorPatrimonioMaterialCategoria)
  categoria?: SetorPatrimonioMaterialCategoria;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nome?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  especificacao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  localizacao?: string | null;

  /** Envie `null` para remover a atribuição a pessoa. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  usuarioAtribuidoId?: number | null;
}
