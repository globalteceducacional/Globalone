import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  IsNumber,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  @IsNumber()
  cargoId: number; // ID do cargo

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

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

