import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  IsNumber,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  @IsString()
  cargo: string; // Agora aceita string (nome do cargo) ou pode ser modificado para aceitar ID

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  formacao?: string;

  @IsOptional()
  @IsString()
  funcao?: string;

  @IsOptional()
  @IsDateString()
  dataNascimento?: string;
}
