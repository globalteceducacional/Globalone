import { IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitDeliveryDto {
  @IsString()
  @MinLength(5)
  descricao: string;

  @IsOptional()
  @IsString()
  imagem?: string;
}

