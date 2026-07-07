import { RemuneracaoPontoTipo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateJornadaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  cargaDiariaMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7 * 24 * 60)
  cargaSemanalMin?: number;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'inicioPadrao deve estar no formato HH:mm.' })
  inicioPadrao?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'fimPadrao deve estar no formato HH:mm.' })
  fimPadrao?: string;

  @IsOptional()
  @IsBoolean()
  almocoAutomatico?: boolean;

  /** false = colaborador fora do ponto/banco de horas. */
  @IsOptional()
  @IsBoolean()
  controlePonto?: boolean;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'almocoInicio deve estar no formato HH:mm.' })
  almocoInicio?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'almocoFim deve estar no formato HH:mm.' })
  almocoFim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  tolerAtrasoMin?: number;

  @IsOptional()
  @IsObject()
  diasUteis?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  /**
   * Geocerca individual: quando os 3 campos abaixo estão preenchidos,
   * SOBRESCREVEM a geocerca global do empregador para a batida deste usuário.
   * Aceita `null` para LIMPAR (e cair no fallback do empregador). Os 3 devem
   * vir juntos (todos preenchidos para ativar, todos nulos para desativar).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitudeReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitudeReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(10_000)
  raioMetros?: number | null;

  /** Sem horário fixo: esperado diário = carga semanal / dias úteis; sem atraso por entrada. */
  @IsOptional()
  @IsBoolean()
  horarioFlexivel?: boolean;

  @IsOptional()
  @IsEnum(RemuneracaoPontoTipo)
  remuneracaoPontoTipo?: RemuneracaoPontoTipo;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorHora?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorMensal?: number | null;

  /** @deprecated Ignorado no servidor: a meta mensal é sempre derivada da carga semanal (× 52/12). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31 * 24 * 60)
  metaHorasMensalMin?: number | null;
}
