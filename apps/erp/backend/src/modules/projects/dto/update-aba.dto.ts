import { IsInt, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class RenameAbaDto {
  @IsString()
  @MaxLength(60)
  from: string;

  @IsString()
  @MaxLength(60)
  to: string;

  /**
   * Escopo opcional por sessão.
   * - número: aplica somente em etapas dessa sessão
   * - null: aplica somente em etapas SEM sessão
   * - ausente/undefined: aplica em todas as sessões do projeto (compatibilidade legada)
   */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  sessaoId?: number | null;
}

export class DeleteAbaDto {
  @IsString()
  @MaxLength(60)
  name: string;

  /**
   * Escopo opcional por sessão. Mesma semântica do RenameAbaDto.sessaoId.
   */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  sessaoId?: number | null;
}

