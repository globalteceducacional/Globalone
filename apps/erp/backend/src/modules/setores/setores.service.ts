import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSetorDto } from './dto/create-setor.dto';
import { UpdateSetorDto } from './dto/update-setor.dto';
import { CreateSetorPatrimonioMaterialDto } from './dto/create-setor-patrimonio-material.dto';
import { UpdateSetorPatrimonioMaterialDto } from './dto/update-setor-patrimonio-material.dto';
import { CreateSetorPatrimonioImaterialDto } from './dto/create-setor-patrimonio-imaterial.dto';
import { UpdateSetorPatrimonioImaterialDto } from './dto/update-setor-patrimonio-imaterial.dto';

const usuarioSetorSelect = {
  id: true,
  nome: true,
  email: true,
  cargo: { select: { id: true, nome: true } },
};

const setorDetailInclude = {
  chefe: { select: { ...usuarioSetorSelect } },
  membros: {
    include: {
      usuario: { select: { ...usuarioSetorSelect } },
    },
  },
  patrimonioMaterial: {
    orderBy: [{ ordem: 'asc' as const }, { id: 'asc' as const }],
    include: {
      usuarioAtribuido: { select: { id: true, nome: true, email: true } },
    },
  },
  patrimonioImaterial: {
    orderBy: [{ ordem: 'asc' as const }, { id: 'asc' as const }],
  },
  _count: {
    select: {
      membros: true,
      projetos: true,
      compras: true,
      curadoriaOrcamentos: true,
    },
  },
};

@Injectable()
export class SetoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listOptions() {
    return this.prisma.setor.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  async findAll(includeInactive = false) {
    return this.prisma.setor.findMany({
      where: includeInactive ? undefined : { ativo: true },
      include: {
        chefe: { select: { id: true, nome: true, email: true } },
        membros: {
          include: {
            usuario: { select: usuarioSetorSelect },
          },
        },
        _count: {
          select: {
            membros: true,
            projetos: true,
            compras: true,
            curadoriaOrcamentos: true,
          },
        },
      },
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: number) {
    const setor = await this.prisma.setor.findUnique({
      where: { id },
      include: setorDetailInclude,
    });

    if (!setor) {
      throw new NotFoundException('Setor não encontrado');
    }

    return setor;
  }

  private async assertUsuarioIntegranteSetor(setorId: number, usuarioId: number) {
    const m = await this.prisma.setorUsuario.findUnique({
      where: { setorId_usuarioId: { setorId, usuarioId } },
    });
    if (!m) {
      throw new BadRequestException('O usuário deve ser integrante deste setor.');
    }
  }

  async create(dto: CreateSetorDto) {
    const nome = dto.nome?.trim();
    if (!nome) {
      throw new BadRequestException('Nome do setor é obrigatório');
    }

    const existing = await this.prisma.setor.findUnique({ where: { nome } });
    if (existing) {
      throw new BadRequestException('Já existe um setor com este nome');
    }

    if (dto.chefeId != null) {
      const u = await this.prisma.usuario.findUnique({ where: { id: dto.chefeId } });
      if (!u) {
        throw new BadRequestException('Chefe informado não encontrado.');
      }
    }

    return this.prisma.setor.create({
      data: {
        nome,
        descricao: dto.descricao?.trim() || null,
        ativo: dto.ativo ?? true,
        chefeId: dto.chefeId ?? undefined,
      },
    });
  }

  async update(id: number, dto: UpdateSetorDto) {
    const current = await this.prisma.setor.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Setor não encontrado');
    }

    const data: Record<string, unknown> = {};

    if (dto.nome !== undefined) {
      const nome = dto.nome?.trim();
      if (!nome) throw new BadRequestException('Nome do setor é obrigatório');
      if (nome !== current.nome) {
        const existing = await this.prisma.setor.findUnique({ where: { nome } });
        if (existing && existing.id !== id) {
          throw new BadRequestException('Já existe um setor com este nome');
        }
      }
      data.nome = nome;
    }

    if (dto.descricao !== undefined) {
      data.descricao = dto.descricao?.trim() || null;
    }

    if (dto.ativo !== undefined) {
      data.ativo = dto.ativo;
    }

    if (dto.chefeId !== undefined) {
      if (dto.chefeId === null) {
        data.chefeId = null;
      } else {
        const u = await this.prisma.usuario.findUnique({ where: { id: dto.chefeId } });
        if (!u) {
          throw new BadRequestException('Chefe informado não encontrado.');
        }
        await this.assertUsuarioIntegranteSetor(id, dto.chefeId);
        data.chefeId = dto.chefeId;
      }
    }

    if (Object.keys(data).length === 0) {
      return this.findOne(id);
    }

    await this.prisma.setor.update({
      where: { id },
      data,
    });

    return this.findOne(id);
  }

  async updateMembers(id: number, userIds: number[] | undefined) {
    await this.findOne(id);
    const ids = Array.isArray(userIds) ? Array.from(new Set(userIds)) : [];

    if (ids.length > 0) {
      const users = await this.prisma.usuario.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (users.length !== ids.length) {
        throw new BadRequestException('Um ou mais usuários informados não existem.');
      }
    }

    const setorRow = await this.prisma.setor.findUnique({
      where: { id },
      select: { chefeId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (setorRow?.chefeId != null && !ids.includes(setorRow.chefeId)) {
        await tx.setor.update({ where: { id }, data: { chefeId: null } });
      }
      await tx.setorUsuario.deleteMany({ where: { setorId: id } });
      if (ids.length > 0) {
        await tx.setorUsuario.createMany({
          data: ids.map((usuarioId) => ({ setorId: id, usuarioId })),
        });
      }
    });

    return this.findOne(id);
  }

  async createPatrimonioMaterial(setorId: number, dto: CreateSetorPatrimonioMaterialDto) {
    await this.findOne(setorId);
    if (dto.usuarioAtribuidoId != null) {
      await this.assertUsuarioIntegranteSetor(setorId, dto.usuarioAtribuidoId);
    }

    const agg = await this.prisma.setorPatrimonioMaterial.aggregate({
      where: { setorId },
      _max: { ordem: true },
    });
    const nextOrdem = (agg._max.ordem ?? 0) + 1;

    return this.prisma.setorPatrimonioMaterial.create({
      data: {
        setorId,
        categoria: dto.categoria,
        nome: dto.nome.trim(),
        quantidade: dto.quantidade ?? null,
        unidade: dto.unidade?.trim() || null,
        especificacao: dto.especificacao?.trim() || null,
        localizacao: dto.localizacao?.trim() || null,
        usuarioAtribuidoId: dto.usuarioAtribuidoId ?? null,
        ordem: nextOrdem,
      },
      include: {
        usuarioAtribuido: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async updatePatrimonioMaterial(setorId: number, itemId: number, dto: UpdateSetorPatrimonioMaterialDto) {
    await this.findOne(setorId);
    const row = await this.prisma.setorPatrimonioMaterial.findFirst({
      where: { id: itemId, setorId },
    });
    if (!row) {
      throw new NotFoundException('Item de patrimônio material não encontrado neste setor.');
    }

    if (dto.usuarioAtribuidoId !== undefined && dto.usuarioAtribuidoId !== null) {
      await this.assertUsuarioIntegranteSetor(setorId, dto.usuarioAtribuidoId);
    }

    const data: Record<string, unknown> = {};
    if (dto.categoria !== undefined) data.categoria = dto.categoria;
    if (dto.nome !== undefined) {
      const n = dto.nome?.trim();
      if (!n) throw new BadRequestException('Nome do item é obrigatório.');
      data.nome = n;
    }
    if (dto.quantidade !== undefined) data.quantidade = dto.quantidade;
    if (dto.unidade !== undefined) data.unidade = dto.unidade?.trim() || null;
    if (dto.especificacao !== undefined) data.especificacao = dto.especificacao?.trim() || null;
    if (dto.localizacao !== undefined) data.localizacao = dto.localizacao?.trim() || null;
    if (dto.usuarioAtribuidoId !== undefined) {
      data.usuarioAtribuidoId = dto.usuarioAtribuidoId;
    }

    if (Object.keys(data).length === 0) {
      return this.prisma.setorPatrimonioMaterial.findUniqueOrThrow({
        where: { id: itemId },
        include: {
          usuarioAtribuido: { select: { id: true, nome: true, email: true } },
        },
      });
    }

    return this.prisma.setorPatrimonioMaterial.update({
      where: { id: itemId },
      data,
      include: {
        usuarioAtribuido: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async removePatrimonioMaterial(setorId: number, itemId: number) {
    await this.findOne(setorId);
    const row = await this.prisma.setorPatrimonioMaterial.findFirst({
      where: { id: itemId, setorId },
    });
    if (!row) {
      throw new NotFoundException('Item de patrimônio material não encontrado neste setor.');
    }
    await this.prisma.setorPatrimonioMaterial.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  async createPatrimonioImaterial(setorId: number, dto: CreateSetorPatrimonioImaterialDto) {
    await this.findOne(setorId);

    const agg = await this.prisma.setorPatrimonioImaterial.aggregate({
      where: { setorId },
      _max: { ordem: true },
    });
    const nextOrdem = (agg._max.ordem ?? 0) + 1;

    let dataValidade: Date | null = null;
    if (dto.dataValidade != null && String(dto.dataValidade).trim() !== '') {
      dataValidade = new Date(dto.dataValidade);
    }

    return this.prisma.setorPatrimonioImaterial.create({
      data: {
        setorId,
        tipo: dto.tipo,
        nome: dto.nome.trim(),
        descricao: dto.descricao?.trim() || null,
        fornecedor: dto.fornecedor?.trim() || null,
        dataValidade,
        observacoes: dto.observacoes?.trim() || null,
        ordem: nextOrdem,
      },
    });
  }

  async updatePatrimonioImaterial(setorId: number, itemId: number, dto: UpdateSetorPatrimonioImaterialDto) {
    await this.findOne(setorId);
    const row = await this.prisma.setorPatrimonioImaterial.findFirst({
      where: { id: itemId, setorId },
    });
    if (!row) {
      throw new NotFoundException('Item de patrimônio imaterial não encontrado neste setor.');
    }

    const data: Record<string, unknown> = {};
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.nome !== undefined) {
      const n = dto.nome?.trim();
      if (!n) throw new BadRequestException('Nome do item é obrigatório.');
      data.nome = n;
    }
    if (dto.descricao !== undefined) data.descricao = dto.descricao?.trim() || null;
    if (dto.fornecedor !== undefined) data.fornecedor = dto.fornecedor?.trim() || null;
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes?.trim() || null;
    if (dto.dataValidade !== undefined) {
      if (dto.dataValidade === null || String(dto.dataValidade).trim() === '') {
        data.dataValidade = null;
      } else {
        data.dataValidade = new Date(dto.dataValidade as string);
      }
    }

    if (Object.keys(data).length === 0) {
      return this.prisma.setorPatrimonioImaterial.findUniqueOrThrow({ where: { id: itemId } });
    }

    return this.prisma.setorPatrimonioImaterial.update({
      where: { id: itemId },
      data,
    });
  }

  async removePatrimonioImaterial(setorId: number, itemId: number) {
    await this.findOne(setorId);
    const row = await this.prisma.setorPatrimonioImaterial.findFirst({
      where: { id: itemId, setorId },
    });
    if (!row) {
      throw new NotFoundException('Item de patrimônio imaterial não encontrado neste setor.');
    }
    await this.prisma.setorPatrimonioImaterial.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  async remove(id: number) {
    const setor = await this.findOne(id);

    const linked = await this.prisma.$transaction([
      this.prisma.projeto.count({ where: { setores: { some: { id } } } }),
      this.prisma.compra.count({ where: { setorId: id } }),
      this.prisma.curadoriaOrcamento.count({ where: { setorId: id } }),
    ]);
    const [projectsCount, purchasesCount, budgetsCount] = linked;

    if (projectsCount + purchasesCount + budgetsCount > 0) {
      throw new BadRequestException(
        `Não é possível excluir o setor "${setor.nome}" porque ele está vinculado a projetos/compras/curadoria.`,
      );
    }

    await this.prisma.setorUsuario.deleteMany({ where: { setorId: id } });
    await this.prisma.setor.delete({ where: { id } });

    return { deleted: true };
  }
}
