import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, Min, IsString, MaxLength, IsInt, IsPositive } from 'class-validator';

export class ImportCuradoriaXlsxDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  nome?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fornecedorId?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overwriteCurrent?: boolean;

  @IsOptional()
  @IsIn(['ITEM', 'TOTAL'])
  descontoAplicadoEm?: 'ITEM' | 'TOTAL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descontoTotal?: number;
}

