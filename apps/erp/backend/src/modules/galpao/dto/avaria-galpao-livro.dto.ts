import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class AvariaGalpaoLivroDto {
  @IsString()
  @IsNotEmpty()
  isbn: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  fornecedorId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsInt()
  @IsPositive()
  quantidade: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justificativa: string;
}

