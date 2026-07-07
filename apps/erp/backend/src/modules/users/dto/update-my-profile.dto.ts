import { IsOptional, IsString, IsDateString, ValidateIf, MaxLength } from 'class-validator';

/** Campos que o próprio usuário pode alterar (sem permissão usuarios:gerenciar). */
export class UpdateMyProfileDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  telefone?: string | null;

  /** CPF (com ou sem máscara). Envie null ou string vazia para limpar. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(14)
  cpf?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  formacao?: string | null;

  /** ISO date (YYYY-MM-DD). Envie null ou string vazia para limpar. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && String(v).trim() !== '')
  @IsDateString()
  dataNascimento?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(8000)
  biografiaResumo?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(8000)
  habilidades?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  linkLattes?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  linkPortfolio?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2048)
  linkLinkedin?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(8000)
  dadosContato?: string | null;

  /** Chave PIX, e-mail da chave, telefone ou texto livre (para repasse RH). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(512)
  pix?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  endereco?: string | null;

  /** ISO date (YYYY-MM-DD). Envie null ou string vazia para limpar. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && String(v).trim() !== '')
  @IsDateString()
  dataEntrada?: string | null;
}
