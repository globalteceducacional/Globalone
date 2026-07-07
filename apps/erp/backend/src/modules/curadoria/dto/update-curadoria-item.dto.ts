import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCuradoriaItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  isbn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantidade?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  desconto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  autor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  editora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  anoPublicacao?: string;
}

