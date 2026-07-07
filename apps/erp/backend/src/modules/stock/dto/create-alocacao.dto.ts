import { IsInt, IsPositive, IsOptional } from 'class-validator';

export class CreateAlocacaoDto {
  @IsInt()
  @IsPositive()
  estoqueId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  projetoId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  etapaId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  usuarioId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  setorId?: number;

  /**
   * Opcional: ao alocar para `usuarioId`, garante que o usuário é integrante deste setor
   * (uso pela tela de detalhes do setor).
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  validarUsuarioNoSetorId?: number;

  @IsInt()
  @IsPositive()
  quantidade: number;
}

