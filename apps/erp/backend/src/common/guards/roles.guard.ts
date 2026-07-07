import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sem restrição definida: rota pública (já protegida pelo JwtAuthGuard)
    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    const cargoNome = user.role as string;
    const userPermissions: string[] = user.permissions ?? [];

    // Quem tem permissão sistema:administrar tem acesso irrestrito
    if (userPermissions.includes('sistema:administrar')) {
      return true;
    }

    // Verificar por nome de cargo (compatibilidade legada)
    if (requiredRoles?.length && requiredRoles.includes(cargoNome)) {
      return true;
    }

    // Verificar por permissão granular: basta ter QUALQUER uma das listadas
    if (requiredPermissions?.length) {
      const hasAny = requiredPermissions.some((perm) => userPermissions.includes(perm));
      if (hasAny) {
        return true;
      }
    }

    throw new ForbiddenException('Você não tem permissão para realizar esta ação');
  }
}
