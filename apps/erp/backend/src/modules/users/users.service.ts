import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { FilterUsersDto } from './dto/filter-users.dto';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import { join } from 'path';
import {
  assertValidCpfOrNull,
  normalizeCpfInput,
} from '../../common/cpf.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterUsersDto) {
    const where: Record<string, unknown> = {};

    // Busca por trecho no nome ou no e-mail (parcial, sem diferenciar maiúsculas)
    if (typeof filter.nome !== 'undefined' && filter.nome && filter.nome.trim().length > 0) {
      const t = filter.nome.trim();
      where.OR = [
        { nome: { contains: t, mode: 'insensitive' } },
        { email: { contains: t, mode: 'insensitive' } },
      ];
    }

    if (typeof filter.cargo !== 'undefined' && filter.cargo) {
      // Buscar cargo por nome e filtrar por cargoId
      const cargo = await this.prisma.cargo.findUnique({
        where: { nome: filter.cargo.toUpperCase() },
      });
      if (cargo) {
        where.cargoId = cargo.id;
      }
    }

    if (typeof filter.ativo !== 'undefined') {
      where.ativo = filter.ativo === 'true';
    }

    const users = await this.prisma.usuario.findMany({
      where,
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
      orderBy: { dataCadastro: 'desc' },
    });

    return users.map((user) => this.mapUserCargoPermissions(user));
  }

  async findOptions() {
    return this.prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, cargo: { select: { nome: true } } },
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return this.mapUserCargoPermissions(user);
  }

  /**
   * Versão com controle de acesso: qualquer usuário pode ver o próprio perfil;
   * para ver perfis alheios é exigida permissão de gestão.
   */
  async findOneAuthorized(
    id: number,
    requester: { userId: number; permissions?: string[] },
  ) {
    const selfView = Number(requester.userId) === Number(id);
    const perms = requester.permissions ?? [];
    const hasUserMgmt =
      perms.includes('sistema:administrar') ||
      perms.includes('usuarios:visualizar') ||
      perms.includes('usuarios:editar') ||
      perms.includes('usuarios:gerenciar');

    if (!selfView && !hasUserMgmt) {
      throw new ForbiddenException(
        'Você não tem permissão para visualizar o perfil de outro usuário.',
      );
    }

    return this.findOne(id);
  }

  async create(data: CreateUserDto) {
    const emailExists = await this.prisma.usuario.findUnique({ where: { email: data.email } });
    if (emailExists) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    // Verificar se o cargo existe
    const cargo = await this.prisma.cargo.findUnique({ where: { id: data.cargoId } });
    if (!cargo) {
      throw new BadRequestException('Cargo não encontrado');
    }

    const hashedPassword = await bcrypt.hash(data.senha, 10);

    let cpfNormalized: string | null = null;
    if (data.cpf !== undefined) {
      cpfNormalized = normalizeCpfInput(data.cpf);
      assertValidCpfOrNull(cpfNormalized);
      if (cpfNormalized) await this.assertCpfNotInUse(cpfNormalized);
    }

    const user = await this.prisma.usuario.create({
      data: {
        nome: data.nome,
        email: data.email,
        senha: hashedPassword,
        cargoId: data.cargoId,
        telefone: data.telefone,
        cpf: cpfNormalized,
        formacao: data.formacao,
        funcao: data.funcao,
        dataNascimento: data.dataNascimento ? new Date(data.dataNascimento) : undefined,
        ativo: false, // Por padrão, novos usuários começam inativos
      },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    return this.mapUserCargoPermissions(user);
  }

  async update(id: number, data: UpdateUserDto) {
    await this.findOne(id);

    if (data.email) {
      const emailExists = await this.prisma.usuario.findUnique({ where: { email: data.email } });
      if (emailExists && emailExists.id !== id) {
        throw new BadRequestException('E-mail já está em uso por outro usuário');
      }
    }

    const payload: Record<string, unknown> = {};

    if (data.nome) payload.nome = data.nome;
    if (data.email) payload.email = data.email;
    if (data.telefone !== undefined) payload.telefone = data.telefone;
    if (data.formacao !== undefined) payload.formacao = data.formacao;
    if (data.funcao !== undefined) payload.funcao = data.funcao;
    if (data.dataNascimento) payload.dataNascimento = new Date(data.dataNascimento);
    if (typeof data.ativo !== 'undefined') payload.ativo = data.ativo;

    if (data.cpf !== undefined) {
      const cpfNormalized = normalizeCpfInput(data.cpf);
      assertValidCpfOrNull(cpfNormalized);
      if (cpfNormalized) await this.assertCpfNotInUse(cpfNormalized, id);
      payload.cpf = cpfNormalized;
    }

    if (data.endereco !== undefined) {
      payload.endereco =
        data.endereco === null || (typeof data.endereco === 'string' && data.endereco.trim() === '')
          ? null
          : String(data.endereco).trim();
    }

    if (data.cargoId) {
      // Verificar se o cargo existe
      const cargo = await this.prisma.cargo.findUnique({ where: { id: data.cargoId } });
      if (!cargo) {
        throw new BadRequestException('Cargo não encontrado');
      }
      payload.cargoId = data.cargoId;
    }

    // Só atualizar senha se ela foi fornecida e não está vazia
    if (typeof data.senha !== 'undefined' && data.senha && data.senha.trim().length > 0) {
      if (data.senha.trim().length < 6) {
        throw new BadRequestException('Senha deve ter no mínimo 6 caracteres');
      }
      payload.senha = await bcrypt.hash(data.senha.trim(), 10);
    }

    const user = await this.prisma.usuario.update({
      where: { id },
      data: payload,
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    return this.mapUserCargoPermissions(user);
  }

  /** Atualização restrita ao próprio usuário (dados pessoais e links do perfil). */
  async updateMyProfile(userId: number, data: UpdateMyProfileDto) {
    await this.findOne(userId);

    const payload: Record<string, unknown> = {};

    if (data.telefone !== undefined) {
      const t = data.telefone;
      payload.telefone =
        t === null || (typeof t === 'string' && t.trim() === '') ? null : String(t).trim();
    }
    if (data.formacao !== undefined) {
      const f = data.formacao;
      payload.formacao =
        f === null || (typeof f === 'string' && f.trim() === '') ? null : String(f).trim();
    }
    if (data.dataNascimento !== undefined) {
      if (data.dataNascimento === null || String(data.dataNascimento).trim() === '') {
        payload.dataNascimento = null;
      } else {
        payload.dataNascimento = new Date(data.dataNascimento as string);
      }
    }

    const assignOptionalText = (key: string, value: string | null | undefined) => {
      if (value === undefined) return;
      if (value === null || (typeof value === 'string' && value.trim() === '')) {
        payload[key] = null;
        return;
      }
      payload[key] = String(value).trim();
    };

    if (data.cpf !== undefined) {
      const cpfNormalized = normalizeCpfInput(data.cpf);
      assertValidCpfOrNull(cpfNormalized);
      if (cpfNormalized) await this.assertCpfNotInUse(cpfNormalized, userId);
      payload.cpf = cpfNormalized;
    }

    assignOptionalText('biografiaResumo', data.biografiaResumo);
    assignOptionalText('habilidades', data.habilidades);
    assignOptionalText('linkLattes', data.linkLattes);
    assignOptionalText('linkPortfolio', data.linkPortfolio);
    assignOptionalText('linkLinkedin', data.linkLinkedin);
    assignOptionalText('dadosContato', data.dadosContato);
    assignOptionalText('pix', data.pix);
    assignOptionalText('endereco', data.endereco);

    if (data.dataEntrada !== undefined) {
      if (data.dataEntrada === null || String(data.dataEntrada).trim() === '') {
        payload.dataEntrada = null;
      } else {
        payload.dataEntrada = new Date(data.dataEntrada as string);
      }
    }

    if (Object.keys(payload).length === 0) {
      return this.findOne(userId);
    }

    const user = await this.prisma.usuario.update({
      where: { id: userId },
      data: payload,
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    return this.mapUserCargoPermissions(user);
  }

  async activate(id: number) {
    await this.findOne(id);
    const user = await this.prisma.usuario.update({
      where: { id },
      data: { ativo: true },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    return this.mapUserCargoPermissions(user);
  }

  async deactivate(id: number) {
    await this.findOne(id);
    const user = await this.prisma.usuario.update({
      where: { id },
      data: { ativo: false },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    return this.mapUserCargoPermissions(user);
  }

  async assignRole(id: number, cargoId: number) {
    await this.findOne(id);
    
    // Verificar se o cargo existe
    const cargo = await this.prisma.cargo.findUnique({ where: { id: cargoId } });
    if (!cargo) {
      throw new BadRequestException('Cargo não encontrado');
    }

    const updatedUser = await this.prisma.usuario.update({
      where: { id },
      data: { cargoId },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    return this.mapUserCargoPermissions(updatedUser);
  }

  /**
   * Remove o usuário e limpa/repontua referências em todo o sistema (projetos, etapas, entregas,
   * requerimentos, etc.). FKs sem onDelete no Prisma impediam o delete direto.
   */
  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      const outros = await tx.usuario.count({ where: { id: { not: id } } });
      if (outros === 0) {
        throw new BadRequestException('Não é possível excluir o único usuário do sistema.');
      }

      let fallback = await tx.usuario.findFirst({
        where: {
          id: { not: id },
          ativo: true,
          cargo: { permissions: { some: { permission: { modulo: 'sistema', acao: 'administrar' } } } },
        },
        orderBy: { id: 'asc' },
      });
      if (!fallback) {
        fallback = await tx.usuario.findFirst({
          where: { id: { not: id }, ativo: true },
          orderBy: { id: 'asc' },
        });
      }
      if (!fallback) {
        fallback = await tx.usuario.findFirst({
          where: { id: { not: id } },
          orderBy: { id: 'asc' },
        });
      }
      if (!fallback) {
        throw new BadRequestException('Não é possível excluir o único usuário do sistema.');
      }
      const fallbackId = fallback.id;

      // Requerimentos: remetente obrigatório — remove os enviados por este usuário
      await tx.requerimento.deleteMany({ where: { usuarioId: id } });
      await tx.requerimento.updateMany({
        where: { destinatarioId: id },
        data: { destinatarioId: null },
      });

      // Ocorrências internas
      await tx.ocorrencia.deleteMany({ where: { usuarioId: id } });
      await tx.ocorrencia.updateMany({
        where: { destinatarioId: id },
        data: { destinatarioId: null },
      });

      await tx.etapa.updateMany({
        where: { responsavelId: id },
        data: { responsavelId: null },
      });

      // Executor da etapa: prioriza o supervisor do projeto; senão outro usuário (ex.: GM)
      const etapasComoExecutor = await tx.etapa.findMany({
        where: { executorId: id },
        select: { id: true, projeto: { select: { supervisorId: true } } },
      });
      for (const e of etapasComoExecutor) {
        const sup = e.projeto?.supervisorId ?? null;
        const nextExecutor = sup != null && sup !== id ? sup : fallbackId;
        await tx.etapa.update({
          where: { id: e.id },
          data: { executorId: nextExecutor },
        });
      }

      await tx.etapaEntrega.updateMany({
        where: { executorId: id },
        data: { executorId: fallbackId },
      });
      await tx.etapaEntrega.updateMany({
        where: { avaliadoPorId: id },
        data: { avaliadoPorId: null },
      });
      await tx.etapaEntrega.updateMany({
        where: { editadoPorId: id },
        data: { editadoPorId: null },
      });

      const pontosChecklistDoExcluido = await tx.checklistItemEntrega.aggregate({
        where: {
          executorId: id,
          status: ChecklistItemStatus.APROVADO,
          pontosAtribuidos: { not: null },
        },
        _sum: { pontosAtribuidos: true },
      });
      const ptsTransferir = pontosChecklistDoExcluido._sum.pontosAtribuidos ?? 0;
      if (ptsTransferir > 0) {
        await tx.usuario.update({
          where: { id: fallbackId },
          data: { pontosTarefas: { increment: ptsTransferir } },
        });
      }

      await tx.checklistItemEntrega.updateMany({
        where: { executorId: id },
        data: { executorId: fallbackId },
      });
      await tx.checklistItemEntrega.updateMany({
        where: { avaliadoPorId: id },
        data: { avaliadoPorId: null },
      });

      await tx.projeto.updateMany({
        where: { supervisorId: id },
        data: { supervisorId: null },
      });

      await tx.usuario.delete({ where: { id } });
    });

    this.removeAllProfilePhotoVariants(id);
  }

  /**
   * Ranking de pontos acumulados por tarefas aprovadas.
   * Critérios de desempate (aplicados em sequência):
   *  1) pontosTarefas (desc)
   *  2) totalEntregasAprovadas (desc) — entregas individuais aprovadas
   *  3) totalEtapasComoParticipante (desc) — etapas distintas em que é executor ou integrante
   *  4) nome (asc, alfabético)
   */
  async ranking() {
    const [usuarios, etapasExecutor, integrantesRows, entregasCounts] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { ativo: true },
        select: {
          id: true,
          nome: true,
          fotoUrl: true,
          pontosTarefas: true,
          cargo: { select: { nome: true } },
        },
        orderBy: [
          { pontosTarefas: 'desc' },
          { nome: 'asc' },
        ],
      }),
      this.prisma.etapa.findMany({ select: { id: true, executorId: true } }),
      this.prisma.etapaIntegrante.findMany({ select: { etapaId: true, usuarioId: true } }),
      this.prisma.checklistItemEntrega.groupBy({
        by: ['executorId'],
        where: { status: 'APROVADO' },
        _count: { id: true },
      }),
    ]);

    /** Usuário → ids de etapas em que participa (executor e/ou integrante), sem duplicar etapa. */
    const etapasPorUsuario = new Map<number, Set<number>>();
    const marcar = (usuarioId: number, etapaId: number) => {
      let set = etapasPorUsuario.get(usuarioId);
      if (!set) {
        set = new Set<number>();
        etapasPorUsuario.set(usuarioId, set);
      }
      set.add(etapaId);
    };
    for (const e of etapasExecutor) {
      marcar(e.executorId, e.id);
    }
    for (const row of integrantesRows) {
      marcar(row.usuarioId, row.etapaId);
    }

    const entregasMap = new Map(
      entregasCounts.map((r) => [r.executorId, r._count.id]),
    );

    const rows = usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      fotoUrl: u.fotoUrl,
      cargo: u.cargo?.nome ?? '',
      pontos: u.pontosTarefas,
      totalEntregasAprovadas: entregasMap.get(u.id) ?? 0,
      totalEtapasComoParticipante: etapasPorUsuario.get(u.id)?.size ?? 0,
    }));

    rows.sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.totalEntregasAprovadas !== a.totalEntregasAprovadas)
        return b.totalEntregasAprovadas - a.totalEntregasAprovadas;
      if (b.totalEtapasComoParticipante !== a.totalEtapasComoParticipante)
        return b.totalEtapasComoParticipante - a.totalEtapasComoParticipante;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return rows.map((r, i) => ({ posicao: i + 1, ...r }));
  }

  async changePassword(userId: number, senhaAtual: string, novaSenha: string) {
    const currentUser = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Verificar senha atual
    const passwordMatches = await bcrypt.compare(senhaAtual, currentUser.senha);
    if (!passwordMatches) {
      throw new BadRequestException('Senha atual incorreta');
    }

    // Validar nova senha
    if (novaSenha.trim().length < 6) {
      throw new BadRequestException('Nova senha deve ter no mínimo 6 caracteres');
    }

    // Atualizar senha
    const hashedPassword = await bcrypt.hash(novaSenha.trim(), 10);
    const updatedUser = await this.prisma.usuario.update({
      where: { id: userId },
      data: { senha: hashedPassword },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    return this.mapUserCargoPermissions(updatedUser);
  }

  private getUploadsRoot(): string {
    const uploadsDirEnv = process.env.UPLOADS_DIR;
    if (uploadsDirEnv && !/^https?:\/\//i.test(uploadsDirEnv)) {
      return uploadsDirEnv.startsWith('.') ? join(process.cwd(), uploadsDirEnv) : uploadsDirEnv;
    }
    return join(process.cwd(), 'uploads');
  }

  private getUploadsUrlPrefix(): string {
    return (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');
  }

  /** Remove todas as fotos salvas como profile-{userId}-* (limpeza ao remover foto). */
  private removeAllProfilePhotoVariants(userId: number) {
    const dir = join(this.getUploadsRoot(), 'profiles');
    if (!fs.existsSync(dir)) return;
    const prefix = `profile-${userId}-`;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(prefix)) {
        try {
          fs.unlinkSync(join(dir, name));
        } catch {
          // ignore
        }
      }
    }
  }

  private deleteFileIfLocalUpload(fotoUrl: string | null | undefined) {
    if (!fotoUrl || !fotoUrl.startsWith(`${this.getUploadsUrlPrefix()}/`)) return;
    const relative = fotoUrl.slice(this.getUploadsUrlPrefix().length + 1);
    const abs = join(this.getUploadsRoot(), relative);
    if (abs.startsWith(join(this.getUploadsRoot(), 'profiles'))) {
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {
        // ignore
      }
    }
  }

  async setMyProfilePhoto(userId: number, file: Express.Multer.File | undefined) {
    if (!file?.filename) {
      throw new BadRequestException('Arquivo de imagem é obrigatório');
    }
    await this.findOne(userId);

    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (user?.fotoUrl) {
      this.deleteFileIfLocalUpload(user.fotoUrl);
    }

    const publicUrl = `${this.getUploadsUrlPrefix()}/profiles/${file.filename}`;

    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: { fotoUrl: publicUrl },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    return this.mapUserCargoPermissions(updated);
  }

  async removeMyProfilePhoto(userId: number) {
    await this.findOne(userId);
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (user?.fotoUrl) {
      this.deleteFileIfLocalUpload(user.fotoUrl);
    }
    this.removeAllProfilePhotoVariants(userId);

    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: { fotoUrl: null },
      include: {
        cargo: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
    return this.mapUserCargoPermissions(updated);
  }

  private async assertCpfNotInUse(cpf: string, excludeUserId?: number) {
    const existing = await this.prisma.usuario.findUnique({ where: { cpf } });
    if (existing && existing.id !== excludeUserId) {
      throw new BadRequestException('CPF já cadastrado para outro usuário.');
    }
  }

  private mapUserCargoPermissions(user: any) {
    if (!user) {
      return user;
    }
    if (!user.cargo) {
      const { senha: _s, ...rest } = user;
      return rest;
    }

    const { senha: _omitSenha, ...safeUser } = user;

    const permissions = safeUser.cargo.permissions?.map((relation) => ({
      id: relation.permissionId,
      modulo: relation.permission.modulo,
      acao: relation.permission.acao,
      chave: `${relation.permission.modulo}:${relation.permission.acao}`,
      descricao: relation.permission.descricao,
    })) ?? [];

    return {
      ...safeUser,
      cargo: {
        ...safeUser.cargo,
        permissions,
      },
    };
  }
}
