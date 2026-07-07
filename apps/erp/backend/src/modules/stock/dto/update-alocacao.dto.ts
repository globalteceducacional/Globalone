import { IsInt, IsPositive, IsOptional } from 'class-validator';

export class UpdateAlocacaoDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  quantidade?: number;
}

