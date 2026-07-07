import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class ImportPurchasesXlsxDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overwriteCurrent?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsIn(['item', 'total'])
  descontoAplicadoEm?: 'item' | 'total';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descontoTotal?: number;
}

