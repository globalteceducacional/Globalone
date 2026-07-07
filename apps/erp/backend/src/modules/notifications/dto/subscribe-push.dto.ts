import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

/** Corpo compatível com `PushSubscription.toJSON()` do browser. */
export class SubscribePushDto {
  @IsString()
  endpoint: string;

  @IsOptional()
  @IsInt()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  endpoint: string;
}
