import { IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CotacaoItemDto {
  @IsNumber()
  @IsPositive()
  valorUnitario: number;

  @IsNumber()
  @Min(0)
  frete: number;

  @IsNumber()
  @Min(0)
  impostos: number;

  @IsOptional()
  @IsString()
  link?: string;
}

export class CreateStockItemDto {
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

  /** Opcional no cadastro rápido; padrão 0 no serviço. */
  @IsOptional()
  @Type(() => Number)
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
  @Type(() => CotacaoItemDto)
  cotacoes?: CotacaoItemDto[];

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;
}
