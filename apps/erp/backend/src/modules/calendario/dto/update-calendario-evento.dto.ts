import { PartialType } from '@nestjs/mapped-types';
import { CreateCalendarioEventoDto } from './create-calendario-evento.dto';

export class UpdateCalendarioEventoDto extends PartialType(CreateCalendarioEventoDto) {}
