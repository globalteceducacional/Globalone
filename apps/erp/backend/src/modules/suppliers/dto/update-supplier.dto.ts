import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14) // CNPJ sem formatação tem 14 dígitos
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contato?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
