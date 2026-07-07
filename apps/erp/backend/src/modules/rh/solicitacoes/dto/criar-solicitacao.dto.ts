import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TipoBatida } from '@prisma/client';

export class CriarSolicitacaoAjusteDto {
  @IsEnum(TipoBatida, { message: 'tipo deve ser ENTRADA ou SAIDA.' })
  tipo!: TipoBatida;

  @IsDateString({}, { message: 'dataHora deve ser uma data ISO válida.' })
  dataHora!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'motivo deve ter ao menos 5 caracteres.' })
  @MaxLength(1000)
  motivo!: string;

  @IsOptional()
  @IsString()
  anexoUrl?: string;
}

export class DecidirSolicitacaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}
