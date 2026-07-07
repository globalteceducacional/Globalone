import { IsArray, ArrayMinSize, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderEtapasDto {
  /** IDs das etapas na nova ordem (primeiro = ordem 0, segundo = ordem 1, ...) */
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  etapaIds: number[];
}
