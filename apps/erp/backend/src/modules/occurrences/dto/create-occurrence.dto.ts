import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOccurrenceDto {
  @IsInt()
  destinatarioId: number;

  @IsString()
  @MaxLength(1000)
  texto: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  anexo?: string;
}
