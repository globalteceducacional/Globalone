import { IsArray, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateResponsiblesDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  responsavelIds?: number[];
}
