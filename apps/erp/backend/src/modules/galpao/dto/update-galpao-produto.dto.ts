import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGalpaoProdutoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

