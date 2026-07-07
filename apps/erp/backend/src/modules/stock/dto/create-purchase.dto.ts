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
  ValidateIf,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompraClasse, CompraStatus } from '@prisma/client';
import { PagoPorEntryDto } from './pago-por.dto';

export class CotacaoDto {
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

export class CreatePurchaseDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  etapaId?: number;

  @IsOptional()
  @ValidateIf((obj) => obj.setorId !== null && obj.setorId !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  setorId?: number | null;

  @IsString()
  @MaxLength(120)
  item: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @IsInt()
  @IsPositive()
  quantidade: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorUnitario?: number; // Valor líquido por unidade (pode ser 0 se o desconto cobrir o preço)

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
  @Type(() => CotacaoDto)
  cotacoes?: CotacaoDto[];

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
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PagoPorEntryDto)
  pagoPor?: PagoPorEntryDto[];

  /** Se omitido, o backend usa o usuário autenticado como solicitante. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  solicitadoPorId?: number;

  /** ESTOQUE (padrão), DESPESA ou ASSINATURA — define a aba/fluxo, independente da categoria. */
  @IsOptional()
  @IsEnum(CompraClasse)
  classe?: CompraClasse;
}
