import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { SetorPatrimonioImaterialTipo } from '@prisma/client';

export class UpdateSetorPatrimonioImaterialDto {
  @IsOptional()
  @IsEnum(SetorPatrimonioImaterialTipo)
  tipo?: SetorPatrimonioImaterialTipo;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  descricao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fornecedor?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && String(v).trim() !== '')
  @IsDateString()
  dataValidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  observacoes?: string | null;
}
