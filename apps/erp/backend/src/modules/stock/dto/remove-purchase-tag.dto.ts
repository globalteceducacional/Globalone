import { ArrayMinSize, IsArray, IsInt, IsPositive, IsString, MaxLength } from 'class-validator';

export class RemovePurchaseTagDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  purchaseIds: number[];

  @IsString()
  @MaxLength(40)
  nome: string;
}
