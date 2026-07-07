import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Item de batida pendente capturado offline pelo cliente.
 * O `dataHoraCliente` é preservado quando dentro de uma janela aceitável (24h).
 * Caso contrário, o servidor utiliza `now()` e marca como AJUSTE_RH com origem mobile.
 */
export class BaterBatchItemDto {
  @IsDateString()
  dataHoraCliente!: string;

  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precisaoGps?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clienteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  /** Selfie em base64 (sem prefixo data:image/...). */
  @IsOptional()
  @IsString()
  @MaxLength(10_000_000)
  fotoBase64?: string;
}

/**
 * Sincronização batch de batidas offline (mobile).
 * Limite de 50 batidas por requisição para evitar abuso.
 */
export class BaterBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BaterBatchItemDto)
  batidas!: BaterBatchItemDto[];
}
