import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
