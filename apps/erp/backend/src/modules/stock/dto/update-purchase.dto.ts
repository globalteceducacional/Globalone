import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  Min,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompraStatus, StatusEntrega } from '@prisma/client';
import { PagoPorEntryDto } from './pago-por.dto';

export class CotacaoUpdateDto {
  @IsNumber()
  @Min(0)
  valorUnitario: number;

  @IsNumber()
  @Min(0)
  frete: number;

  @IsNumber()
  @Min(0)
  impostos: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  desconto?: number;

  @IsOptional()
  @IsIn(['valor', 'porcentagem'])
  descontoTipo?: 'valor' | 'porcentagem';

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  fornecedorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  formaPagamento?: string;
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  etapaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  setorId?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projetoId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  item?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantidade?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorUnitario?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imagemUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nfUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comprovantePagamentoUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CotacaoUpdateDto)
  cotacoes?: CotacaoUpdateDto[];

  @IsOptional()
  @IsEnum(CompraStatus)
  status?: CompraStatus;

  @IsOptional()
  dataCompra?: string; // Data da compra no formato ISO string (será convertida para DateTime)

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsEnum(StatusEntrega)
  statusEntrega?: StatusEntrega;

  @IsOptional()
  @IsString()
  dataEntrega?: string; // Data da entrega no formato ISO string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  enderecoEntrega?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  recebidoPor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  solicitadoPorId?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PagoPorEntryDto)
  pagoPor?: PagoPorEntryDto[];
}

