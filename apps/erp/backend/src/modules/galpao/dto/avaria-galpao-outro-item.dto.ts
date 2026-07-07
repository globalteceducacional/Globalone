import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

export class AvariaGalpaoOutroItemDto {
  @IsInt()
  @IsPositive()
  estoqueId: number;

  @IsInt()
  @IsPositive()
  quantidade: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justificativa: string;
}

