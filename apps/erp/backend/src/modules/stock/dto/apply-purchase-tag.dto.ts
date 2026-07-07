import { ArrayMinSize, IsArray, IsHexColor, IsInt, IsPositive, IsString, MaxLength } from 'class-validator';

export class ApplyPurchaseTagDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  purchaseIds: number[];

  @IsString()
  @MaxLength(40)
  nome: string;

  @IsHexColor()
  cor: string;
}
