import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class EntradaGalpaoLivroDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  isbn: string;

  @IsOptional()
  @IsInt()
  categoriaId?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  fornecedorId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  nome?: string;

  @IsInt()
  @IsPositive()
  quantidade: number;

  @IsNumber()
  @IsPositive()
  valor: number;

  @IsOptional()
  @IsNumber()
  desconto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  autor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  editora?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  anoPublicacao?: string | null;
}

