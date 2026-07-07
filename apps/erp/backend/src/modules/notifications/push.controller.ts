import { Body, Controller, Delete, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';
import { SubscribePushDto, UnsubscribePushDto } from './dto/subscribe-push.dto';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** Chave pública VAPID (não é segredo); usada pelo browser antes do subscribe. */
  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.pushService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(
    @CurrentUser() user: { userId: number },
    @Body() body: SubscribePushDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushService.saveSubscription(user.userId, body, userAgent);
  }

  @Delete('subscribe')
  @UseGuards(JwtAuthGuard)
  unsubscribe(@CurrentUser() user: { userId: number }, @Body() body: UnsubscribePushDto) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }
}
