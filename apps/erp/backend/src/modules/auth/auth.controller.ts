import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type JwtUser = { userId: number };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Máx 5 tentativas de login por minuto por IP — proteção contra força bruta
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  // Máx 3 registros por hora por IP
  @Post('register')
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  /**
   * Retorna o perfil completo do usuário autenticado buscando SEMPRE no banco.
   * O frontend deve chamar este endpoint no startup para sincronizar o estado local.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtUser) {
    return this.authService.getMe(user.userId);
  }
}
