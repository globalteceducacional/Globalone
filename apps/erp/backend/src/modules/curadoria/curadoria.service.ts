import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CompraStatus, CuradoriaDescontoAplicadoEm } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCuradoriaItemDto, CreateCuradoriaOrcamentoDto } from './dto/create-curadoria-orcamento.dto';
import { ImportCuradoriaXlsxDto } from './dto/import-curadoria-xlsx.dto';
import { UpdateCuradoriaOrcamentoDto } from './dto/update-curadoria-orcamento.dto';
import { UpdateCuradoriaItemDto } from './dto/update-curadoria-item.dto';

@Injectable()
export class CuradoriaService {
  private static readonly STOCK_INTERNAL_MARKER_PREFIX = '[AUTO_ESTOQUE_';
  private readonly logger = new Logger(CuradoriaService.name);
  private static readonly STOCK_PRESERVE_MARKER = '[AUTO_ESTOQUE_PRESERVADO]';

  constructor(private readonly prisma: PrismaService) {}

  /** Chave estável ISBN + gênero (alinha curadoria ao galpão: reservas e avarias). */
  private estoqueCuradoriaGroupKey(isbnRaw: string, categoriaId: number | null | undefined): string {
    const isbn = String(isbnRaw ?? '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase()
      .slice(0, 30);
    return `${isbn}::${categoriaId ?? 'null'}`;
  }

  private async resolveItemName(
    nome: string | undefined,
    isbnRaw: string,
    cachedBookData?: { titulo?: string | null },
  ): Promise<string> {
    const trimmedName = String(nome ?? '').trim();
    if (trimmedName) return trimmedName.slice(0, 180);

    if (cachedBookData?.titulo?.trim()) {
      return cachedBookData.titulo.trim().slice(0, 180);
    }

    const isbn = String(isbnRaw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
    if (isbn.length === 10 || isbn.length === 13) {
      try {
        const book = await this.fetchBookByIsbn(isbn);
        if (book?.titulo?.trim()) {
          return book.titulo.trim().slice(0, 180);
        }
      } catch {
        // Se a busca por ISBN falhar, geramos um nome padrão.
      }
    }

    return `Livro ISBN ${isbn || 'não informado'}`.slice(0, 180);
  }

  private normalizeHeader(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  private parseNumber(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const raw = String(value).trim();
    let normalized = raw;
    if (raw.includes(',') && raw.includes('.')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      normalized = raw.replace(',', '.');
    }
    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
  }

  private buildDiscountsByTotal(values: number[], descontoTotal: number): number[] {
    const subtotal = values.reduce((sum, value) => sum + value, 0);
    if (subtotal <= 0 || descontoTotal <= 0) {
      return values.map(() => 0);
    }

    const discounts = values.map((value) => Number(((value / subtotal) * descontoTotal).toFixed(2)));
    const sum = discounts.reduce((acc, value) => acc + value, 0);
    const diff = Number((descontoTotal - sum).toFixed(2));
    if (diff !== 0 && discounts.length > 0) {
      discounts[discounts.length - 1] = Number((discounts[discounts.length - 1] + diff).toFixed(2));
    }
    return discounts;
  }

  private async ensureProjectExists(id?: number) {
    if (!id) return;
    const project = await this.prisma.projeto.findUnique({ where: { id }, select: { id: true } });
    if (!project) throw new BadRequestException('Projeto não encontrado.');
  }

  private async ensureSupplierExists(id?: number | null) {
    if (!id) return;
    const supplier = await this.prisma.fornecedor.findUnique({ where: { id }, select: { id: true } });
    if (!supplier) throw new BadRequestException('Fornecedor não encontrado.');
  }

  private async ensureSetorExists(id?: number | null) {
    if (!id) return;
    const setor = await this.prisma.setor.findUnique({ where: { id }, select: { id: true } });
    if (!setor) throw new BadRequestException('Setor não encontrado.');
  }

  private async ensureCategoriesExist(categoryIds: number[]) {
    if (!categoryIds.length) return;
    const uniqueCategoryIds = Array.from(new Set(categoryIds));
    const categories = await this.prisma.categoriaCompra.findMany({
      where: { id: { in: uniqueCategoryIds }, tipo: 'LIVRO' },
      select: { id: true },
    });
    if (categories.length !== uniqueCategoryIds.length) {
      throw new BadRequestException('Um ou mais itens possuem gênero literário inválido.');
    }
  }

  async listCotacoesByIsbn(isbnRaw: string) {
    const isbn = String(isbnRaw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!isbn) {
      throw new BadRequestException('ISBN é obrigatório.');
    }

    const items = await this.prisma.curadoriaItem.findMany({
      where: {
        isbn,
        orcamento: {
          status: CompraStatus.ENTREGUE,
        },
      },
      include: {
        categoria: { select: { id: true, nome: true } },
        orcamento: {
          select: {
            id: true,
            nome: true,
            fornecedorId: true,
            fornecedor: { select: { nomeFantasia: true, razaoSocial: true } },
            dataCriacao: true,
            projeto: { select: { id: true, nome: true } },
          },
        },
      },
      orderBy: [{ valorLiquido: 'asc' }, { valor: 'asc' }],
    });

    return items.map((item) => ({
      itemId: item.id,
      orcamentoId: item.orcamento.id,
      orcamentoNome: item.orcamento.nome,
      fornecedorId: item.orcamento.fornecedorId ?? null,
      fornecedorNome: item.orcamento.fornecedor?.nomeFantasia ?? item.orcamento.fornecedor?.razaoSocial ?? null,
      dataCriacao: item.orcamento.dataCriacao,
      projetoId: item.orcamento.projeto?.id ?? null,
      projetoNome: item.orcamento.projeto?.nome ?? null,
      categoriaId: item.categoriaId ?? null,
      categoriaNome: item.categoria?.nome ?? null,
      quantidade: item.quantidade,
      valor: item.valor,
      desconto: item.desconto,
      valorLiquido: item.valorLiquido,
    }));
  }

  async listEstoqueCuradoria(search?: string) {
    const where: any = {
      orcamento: {
        status: CompraStatus.ENTREGUE,
      },
    };

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { nome: { contains: term, mode: 'insensitive' } },
        { isbn: { contains: term, mode: 'insensitive' } },
        { categoria: { nome: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const items = await this.prisma.curadoriaItem.findMany({
      where,
      include: {
        categoria: { select: { id: true, nome: true } },
      },
      orderBy: { nome: 'asc' },
    });

    type GroupKey = string;
    const grouped = new Map<
      GroupKey,
      {
        isbn: string;
        nome: string;
        categoriaId: number | null;
        categoriaNome: string | null;
        quantidadeTotal: number;
        valorMedio: number;
        valorTotal: number;
        descontoMedio: number;
        totalDesconto: number;
        autor?: string | null;
        editora?: string | null;
        anoPublicacao?: string | null;
      }
    >();

    for (const item of items) {
      const key = this.estoqueCuradoriaGroupKey(item.isbn, item.categoriaId ?? null);
      const existing = grouped.get(key);
      const quantidade = item.quantidade || 1;
      const valorUnitario = item.valorLiquido ?? item.valor;
      const valorTotalItem = Number((valorUnitario * quantidade).toFixed(2));
      const descontoUnitario = item.desconto ?? 0;
      const descontoTotalItem = Number((descontoUnitario * quantidade).toFixed(2));

      if (!existing) {
        grouped.set(key, {
          isbn: item.isbn,
          nome: item.nome,
          categoriaId: item.categoriaId ?? null,
          categoriaNome: item.categoria?.nome ?? null,
          quantidadeTotal: quantidade,
          valorMedio: Number(valorUnitario.toFixed(2)),
          valorTotal: valorTotalItem,
          descontoMedio: descontoUnitario,
          totalDesconto: descontoTotalItem,
          autor: item.autor,
          editora: item.editora,
          anoPublicacao: item.anoPublicacao,
        });
      } else {
        const novaQuantidade = existing.quantidadeTotal + quantidade;
        const novoValorTotal = Number((existing.valorTotal + valorTotalItem).toFixed(2));
        const novoTotalDesconto = Number((existing.totalDesconto + descontoTotalItem).toFixed(2));
        const novoValorMedio = novaQuantidade > 0 ? Number((novoValorTotal / novaQuantidade).toFixed(2)) : 0;
        const novoDescontoMedio =
          novaQuantidade > 0 ? Number((novoTotalDesconto / novaQuantidade).toFixed(2)) : 0;

        grouped.set(key, {
          ...existing,
          quantidadeTotal: novaQuantidade,
          valorTotal: novoValorTotal,
          valorMedio: novoValorMedio,
          totalDesconto: novoTotalDesconto,
          descontoMedio: novoDescontoMedio,
          autor: existing.autor || item.autor,
          editora: existing.editora || item.editora,
          anoPublicacao: existing.anoPublicacao || item.anoPublicacao,
        });
      }
    }

    const [reservasAll, avariasAll] = await Promise.all([
      this.prisma.galpaoProdutoLivroReserva.findMany({
        select: { isbn: true, categoriaId: true, quantidade: true },
      }),
      this.prisma.galpaoLivroAvaria.findMany({
        select: { isbn: true, categoriaId: true, quantidade: true },
      }),
    ]);

    const resMap = new Map<string, number>();
    for (const r of reservasAll) {
      const k = this.estoqueCuradoriaGroupKey(r.isbn, r.categoriaId ?? null);
      resMap.set(k, (resMap.get(k) ?? 0) + r.quantidade);
    }
    const avMap = new Map<string, number>();
    for (const a of avariasAll) {
      const k = this.estoqueCuradoriaGroupKey(a.isbn, a.categoriaId ?? null);
      avMap.set(k, (avMap.get(k) ?? 0) + a.quantidade);
    }

    return Array.from(grouped.values())
      .map((item) => {
        const k = this.estoqueCuradoriaGroupKey(item.isbn, item.categoriaId);
        const quantidadeAlocada = resMap.get(k) ?? 0;
        const quantidadeAvariadaTotal = avMap.get(k) ?? 0;
        const quantidadeDisponivel = Math.max(0, item.quantidadeTotal - quantidadeAlocada);
        return {
          isbn: item.isbn,
          nome: item.nome,
          categoriaId: item.categoriaId,
          categoriaNome: item.categoriaNome,
          quantidadeTotal: item.quantidadeTotal,
          quantidadeAlocada,
          quantidadeDisponivel,
          quantidadeAvariadaTotal,
          valorMedio: item.valorMedio,
          valorTotal: item.valorTotal,
          descontoMedio: item.descontoMedio,
          autor: item.autor,
          editora: item.editora,
          anoPublicacao: item.anoPublicacao,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  /** Detalhe das avarias de livro (almoxarifado) para o par ISBN + gênero — motivos e quantidades. */
  async listLivroAvariasCuradoria(isbnRaw: string, categoriaId: number | null) {
    const isbn = String(isbnRaw ?? '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase()
      .slice(0, 30);
    if (!isbn) {
      throw new BadRequestException('ISBN é obrigatório.');
    }

    const where = {
      isbn,
      categoriaId: categoriaId ?? null,
    };

    return this.prisma.galpaoLivroAvaria.findMany({
      where,
      orderBy: { dataCriacao: 'desc' },
      select: {
        id: true,
        quantidade: true,
        justificativa: true,
        dataCriacao: true,
        galpaoProduto: { select: { id: true, nome: true } },
        projeto: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
      },
    });
  }

  async clearEstoqueCuradoria(isbnRaw: string, categoriaId?: number) {
    const isbn = String(isbnRaw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!isbn) {
      throw new BadRequestException('ISBN é obrigatório.');
    }

    const where: any = {
      isbn,
      orcamento: {
        status: CompraStatus.ENTREGUE,
      },
    };
    if (categoriaId !== undefined && categoriaId !== null) {
      where.categoriaId = categoriaId;
    }

    const existingCount = await this.prisma.curadoriaItem.count({ where });
    if (!existingCount) {
      throw new NotFoundException('Nenhum item encontrado no estoque para o ISBN/gênero informado.');
    }

    const deleted = await this.prisma.curadoriaItem.deleteMany({ where });
    return {
      deleted: deleted.count,
      message: 'Itens removidos do estoque de curadoria para o ISBN/gênero informado.',
    };
  }

  async listOrcamentos(search?: string) {
    const where = search?.trim()
      ? {
          OR: [
            { nome: { contains: search.trim(), mode: 'insensitive' as const } },
            { observacao: { contains: search.trim(), mode: 'insensitive' as const } },
            { projeto: { nome: { contains: search.trim(), mode: 'insensitive' as const } } },
          ],
        }
      : undefined;

    const budgets = await this.prisma.curadoriaOrcamento.findMany({
      where,
      include: {
        projeto: { select: { id: true, nome: true } },
        setor: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true } },
        _count: { select: { itens: true } },
        itens: { select: { valor: true, desconto: true, valorLiquido: true, quantidade: true } },
      },
      orderBy: { dataCriacao: 'desc' },
    });

    const visibleBudgets = budgets.filter(
      (budget) =>
        !String(budget.observacao ?? '').includes(CuradoriaService.STOCK_INTERNAL_MARKER_PREFIX),
    );

    return visibleBudgets.map((budget) => {
      const totalQuantidade = budget.itens.reduce((sum, item) => sum + item.quantidade, 0);
      const totalBruto = Number(
        budget.itens.reduce((sum, item) => sum + item.valor * item.quantidade, 0).toFixed(2),
      );
      const totalDesconto = Number(
        budget.itens.reduce((sum, item) => sum + item.desconto * item.quantidade, 0).toFixed(2),
      );
      const totalLiquido = Number(
        budget.itens.reduce((sum, item) => sum + item.valorLiquido * item.quantidade, 0).toFixed(2),
      );
      return {
        id: budget.id,
        nome: budget.nome,
        observacao: budget.observacao,
        projetoId: budget.projetoId,
        projeto: budget.projeto,
        setorId: (budget as any).setorId ?? null,
        setor: (budget as any).setor ?? null,
        fornecedorId: budget.fornecedorId,
        fornecedor: budget.fornecedor,
        nfUrl: budget.nfUrl,
        arquivoOrcamentoUrl: budget.arquivoOrcamentoUrl,
        comprovantePagamentoUrl: budget.comprovantePagamentoUrl,
        formaPagamento: budget.formaPagamento,
        status: budget.status,
        descontoAplicadoEm: budget.descontoAplicadoEm,
        descontoTotal: budget.descontoTotal,
        dataCriacao: budget.dataCriacao,
        dataAtualizacao: budget.dataAtualizacao,
        totalItens: budget._count.itens,
        totalQuantidade,
        totalBruto,
        totalDesconto,
        totalLiquido,
      };
    });
  }

  async getOrcamentoById(id: number) {
    const budget = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id },
      include: {
        projeto: { select: { id: true, nome: true } },
        setor: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true } },
        criadoPor: { select: { id: true, nome: true } },
        itens: {
          include: {
            categoria: { select: { id: true, nome: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!budget) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }

    const totalBruto = Number(
      budget.itens.reduce((sum, item) => sum + item.valor * item.quantidade, 0).toFixed(2),
    );
    const totalDesconto = Number(
      budget.itens.reduce((sum, item) => sum + item.desconto * item.quantidade, 0).toFixed(2),
    );
    const totalLiquido = Number(
      budget.itens.reduce((sum, item) => sum + item.valorLiquido * item.quantidade, 0).toFixed(2),
    );

    return {
      ...budget,
      totalBruto,
      totalDesconto,
      totalLiquido,
    };
  }

  private async createOrcamentoInternal(
    input: {
      nome: string;
      projetoId?: number;
      setorId?: number | null;
      fornecedorId?: number;
      nfUrl?: string;
      arquivoOrcamentoUrl?: string;
      comprovantePagamentoUrl?: string;
      formaPagamento?: string;
      status?: CompraStatus;
      observacao?: string;
      descontoAplicadoEm: CuradoriaDescontoAplicadoEm;
      descontoTotal?: number;
      itens: CreateCuradoriaItemDto[];
      criadoPorId: number;
    },
  ) {
    if (!input.itens.length) {
      throw new BadRequestException('Informe ao menos um item no orçamento.');
    }

    await this.ensureProjectExists(input.projetoId);
    await this.ensureSetorExists(input.setorId ?? undefined);
    await this.ensureSupplierExists(input.fornecedorId);
    await this.ensureCategoriesExist(
      input.itens.map((item) => item.categoriaId).filter((id): id is number => Boolean(id)),
    );

    if (input.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.TOTAL && (input.descontoTotal ?? 0) < 0) {
      throw new BadRequestException('Desconto total inválido.');
    }

    const normalizedItems = await Promise.all(
      input.itens.map(async (item) => {
        const isbn = String(item.isbn ?? '').replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 30);
        if (!isbn) {
          throw new BadRequestException('ISBN é obrigatório para todos os livros.');
        }
        const nome = await this.resolveItemName(item.nome, isbn);
        return {
          ...item,
          nome,
          isbn,
        };
      }),
    );

    const lineTotals = normalizedItems.map((item) => Number(item.valor) * Number(item.quantidade));
    const discounts =
      input.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.TOTAL
        ? this.buildDiscountsByTotal(lineTotals, Number(input.descontoTotal ?? 0)).map(
            (lineDiscount, index) => {
              const quantity = Number(normalizedItems[index]?.quantidade ?? 1);
              return Number((lineDiscount / Math.max(1, quantity)).toFixed(2));
            },
          )
        : normalizedItems.map((item) => Number(item.desconto ?? 0));

    const created = await this.prisma.curadoriaOrcamento.create({
      data: {
        nome: input.nome.trim(),
        projetoId: input.projetoId ?? null,
        setorId: input.setorId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        nfUrl: input.nfUrl?.trim() || null,
        arquivoOrcamentoUrl: input.arquivoOrcamentoUrl?.trim() || null,
        comprovantePagamentoUrl: input.comprovantePagamentoUrl?.trim() || null,
        formaPagamento: input.formaPagamento?.trim() || null,
        status: input.status ?? 'PENDENTE',
        observacao: input.observacao?.trim() || null,
        descontoAplicadoEm: input.descontoAplicadoEm,
        descontoTotal: Number(input.descontoTotal ?? 0),
        criadoPorId: input.criadoPorId,
        itens: {
          create: normalizedItems.map((item, index) => {
            const desconto = Number(discounts[index] ?? 0);
            const valor = Number(item.valor);
            return {
              nome: item.nome,
              isbn: item.isbn,
              quantidade: Number(item.quantidade || 1),
              categoriaId: item.categoriaId ?? null,
              valor,
              desconto,
              valorLiquido: Number(Math.max(0, valor - desconto).toFixed(2)),
              autor: item.autor?.trim() || null,
              editora: item.editora?.trim() || null,
              anoPublicacao: item.anoPublicacao?.trim() || null,
            };
          }),
        },
      },
      include: {
        _count: { select: { itens: true } },
      },
    });

    return {
      id: created.id,
      nome: created.nome,
      totalItens: input.itens.length,
      message: 'Orçamento de curadoria criado com sucesso.',
    };
  }

  async createOrcamento(dto: CreateCuradoriaOrcamentoDto, userId: number) {
    return this.createOrcamentoInternal({
      nome: dto.nome,
      projetoId: dto.projetoId,
      setorId: dto.setorId ?? null,
      fornecedorId: dto.fornecedorId,
      nfUrl: dto.nfUrl,
      arquivoOrcamentoUrl: dto.arquivoOrcamentoUrl,
      comprovantePagamentoUrl: dto.comprovantePagamentoUrl,
      formaPagamento: dto.formaPagamento,
      status: dto.status,
      observacao: dto.observacao,
      descontoAplicadoEm: dto.descontoAplicadoEm,
      descontoTotal: dto.descontoTotal,
      itens: dto.itens,
      criadoPorId: userId,
    });
  }

  async deleteOrcamento(id: number, deleteStock = false) {
    const existing = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id },
      include: { itens: true },
    });
    if (!existing) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }

    const isDelivered = existing.status === CompraStatus.ENTREGUE;
    const hasStockItems = Array.isArray(existing.itens) && existing.itens.length > 0;
    const shouldPreserveStock = !deleteStock && isDelivered && hasStockItems;

    if (shouldPreserveStock) {
      await this.prisma.curadoriaOrcamento.update({
        where: { id },
        data: {
          nome: `Estoque preservado - ${existing.nome}`,
          observacao: `${CuradoriaService.STOCK_PRESERVE_MARKER} Origem orçamento #${existing.id}`,
          projetoId: existing.projetoId ?? null,
          setorId: existing.setorId ?? null,
          fornecedorId: existing.fornecedorId ?? null,
          status: CompraStatus.ENTREGUE,
        },
      });
    } else {
      await this.prisma.curadoriaOrcamento.delete({ where: { id } });
    }

    if (shouldPreserveStock) {
      return {
        message: `Orçamento "${existing.nome}" excluído com sucesso. Itens de estoque foram preservados.`,
      };
    }

    return { message: `Orçamento "${existing.nome}" excluído com sucesso.` };
  }

  async updateOrcamento(id: number, dto: UpdateCuradoriaOrcamentoDto) {
    const budget = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id },
      include: {
        itens: {
          select: {
            id: true,
            valor: true,
            quantidade: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!budget) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.projetoId !== undefined) {
      await this.ensureProjectExists(dto.projetoId ?? undefined);
      data.projetoId = dto.projetoId ?? null;
    }
    if (dto.setorId !== undefined) {
      await this.ensureSetorExists(dto.setorId ?? undefined);
      data.setorId = dto.setorId ?? null;
    }
    if (dto.fornecedorId !== undefined) {
      await this.ensureSupplierExists(dto.fornecedorId ?? undefined);
      data.fornecedorId = dto.fornecedorId ?? null;
    }
    if (dto.nfUrl !== undefined) data.nfUrl = dto.nfUrl.trim() || null;
    if (dto.arquivoOrcamentoUrl !== undefined) data.arquivoOrcamentoUrl = dto.arquivoOrcamentoUrl.trim() || null;
    if (dto.comprovantePagamentoUrl !== undefined) {
      data.comprovantePagamentoUrl = dto.comprovantePagamentoUrl.trim() || null;
    }
    if (dto.formaPagamento !== undefined) data.formaPagamento = dto.formaPagamento.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.observacao !== undefined) data.observacao = dto.observacao.trim() || null;
    const nextDiscountMode =
      dto.descontoAplicadoEm !== undefined
        ? dto.descontoAplicadoEm
        : (budget.descontoAplicadoEm as CuradoriaDescontoAplicadoEm);
    const nextDiscountTotal =
      dto.descontoTotal !== undefined ? Number(dto.descontoTotal) : Number(budget.descontoTotal ?? 0);

    if (nextDiscountTotal < 0) {
      throw new BadRequestException('Desconto total inválido.');
    }

    data.descontoAplicadoEm = nextDiscountMode;
    data.descontoTotal = nextDiscountMode === CuradoriaDescontoAplicadoEm.TOTAL ? nextDiscountTotal : 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.curadoriaOrcamento.update({
        where: { id },
        data,
      });

      if (nextDiscountMode === CuradoriaDescontoAplicadoEm.TOTAL && budget.itens.length > 0) {
        const lineTotals = budget.itens.map((item) => Number(item.valor) * Number(item.quantidade));
        const lineDiscounts = this.buildDiscountsByTotal(lineTotals, nextDiscountTotal);

        for (let index = 0; index < budget.itens.length; index += 1) {
          const item = budget.itens[index];
          const quantity = Math.max(1, Number(item.quantidade || 1));
          const perUnitDiscount = Number(((lineDiscounts[index] ?? 0) / quantity).toFixed(2));
          const value = Number(item.valor);

          await tx.curadoriaItem.update({
            where: { id: item.id },
            data: {
              desconto: perUnitDiscount,
              valorLiquido: Number(Math.max(0, value - perUnitDiscount).toFixed(2)),
            },
          });
        }
      }
    });

    return this.getOrcamentoById(id);
  }

  async updateItem(orcamentoId: number, itemId: number, dto: UpdateCuradoriaItemDto) {
    const budget = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id: orcamentoId },
      select: { id: true, descontoAplicadoEm: true, descontoTotal: true },
    });
    if (!budget) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }

    const item = await this.prisma.curadoriaItem.findFirst({
      where: { id: itemId, orcamentoId },
    });
    if (!item) {
      throw new NotFoundException('Item de curadoria não encontrado neste orçamento.');
    }

    const data: any = {};
    if (dto.nome !== undefined) {
      const isbnForName = dto.isbn !== undefined ? dto.isbn : item.isbn;
      data.nome = await this.resolveItemName(dto.nome, isbnForName);
    }
    if (dto.isbn !== undefined) {
      const cleanedIsbn = dto.isbn.replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 30);
      if (!cleanedIsbn) {
        throw new BadRequestException('ISBN é obrigatório.');
      }
      data.isbn = cleanedIsbn;
      if (dto.nome === undefined && !item.nome?.trim()) {
        data.nome = await this.resolveItemName(undefined, cleanedIsbn);
      }
    }
    if (dto.categoriaId !== undefined) {
      const category = await this.prisma.categoriaCompra.findFirst({
        where: { id: dto.categoriaId, tipo: 'LIVRO' },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException('Gênero literário inválido.');
      }
      data.categoriaId = dto.categoriaId;
    }
    if (dto.quantidade !== undefined) data.quantidade = dto.quantidade;
    if (dto.valor !== undefined) data.valor = Number(dto.valor);
    if (dto.desconto !== undefined) data.desconto = Number(dto.desconto);
    if (dto.autor !== undefined) data.autor = dto.autor.trim() || null;
    if (dto.editora !== undefined) data.editora = dto.editora.trim() || null;
    if (dto.anoPublicacao !== undefined) data.anoPublicacao = dto.anoPublicacao.trim() || null;

    if (dto.valor !== undefined || dto.desconto !== undefined) {
      const valor = dto.valor !== undefined ? Number(dto.valor) : Number(item.valor);
      const desconto = dto.desconto !== undefined ? Number(dto.desconto) : Number(item.desconto);
      data.valorLiquido = Number(Math.max(0, valor - desconto).toFixed(2));
    }

    await this.prisma.curadoriaItem.update({
      where: { id: itemId },
      data,
    });

    if (budget.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.TOTAL) {
      const items = await this.prisma.curadoriaItem.findMany({
        where: { orcamentoId },
        select: { id: true, valor: true, quantidade: true },
        orderBy: { id: 'asc' },
      });

      const lineTotals = items.map((currentItem) => Number(currentItem.valor) * Number(currentItem.quantidade));
      const lineDiscounts = this.buildDiscountsByTotal(lineTotals, Number(budget.descontoTotal ?? 0));

      await this.prisma.$transaction(
        items.map((currentItem, index) => {
          const quantity = Math.max(1, Number(currentItem.quantidade || 1));
          const perUnitDiscount = Number(((lineDiscounts[index] ?? 0) / quantity).toFixed(2));
          const value = Number(currentItem.valor);
          return this.prisma.curadoriaItem.update({
            where: { id: currentItem.id },
            data: {
              desconto: perUnitDiscount,
              valorLiquido: Number(Math.max(0, value - perUnitDiscount).toFixed(2)),
            },
          });
        }),
      );
    }

    return this.getOrcamentoById(orcamentoId);
  }

  async addItem(orcamentoId: number, dto: CreateCuradoriaItemDto) {
    const budget = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id: orcamentoId },
      select: {
        id: true,
        descontoAplicadoEm: true,
        descontoTotal: true,
      },
    });
    if (!budget) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }

    const cleanedIsbn = String(dto.isbn ?? '').replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 30);
    if (!cleanedIsbn) {
      throw new BadRequestException('ISBN do item é obrigatório.');
    }

    await this.ensureCategoriesExist(
      [dto.categoriaId].filter((id): id is number => typeof id === 'number'),
    );

    const resolvedName = await this.resolveItemName(dto.nome, cleanedIsbn);

    const createdItem = await this.prisma.curadoriaItem.create({
      data: {
        orcamentoId,
        nome: resolvedName,
        isbn: cleanedIsbn,
        quantidade: Number(dto.quantidade || 1),
        categoriaId: dto.categoriaId ?? null,
        valor: Number(dto.valor),
        desconto:
          budget.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.ITEM
            ? Number(dto.desconto ?? 0)
            : 0,
        valorLiquido:
          budget.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.ITEM
            ? Number(
                Math.max(
                  0,
                  Number(dto.valor) - Number(dto.desconto ?? 0),
                ).toFixed(2),
              )
            : Number(Number(dto.valor).toFixed(2)),
        autor: dto.autor?.trim() || null,
        editora: dto.editora?.trim() || null,
        anoPublicacao: dto.anoPublicacao?.trim() || null,
      },
    });

    if (budget.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.TOTAL) {
      const items = await this.prisma.curadoriaItem.findMany({
        where: { orcamentoId },
        select: { id: true, valor: true, quantidade: true },
        orderBy: { id: 'asc' },
      });
      const lineTotals = items.map((item) => Number(item.valor) * Number(item.quantidade));
      const lineDiscounts = this.buildDiscountsByTotal(
        lineTotals,
        Number(budget.descontoTotal ?? 0),
      );

      await this.prisma.$transaction(
        items.map((item, index) => {
          const quantity = Math.max(1, Number(item.quantidade || 1));
          const perUnitDiscount = Number(((lineDiscounts[index] ?? 0) / quantity).toFixed(2));
          const value = Number(item.valor);
          return this.prisma.curadoriaItem.update({
            where: { id: item.id },
            data: {
              desconto: perUnitDiscount,
              valorLiquido: Number(Math.max(0, value - perUnitDiscount).toFixed(2)),
            },
          });
        }),
      );
    }

    // Apenas para evitar warning de variável não usada em lint mais agressivo
    if (!createdItem) {
      throw new BadRequestException('Falha ao criar item de curadoria.');
    }

    return this.getOrcamentoById(orcamentoId);
  }

  async deleteItem(orcamentoId: number, itemId: number) {
    const budget = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id: orcamentoId },
      select: { id: true, descontoAplicadoEm: true, descontoTotal: true },
    });
    if (!budget) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }

    const item = await this.prisma.curadoriaItem.findFirst({
      where: { id: itemId, orcamentoId },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Item de curadoria não encontrado neste orçamento.');
    }

    await this.prisma.curadoriaItem.delete({ where: { id: itemId } });

    if (budget.descontoAplicadoEm === CuradoriaDescontoAplicadoEm.TOTAL) {
      const items = await this.prisma.curadoriaItem.findMany({
        where: { orcamentoId },
        select: { id: true, valor: true, quantidade: true },
        orderBy: { id: 'asc' },
      });

      if (items.length > 0) {
        const lineTotals = items.map((currentItem) => Number(currentItem.valor) * Number(currentItem.quantidade));
        const lineDiscounts = this.buildDiscountsByTotal(
          lineTotals,
          Number(budget.descontoTotal ?? 0),
        );

        await this.prisma.$transaction(
          items.map((currentItem, index) => {
            const quantity = Math.max(1, Number(currentItem.quantidade || 1));
            const perUnitDiscount = Number(((lineDiscounts[index] ?? 0) / quantity).toFixed(2));
            const value = Number(currentItem.valor);
            return this.prisma.curadoriaItem.update({
              where: { id: currentItem.id },
              data: {
                desconto: perUnitDiscount,
                valorLiquido: Number(Math.max(0, value - perUnitDiscount).toFixed(2)),
              },
            });
          }),
        );
      }
    }

    return this.getOrcamentoById(orcamentoId);
  }

  async importXlsx(fileBuffer: Buffer, dto: ImportCuradoriaXlsxDto, userId: number) {
    const startedAt = Date.now();
    this.logger.log(
      `Iniciando importação de Curadoria XLSX (user=${userId}, projetoId=${dto.projetoId ?? 'null'}, overwriteCurrent=${dto.overwriteCurrent ?? false})`,
    );

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new BadRequestException('Planilha XLSX sem abas válidas.');
    }

    const sheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
    if (!rows.length) {
      throw new BadRequestException('Planilha sem linhas de dados.');
    }

    this.logger.log(
      `Importação Curadoria: primeira aba="${firstSheet}", linhas lidas=${rows.length}`,
    );

    await this.ensureProjectExists(dto.projetoId);

    const categoryNameMap = new Map<string, number>();
    if (!dto.categoriaId) {
      const categories = await this.prisma.categoriaCompra.findMany({
        where: { ativo: true, tipo: 'LIVRO' },
        select: { id: true, nome: true },
      });
      for (const category of categories) {
        categoryNameMap.set(this.normalizeHeader(category.nome), category.id);
      }
    }

    const parsedItems: Array<{
      nome: string;
      isbn: string;
      valor: number;
      quantidade: number;
      desconto: number;
      categoriaId?: number;
      editoraPlanilha?: string;
    }> = [];
    const items: CreateCuradoriaItemDto[] = [];
    const missingTitleIsbns: string[] = [];
    let skipped = 0;

    let processed = 0;
    const logEvery = 50;

    for (const row of rows) {
      const rowMap = new Map<string, unknown>();
      Object.entries(row).forEach(([key, value]) => {
        rowMap.set(this.normalizeHeader(key), value);
      });

      let nome = String(rowMap.get('titulo') ?? rowMap.get('nome') ?? rowMap.get('item') ?? '').trim();
      const isbnRaw = String(rowMap.get('isbn') ?? '').trim();
      const isbn = isbnRaw.replace(/[^0-9Xx]/g, '').toUpperCase();
      const valor = this.parseNumber(rowMap.get('valor') ?? rowMap.get('valorunitario'));
      const descontoValor =
        this.parseNumber(rowMap.get('desconto') ?? rowMap.get('desc') ?? rowMap.get('descontovalor')) ?? 0;
      const descontoPercentual =
        this.parseNumber(
          rowMap.get('descontopercentual') ??
            rowMap.get('desconto_percentual') ??
            rowMap.get('descontoitempercentual') ??
            rowMap.get('descontoporc'),
        ) ?? 0;
      const quantidade =
        this.parseNumber(
          rowMap.get('quantidade') ??
            rowMap.get('qtd') ??
            rowMap.get('qtde') ??
            rowMap.get('qtdpedida'),
        ) ?? 1;
      const editoraPlanilhaRaw = String(
        rowMap.get('editora') ?? rowMap.get('publisher') ?? rowMap.get('publicadora') ?? '',
      ).trim();
      const editoraPlanilha = editoraPlanilhaRaw ? editoraPlanilhaRaw.slice(0, 120) : undefined;
      const categoriaNomeRaw = String(
        rowMap.get('generoliterario') ?? rowMap.get('categoria') ?? rowMap.get('genero') ?? '',
      ).trim();
      const categoriaNomeNormalizado = this.normalizeHeader(categoriaNomeRaw);
      let categoriaId = dto.categoriaId ?? categoryNameMap.get(categoriaNomeNormalizado);

      if (!isbn || valor == null || quantidade <= 0) {
        skipped += 1;
        continue;
      }

      // Criar categoria de LIVRO automaticamente se não existir e não houver categoria padrão
      if (!categoriaId && categoriaNomeNormalizado) {
        const createdCategory = await this.prisma.categoriaCompra.upsert({
          where: {
            nome_tipo: {
              nome: categoriaNomeRaw || 'Livros',
              tipo: 'LIVRO',
            },
          },
          update: { ativo: true },
          create: {
            nome: categoriaNomeRaw || 'Livros',
            descricao: 'Categoria criada automaticamente pela importação de Curadoria.',
            tipo: 'LIVRO',
            ativo: true,
          },
        });
        categoriaId = createdCategory.id;
        categoryNameMap.set(categoriaNomeNormalizado, createdCategory.id);
      }

      let descontoCalculado = Number(descontoValor || 0);
      if (descontoPercentual > 0 && valor != null) {
        const descontoPorcentagem = Number(((Number(valor) * descontoPercentual) / 100).toFixed(2));
        descontoCalculado = descontoPorcentagem;
      }

      parsedItems.push({
        nome: nome.slice(0, 180),
        isbn: isbn.slice(0, 30),
        categoriaId,
        valor,
        quantidade: Math.max(1, Math.floor(quantidade)),
        desconto: descontoCalculado,
        editoraPlanilha,
      });
      processed += 1;
      if (processed % logEvery === 0) {
        this.logger.log(
          `Importação Curadoria: ${processed}/${rows.length} linhas processadas (válidas=${parsedItems.length}, ignoradas=${skipped})`,
        );
      }
    }

    const isbnCache = new Map<string, any | null>();
    const workersCount = Math.max(1, Math.min(8, parsedItems.length));
    let enrichIndex = 0;
    let enriched = 0;

    const enrichWorker = async () => {
      while (true) {
        const currentIndex = enrichIndex;
        enrichIndex += 1;
        if (currentIndex >= parsedItems.length) return;

        const parsed = parsedItems[currentIndex];
        let nome = parsed.nome;
        let autor: string | undefined;
        let editora: string | undefined = parsed.editoraPlanilha;
        let anoPublicacao: string | undefined;

        if (!nome || !parsed.editoraPlanilha) {
          let book = isbnCache.get(parsed.isbn) ?? null;
          if (!isbnCache.has(parsed.isbn)) {
            try {
              book = await this.fetchBookByIsbn(parsed.isbn);
            } catch {
              book = null;
            }
            isbnCache.set(parsed.isbn, book);
          }

          if (book) {
            if (!nome && book.titulo) {
              nome = String(book.titulo).slice(0, 180);
            }
            if (Array.isArray(book.autores) && book.autores.length > 0) {
              autor = book.autores.map((author) => String(author)).join(', ').slice(0, 180);
            }
            if (!editora && book.editora) {
              editora = String(book.editora).slice(0, 120);
            }
            if (book.anoPublicacao) {
              anoPublicacao = String(book.anoPublicacao).slice(0, 20);
            }
          }
        }

        const finalName = (nome || `Livro ISBN ${parsed.isbn}`).slice(0, 180);
        if (!nome) {
          missingTitleIsbns.push(parsed.isbn);
        }

        items[currentIndex] = {
          nome: finalName,
          isbn: parsed.isbn,
          categoriaId: parsed.categoriaId,
          valor: parsed.valor,
          quantidade: parsed.quantidade,
          desconto: parsed.desconto,
          autor,
          editora,
          anoPublicacao,
        };

        enriched += 1;
        if (enriched % logEvery === 0) {
          this.logger.log(
            `Importação Curadoria: enriquecimento ${enriched}/${parsedItems.length} (cache ISBN=${isbnCache.size})`,
          );
        }
      }
    };

    await Promise.all(Array.from({ length: workersCount }, () => enrichWorker()));

    if (!items.length) {
      throw new BadRequestException(
        'Nenhum item válido encontrado. Colunas obrigatórias: isbn, genero_literario, valor.',
      );
    }

    if (dto.overwriteCurrent && dto.projetoId) {
      await this.prisma.curadoriaOrcamento.deleteMany({
        where: { projetoId: dto.projetoId },
      });
    }

    const nomeArquivo =
      dto.nome?.trim() || `Orçamento importado ${new Date().toLocaleDateString('pt-BR')}`;
    const created = await this.createOrcamentoInternal({
      nome: nomeArquivo,
      projetoId: dto.projetoId,
      fornecedorId: dto.fornecedorId ?? undefined,
      observacao: 'Importado via XLSX.',
      status: 'PENDENTE',
      descontoAplicadoEm: dto.descontoAplicadoEm ?? CuradoriaDescontoAplicadoEm.ITEM,
      descontoTotal: dto.descontoTotal ?? 0,
      itens: items,
      criadoPorId: userId,
    });

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Importação Curadoria concluída: orcamentoId=${created.id}, itens=${items.length}, ignorados=${skipped}, tempo=${elapsedMs}ms`,
    );

    return {
      ...created,
      imported: items.length,
      skipped,
      missingTitleIsbns: Array.from(new Set(missingTitleIsbns)),
      message: 'Importação XLSX de curadoria concluída.',
    };
  }

  async fetchBookByIsbn(isbn: string) {
    const cleaned = isbn.toUpperCase().replace(/[^0-9X]/g, '');
    if (!(cleaned.length === 10 || cleaned.length === 13)) {
      throw new BadRequestException('ISBN inválido. Informe 10 ou 13 caracteres.');
    }

    try {
      const merged: {
        isbn: string;
        titulo: string | null;
        subtitulo: string | null;
        autores: string[];
        editora: string | null;
        anoPublicacao: string | null;
        categorias: string[];
      } = {
        isbn: cleaned,
        titulo: null,
        subtitulo: null,
        autores: [],
        editora: null,
        anoPublicacao: null,
        categorias: [],
      };

      let hasAnySource = false;

      try {
        const googleController = new AbortController();
        const googleTimeoutId = setTimeout(() => googleController.abort(), 10000);
        const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleaned}`, {
          signal: googleController.signal,
        });
        clearTimeout(googleTimeoutId);

        if (googleResponse.ok) {
          const payload = await googleResponse.json();
          const volumeInfo = payload?.items?.[0]?.volumeInfo;
          if (volumeInfo) {
            hasAnySource = true;
            const titulo = String(volumeInfo.title ?? '').trim();
            const subtitulo = String(volumeInfo.subtitle ?? '').trim();
            const editora = String(volumeInfo.publisher ?? '').trim();
            const ano = String(volumeInfo.publishedDate ?? '').trim();
            const autores = Array.isArray(volumeInfo.authors)
              ? volumeInfo.authors.map((author: unknown) => String(author)).filter(Boolean)
              : [];
            const categorias = Array.isArray(volumeInfo.categories)
              ? volumeInfo.categories.map((category: unknown) => String(category)).filter(Boolean)
              : [];

            if (!merged.titulo && titulo) merged.titulo = titulo;
            if (!merged.subtitulo && subtitulo) merged.subtitulo = subtitulo;
            if (!merged.editora && editora) merged.editora = editora;
            if (!merged.anoPublicacao && ano) merged.anoPublicacao = ano;
            if (merged.autores.length === 0 && autores.length > 0) merged.autores = autores;
            if (merged.categorias.length === 0 && categorias.length > 0) merged.categorias = categorias;
          }
        }
      } catch {
        // Ignoramos falhas individuais de fonte e seguimos para as próximas.
      }

      try {
        const brasilApiController = new AbortController();
        const brasilApiTimeoutId = setTimeout(() => brasilApiController.abort(), 10000);
        const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/isbn/v1/${cleaned}`, {
          signal: brasilApiController.signal,
        });
        clearTimeout(brasilApiTimeoutId);

        if (brasilApiResponse.ok) {
          const brasilApiPayload = await brasilApiResponse.json();
          const title = String(brasilApiPayload?.title ?? '').trim();
          const authors = Array.isArray(brasilApiPayload?.authors)
            ? brasilApiPayload.authors.map((author: unknown) => String(author)).filter(Boolean)
            : [];
          const yearRaw = brasilApiPayload?.year;
          const year =
            yearRaw === null || yearRaw === undefined || yearRaw === ''
              ? null
              : String(yearRaw).trim();
          const publisher = String(brasilApiPayload?.publisher ?? '').trim();
          const subjects = Array.isArray(brasilApiPayload?.subjects)
            ? brasilApiPayload.subjects.map((subject: unknown) => String(subject)).filter(Boolean)
            : [];

          if (title || authors.length || publisher || year || subjects.length) {
            hasAnySource = true;
            if (!merged.titulo && title) merged.titulo = title;
            if (!merged.editora && publisher) merged.editora = publisher;
            if (!merged.anoPublicacao && year) merged.anoPublicacao = year;
            if (merged.autores.length === 0 && authors.length > 0) merged.autores = authors;
            if (merged.categorias.length === 0 && subjects.length > 0) merged.categorias = subjects;
          }
        }
      } catch {
        // Ignoramos falhas individuais de fonte e seguimos para as próximas.
      }

      try {
        const openLibraryController = new AbortController();
        const openLibraryTimeoutId = setTimeout(() => openLibraryController.abort(), 10000);
        const openLibraryResponse = await fetch(
          `https://openlibrary.org/api/books?bibkeys=ISBN:${cleaned}&format=json&jscmd=data`,
          { signal: openLibraryController.signal },
        );
        clearTimeout(openLibraryTimeoutId);

        if (openLibraryResponse.ok) {
          const openLibraryPayload = await openLibraryResponse.json();
          const key = `ISBN:${cleaned}`;
          const bookData = openLibraryPayload?.[key];

          if (bookData) {
            hasAnySource = true;
            const titulo = String(bookData.title ?? '').trim();
            const publishDateRaw = String(bookData.publish_date ?? '').trim();
            const publishers = Array.isArray(bookData.publishers)
              ? bookData.publishers.map((publisher: any) => String(publisher?.name ?? '')).filter(Boolean)
              : [];
            const subjects = Array.isArray(bookData.subjects)
              ? bookData.subjects.map((subject: any) => String(subject?.name ?? '')).filter(Boolean)
              : [];
            const autores = Array.isArray(bookData.authors)
              ? bookData.authors.map((author: any) => String(author?.name ?? '')).filter(Boolean)
              : [];

            if (!merged.titulo && titulo) merged.titulo = titulo;
            if (!merged.editora && publishers[0]) merged.editora = publishers[0];
            if (!merged.anoPublicacao && publishDateRaw) merged.anoPublicacao = publishDateRaw;
            if (merged.autores.length === 0 && autores.length > 0) merged.autores = autores;
            if (merged.categorias.length === 0 && subjects.length > 0) merged.categorias = subjects;
          }
        }
      } catch {
        // Ignoramos falhas individuais de fonte.
      }

      if (!hasAnySource) {
        throw new BadRequestException('Livro não encontrado para o ISBN informado.');
      }

      return merged;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new BadRequestException('Tempo de espera excedido ao buscar dados do ISBN.');
      }
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error.message || 'Erro ao buscar dados do ISBN. Verifique o valor informado.',
      );
    }
  }
}

