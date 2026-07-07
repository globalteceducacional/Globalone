import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

const MAX_BATCH = 500;

export class BatchExportStockItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH)
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[];
}
