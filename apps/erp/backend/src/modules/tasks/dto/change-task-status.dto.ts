import { EtapaStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class ChangeTaskStatusDto {
  @IsEnum(EtapaStatus)
  status: EtapaStatus;

  @IsOptional()
  @IsBoolean()
  iniciada?: boolean;
}
