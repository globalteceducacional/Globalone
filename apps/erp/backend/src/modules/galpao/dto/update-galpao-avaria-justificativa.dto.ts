import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateGalpaoAvariaJustificativaDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  justificativa!: string;
}
