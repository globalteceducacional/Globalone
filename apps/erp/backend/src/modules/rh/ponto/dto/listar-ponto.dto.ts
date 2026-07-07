import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/** Filtros opcionais de período/usuário para as listagens de ponto. */
export class ListarPontoDto {
  @IsOptional()
  @IsDateString({}, { message: 'inicio deve ser uma data ISO válida.' })
  inicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fim deve ser uma data ISO válida.' })
  fim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'usuarioId deve ser um inteiro.' })
  usuarioId?: number;
}
