import { StatusEntrega } from '@prisma/client';
import {
  IsArray,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BatchPurchaseToAcaminhoDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  purchaseIds: number[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  formaPagamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nfUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comprovantePagamentoUrl?: string;

  @IsOptional()
  @IsString()
  dataCompra?: string;

  @IsOptional()
  @IsString()
  previsaoEntrega?: string;

  @IsOptional()
  @IsEnum(StatusEntrega)
  statusEntrega?: StatusEntrega;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  enderecoEntrega?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  @IsOptional()
  @IsIn(['valor', 'porcentagem'])
  descontoTipo?: 'valor' | 'porcentagem';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  descontoValor?: number;

  /** Frete total do pedido em lote; repartido igualmente entre as compras (somado ao frete por unidade da cotação selecionada). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  freteLote?: number;
}
