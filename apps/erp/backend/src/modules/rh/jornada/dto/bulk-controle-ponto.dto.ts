import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt } from 'class-validator';

export class BulkControlePontoDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um colaborador.' })
  @ArrayMaxSize(2000)
  @Type(() => Number)
  @IsInt({ each: true })
  usuarioIds!: number[];

  @IsBoolean()
  controlePonto!: boolean;
}
