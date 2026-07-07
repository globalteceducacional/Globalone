import { ArrayUnique, IsArray, IsInt, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSetorMembersDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  userIds?: number[];
}

