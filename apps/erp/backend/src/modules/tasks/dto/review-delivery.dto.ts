import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  comentario?: string;
}

