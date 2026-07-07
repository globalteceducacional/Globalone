import { CalendarioEventoAlvo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCalendarioEventoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @Type(() => Date)
  @IsDate()
  dataInicio: Date;

  @Type(() => Date)
  @IsDate()
  dataFim: Date;

  @IsEnum(CalendarioEventoAlvo)
  alvo: CalendarioEventoAlvo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projetoId?: number;

  @ValidateIf((o) => o.alvo === CalendarioEventoAlvo.SELECIONADOS)
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos um integrante ou use a opção todos os usuários.' })
  @IsInt({ each: true })
  usuarioIds?: number[];
}
