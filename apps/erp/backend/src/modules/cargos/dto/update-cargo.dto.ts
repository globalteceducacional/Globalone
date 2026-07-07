import { PartialType } from '@nestjs/mapped-types';
import { CreateCargoDto } from './create-cargo.dto';
import { IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class UpdateCargoDto extends PartialType(CreateCargoDto) {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paginasPermitidas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

