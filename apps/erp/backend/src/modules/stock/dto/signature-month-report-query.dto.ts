import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

export class SignatureMonthReportQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'mesReferencia deve estar no formato YYYY-MM',
  })
  mesReferencia: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projetoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  setorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;
}
