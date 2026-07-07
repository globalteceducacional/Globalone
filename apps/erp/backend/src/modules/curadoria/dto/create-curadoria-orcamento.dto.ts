import { Type } from 'class-transformer';
import { CompraStatus } from '@prisma/client';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';

export class CreateCuradoriaItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  nome?: string;

  @IsString()
  @MaxLength(30)
  isbn: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantidade: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  desconto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  autor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  editora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  anoPublicacao?: string;
}

export class CreateCuradoriaOrcamentoDto {
  @IsString()
  @MaxLength(180)
  nome: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsOptional()
  @Type(() => Number)
  @ValidateIf((obj) => obj.setorId !== null && obj.setorId !== undefined)
  @IsInt()
  @IsPositive()
  setorId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fornecedorId?: number;

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
  @IsEnum(CompraStatus)
  status?: CompraStatus;

  @IsIn(['ITEM', 'TOTAL'])
  descontoAplicadoEm: 'ITEM' | 'TOTAL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descontoTotal?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCuradoriaItemDto)
  itens: CreateCuradoriaItemDto[];
}

