import { IsOptional, Matches } from 'class-validator';

export class ConfirmSignatureMonthDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'mesReferencia deve estar no formato YYYY-MM',
  })
  mesReferencia?: string;
}
