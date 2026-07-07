import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateSetorDto {
  @IsString()
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /** Usuário chefe do setor (opcional). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  chefeId?: number;
}

