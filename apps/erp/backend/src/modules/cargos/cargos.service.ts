import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCargoDto } from './dto/create-cargo.dto';
import { UpdateCargoDto } from './dto/update-cargo.dto';

@Injectable()
export class CargosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const cargos = await this.prisma.cargo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { usuarios: true },
        },
      },
    });

    return cargos.map((cargo) => this.mapCargoWithPermissions(cargo));
  }

  async findAllIncludingInactive() {
    const cargos = await this.prisma.cargo.findMany({
      orderBy: { nome: 'asc' },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { usuarios: true },
        },
      },
    });

    return cargos.map((cargo) => this.mapCargoWithPermissions(cargo));
  }

  async findOne(id: number) {
    const cargo = await this.prisma.cargo.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { usuarios: true },
        },
      },
    });

    if (!cargo) {
      throw new NotFoundException('Cargo não encontrado');
    }

    return this.mapCargoWithPermissions(cargo);
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ modulo: 'asc' }, { acao: 'asc' }],
    });
  }

  async create(data: CreateCargoDto) {
    const nomeExists = await this.prisma.cargo.findUnique({
      where: { nome: data.nome.toUpperCase() },
    });

    if (nomeExists) {
      throw new BadRequestException('Já existe um cargo com este nome');
    }

    const permissions = await this.resolvePermissionKeys(data.permissions);

    const cargo = await this.prisma.cargo.create({
      data: {
        nome: data.nome.toUpperCase(),
        descricao: data.descricao,
        ativo: data.ativo ?? true,
        paginasPermitidas: data.paginasPermitidas || [],
        permissions: permissions.length
          ? {
              create: permissions.map((permission) => ({ permissionId: permission.id })),
            }
          : undefined,
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { usuarios: true } },
      },
    });

    return this.mapCargoWithPermissions(cargo);
  }

  async update(id: number, data: UpdateCargoDto) {
    await this.findOne(id);

    if (data.nome) {
      const nomeExists = await this.prisma.cargo.findUnique({
        where: { nome: data.nome.toUpperCase() },
      });

      if (nomeExists && nomeExists.id !== id) {
        throw new BadRequestException('Já existe um cargo com este nome');
      }
    }

    const payload: any = {};

    if (data.nome) {
      payload.nome = data.nome.toUpperCase();
    }

    if (typeof data.descricao !== 'undefined') {
      payload.descricao = data.descricao;
    }

    if (typeof data.ativo !== 'undefined') {
      payload.ativo = data.ativo;
    }

    if (typeof data.paginasPermitidas !== 'undefined') {
      payload.paginasPermitidas = data.paginasPermitidas;
    }

    let permissions: Awaited<ReturnType<typeof this.resolvePermissionKeys>> | null = null;
    if (typeof data.permissions !== 'undefined') {
      permissions = await this.resolvePermissionKeys(data.permissions);
    }

    const cargo = await this.prisma.cargo.update({
      where: { id },
      data: {
        ...payload,
        ...(permissions !== null
          ? {
              permissions: {
                deleteMany: {},
                create: permissions.map((permission) => ({ permissionId: permission.id })),
              },
            }
          : {}),
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { usuarios: true } },
      },
    });

    return this.mapCargoWithPermissions(cargo);
  }

  async remove(id: number) {
    const cargo = await this.findOne(id);

    // Verificar se há usuários usando este cargo
    const usuariosCount = await this.prisma.usuario.count({
      where: { cargoId: id },
    });

    if (usuariosCount > 0) {
      throw new BadRequestException(
        `Não é possível excluir este cargo. Existem ${usuariosCount} usuário(s) utilizando-o.`,
      );
    }

    await this.prisma.cargo.delete({
      where: { id },
    });
  }

  private mapCargoWithPermissions(cargo: any) {
    const permissions = cargo.permissions?.map((relation) => ({
      id: relation.permissionId,
      modulo: relation.permission.modulo,
      acao: relation.permission.acao,
      chave: `${relation.permission.modulo}:${relation.permission.acao}`,
      descricao: relation.permission.descricao,
    })) ?? [];

    return {
      ...cargo,
      permissions,
    };
  }

  private async resolvePermissionKeys(keys?: string[]) {
    if (!keys || keys.length === 0) {
      return [];
    }

    const normalized = Array.from(new Set(keys.map((key) => key?.trim()).filter(Boolean)));

    const parsed = normalized.map((key) => {
      const [modulo, acao] = key.split(':').map((part) => part?.trim());
      if (!modulo || !acao) {
        throw new BadRequestException(`Formato de permissão inválido: ${key}`);
      }
      return { modulo, acao, chave: key };
    });

    // Em ambientes onde o seed não foi executado, ainda queremos permitir salvar o cargo.
    // Então, criamos automaticamente as permissões ausentes.
    const permissions = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.permission.findMany({
        where: {
          OR: parsed.map(({ modulo, acao }) => ({ modulo, acao })),
        },
      });

      const foundKeys = new Set(existing.map((p) => `${p.modulo}:${p.acao}`));
      const missing = parsed.filter((item) => !foundKeys.has(item.chave));

      if (missing.length > 0) {
        await Promise.all(
          missing.map((item) =>
            tx.permission.upsert({
              where: {
                modulo_acao: {
                  modulo: item.modulo,
                  acao: item.acao,
                },
              },
              update: {},
              create: {
                modulo: item.modulo,
                acao: item.acao,
                descricao: `Permissão criada automaticamente: ${item.modulo}:${item.acao}`,
              },
            }),
          ),
        );
      }

      return tx.permission.findMany({
        where: {
          OR: parsed.map(({ modulo, acao }) => ({ modulo, acao })),
        },
      });
    });

    return permissions;
  }
}

