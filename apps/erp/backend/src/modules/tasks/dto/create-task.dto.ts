import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ChecklistSubItemDto {
  /** UUID estável — preserva vínculo de entregas ao reordenar/editar subtarefas. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(500)
  texto: string;

  @IsOptional()
  concluido?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  // Pontos de subtarefa NÃO são configuráveis: é calculado automaticamente
  // como Math.floor(parent.pontos / total_subitens), mínimo 1.
}

/** Integrante com itens do checklist atribuídos (índices 0-based do checklistJson). */
export class IntegranteEtapaDto {
  @IsInt()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : value))
  usuarioId: number;

  /** Omitir ou null = vê todos os itens em Meu Trabalho. [] = nenhum item. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => Number(v)).filter((n) => !Number.isNaN(n)) : value,
  )
  checklistItemIndices?: number[] | null;
}

export class ChecklistItemDto {
  /** UUID estável — preserva vínculo de entregas ao reordenar/editar tarefas. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(500)
  texto: string;

  @IsOptional()
  concluido?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistSubItemDto)
  subitens?: ChecklistSubItemDto[];

  /** Vazio ou omitido = todos os integrantes; com IDs = só esses usuários (integrantes da etapa). */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => Number(v)).filter((n) => !Number.isNaN(n) && n > 0) : value,
  )
  integrantesIds?: number[];

  /** Pontos ao aprovar esta tarefa (padrão 1 no backend se omitido). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : undefined))
  pontos?: number;
}

export class CreateTaskDto {
  @IsInt()
  projetoId: number;

  @IsInt()
  executorId: number;

  @IsString()
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : undefined))
  sessaoId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  aba?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @IsPositive()
  valorInsumos?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => Number(v)).filter((n) => !Number.isNaN(n)) : value))
  integrantesIds?: number[];

  /** Se enviado, substitui `integrantesIds` (lista completa com índices por usuário). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegranteEtapaDto)
  integrantes?: IntegranteEtapaDto[];

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : undefined))
  responsavelId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => Number(v)).filter((n) => !Number.isNaN(n)) : value,
  )
  setorIds?: number[];

  // Legado: mantém compatibilidade com chamadas antigas.
  @IsOptional()
  @IsInt()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? Number(value) : undefined,
  )
  setorId?: number;
}
