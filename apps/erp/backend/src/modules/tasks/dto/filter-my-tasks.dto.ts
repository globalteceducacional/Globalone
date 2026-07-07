import { EtapaStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional } from 'class-validator';

export class FilterMyTasksDto {
  @IsOptional()
  @IsEnum(EtapaStatus)
  status?: EtapaStatus;

  @IsOptional()
  @IsInt()
  projetoId?: number;
}
