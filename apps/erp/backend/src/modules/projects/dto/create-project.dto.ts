import {
  IsArray,
  IsNumber,
  IsOptional,
  IsInt,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @IsString()
  resumo?: string;

  @IsOptional()
  @IsString()
  objetivo?: string;

  @IsOptional()
  @IsString()
  descricaoLonga?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorTotal?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  valorInsumos?: number;

  @IsNumber()
  @IsPositive()
  supervisorId: number;

  /**
   * Suporta múltiplos setores responsáveis.
   * Se `setorId` (legado) for enviado, o backend pode converter para `setorIds=[setorId]`.
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  @Type(() => Number)
  setorIds?: number[];

  // Campo legado (mantido para compatibilidade com payloads antigos)
  @IsOptional()
  @ValidateIf((obj) => obj.setorId !== null && obj.setorId !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  setorId?: number | null;

  @IsOptional()
  @IsArray()
  responsavelIds?: number[];

  @IsOptional()
  planilhaJson?: Record<string, unknown>;

  @IsOptional()
  descricaoArquivos?: {
    originalName: string;
    url: string;
    mimeType?: string;
    size?: number;
  }[];
}
