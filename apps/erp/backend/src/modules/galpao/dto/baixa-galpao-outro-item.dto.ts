import { IsInt, IsPositive } from 'class-validator';

export class BaixaGalpaoOutroItemDto {
  @IsInt()
  @IsPositive()
  estoqueAlocacaoId: number;

  @IsInt()
  @IsPositive()
  quantidade: number;
}

