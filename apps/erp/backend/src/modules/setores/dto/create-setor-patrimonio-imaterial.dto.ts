import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SetorPatrimonioImaterialTipo } from '@prisma/client';

export class CreateSetorPatrimonioImaterialDto {
  @IsEnum(SetorPatrimonioImaterialTipo)
  tipo: SetorPatrimonioImaterialTipo;

  @IsString()
  @MaxLength(500)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  descricao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fornecedor?: string | null;

  @IsOptional()
  @IsDateString()
  dataValidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  observacoes?: string | null;
}
