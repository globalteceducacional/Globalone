import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RejectPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivoRejeicao: string;
}

