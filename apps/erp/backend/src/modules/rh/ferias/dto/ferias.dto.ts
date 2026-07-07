import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CriarFeriasDto {
  @IsDateString({}, { message: 'dataInicio deve ser uma data ISO válida.' })
  dataInicio!: string;

  @IsDateString({}, { message: 'dataFim deve ser uma data ISO válida.' })
  dataFim!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodoAquisitivoId?: number;

  /** Dias vendidos (abono pecuniário) — máximo 10 conforme CLT. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  abonoPecuniario?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class DecidirFeriasDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;

  /** Data prevista de pagamento (deve preceder o início). */
  @IsOptional()
  @IsDateString({}, { message: 'dataPagamento deve ser uma data ISO válida.' })
  dataPagamento?: string;

  /** 1/3 constitucional (informativo). */
  @IsOptional()
  @Type(() => Number)
  tercoConstitucional?: number;
}
