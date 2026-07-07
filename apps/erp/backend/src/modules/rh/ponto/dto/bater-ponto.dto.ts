import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Payload da batida de ponto enviada pelo colaborador via multipart/form-data.
 * Os campos numéricos chegam como string no FormData; usamos `@Type(() => Number)`
 * para conversão automática em conjunto com o ValidationPipe global.
 */
export class BaterPontoDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude deve ser um número.' })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'longitude deve ser um número.' })
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'precisaoGps deve ser um número.' })
  precisaoGps?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'observacao deve ter no máximo 500 caracteres.' })
  observacao?: string;
}
