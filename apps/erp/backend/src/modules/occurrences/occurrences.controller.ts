import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { OccurrencesService } from './occurrences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOccurrenceDto } from './dto/create-occurrence.dto';

@Controller('occurrences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OccurrencesController {
  constructor(private readonly occurrencesService: OccurrencesService) {}

  @Post()
  create(@CurrentUser() user: { userId: number }, @Body() body: CreateOccurrenceDto) {
    return this.occurrencesService.create(user.userId, body);
  }

  @Get('sent')
  listSent(@CurrentUser() user: { userId: number }) {
    return this.occurrencesService.listSent(user.userId);
  }

  @Get('received')
  listReceived(@CurrentUser() user: { userId: number }) {
    return this.occurrencesService.listReceived(user.userId);
  }
}
