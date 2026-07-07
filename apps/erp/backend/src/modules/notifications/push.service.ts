import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

export type PushNotificationPayload = {
  title: string;
  body: string;
  /** Caminho relativo (ex.: /tasks?etapaId=1) para abrir ao clicar. */
  url: string;
  /** Tag estável para não colapsar várias notificações no Android. */
  tag?: string;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidConfigured: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = this.config.get<string>('VAPID_SUBJECT', 'mailto:no-reply@example.com').trim();
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.vapidConfigured = true;
    } else {
      this.vapidConfigured = false;
      this.logger.warn(
        'Web Push desativado: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env (npx web-push generate-vapid-keys).',
      );
    }
  }

  getVapidPublicKey(): string | null {
    if (!this.vapidConfigured) return null;
    return this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ?? null;
  }

  async saveSubscription(userId: number, dto: SubscribePushDto, userAgent?: string) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        usuarioId: userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent?.slice(0, 512) ?? null,
      },
      update: {
        usuarioId: userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent?.slice(0, 512) ?? null,
      },
    });
  }

  async removeSubscription(userId: number, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { usuarioId: userId, endpoint },
    });
    return { ok: true };
  }

  /** Envia push para todos os dispositivos do usuário; falhas 410 removem a subscription. */
  async sendToUser(userId: number, payload: PushNotificationPayload): Promise<void> {
    if (!this.vapidConfigured) return;

    const subs = await this.prisma.pushSubscription.findMany({
      where: { usuarioId: userId },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    const pushSub = (s: (typeof subs)[0]) => ({
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    });

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(pushSub(s), body, {
            TTL: 86400,
            urgency: 'normal',
          });
        } catch (err: unknown) {
          const status = typeof err === 'object' && err && 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } }).catch(() => undefined);
            return;
          }
          this.logger.warn(`Falha ao enviar push (subscription ${s.id}): ${String(err)}`);
        }
      }),
    );
  }
}
