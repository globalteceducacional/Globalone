import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TipoBatida } from '@prisma/client';

/**
 * Criação manual (retroativa) de um registro de ponto pelo RH.
 * `justificativa` é obrigatória para fins de auditoria.
 */
export class CriarAjustePontoDto {
  @IsInt({ message: 'usuarioId deve ser um inteiro.' })
  usuarioId!: number;

  @IsEnum(TipoBatida, { message: 'tipo deve ser ENTRADA ou SAIDA.' })
  tipo!: TipoBatida;

  @IsDateString({}, { message: 'dataHora deve ser uma data ISO válida.' })
  dataHora!: string;

  @IsString()
  @IsNotEmpty({ message: 'justificativa é obrigatória.' })
  @MinLength(5, { message: 'justificativa deve ter ao menos 5 caracteres.' })
  @MaxLength(1000, { message: 'justificativa deve ter no máximo 1000 caracteres.' })
  justificativa!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

/** Edição de um registro existente (alterar tipo/dataHora) com justificativa. */
export class EditarPontoDto {
  @IsOptional()
  @IsEnum(TipoBatida, { message: 'tipo deve ser ENTRADA ou SAIDA.' })
  tipo?: TipoBatida;

  @IsOptional()
  @IsDateString({}, { message: 'dataHora deve ser uma data ISO válida.' })
  dataHora?: string;

  @IsString()
  @IsNotEmpty({ message: 'justificativa é obrigatória.' })
  @MinLength(5, { message: 'justificativa deve ter ao menos 5 caracteres.' })
  @MaxLength(1000)
  justificativa!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

/** Exclusão (soft via remoção) com justificativa registrada antes do delete. */
export class RemoverPontoDto {
  @IsString()
  @IsNotEmpty({ message: 'justificativa é obrigatória.' })
  @MinLength(5, { message: 'justificativa deve ter ao menos 5 caracteres.' })
  @MaxLength(1000)
  justificativa!: string;
}
