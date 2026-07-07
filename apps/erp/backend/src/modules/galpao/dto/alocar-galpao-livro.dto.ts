import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class AlocarGalpaoLivroDto {
  @IsString()
  @IsOptional()
  @MaxLength(30)
  isbn: string;

  @IsOptional()
  @IsInt()
  categoriaId?: number | null;

  @IsOptional()
  @IsInt()
  fornecedorId?: number | null;

  @IsInt()
  @IsPositive()
  quantidade: number;
}

