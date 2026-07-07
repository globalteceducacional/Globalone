import {
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsInt,
  IsPositive,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CotacaoDto } from './create-purchase.dto';

export class ApprovePurchaseDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CotacaoDto)
  cotacoes?: CotacaoDto[];

  @IsOptional()
  @IsNumber()
  selectedCotacaoIndex?: number;

  @IsOptional()
  @IsBoolean()
  withChanges?: boolean;

  @IsOptional()
  @IsInt()
  @IsPositive()
  approvedQuantity?: number;

  @IsOptional()
  @IsIn(['COMPRAR_DEPOIS', 'REMOVER'])
  reducedQuantityAction?: 'COMPRAR_DEPOIS' | 'REMOVER';

  /** Permite aprovar já direcionando para categoria de assinatura. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaId?: number;
}
