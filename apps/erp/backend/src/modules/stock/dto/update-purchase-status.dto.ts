import { CompraStatus, StatusEntrega } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePurchaseStatusDto {
  @IsEnum(CompraStatus)
  status: CompraStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacaoStatus?: string;

  @IsOptional()
  @IsEnum(StatusEntrega)
  statusEntrega?: StatusEntrega;

  @IsOptional()
  @IsString()
  previsaoEntrega?: string; // Previsão de entrega no formato ISO string (quando status for COMPRADO_ACAMINHO)

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
}
