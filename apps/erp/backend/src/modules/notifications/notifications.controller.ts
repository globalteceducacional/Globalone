import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: number },
    @Query('unread') unread?: string,
  ) {
    const unreadOnly = typeof unread !== 'undefined' ? unread === 'true' : false;
    return this.notificationsService.list(user.userId, unreadOnly);
  }

  @Post('mark-all-read')
  markAll(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Delete('clear')
  clearAll(@CurrentUser() user: { userId: number }) {
    return this.notificationsService.clearAll(user.userId);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }

  @Post()
  @Permissions('notificacoes:enviar', 'projetos:editar', 'projetos:aprovar')
  create(@Body() body: CreateNotificationDto) {
    return this.notificationsService.create(body);
  }
}
