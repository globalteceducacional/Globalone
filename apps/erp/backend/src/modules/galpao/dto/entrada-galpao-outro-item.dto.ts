import { IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class EntradaGalpaoOutroItemDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  estoqueId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  item?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @IsInt()
  @IsPositive()
  quantidade: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  valorUnitario?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  imagemUrl?: string;
}

