import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const USER_INCLUDE = {
  cargo: {
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  },
} as const;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async validateUser(email: string, senha: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { email },
      include: USER_INCLUDE,
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatches = await bcrypt.compare(senha, user.senha);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.ativo) {
      throw new UnauthorizedException('Usuário inativo. Aguarde aprovação.');
    }

    return this.mapCargoPermissions(user);
  }

  async login(payload: LoginDto) {
    const user = await this.validateUser(payload.email, payload.senha);
    // Re-fetch fresh data to build the token
    const fresh = await this.prisma.usuario.findUnique({
      where: { id: user.id },
      include: USER_INCLUDE,
    });
    const mappedUser = this.mapCargoPermissions(fresh);
    const permissionKeys = mappedUser?.cargo?.permissions?.map((p: any) => p.chave) ?? [];
    const token = this.jwtService.sign({
      sub: user.id,
      role: mappedUser?.cargo?.nome || 'EXECUTOR',
      permissions: permissionKeys,
    });
    return { token, user: mappedUser };
  }

  /** Retorna o perfil completo e as permissões actuais do banco para o usuário do JWT. */
  async getMe(userId: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    if (!user) throw new UnauthorizedException('Sessão inválida');
    if (!user.ativo) throw new UnauthorizedException('Usuário inativo');
    return this.mapCargoPermissions(user);
  }

  /** Gera um novo token com permissões FRESCAS do banco (usado pelo sliding-session). */
  async refreshToken(userId: number): Promise<string | null> {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    if (!user || !user.ativo) return null;
    const mapped = this.mapCargoPermissions(user);
    const permissionKeys = mapped?.cargo?.permissions?.map((p: any) => p.chave) ?? [];
    return this.jwtService.sign({
      sub: userId,
      role: mapped?.cargo?.nome || 'EXECUTOR',
      permissions: permissionKeys,
    });
  }

  async register(data: RegisterDto) {
    const emailExists = await this.prisma.usuario.findUnique({ where: { email: data.email } });
    if (emailExists) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    let cargo;
    if (typeof data.cargo === 'string') {
      cargo = await this.prisma.cargo.findUnique({ where: { nome: data.cargo.toUpperCase() } });
      if (!cargo) throw new BadRequestException('Cargo não encontrado');
    } else {
      cargo = await this.prisma.cargo.findUnique({ where: { id: data.cargo } });
      if (!cargo) throw new BadRequestException('Cargo não encontrado');
    }

    const hashedPassword = await bcrypt.hash(data.senha, 10);

    const user = await this.prisma.usuario.create({
      data: {
        nome: data.nome,
        email: data.email,
        senha: hashedPassword,
        cargoId: cargo.id,
        telefone: data.telefone,
        formacao: data.formacao,
        funcao: data.funcao,
        dataNascimento: data.dataNascimento ? new Date(data.dataNascimento) : undefined,
      },
      include: USER_INCLUDE,
    });

    return { user: this.mapCargoPermissions(user) };
  }

  private mapCargoPermissions(user: any) {
    if (!user) {
      return user;
    }
    const { senha: _omitSenha, ...safe } = user;

    if (!safe.cargo) {
      return safe;
    }

    const permissions = safe.cargo.permissions?.map((relation) => ({
      id: relation.permissionId,
      modulo: relation.permission.modulo,
      acao: relation.permission.acao,
      chave: `${relation.permission.modulo}:${relation.permission.acao}`,
      descricao: relation.permission.descricao,
    })) ?? [];

    return {
      ...safe,
      cargo: {
        ...safe.cargo,
        permissions,
      },
    };
  }
}
