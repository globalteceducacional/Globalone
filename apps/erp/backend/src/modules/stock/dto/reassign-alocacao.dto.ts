import { IsInt, IsOptional, IsPositive } from 'class-validator';

/** Troca o destino de uma alocação sem projeto (somente usuário ou setor). */
export class ReassignAlocacaoDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  usuarioId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  setorId?: number;

  /** Se informado com `usuarioId`, valida integrante do setor (mesma regra da criação). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  validarUsuarioNoSetorId?: number;
}
