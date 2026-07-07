import { Type } from 'class-transformer';
import { CompraStatus } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateCuradoriaOrcamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  nome?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projetoId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @ValidateIf((obj) => (obj as any).setorId !== null && (obj as any).setorId !== undefined)
  @IsInt()
  @IsPositive()
  setorId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fornecedorId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nfUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  formaPagamento?: string;

  @IsOptional()
  @IsString()
  arquivoOrcamentoUrl?: string;

  @IsOptional()
  @IsString()
  comprovantePagamentoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  @IsOptional()
  @IsEnum(CompraStatus)
  status?: CompraStatus;

  @IsOptional()
  @IsIn(['ITEM', 'TOTAL'])
  descontoAplicadoEm?: 'ITEM' | 'TOTAL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descontoTotal?: number;
}

