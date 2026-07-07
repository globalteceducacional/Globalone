import { IsOptional, IsBooleanString, IsString } from 'class-validator';

export class FilterUsersDto {
  @IsOptional()
  @IsString()
  nome?: string; // Texto buscado no nome ou no e-mail (parcial, case-insensitive)

  @IsOptional()
  @IsString()
  cargo?: string; // Nome do cargo para filtrar

  @IsOptional()
  @IsBooleanString()
  ativo?: string;
}
