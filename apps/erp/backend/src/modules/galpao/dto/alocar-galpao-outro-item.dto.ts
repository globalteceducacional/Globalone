import { IsInt, IsPositive } from 'class-validator';

export class AlocarGalpaoOutroItemDto {
  @IsInt()
  @IsPositive()
  estoqueId: number;

  @IsInt()
  @IsPositive()
  quantidade: number;
}

