import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdateChecklistSubItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(500)
  texto: string;

  @IsOptional()
  @IsBoolean()
  concluido?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  // Pontos de subtarefa NÃO são configuráveis: calculado como
  // Math.floor(parent.pontos / total_subitens), mínimo 1.
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(500)
  texto: string;

  @IsOptional()
  @IsBoolean()
  concluido?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateChecklistSubItemDto)
  subitens?: UpdateChecklistSubItemDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : undefined))
  pontos?: number;

  /** Mesmo significado que em `ChecklistItemDto` ao salvar etapa. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => Number(v)).filter((n) => !Number.isNaN(n) && n > 0) : value,
  )
  integrantesIds?: number[];
}

export class UpdateChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateChecklistItemDto)
  checklist: UpdateChecklistItemDto[];
}

