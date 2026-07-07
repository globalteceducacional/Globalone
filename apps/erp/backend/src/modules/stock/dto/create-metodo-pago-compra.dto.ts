import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMetodoPagoCompraDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome: string;
}
