import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriaCompraTipo } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tipo?: CategoriaCompraTipo) {
    return this.prisma.categoriaCompra.findMany({
      where: { ativo: true, ...(tipo ? { tipo } : {}) },
      orderBy: { nome: 'asc' },
    });
  }

  async findAllIncludingInactive(tipo?: CategoriaCompraTipo) {
    return this.prisma.categoriaCompra.findMany({
      where: tipo ? { tipo } : undefined,
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: number) {
    const categoria = await this.prisma.categoriaCompra.findUnique({
      where: { id },
    });

    if (!categoria) {
      throw new NotFoundException(`Categoria com ID ${id} não encontrada`);
    }

    return categoria;
  }

  private assertCategoriaTipoExclusivo(isAssinatura?: boolean, isDespesa?: boolean) {
    if (isAssinatura && isDespesa) {
      throw new BadRequestException(
        'Uma categoria não pode ser assinatura mensal e despesa operacional ao mesmo tempo.',
      );
    }
  }

  async create(data: CreateCategoryDto) {
    const tipo = data.tipo ?? CategoriaCompraTipo.ITEM;
    const isAssinatura = data.isAssinatura ?? false;
    const isDespesa = data.isDespesa ?? false;
    this.assertCategoriaTipoExclusivo(isAssinatura, isDespesa);

    // Verificar se nome já existe
    const existingCategory = await this.prisma.categoriaCompra.findFirst({
      where: { nome: data.nome, tipo },
    });

    if (existingCategory) {
      throw new BadRequestException('Já existe uma categoria com este nome');
    }

    const semEstoque = isAssinatura || isDespesa;

    return this.prisma.categoriaCompra.create({
      data: {
        nome: data.nome,
        descricao: data.descricao,
        ativo: data.ativo ?? true,
        tipo,
        entraNoEstoque: semEstoque ? false : (data.entraNoEstoque ?? true),
        permiteAlocacao: semEstoque ? false : (data.permiteAlocacao ?? true),
        isAssinatura,
        isDespesa,
        recorrenciaMensal: isAssinatura ? true : (data.recorrenciaMensal ?? false),
      } as any,
    } as any);
  }

  async update(id: number, data: UpdateCategoryDto) {
    const categoria = await this.findOne(id);
    const nextTipo = data.tipo ?? categoria.tipo;
    const nextNome = data.nome ?? categoria.nome;

    // Se estiver atualizando o nome, verificar se já existe
    if (nextNome !== categoria.nome || nextTipo !== categoria.tipo) {
      const existingCategory = await this.prisma.categoriaCompra.findFirst({
        where: {
          nome: nextNome,
          tipo: nextTipo,
          id: { not: id },
        },
      });

      if (existingCategory) {
        throw new BadRequestException('Já existe uma categoria com este nome');
      }
    }

    const nextAssinatura = data.isAssinatura ?? categoria.isAssinatura;
    const nextDespesa = data.isDespesa ?? (categoria as any).isDespesa ?? false;
    this.assertCategoriaTipoExclusivo(nextAssinatura, nextDespesa);

    return this.prisma.categoriaCompra.update({
      where: { id },
      data: {
        ...data,
        ...(nextAssinatura === true
          ? {
              entraNoEstoque: false,
              permiteAlocacao: false,
              isDespesa: false,
              recorrenciaMensal: true,
            }
          : {}),
        ...(nextDespesa === true
          ? {
              entraNoEstoque: false,
              permiteAlocacao: false,
              isAssinatura: false,
              recorrenciaMensal: false,
            }
          : {}),
        dataAtualizacao: new Date(),
      } as any,
    } as any);
  }

  async remove(id: number) {
    await this.findOne(id);

    // Verificar se há compras usando esta categoria
    const comprasComCategoria = await this.prisma.compra.count({
      where: { categoriaId: id },
    });

    if (comprasComCategoria > 0) {
      throw new BadRequestException(
        `Não é possível excluir esta categoria. Existem ${comprasComCategoria} compra(s) vinculada(s) a ela. Desative a categoria ao invés de excluí-la.`,
      );
    }

    return this.prisma.categoriaCompra.delete({
      where: { id },
    });
  }

  async toggleActive(id: number) {
    const categoria = await this.findOne(id);

    return this.prisma.categoriaCompra.update({
      where: { id },
      data: {
        ativo: !categoria.ativo,
        dataAtualizacao: new Date(),
      },
    });
  }
}
