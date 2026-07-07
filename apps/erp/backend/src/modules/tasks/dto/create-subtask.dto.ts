import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubetapaStatus } from '@prisma/client';

export class CreateSubtaskDto {
  @IsInt()
  etapaId: number;

  @IsString()
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsEnum(SubetapaStatus)
  status?: SubetapaStatus;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;
}
