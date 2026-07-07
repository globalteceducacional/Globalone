import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      // Aceita token APENAS via header Authorization: Bearer <token>.
      // Query-string (?access_token=) foi removida: tokens em URL aparecem em logs
      // de servidor, headers Referer e histórico do browser.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'default-secret'),
    });
  }

  async validate(payload: { sub: number; role: string; permissions?: string[] }) {
    return {
      userId: payload.sub,
      role: payload.role,
      permissions: payload.permissions ?? [],
    };
  }
}
