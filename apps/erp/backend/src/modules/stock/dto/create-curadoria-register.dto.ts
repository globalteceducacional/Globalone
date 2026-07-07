import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class CuradoriaItemDto {
  @IsString()
  @MaxLength(120)
  nome: string;

  @IsString()
  @MaxLength(60)
  isbn: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  desconto?: number;
}

export class CreateCuradoriaRegisterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  @IsIn(['item', 'total'])
  descontoAplicadoEm: 'item' | 'total';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descontoTotal?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CuradoriaItemDto)
  itens: CuradoriaItemDto[];
}

export type CuradoriaItemInput = CuradoriaItemDto;

