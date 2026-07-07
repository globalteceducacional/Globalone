import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificacaoTipo } from '@prisma/client';

export class CreateNotificationDto {
  @IsInt()
  usuarioId: number;

  @IsString()
  @MaxLength(80)
  titulo: string;

  @IsString()
  @MaxLength(500)
  mensagem: string;

  @IsOptional()
  @IsEnum(NotificacaoTipo)
  tipo?: NotificacaoTipo;

  @IsOptional()
  @IsInt()
  requerimentoId?: number; // Link para o requerimento com detalhes completos

  @IsOptional()
  @IsInt()
  etapaId?: number;

  @IsOptional()
  @IsInt()
  calendarioEventoId?: number;
}
