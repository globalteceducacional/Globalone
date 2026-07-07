import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpsertSignatureMonthDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'mesReferencia deve estar no formato YYYY-MM',
  })
  mesReferencia: string;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  nfUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  comprovantePagamentoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  observacao?: string | null;
}
