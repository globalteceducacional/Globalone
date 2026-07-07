import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateSetorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  descricao?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /** Envie `null` para remover o chefe. Só pode ser um integrante do setor. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  chefeId?: number | null;
}
