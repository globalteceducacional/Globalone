import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * usuario: usuarioId obrigatório.
 * pessoa: texto = nome.
 * metodo: metodoId (cadastro) OU texto (legado / find-or-create pelo nome).
 */
export class PagoPorEntryDto {
  @IsIn(['usuario', 'pessoa', 'metodo'])
  tipo: 'usuario' | 'pessoa' | 'metodo';

  @ValidateIf((o) => o.tipo === 'usuario')
  @IsInt()
  @IsPositive()
  usuarioId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  texto?: string;

  @ValidateIf((o) => o.tipo === 'metodo')
  @IsOptional()
  @IsInt()
  @IsPositive()
  metodoId?: number;
}
