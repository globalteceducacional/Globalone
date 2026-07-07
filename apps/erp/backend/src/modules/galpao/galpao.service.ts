import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CompraStatus,
  CuradoriaDescontoAplicadoEm,
  GalpaoLivroMovimentoTipo,
  CategoriaCompraTipo,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGalpaoProdutoDto } from './dto/create-galpao-produto.dto';
import { UpdateGalpaoProdutoDto } from './dto/update-galpao-produto.dto';
import { EntradaGalpaoLivroDto } from './dto/entrada-galpao-livro.dto';
import { AlocarGalpaoLivroDto } from './dto/alocar-galpao-livro.dto';
import { BaixaGalpaoLivroDto } from './dto/baixa-galpao-livro.dto';
import { AvariaGalpaoLivroDto } from './dto/avaria-galpao-livro.dto';
import { AlocarGalpaoOutroItemDto } from './dto/alocar-galpao-outro-item.dto';
import { BaixaGalpaoOutroItemDto } from './dto/baixa-galpao-outro-item.dto';
import { EntradaGalpaoOutroItemDto } from './dto/entrada-galpao-outro-item.dto';
import { AvariaGalpaoOutroItemDto } from './dto/avaria-galpao-outro-item.dto';

type LivroDisponivel = {
  isbn: string;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidadeTotal: number;
  quantidadeDisponivel: number;
  quantidadeReservadaTotal: number;
  quantidadeAvariasTotal?: number;
  valorMedio: number;
  descontoMedio: number;
  valorTotal: number;
  autor?: string | null;
  editora?: string | null;
  anoPublicacao?: string | null;
};

type LivroReservado = {
  isbn: string;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidade: number;
  fornecedorId?: number | null;
  fornecedorNome?: string | null;
  valorMedio?: number;
  descontoMedio?: number;
  valorTotal?: number;
};

function livroKey(isbn: string, categoriaId: number | null) {
  return `${isbn}::${categoriaId ?? 'null'}`;
}

@Injectable()
export class GalpaoService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeIsbn(isbnRaw: string): string {
    const isbn = String(isbnRaw ?? '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase()
      .slice(0, 30);
    if (!isbn) throw new BadRequestException('ISBN é obrigatório.');
    return isbn;
  }

  private async ensureProdutoExists(produtoId: number) {
    const produto = await this.prisma.galpaoProduto.findUnique({ where: { id: produtoId } });
    if (!produto) throw new NotFoundException('Produto do galpão não encontrado.');
    return produto;
  }

  private async ensureFornecedorExists(fornecedorId: number) {
    const fornecedor = await this.prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado.');
    return fornecedor;
  }

  private async ensureProjetoExists(projetoId: number) {
    const projeto = await this.prisma.projeto.findUnique({ where: { id: projetoId } });
    if (!projeto) throw new NotFoundException('Projeto não encontrado.');
    return projeto;
  }

  private async validateCategoriaLivro(categoriaId?: number | null) {
    if (categoriaId === undefined || categoriaId === null) return null;
    const categoria = await this.prisma.categoriaCompra.findFirst({
      where: { id: categoriaId, tipo: CategoriaCompraTipo.LIVRO },
      select: { id: true },
    });
    if (!categoria) throw new BadRequestException('Categoria/Gênero literário inválido para livro.');
    return categoriaId;
  }

  async listProdutos(input: { search?: string }) {
    const where: any = {};
    if (input.search?.trim()) {
      const term = input.search.trim();
      where.OR = [
        { nome: { contains: term, mode: 'insensitive' as any } },
        { descricao: { contains: term, mode: 'insensitive' as any } },
      ];
    }

    const produtos = await this.prisma.galpaoProduto.findMany({
      where,
      orderBy: { dataCriacao: 'desc' },
    });

    return produtos;
  }

  async createProduto(dto: CreateGalpaoProdutoDto, _userId: number) {
    const created = await this.prisma.galpaoProduto.create({
      data: {
        nome: dto.nome.trim(),
        descricao: dto.descricao ? dto.descricao.trim() : undefined,
        ativo: dto.ativo ?? true,
      },
    });
    return created;
  }

  async updateProduto(id: number, dto: UpdateGalpaoProdutoDto, _userId: number) {
    await this.ensureProdutoExists(id);

    const updated = await this.prisma.galpaoProduto.update({
      where: { id },
      data: {
        nome: dto.nome !== undefined ? dto.nome.trim() : undefined,
        descricao: dto.descricao !== undefined ? (dto.descricao ? dto.descricao.trim() : undefined) : undefined,
        ativo: dto.ativo !== undefined ? dto.ativo : undefined,
      },
    });

    return updated;
  }

  async deleteProduto(id: number) {
    await this.ensureProdutoExists(id);
    await this.prisma.galpaoProduto.delete({ where: { id } });
    return { deleted: true };
  }

  async deleteLivroCadastro(input: { isbn: string; categoriaId?: number }) {
    const isbn = this.normalizeIsbn(input.isbn);
    const categoriaId = await this.validateCategoriaLivro(input.categoriaId ?? null);

    const reservedTotal = await this.prisma.galpaoProdutoLivroReserva.aggregate({
      where: { isbn, categoriaId },
      _sum: { quantidade: true },
    });
    const reservado = reservedTotal._sum.quantidade ?? 0;
    if (reservado > 0) {
      throw new BadRequestException('Não é possível excluir: há livros reservados/alocados.');
    }

    const deleted = await this.prisma.curadoriaItem.deleteMany({
      where: {
        isbn,
        categoriaId,
        orcamento: { status: CompraStatus.ENTREGUE },
      },
    });

    if (!deleted.count) {
      throw new NotFoundException('Livro não encontrado no estoque para exclusão.');
    }

    return { deleted: deleted.count, message: 'Cadastro de livro removido do estoque.' };
  }

  async deleteOutroItemCadastro(estoqueId: number) {
    const estoque = await this.prisma.estoque.findUnique({ where: { id: estoqueId } });
    if (!estoque) throw new NotFoundException('Item de estoque não encontrado.');

    const alocadas = await this.prisma.estoqueAlocacao.count({ where: { estoqueId } });
    if (alocadas > 0) {
      throw new BadRequestException('Não é possível excluir: há alocações vinculadas a este item.');
    }

    await this.prisma.estoque.delete({ where: { id: estoqueId } });
    return { deleted: true, message: 'Cadastro de item removido do estoque.' };
  }

  private async getSharedBookStockAggregated(input: { search?: string; categoriaId?: number }) {
    const where: any = {
      orcamento: { status: CompraStatus.ENTREGUE },
    };

    if (input.categoriaId !== undefined) {
      where.categoriaId = input.categoriaId;
    }

    if (input.search?.trim()) {
      const term = input.search.trim();
      where.OR = [
        { nome: { contains: term, mode: 'insensitive' as any } },
        { isbn: { contains: term, mode: 'insensitive' as any } },
        { categoria: { nome: { contains: term, mode: 'insensitive' as any } } },
      ];
    }

    const items = await this.prisma.curadoriaItem.findMany({
      where,
      include: { categoria: { select: { id: true, nome: true } } },
      orderBy: { nome: 'asc' },
    });

    type Agg = {
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
    };

    const grouped = new Map<string, Agg>();

    for (const item of items) {
      const key = livroKey(item.isbn, item.categoriaId ?? null);
      const existing = grouped.get(key);

      const quantidade = item.quantidade || 1;
      const valorUnitario = (item.valorLiquido ?? item.valor) || 0;
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
        const novoDescontoMedio = novaQuantidade > 0 ? Number((novoTotalDesconto / novaQuantidade).toFixed(2)) : 0;

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

    return Array.from(grouped.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async listLivrosDisponiveis(input: { produtoId?: number; search?: string; categoriaId?: number }) {

    const sharedStock = await this.getSharedBookStockAggregated({ search: input.search, categoriaId: input.categoriaId });

    const [reservas, avariasRows] = await Promise.all([
      this.prisma.galpaoProdutoLivroReserva.findMany({
        select: { isbn: true, categoriaId: true, quantidade: true },
      }),
      this.prisma.galpaoLivroAvaria.findMany({
        select: { isbn: true, categoriaId: true, quantidade: true },
      }),
    ]);

    const reservasMap = new Map<string, number>();
    for (const r of reservas) {
      const key = livroKey(r.isbn, r.categoriaId ?? null);
      reservasMap.set(key, (reservasMap.get(key) ?? 0) + (r.quantidade ?? 0));
    }

    const avariasMap = new Map<string, number>();
    for (const a of avariasRows as any[]) {
      const key = livroKey(a.isbn as string, (a.categoriaId as number | null) ?? null);
      avariasMap.set(key, (avariasMap.get(key) ?? 0) + ((a.quantidade as number) || 0));
    }

    const result: LivroDisponivel[] = sharedStock
      .map((book) => {
        const key = livroKey(book.isbn, book.categoriaId);
        const reservedTotal = reservasMap.get(key) ?? 0;
        const avariasTotal = avariasMap.get(key) ?? 0;
        const quantidadeDisponivel = Math.max(0, book.quantidadeTotal - reservedTotal);
        return {
          ...book,
          quantidadeDisponivel,
          quantidadeReservadaTotal: reservedTotal,
          quantidadeAvariasTotal: avariasTotal,
        };
      })
      .filter((b) => b.quantidadeDisponivel > 0);

    return result;
  }

  async listLivrosDisponiveisPorFornecedor(input: { isbn: string; categoriaId?: number }) {
    const isbn = this.normalizeIsbn(input.isbn);
    const categoriaIdNormalized = input.categoriaId ?? null;
    const categoriaIdValidated = await this.validateCategoriaLivro(categoriaIdNormalized);

    const [stockItems, reservas] = await Promise.all([
      this.prisma.curadoriaItem.findMany({
        where: {
          isbn,
          categoriaId: categoriaIdValidated,
          orcamento: { status: CompraStatus.ENTREGUE, fornecedorId: { not: null } },
        },
        select: {
          quantidade: true,
          orcamento: {
            select: {
              fornecedorId: true,
              fornecedor: { select: { nomeFantasia: true, razaoSocial: true } },
            },
          },
        },
      }),
      this.prisma.galpaoProdutoLivroReserva.findMany({
        where: {
          isbn,
          categoriaId: categoriaIdValidated,
          fornecedorId: { not: null },
        },
        select: { fornecedorId: true, quantidade: true },
      }),
    ]);

    const stockMap = new Map<number, { fornecedorId: number; fornecedorNome: string; total: number }>();
    for (const item of stockItems as any[]) {
      const fornecedorId: number | null = item.orcamento?.fornecedorId ?? null;
      if (fornecedorId == null) continue;
      const fornecedorNome =
        item.orcamento?.fornecedor?.nomeFantasia ??
        item.orcamento?.fornecedor?.razaoSocial ??
        'Fornecedor';

      const current = stockMap.get(fornecedorId);
      const qty = (item.quantidade as number) || 1;
      if (!current) {
        stockMap.set(fornecedorId, { fornecedorId, fornecedorNome, total: qty });
      } else {
        current.total += qty;
      }
    }

    const reservasMap = new Map<number, number>();
    for (const r of reservas as any[]) {
      const fornecedorId: number | null = r.fornecedorId ?? null;
      if (fornecedorId == null) continue;
      reservasMap.set(fornecedorId, (reservasMap.get(fornecedorId) ?? 0) + ((r.quantidade as number) || 0));
    }

    const result = Array.from(stockMap.values())
      .map((s) => {
        const reservedTotal = reservasMap.get(s.fornecedorId) ?? 0;
        const quantidadeDisponivel = Math.max(0, s.total - reservedTotal);
        return {
          fornecedorId: s.fornecedorId,
          fornecedorNome: s.fornecedorNome,
          quantidadeDisponivel,
        };
      })
      .filter((r) => r.quantidadeDisponivel > 0)
      .sort((a, b) => a.fornecedorNome.localeCompare(b.fornecedorNome));

    return result;
  }

  async listLivrosReservados(produtoId: number): Promise<LivroReservado[]> {
    await this.ensureProdutoExists(produtoId);

    const reservas = await this.prisma.galpaoProdutoLivroReserva.findMany({
      where: { galpaoProdutoId: produtoId },
      include: {
        categoria: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
      },
    });

    if (reservas.length === 0) return [];

    const sharedStock = await this.getSharedBookStockAggregated({});
    const stockMap = new Map<string, any>();
    for (const s of sharedStock) {
      stockMap.set(livroKey(s.isbn, s.categoriaId), s);
    }

    return reservas.map((r) => {
      const key = livroKey(r.isbn, r.categoriaId ?? null);
      const stock = stockMap.get(key);
      return {
        isbn: r.isbn,
        nome: stock?.nome ?? `Livro ISBN ${r.isbn}`,
        categoriaId: r.categoriaId ?? null,
        categoriaNome: r.categoria?.nome ?? stock?.categoriaNome ?? null,
        quantidade: r.quantidade,
        fornecedorId: r.fornecedorId ?? null,
        fornecedorNome: r.fornecedor?.nomeFantasia ?? r.fornecedor?.razaoSocial ?? null,
        valorMedio: stock?.valorMedio,
        descontoMedio: stock?.descontoMedio,
        valorTotal: stock?.valorTotal,
      };
    });
  }

  async entradaLivros(produtoId: number, dto: EntradaGalpaoLivroDto, userId: number) {
    await this.ensureProdutoExists(produtoId);
    const categoriaIdNormalized = await this.validateCategoriaLivro(dto.categoriaId ?? null);
    const isbn = this.normalizeIsbn(dto.isbn);
    const fornecedorIdNormalized = dto.fornecedorId ?? null;

    if (fornecedorIdNormalized != null) {
      await this.ensureFornecedorExists(fornecedorIdNormalized);
    }

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');
    if (!Number.isFinite(dto.valor) || dto.valor < 0) throw new BadRequestException('Valor inválido.');

    const desconto = dto.desconto ?? 0;
    const valor = Number(dto.valor);
    const valorLiquido = Number(Math.max(0, valor - Number(desconto)).toFixed(2));

    const nomeLivro = dto.nome?.trim() || `Livro ISBN ${isbn}`;

    const observacao = `[AUTO_ESTOQUE_GALPAO_ENTRADA] GalpãoProduto #${produtoId}`;
    const nomeOrcamento = `Estoque Galpão - ${isbn} (${new Date().toLocaleDateString('pt-BR')})`;

    const created = await this.prisma.curadoriaOrcamento.create({
      data: {
        nome: nomeOrcamento,
        observacao,
        status: CompraStatus.ENTREGUE,
        descontoAplicadoEm: CuradoriaDescontoAplicadoEm.ITEM,
        descontoTotal: 0,
        criadoPorId: userId,
        fornecedorId: fornecedorIdNormalized,
        itens: {
          create: [
            {
              nome: nomeLivro,
              isbn,
              quantidade: dto.quantidade,
              categoriaId: categoriaIdNormalized,
              valor,
              desconto: Number(desconto),
              valorLiquido,
              autor: dto.autor?.trim() || null,
              editora: dto.editora?.trim() || null,
              anoPublicacao: dto.anoPublicacao?.trim() || null,
            },
          ],
        },
      },
      include: { itens: false },
    });

    await this.prisma.galpaoProdutoLivroMovimento.create({
      data: {
        galpaoProdutoId: produtoId,
        tipo: GalpaoLivroMovimentoTipo.ENTRADA,
        isbn,
        categoriaId: categoriaIdNormalized,
        quantidade: dto.quantidade,
      },
    });

    return {
      message: 'Entrada de livros registrada com sucesso.',
      orcamentoId: created.id,
    };
  }

  async alocarLivros(produtoId: number, dto: AlocarGalpaoLivroDto) {
    await this.ensureProdutoExists(produtoId);

    const categoriaIdNormalized = dto.categoriaId ?? null;
    const categoriaIdValidated = await this.validateCategoriaLivro(categoriaIdNormalized);
    const isbn = this.normalizeIsbn(dto.isbn);

    if (dto.fornecedorId == null) {
      throw new BadRequestException('Fornecedor é obrigatório para alocar livros.');
    }
    await this.ensureFornecedorExists(dto.fornecedorId);

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

    const [stockItems, reservasAll] = await Promise.all([
      this.prisma.curadoriaItem.findMany({
        where: {
          isbn,
          categoriaId: categoriaIdValidated,
          orcamento: { status: CompraStatus.ENTREGUE, fornecedorId: dto.fornecedorId },
        },
        select: { quantidade: true },
      }),
      this.prisma.galpaoProdutoLivroReserva.findMany({
        where: {
          isbn,
          categoriaId: categoriaIdValidated,
          fornecedorId: dto.fornecedorId,
        },
        select: { quantidade: true },
      }),
    ]);

    const totalStock = stockItems.reduce((sum, it) => sum + (it.quantidade || 1), 0);
    const reservedTotal = reservasAll.reduce((sum, r) => sum + (r.quantidade || 0), 0);
    const disponivel = Math.max(0, totalStock - reservedTotal);

    if (dto.quantidade > disponivel) {
      throw new BadRequestException(
        `Quantidade solicitada (${dto.quantidade}) excede o disponível (${disponivel}).`,
      );
    }

    // Composite unique: galpaoProdutoId + isbn + categoriaId
    const whereUnique: any = {
      galpaoProdutoId_isbn_categoriaId_fornecedorId: {
        galpaoProdutoId: produtoId,
        isbn,
        categoriaId: categoriaIdValidated,
        fornecedorId: dto.fornecedorId,
      },
    };

    const updated = await this.prisma.galpaoProdutoLivroReserva.upsert({
      where: whereUnique,
      create: {
        galpaoProdutoId: produtoId,
        isbn,
        categoriaId: categoriaIdValidated,
        fornecedorId: dto.fornecedorId,
        quantidade: dto.quantidade,
      },
      update: { quantidade: { increment: dto.quantidade } },
    });

    return {
      message: 'Livro alocado com sucesso.',
      reserva: updated,
      quantidadeDisponivel: disponivel - dto.quantidade,
    };
  }

  async baixarLivros(produtoId: number, dto: BaixaGalpaoLivroDto) {
    await this.ensureProdutoExists(produtoId);

    const categoriaIdNormalized = dto.categoriaId ?? null;
    const categoriaIdValidated = await this.validateCategoriaLivro(categoriaIdNormalized);
    const isbn = this.normalizeIsbn(dto.isbn);

    if (dto.fornecedorId == null) {
      throw new BadRequestException('Fornecedor é obrigatório para baixa de livros.');
    }
    await this.ensureFornecedorExists(dto.fornecedorId);

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

    const whereUnique: any = {
      galpaoProdutoId_isbn_categoriaId_fornecedorId: {
        galpaoProdutoId: produtoId,
        isbn,
        categoriaId: categoriaIdValidated,
        fornecedorId: dto.fornecedorId,
      },
    };

    return this.prisma.$transaction(async (tx) => {
      const reserva = await tx.galpaoProdutoLivroReserva.findUnique({ where: whereUnique });
      if (!reserva) throw new NotFoundException('Reserva do livro não encontrada neste produto.');

      if (reserva.quantidade < dto.quantidade) {
        throw new BadRequestException(
          `Quantidade solicitada (${dto.quantidade}) excede a reservada (${reserva.quantidade}).`,
        );
      }

      const [stockItems, reservasAll] = await Promise.all([
        tx.curadoriaItem.findMany({
          where: {
            isbn,
            categoriaId: categoriaIdValidated,
            orcamento: { status: CompraStatus.ENTREGUE, fornecedorId: dto.fornecedorId },
          },
          select: { id: true, quantidade: true, orcamento: { select: { dataCriacao: true } } },
        }),
        tx.galpaoProdutoLivroReserva.findMany({
          where: { isbn, categoriaId: categoriaIdValidated, fornecedorId: dto.fornecedorId },
          select: { quantidade: true },
        }),
      ]);

      const totalStock = stockItems.reduce((sum, it: any) => sum + ((it.quantidade as number) || 1), 0);
      const reservedTotal = reservasAll.reduce((sum, r: any) => sum + (r.quantidade as number), 0);

      if (totalStock < reservedTotal) {
        throw new BadRequestException(
          'Estoque compartilhado insuficiente no momento (reservas acima do estoque).',
        );
      }

      // Consumo FIFO por dataCriacao do orçamento
      const sorted = stockItems.sort(
        (a: any, b: any) => new Date(a.orcamento.dataCriacao).getTime() - new Date(b.orcamento.dataCriacao).getTime(),
      );

      let remaining = dto.quantidade;
      for (const it of sorted) {
        if (remaining <= 0) break;

        const itemQty = (it.quantidade as number) || 1;
        const consume = Math.min(itemQty, remaining);

        if (consume === itemQty) {
          await tx.curadoriaItem.delete({ where: { id: it.id } });
        } else {
          await tx.curadoriaItem.update({
            where: { id: it.id },
            data: { quantidade: itemQty - consume },
          });
        }

        remaining -= consume;
      }

      if (remaining !== 0) {
        throw new BadRequestException('Falha ao consumir estoque compartilhado (quantidade insuficiente).');
      }

      // Atualizar reserva do produto
      if (reserva.quantidade === dto.quantidade) {
        await tx.galpaoProdutoLivroReserva.delete({ where: whereUnique });
      } else {
        await tx.galpaoProdutoLivroReserva.update({
          where: whereUnique,
          data: { quantidade: reserva.quantidade - dto.quantidade },
        });
      }

      await tx.galpaoProdutoLivroMovimento.create({
        data: {
          galpaoProdutoId: produtoId,
          tipo: GalpaoLivroMovimentoTipo.BAIXA,
          isbn,
          categoriaId: categoriaIdValidated,
          quantidade: dto.quantidade,
        },
      });

      return { message: 'Baixa do livro registrada com sucesso.' };
    });
  }

  async avariaLivros(produtoId: number | null, dto: AvariaGalpaoLivroDto, userId: number) {
    if (produtoId != null) {
      await this.ensureProdutoExists(produtoId);
    }

    if (dto.fornecedorId != null) {
      await this.ensureFornecedorExists(dto.fornecedorId);
    }

    if (dto.projetoId != null) {
      await this.ensureProjetoExists(dto.projetoId);
    }

    const categoriaIdNormalized = dto.categoriaId ?? null;
    const categoriaIdValidated = await this.validateCategoriaLivro(categoriaIdNormalized);
    const isbn = this.normalizeIsbn(dto.isbn);
    const justificativa = dto.justificativa?.trim();

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');
    if (!justificativa) throw new BadRequestException('Justificativa da avaria é obrigatória.');

    return this.prisma.$transaction(async (tx) => {
      const [stockItems, reservasAll] = await Promise.all([
        tx.curadoriaItem.findMany({
          where: {
            isbn,
            categoriaId: categoriaIdValidated,
            orcamento: {
              status: CompraStatus.ENTREGUE,
              ...(dto.fornecedorId != null ? { fornecedorId: dto.fornecedorId } : {}),
            },
          },
          select: { id: true, quantidade: true, orcamento: { select: { dataCriacao: true } } },
        }),
        tx.galpaoProdutoLivroReserva.findMany({
          where: {
            isbn,
            categoriaId: categoriaIdValidated,
            ...(dto.fornecedorId != null ? { fornecedorId: dto.fornecedorId } : {}),
          },
          select: { quantidade: true },
        }),
      ]);

      const totalStock = stockItems.reduce((sum, it: any) => sum + ((it.quantidade as number) || 1), 0);
      const reservedTotal = reservasAll.reduce((sum, r: any) => sum + (r.quantidade as number), 0);
      const disponivel = Math.max(0, totalStock - reservedTotal);

      if (dto.quantidade > disponivel) {
        throw new BadRequestException(
          `Quantidade de avaria (${dto.quantidade}) excede o disponível (${disponivel}).`,
        );
      }

      const stockSorted = [...stockItems].sort((a: any, b: any) => {
        const da = new Date(a.orcamento?.dataCriacao ?? 0).getTime();
        const db = new Date(b.orcamento?.dataCriacao ?? 0).getTime();
        if (da !== db) return da - db;
        return (a.id as number) - (b.id as number);
      });

      let remaining = dto.quantidade;
      for (const it of stockSorted) {
        if (remaining <= 0) break;
        const itemQty = (it.quantidade as number) || 1;
        if (itemQty <= 0) continue;
        const consume = Math.min(itemQty, remaining);
        remaining -= consume;

        if (consume === itemQty) {
          await tx.curadoriaItem.delete({ where: { id: it.id as number } });
        } else {
          await tx.curadoriaItem.update({
            where: { id: it.id as number },
            data: { quantidade: itemQty - consume },
          });
        }
      }

      if (remaining !== 0) {
        throw new BadRequestException('Falha ao registrar avaria (quantidade insuficiente no estoque).');
      }

      const created = await tx.galpaoLivroAvaria.create({
        data: {
          galpaoProdutoId: produtoId ?? null,
          isbn,
          categoriaId: categoriaIdValidated,
          quantidade: dto.quantidade,
          justificativa,
          fornecedorId: dto.fornecedorId ?? null,
          projetoId: dto.projetoId ?? null,
          criadoPorId: userId,
        },
      });

      return { message: 'Avaria de livro registrada com sucesso.', avaria: created };
    });
  }

  async updateLivroAvariaJustificativa(avariaId: number, justificativa: string) {
    const j = justificativa?.trim();
    if (!j) throw new BadRequestException('Justificativa é obrigatória.');

    const existing = await this.prisma.galpaoLivroAvaria.findUnique({ where: { id: avariaId } });
    if (!existing) throw new NotFoundException('Registro de avaria não encontrado.');

    return this.prisma.galpaoLivroAvaria.update({
      where: { id: avariaId },
      data: { justificativa: j },
    });
  }

  /**
   * Remove o registro de avaria e recoloca a quantidade no estoque de curadoria (mesma lógica inversa do lançamento).
   */
  async deleteLivroAvaria(avariaId: number) {
    const avaria = await this.prisma.galpaoLivroAvaria.findUnique({
      where: { id: avariaId },
    });
    if (!avaria) throw new NotFoundException('Registro de avaria não encontrado.');

    return this.prisma.$transaction(async (tx) => {
      const fornecedorWhere =
        avaria.fornecedorId != null ? { fornecedorId: avaria.fornecedorId } : {};

      const template = await tx.curadoriaItem.findFirst({
        where: {
          isbn: avaria.isbn,
          categoriaId: avaria.categoriaId,
          orcamento: {
            status: CompraStatus.ENTREGUE,
            ...fornecedorWhere,
          },
        },
        orderBy: { id: 'desc' },
        include: { orcamento: true },
      });

      const orcamentoAlvo =
        template?.orcamento ??
        (await tx.curadoriaOrcamento.findFirst({
          where: {
            status: CompraStatus.ENTREGUE,
            ...fornecedorWhere,
          },
          orderBy: { dataCriacao: 'asc' },
        }));

      if (!orcamentoAlvo) {
        throw new BadRequestException(
          'Não foi possível estornar a avaria: não há orçamento de curadoria entregue para recolocar o saldo.',
        );
      }

      const nome = template?.nome ?? `Livro ISBN ${avaria.isbn}`;
      const valor = template != null ? Number(template.valor) : 0;
      const desconto = template != null ? Number(template.desconto) : 0;
      const valorLiquido =
        template != null
          ? Number(template.valorLiquido)
          : Number(Math.max(0, valor - desconto).toFixed(2));

      await tx.curadoriaItem.create({
        data: {
          orcamentoId: orcamentoAlvo.id,
          nome,
          isbn: avaria.isbn,
          categoriaId: avaria.categoriaId,
          quantidade: avaria.quantidade,
          valor,
          desconto,
          valorLiquido,
          autor: template?.autor ?? null,
          editora: template?.editora ?? null,
          anoPublicacao: template?.anoPublicacao ?? null,
        },
      });

      await tx.galpaoLivroAvaria.delete({ where: { id: avariaId } });

      return { message: 'Avaria excluída e quantidade recolocada no estoque de curadoria.' };
    });
  }

  async listLivroAvarias(input: { isbn: string; categoriaId?: number }) {
    const isbn = this.normalizeIsbn(input.isbn);
    const categoriaId = input.categoriaId ?? null;

    return this.prisma.galpaoLivroAvaria.findMany({
      where: { isbn, categoriaId },
      orderBy: { dataCriacao: 'desc' },
      include: {
        galpaoProduto: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
        projeto: { select: { id: true, nome: true } },
        categoria: { select: { id: true, nome: true } },
      },
    });
  }

  async listLivrosAlocadosReport(input: {
    search?: string;
    categoriaId?: number;
    produtoId?: number;
  }) {
    const where: any = {};
    if (input.categoriaId !== undefined) where.categoriaId = input.categoriaId;
    if (input.produtoId !== undefined) where.galpaoProdutoId = input.produtoId;

    const [reservas, sharedStock] = await Promise.all([
      this.prisma.galpaoProdutoLivroReserva.findMany({
        where,
        orderBy: [{ dataReserva: 'desc' }],
        include: {
          galpaoProduto: { select: { id: true, nome: true } },
          fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
          categoria: { select: { id: true, nome: true } },
        },
      }),
      this.getSharedBookStockAggregated({ categoriaId: input.categoriaId }),
    ]);

    const stockMap = new Map<string, (typeof sharedStock)[number]>();
    for (const item of sharedStock) {
      stockMap.set(livroKey(item.isbn, item.categoriaId), item);
    }

    const term = input.search?.trim().toLowerCase() ?? '';

    return reservas
      .map((r) => {
        const key = livroKey(r.isbn, r.categoriaId ?? null);
        const stock = stockMap.get(key);
        const titulo = stock?.nome ?? `Livro ISBN ${r.isbn}`;
        return {
          id: r.id,
          isbn: r.isbn,
          titulo,
          autor: stock?.autor ?? null,
          editora: stock?.editora ?? null,
          categoriaId: r.categoriaId ?? null,
          categoriaNome: r.categoria?.nome ?? stock?.categoriaNome ?? null,
          quantidade: r.quantidade,
          produto: r.galpaoProduto,
          fornecedor: r.fornecedor
            ? {
                id: r.fornecedor.id,
                nome: r.fornecedor.nomeFantasia ?? r.fornecedor.razaoSocial ?? 'Fornecedor',
              }
            : null,
          dataReserva: r.dataReserva,
        };
      })
      .filter((row) => {
        if (!term) return true;
        return (
          row.isbn.toLowerCase().includes(term) ||
          row.titulo.toLowerCase().includes(term) ||
          String(row.autor ?? '').toLowerCase().includes(term) ||
          String(row.editora ?? '').toLowerCase().includes(term) ||
          String(row.categoriaNome ?? '').toLowerCase().includes(term) ||
          String(row.produto?.nome ?? '').toLowerCase().includes(term) ||
          String(row.fornecedor?.nome ?? '').toLowerCase().includes(term)
        );
      });
  }

  async listLivroAvariasReport(input: {
    search?: string;
    categoriaId?: number;
    produtoId?: number;
  }) {
    const where: any = {};
    if (input.categoriaId !== undefined) where.categoriaId = input.categoriaId;
    if (input.produtoId !== undefined) where.galpaoProdutoId = input.produtoId;

    const [avarias, sharedStock] = await Promise.all([
      this.prisma.galpaoLivroAvaria.findMany({
        where,
        orderBy: { dataCriacao: 'desc' },
        include: {
          galpaoProduto: { select: { id: true, nome: true } },
          fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
          projeto: { select: { id: true, nome: true } },
          categoria: { select: { id: true, nome: true } },
        },
      }),
      this.getSharedBookStockAggregated({ categoriaId: input.categoriaId }),
    ]);

    const stockMap = new Map<string, (typeof sharedStock)[number]>();
    for (const item of sharedStock) {
      stockMap.set(livroKey(item.isbn, item.categoriaId), item);
    }

    const term = input.search?.trim().toLowerCase() ?? '';

    return avarias
      .map((a) => {
        const key = livroKey(a.isbn, a.categoriaId ?? null);
        const stock = stockMap.get(key);
        const titulo = stock?.nome ?? `Livro ISBN ${a.isbn}`;
        return {
          id: a.id,
          isbn: a.isbn,
          titulo,
          autor: stock?.autor ?? null,
          editora: stock?.editora ?? null,
          categoriaId: a.categoriaId ?? null,
          categoriaNome: a.categoria?.nome ?? stock?.categoriaNome ?? null,
          quantidade: a.quantidade,
          justificativa: a.justificativa,
          produto: a.galpaoProduto,
          fornecedor: a.fornecedor
            ? {
                id: a.fornecedor.id,
                nome: a.fornecedor.nomeFantasia ?? a.fornecedor.razaoSocial ?? 'Fornecedor',
              }
            : null,
          projeto: a.projeto,
          dataCriacao: a.dataCriacao,
        };
      })
      .filter((row) => {
        if (!term) return true;
        return (
          row.isbn.toLowerCase().includes(term) ||
          row.titulo.toLowerCase().includes(term) ||
          String(row.autor ?? '').toLowerCase().includes(term) ||
          String(row.editora ?? '').toLowerCase().includes(term) ||
          String(row.categoriaNome ?? '').toLowerCase().includes(term) ||
          String(row.justificativa ?? '').toLowerCase().includes(term) ||
          String(row.produto?.nome ?? '').toLowerCase().includes(term) ||
          String(row.fornecedor?.nome ?? '').toLowerCase().includes(term) ||
          String(row.projeto?.nome ?? '').toLowerCase().includes(term)
        );
      });
  }

  async listOutrosItensDisponiveis(input: { produtoId?: number; search?: string }) {

    const where: any = {};
    if (input.search?.trim()) {
      where.item = { contains: input.search.trim(), mode: 'insensitive' as any };
    }

    const items: any[] = await this.prisma.estoque.findMany({
      where,
      include: {
        projeto: true,
        etapa: true,
        categoria: true,
      } as any,
      orderBy: { item: 'asc' },
    });

    const itemIds = items.map((it) => it.id);
    const alocacoes =
      itemIds.length > 0
        ? await this.prisma.estoqueAlocacao.findMany({
            where: { estoqueId: { in: itemIds } },
            select: { estoqueId: true, quantidade: true },
          })
        : [];

    const alocMap = new Map<number, number>();
    for (const a of alocacoes) {
      alocMap.set(a.estoqueId, (alocMap.get(a.estoqueId) ?? 0) + (a.quantidade ?? 0));
    }

    return items
      .map((item) => {
        const quantidadeAlocada = alocMap.get(item.id) ?? 0;
        const quantidadeDisponivel = item.quantidade - quantidadeAlocada;
        return { ...item, quantidadeAlocada, quantidadeDisponivel };
      })
      .filter((it) => it.quantidadeDisponivel > 0);
  }

  async listOutrosItensAlocados(produtoId: number) {
    await this.ensureProdutoExists(produtoId);

    const reservas = await this.prisma.estoqueAlocacao.findMany({
      where: { galpaoProdutoId: produtoId },
      include: { estoque: true },
      orderBy: { dataAlocacao: 'desc' },
    });

    return reservas.map((al: any) => ({
      id: al.id,
      estoqueId: al.estoqueId,
      quantidade: al.quantidade,
      projetoId: al.projetoId ?? null,
      etapaId: al.etapaId ?? null,
      usuarioId: al.usuarioId ?? null,
      estoque: al.estoque,
    }));
  }

  async alocarOutroItem(produtoId: number, dto: AlocarGalpaoOutroItemDto) {
    await this.ensureProdutoExists(produtoId);

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

    const estoque = await this.prisma.estoque.findUnique({ where: { id: dto.estoqueId } });
    if (!estoque) throw new NotFoundException('Item de estoque não encontrado');

    const alocacoes = await this.prisma.estoqueAlocacao.findMany({
      where: { estoqueId: dto.estoqueId },
      select: { quantidade: true },
    });
    const quantidadeAlocada = alocacoes.reduce((sum, a) => sum + (a.quantidade ?? 0), 0);
    const quantidadeDisponivel = estoque.quantidade - quantidadeAlocada;

    if (dto.quantidade > quantidadeDisponivel) {
      throw new BadRequestException(
        `Quantidade solicitada (${dto.quantidade}) excede o disponível (${quantidadeDisponivel}).`,
      );
    }

    const existing = await this.prisma.estoqueAlocacao.findFirst({
      where: {
        estoqueId: dto.estoqueId,
        galpaoProdutoId: produtoId,
        projetoId: null,
        etapaId: null,
        usuarioId: null,
      } as any,
    });

    if (existing) {
      const updated = await this.prisma.estoqueAlocacao.update({
        where: { id: existing.id },
        data: { quantidade: existing.quantidade + dto.quantidade },
      });
      return { message: 'Item alocado com sucesso.', alocacao: updated };
    }

    const created = await this.prisma.estoqueAlocacao.create({
      data: {
        estoqueId: dto.estoqueId,
        galpaoProdutoId: produtoId,
        quantidade: dto.quantidade,
      },
    });

    return { message: 'Item alocado com sucesso.', alocacao: created };
  }

  async entradaOutroItem(produtoId: number, dto: EntradaGalpaoOutroItemDto) {
    await this.ensureProdutoExists(produtoId);

    if (!dto.quantidade || dto.quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida.');
    }

    // Entrada por estoqueId: apenas aumenta a quantidade do item no estoque global.
    if (dto.estoqueId) {
      const estoque = await this.prisma.estoque.findUnique({ where: { id: dto.estoqueId } });
      if (!estoque) throw new NotFoundException('Item de estoque não encontrado');

      const updated = await this.prisma.estoque.update({
        where: { id: dto.estoqueId },
        data: { quantidade: estoque.quantidade + dto.quantidade },
      });

      return { message: 'Entrada do item registrada com sucesso.', estoque: updated };
    }

    // Entrada criando um item novo no estoque global.
    const itemName = dto.item?.trim();
    const valorUnitario = dto.valorUnitario;
    if (!itemName) {
      throw new BadRequestException('Informe `item` ou `estoqueId` para registrar a entrada.');
    }
    if (valorUnitario === undefined || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
      throw new BadRequestException('Informe `valorUnitario` válido ao criar um novo item.');
    }

    // Se já existir um item equivalente (mesmo nome + mesma categoriaId), incrementa ao invés de duplicar.
    const categoriaIdOrNull = dto.categoriaId ?? null;
    const existing = await this.prisma.estoque.findFirst({
      where: {
        item: itemName,
        categoriaId: categoriaIdOrNull,
      },
    });

    if (existing) {
      const updated = await this.prisma.estoque.update({
        where: { id: existing.id },
        data: {
          quantidade: existing.quantidade + dto.quantidade,
          valorUnitario,
          descricao: dto.descricao?.trim() || undefined,
          imagemUrl: dto.imagemUrl ?? undefined,
        },
      });

      return { message: 'Entrada do item registrada com sucesso (incremento).', estoque: updated };
    }

    if (dto.categoriaId !== undefined) {
      const categoria = await this.prisma.categoriaCompra.findFirst({
        where: { id: dto.categoriaId, tipo: CategoriaCompraTipo.ITEM },
        select: { id: true },
      });
      if (!categoria) throw new BadRequestException('Categoria inválida para item.');
    }

    const created = await this.prisma.estoque.create({
      data: {
        item: itemName,
        descricao: dto.descricao?.trim() || undefined,
        quantidade: dto.quantidade,
        valorUnitario: valorUnitario,
        categoriaId: dto.categoriaId ?? null,
        imagemUrl: dto.imagemUrl ?? null,
      },
    });

    return { message: 'Item criado e entrada registrada com sucesso.', estoque: created };
  }

  async baixarOutroItem(produtoId: number, dto: BaixaGalpaoOutroItemDto) {
    await this.ensureProdutoExists(produtoId);

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

    return this.prisma.$transaction(async (tx) => {
      const alocacao = await tx.estoqueAlocacao.findUnique({
        where: { id: dto.estoqueAlocacaoId },
        include: { estoque: true },
      });

      if (!alocacao || alocacao.galpaoProdutoId !== produtoId) {
        throw new NotFoundException('Alocação não encontrada neste produto.');
      }

      if (alocacao.quantidade < dto.quantidade) {
        throw new BadRequestException(
          `Quantidade solicitada (${dto.quantidade}) excede a reservada (${alocacao.quantidade}).`,
        );
      }

      const estoque = alocacao.estoque;
      const todasAlocacoes = await tx.estoqueAlocacao.findMany({
        where: { estoqueId: estoque.id },
        select: { quantidade: true },
      });
      const totalReservado = todasAlocacoes.reduce((sum, a) => sum + (a.quantidade ?? 0), 0);

      if (estoque.quantidade < totalReservado) {
        throw new BadRequestException('Estoque global insuficiente no momento (reservas acima do estoque).');
      }

      const reservedOthers = totalReservado - alocacao.quantidade;
      const requiredStock = reservedOthers + dto.quantidade;

      if (estoque.quantidade < requiredStock) {
        throw new BadRequestException('Estoque global insuficiente para essa baixa.');
      }

      const newEstoqueQuantidade = estoque.quantidade - dto.quantidade;
      await tx.estoque.update({
        where: { id: estoque.id },
        data: { quantidade: newEstoqueQuantidade },
      });

      if (alocacao.quantidade === dto.quantidade) {
        await tx.estoqueAlocacao.delete({ where: { id: alocacao.id } });
      } else {
        await tx.estoqueAlocacao.update({
          where: { id: alocacao.id },
          data: { quantidade: alocacao.quantidade - dto.quantidade },
        });
      }

      return { message: 'Baixa do item registrada com sucesso.' };
    });
  }

  async avariaOutroItem(produtoId: number, dto: AvariaGalpaoOutroItemDto, userId: number) {
    await this.ensureProdutoExists(produtoId);

    if (!dto.quantidade || dto.quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

    const estoque = await this.prisma.estoque.findUnique({
      where: { id: dto.estoqueId },
      select: { id: true, quantidade: true },
    });
    if (!estoque) throw new NotFoundException('Item de estoque não encontrado');

    const sumAlloc = await this.prisma.estoqueAlocacao.aggregate({
      where: { estoqueId: dto.estoqueId },
      _sum: { quantidade: true },
    });
    const totalAlocada = sumAlloc._sum.quantidade ?? 0;

    const quantidadeDisponivel = Math.max(0, estoque.quantidade - totalAlocada);
    if (dto.quantidade > quantidadeDisponivel) {
      throw new BadRequestException(
        `Quantidade de avaria (${dto.quantidade}) excede o disponível (${quantidadeDisponivel}).`,
      );
    }

    const novaQuantidade = estoque.quantidade - dto.quantidade;
    await this.prisma.estoque.update({
      where: { id: estoque.id },
      data: { quantidade: novaQuantidade },
    });

    const created = await this.prisma.galpaoOutroItemAvaria.create({
      data: {
        estoqueId: dto.estoqueId,
        galpaoProdutoId: produtoId,
        quantidade: dto.quantidade,
        justificativa: dto.justificativa.trim(),
        criadoPorId: userId,
      },
    });

    return {
      message: 'Avaria registrada com sucesso.',
      avaria: created,
    };
  }

  async listAvariasOutroItem(estoqueId: number) {
    const avarias = await this.prisma.galpaoOutroItemAvaria.findMany({
      where: { estoqueId },
      orderBy: { dataCriacao: 'desc' },
      include: {
        galpaoProduto: { select: { id: true, nome: true } },
      },
    });

    return avarias;
  }

  async updateOutroItemAvariaJustificativa(avariaId: number, justificativa: string) {
    const j = justificativa?.trim();
    if (!j) throw new BadRequestException('Justificativa é obrigatória.');

    const existing = await this.prisma.galpaoOutroItemAvaria.findUnique({ where: { id: avariaId } });
    if (!existing) throw new NotFoundException('Registro de avaria não encontrado.');

    return this.prisma.galpaoOutroItemAvaria.update({
      where: { id: avariaId },
      data: { justificativa: j },
    });
  }

  async deleteOutroItemAvaria(avariaId: number) {
    const avaria = await this.prisma.galpaoOutroItemAvaria.findUnique({
      where: { id: avariaId },
      select: { id: true, estoqueId: true, quantidade: true },
    });
    if (!avaria) throw new NotFoundException('Registro de avaria não encontrado.');

    return this.prisma.$transaction(async (tx) => {
      const estoque = await tx.estoque.findUnique({ where: { id: avaria.estoqueId } });
      if (!estoque) throw new NotFoundException('Item de estoque não encontrado.');

      await tx.estoque.update({
        where: { id: estoque.id },
        data: { quantidade: estoque.quantidade + avaria.quantidade },
      });

      await tx.galpaoOutroItemAvaria.delete({ where: { id: avariaId } });

      return { message: 'Avaria excluída e quantidade devolvida ao estoque disponível.' };
    });
  }

  /**
   * Lista orçamentos de curadoria em COMPRADO_ACAMINHO para o almoxarifado marcar recebimento
   * (sem acessar a tela completa de curadoria).
   */
  async listCuradoriaOrcamentosACaminho() {
    const rows = await this.prisma.curadoriaOrcamento.findMany({
      where: { status: CompraStatus.COMPRADO_ACAMINHO },
      select: {
        id: true,
        nome: true,
        dataCriacao: true,
        projeto: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
        _count: { select: { itens: true } },
      },
      orderBy: { dataCriacao: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      dataCriacao: r.dataCriacao,
      projeto: r.projeto,
      fornecedor: r.fornecedor,
      quantidadeItens: r._count.itens,
    }));
  }

  /** Marca orçamento de curadoria como ENTREGUE para os itens entrarem no estoque do almoxarifado. */
  async marcarCuradoriaOrcamentoEntregue(orcamentoId: number) {
    const existing = await this.prisma.curadoriaOrcamento.findUnique({
      where: { id: orcamentoId },
      select: { id: true, nome: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Orçamento de curadoria não encontrado.');
    }
    if (existing.status !== CompraStatus.COMPRADO_ACAMINHO) {
      throw new BadRequestException(
        'Somente orçamentos com status "Comprado / A caminho" podem ser marcados como entregues aqui.',
      );
    }

    await this.prisma.curadoriaOrcamento.update({
      where: { id: orcamentoId },
      data: { status: CompraStatus.ENTREGUE },
    });

    return {
      id: existing.id,
      nome: existing.nome,
      status: CompraStatus.ENTREGUE,
      message:
        'Orçamento marcado como entregue. Os itens passam a compor o estoque disponível no almoxarifado.',
    };
  }
}

