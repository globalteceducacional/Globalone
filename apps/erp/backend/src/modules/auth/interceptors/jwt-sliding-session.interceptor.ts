import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, switchMap } from 'rxjs';
import { AuthService } from '../auth.service';

type AuthUser = { userId: number };

@Injectable()
export class JwtSlidingSessionInterceptor implements NestInterceptor {
  constructor(private readonly authService: AuthService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<{ user?: AuthUser }>();
    const res = http.getResponse<{ setHeader: (name: string, value: string) => void }>();

    return next.handle().pipe(
      switchMap(async (result) => {
        const userId = req.user?.userId;
        if (!userId) return result;

        // Busca permissões FRESCAS do banco para renovar o token.
        // Isso garante que revogações de cargo entram em vigor na próxima requisição.
        const renewedToken = await this.authService.refreshToken(userId);
        if (renewedToken) {
          res.setHeader('x-renewed-token', renewedToken);
        }
        return result;
      }),
    );
  }
}
