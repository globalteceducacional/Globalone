import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarioEventosController } from './calendario-eventos.controller';
import { CalendarioEventosService } from './calendario-eventos.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CalendarioEventosController],
  providers: [CalendarioEventosService],
})
export class CalendarioModule {}
