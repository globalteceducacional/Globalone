import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator que marca quais permissões granulares (ex: 'estoque:visualizar')
 * são necessárias para acessar a rota.
 * Lógica OR: o usuário precisa ter QUALQUER uma das permissões listadas.
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
