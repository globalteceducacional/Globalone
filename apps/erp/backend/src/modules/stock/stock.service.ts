import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { UpdatePurchaseStatusDto } from './dto/update-purchase-status.dto';
import { BatchPurchaseToAcaminhoDto } from './dto/batch-purchase-to-acaminho.dto';
import {
  CompraClasse,
  CompraStatus,
  EstoqueStatus,
  NotificacaoTipo,
  Prisma,
  RequerimentoTipo,
} from '@prisma/client';
import { PagoPorEntryDto } from './dto/pago-por.dto';
import { ImportPurchasesXlsxDto } from './dto/import-purchases-xlsx.dto';
import { ImportPurchaseSheetDto } from './dto/import-purchase-sheet.dto';
import { ImportEstoqueSheetDto } from './dto/import-estoque-sheet.dto';
import { CreateCuradoriaRegisterDto, CuradoriaItemInput } from './dto/create-curadoria-register.dto';
import { UpsertSignatureMonthDto } from './dto/upsert-signature-month.dto';
import { SignatureMonthReportQueryDto } from './dto/signature-month-report-query.dto';
import { assinaturaMesTemNfEComprovante } from './attachment-urls';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async findSystemSenderId(excludeId?: number): Promise<number | null> {
    const permFilter = {
      cargo: { permissions: { some: { permission: { OR: [{ modulo: 'compras', acao: 'aprovar' }, { modulo: 'sistema', acao: 'administrar' }] } } } },
    };
    if (excludeId) {
      const user = await this.prisma.usuario.findFirst({
        where: { ativo: true, id: { not: excludeId }, ...permFilter },
        orderBy: { id: 'asc' },
      });
      if (user) return user.id;
    }
    const user = await this.prisma.usuario.findFirst({
      where: { ativo: true, ...permFilter },
      orderBy: { id: 'asc' },
    });
    if (user) return user.id;
    const fallback = await this.prisma.usuario.findFirst({ where: { ativo: true }, orderBy: { id: 'asc' } });
    return fallback?.id ?? null;
  }

  private normalizeHeader(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  private formatMonthRef(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private normalizeMonthRef(monthRef?: string): string {
    const raw = (monthRef || '').trim();
    if (!raw) return this.formatMonthRef();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
      throw new BadRequestException('Mês de referência inválido. Use formato YYYY-MM.');
    }
    return raw;
  }

  private async findCategoriaCompraById(categoriaId?: number | null) {
    if (!categoriaId) return null;
    return (this.prisma as any).categoriaCompra.findUnique({
      where: { id: categoriaId },
    });
  }

  private isAssinaturaCategoria(categoria: any): boolean {
    return Boolean(categoria?.isAssinatura || categoria?.recorrenciaMensal);
  }

  private async resolveCompraClasse(
    classe?: CompraClasse,
    categoriaId?: number,
  ): Promise<CompraClasse> {
    if (classe) return classe;
    if (!categoriaId) return CompraClasse.ESTOQUE;
    const categoria = await this.findCategoriaCompraById(categoriaId);
    if (this.isAssinaturaCategoria(categoria)) return CompraClasse.ASSINATURA;
    if (categoria?.isDespesa) return CompraClasse.DESPESA;
    return CompraClasse.ESTOQUE;
  }

  /** NF e comprovante do mês preenchidos (um ou mais URLs por campo). */
  private isAssinaturaMesDocumentacaoCompleta(row: {
    nfUrl?: string | null;
    comprovantePagamentoUrl?: string | null;
  } | null | undefined): boolean {
    return assinaturaMesTemNfEComprovante(row?.nfUrl, row?.comprovantePagamentoUrl);
  }

  private emptyToNullUrl(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const t = String(value).trim();
    return t.length > 0 ? t : null;
  }

  async listMetodosPagoCompra() {
    return this.prisma.metodoPagoCompra.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    });
  }

  async createMetodoPagoCompra(nome: string) {
    const trimmed = nome.trim().slice(0, 200);
    if (!trimmed) {
      throw new BadRequestException('Nome do método é obrigatório');
    }
    const exists = await this.prisma.metodoPagoCompra.findFirst({
      where: { nome: trimmed },
    });
    if (exists) {
      if (!exists.ativo) {
        return this.prisma.metodoPagoCompra.update({
          where: { id: exists.id },
          data: { ativo: true },
          select: { id: true, nome: true },
        });
      }
      throw new BadRequestException('Já existe um método com este nome');
    }
    return this.prisma.metodoPagoCompra.create({
      data: { nome: trimmed },
      select: { id: true, nome: true },
    });
  }

  private async findOrCreateMetodoPagoCompra(nome: string) {
    const trimmed = nome.trim().slice(0, 200);
    if (!trimmed) return null;
    let m = await this.prisma.metodoPagoCompra.findFirst({
      where: { nome: trimmed, ativo: true },
    });
    if (m) return m;
    try {
      return await this.prisma.metodoPagoCompra.create({
        data: { nome: trimmed },
      });
    } catch {
      return this.prisma.metodoPagoCompra.findFirst({
        where: { nome: trimmed },
      });
    }
  }

  /** Valida e grava quem/método do pagamento (usuário, pessoa externa ou método cadastrado). */
  private async sanitizePagoPorJson(
    entries: PagoPorEntryDto[] | undefined,
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (!entries || entries.length === 0) {
      return undefined;
    }
    const out: Record<string, unknown>[] = [];
    for (const e of entries) {
      if (e.tipo === 'usuario' && e.usuarioId) {
        const u = await this.prisma.usuario.findUnique({
          where: { id: e.usuarioId },
          select: { id: true, nome: true },
        });
        if (u) {
          out.push({ tipo: 'usuario', usuarioId: u.id, nome: u.nome });
        }
      } else if (e.tipo === 'pessoa' && e.texto?.trim()) {
        out.push({ tipo: 'pessoa', nome: e.texto.trim().slice(0, 200) });
      } else if (e.tipo === 'metodo') {
        if (e.metodoId) {
          const m = await this.prisma.metodoPagoCompra.findFirst({
            where: { id: e.metodoId, ativo: true },
          });
          if (m) {
            out.push({ tipo: 'metodo', metodoId: m.id, descricao: m.nome });
          }
        } else if (e.texto?.trim()) {
          const m = await this.findOrCreateMetodoPagoCompra(e.texto.trim());
          if (m) {
            out.push({ tipo: 'metodo', metodoId: m.id, descricao: m.nome });
          }
        }
      }
    }
    return out.length > 0 ? (out as unknown as Prisma.InputJsonValue) : undefined;
  }

  /**
   * Salva um data URL (base64) em disco e retorna a URL pública (/uploads/...).
   * Se o valor não for data URL, devolve o próprio valor.
   */
  private async persistDataUrl(
    value: string | undefined | null,
    subdir: string,
  ): Promise<string | undefined> {
    if (!value || typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    const dataUrlMatch = /^data:(.+);base64,(.+)$/i.exec(trimmed);
    if (!dataUrlMatch) {
      // Já é uma URL normal (http, https ou /uploads/...), apenas devolver
      return trimmed;
    }

    const mimeType = dataUrlMatch[1] || 'application/octet-stream';
    const base64Data = dataUrlMatch[2];

    let extension = 'bin';
    const mimeToExt: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    if (mimeToExt[mimeType]) {
      extension = mimeToExt[mimeType];
    } else if (mimeType.startsWith('image/')) {
      extension = mimeType.slice('image/'.length);
    }

    const buffer = Buffer.from(base64Data, 'base64');

    const baseDirEnv = process.env.UPLOADS_DIR;
    const baseDir =
      baseDirEnv && !/^https?:\/\//i.test(baseDirEnv)
        ? baseDirEnv.startsWith('.')
          ? join(process.cwd(), baseDirEnv)
          : baseDirEnv
        : join(process.cwd(), 'uploads');

    const dir = join(baseDir, subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
    const filePath = join(dir, filename);
    await fs.promises.writeFile(filePath, buffer);

    const prefix = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');
    const publicPath = `${prefix}/${subdir}/${filename}`;
    return publicPath;
  }

  private parseNumber(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const raw = String(value).trim();
    let normalized = raw;
    if (raw.includes(',') && raw.includes('.')) {
      // Ex.: 1.234,56
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      // Ex.: 12,50
      normalized = raw.replace(',', '.');
    }
    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
  }

  private pickRowValue(rowMap: Map<string, unknown>, aliases: string[]): unknown {
    for (const alias of aliases) {
      const found = rowMap.get(this.normalizeHeader(alias));
      if (found !== undefined && found !== null && String(found).trim() !== '') {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Interpreta célula: trechos separados por ; — cada um é «email (qtd)» (usuário) ou «nome do setor (qtd)» (sem @).
   */
  private parseAlocacoesFromSheetCell(
    raw: unknown,
  ):
    | {
        entries: (
          | { kind: 'usuario'; email: string; quantidade: number }
          | { kind: 'setor'; nome: string; quantidade: number }
        )[];
      }
    | { error: string } {
    if (raw === undefined || raw === null) {
      return { entries: [] };
    }
    const s = String(raw).trim();
    if (!s) {
      return { entries: [] };
    }
    const segments = s.split(';').map((x) => x.trim()).filter((x) => x.length > 0);
    const entries: (
      | { kind: 'usuario'; email: string; quantidade: number }
      | { kind: 'setor'; nome: string; quantidade: number }
    )[] = [];
    for (const seg of segments) {
      const open = seg.lastIndexOf('(');
      const close = seg.lastIndexOf(')');
      if (open === -1 || close === -1 || close <= open) {
        return {
          error: `Formato inválido em «${seg.slice(0, 48)}». Use: email (qtd) ou nome do setor (qtd), separados por ;`,
        };
      }
      const label = seg.slice(0, open).trim();
      const qtyStr = seg.slice(open + 1, close).trim();
      const qty = Math.trunc(Number(qtyStr));
      if (!label) {
        return { error: 'Identificador ausente em um trecho de alocação (e-mail ou nome do setor).' };
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return {
          error: `Quantidade inválida para «${label.slice(0, 64)}» (use inteiro > 0 entre parênteses).`,
        };
      }
      if (label.includes('@')) {
        entries.push({ kind: 'usuario', email: label, quantidade: qty });
      } else {
        entries.push({ kind: 'setor', nome: label, quantidade: qty });
      }
    }
    return { entries };
  }

  private parseDateValue(value: unknown): string | undefined {
    if (value == null || value === '') return undefined;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  private buildCuradoriaObservation(base: string | undefined, registroId: string): string {
    const trimmed = base?.trim() ?? '';
    const prefix = `Registro Curadoria: ${registroId}`;
    return trimmed ? `${prefix} | ${trimmed}` : prefix;
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

  /**
   * Soma o frete da linha (parcela do frete do lote para esta compra) ao campo `frete` por unidade da cotação selecionada.
   * Se não houver cotações, cria uma linha única usando `valorUnitario` da compra.
   */
  private applyFreightShareToCompraCotacoes(
    compra: {
      cotacoesJson: unknown;
      cotacaoSelecionadaIndex: number | null;
      quantidade: number;
      valorUnitario: number | null;
    },
    freightLineAmount: number,
  ): unknown[] {
    const qty = Math.max(1, compra.quantidade || 1);
    const addPerUnit = Number((freightLineAmount / qty).toFixed(4));
    const cotacoes = Array.isArray(compra.cotacoesJson) ? [...(compra.cotacoesJson as Record<string, unknown>[])] : [];

    if (cotacoes.length === 0) {
      const vu = Number(compra.valorUnitario) || 0;
      return [
        {
          valorUnitario: vu,
          frete: addPerUnit,
          impostos: 0,
          desconto: 0,
          descontoTipo: 'valor',
          link: '',
          formaPagamento: '',
        },
      ];
    }

    const idx = Math.min(
      Math.max(0, compra.cotacaoSelecionadaIndex ?? 0),
      cotacoes.length - 1,
    );

    return cotacoes.map((c, j) => {
      if (j !== idx) return c;
      const oldF = Number(c.frete) || 0;
      return {
        ...c,
        frete: Number((oldF + addPerUnit).toFixed(4)),
      };
    });
  }

  async fetchBookByIsbn(isbn: string) {
    const cleaned = isbn.toUpperCase().replace(/[^0-9X]/g, '');
    if (!(cleaned.length === 10 || cleaned.length === 13)) {
      throw new BadRequestException('ISBN inválido. Informe 10 ou 13 caracteres.');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleaned}`,
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new BadRequestException('Erro ao buscar dados do ISBN.');
      }

      const payload = await response.json();
      const volumeInfo = payload?.items?.[0]?.volumeInfo;
      if (!volumeInfo) {
        throw new BadRequestException('Livro não encontrado para o ISBN informado.');
      }

      return {
        isbn: cleaned,
        titulo: String(volumeInfo.title ?? '').trim() || null,
        subtitulo: String(volumeInfo.subtitle ?? '').trim() || null,
        autores: Array.isArray(volumeInfo.authors)
          ? volumeInfo.authors.map((author: unknown) => String(author))
          : [],
        editora: String(volumeInfo.publisher ?? '').trim() || null,
        anoPublicacao: String(volumeInfo.publishedDate ?? '').trim() || null,
        categorias: Array.isArray(volumeInfo.categories)
          ? volumeInfo.categories.map((category: unknown) => String(category))
          : [],
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new BadRequestException('Tempo de espera excedido ao buscar dados do ISBN.');
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Erro ao buscar dados do ISBN. Verifique o valor informado.',
      );
    }
  }

  private async createCuradoriaItems(
    items: CuradoriaItemInput[],
    params: {
      projetoId?: number;
      solicitadoPorId: number;
      descontoAplicadoEm: 'item' | 'total';
      descontoTotal?: number;
      observacao?: string;
      registroId: string;
    },
  ) {
    if (!items.length) {
      throw new BadRequestException('Informe ao menos um item no registro.');
    }

    const valores = items.map((item) => item.valor);
    const descontosPorItem =
      params.descontoAplicadoEm === 'total'
        ? this.buildDiscountsByTotal(valores, params.descontoTotal ?? 0)
        : items.map((item) => item.desconto ?? 0);

    const createPayloads = items.map((item, index) => {
      const descontoAplicado = descontosPorItem[index] ?? 0;
      const valorLiquidoUnitario = Number(Math.max(0, item.valor - descontoAplicado).toFixed(2));

      return {
        projetoId: params.projetoId || null,
        categoriaId: item.categoriaId,
        item: item.nome,
        descricao: `ISBN: ${item.isbn}`,
        quantidade: 1,
        valorUnitario: valorLiquidoUnitario,
        status: CompraStatus.SOLICITADO,
        solicitadoPorId: params.solicitadoPorId,
        observacao: this.buildCuradoriaObservation(params.observacao, params.registroId),
        cotacoesJson: [
          {
            valorOriginal: item.valor,
            valorUnitario: valorLiquidoUnitario,
            desconto: descontoAplicado,
            descontoTipo: 'valor',
            isbn: item.isbn,
            registroCuradoriaId: params.registroId,
            descontoAplicadoEm: params.descontoAplicadoEm,
          },
        ],
      };
    });

    await this.prisma.$transaction(
      createPayloads.map((payload) =>
        this.prisma.compra.create({
          data: payload as any,
        }),
      ),
    );

    const totalBruto = Number(valores.reduce((sum, value) => sum + value, 0).toFixed(2));
    const totalDesconto = Number(descontosPorItem.reduce((sum, value) => sum + value, 0).toFixed(2));
    return {
      registroId: params.registroId,
      count: createPayloads.length,
      totalBruto,
      totalDesconto,
      totalLiquido: Number((totalBruto - totalDesconto).toFixed(2)),
    };
  }

  async createCuradoriaRegister(data: CreateCuradoriaRegisterDto, solicitadoPorId: number) {
    if (data.projetoId) {
      await this.ensureProjectExists(data.projetoId);
    }

    const uniqueCategoryIds = Array.from(new Set(data.itens.map((item) => item.categoriaId)));
    const categories = await this.prisma.categoriaCompra.findMany({
      where: { id: { in: uniqueCategoryIds } },
      select: { id: true },
    });
    if (categories.length !== uniqueCategoryIds.length) {
      throw new BadRequestException('Um ou mais itens possuem categoria inválida.');
    }

    if (data.descontoAplicadoEm === 'total' && (data.descontoTotal == null || data.descontoTotal < 0)) {
      throw new BadRequestException('Informe o desconto total quando aplicado no valor total.');
    }

    const registroId = `CUR-${Date.now()}`;
    const result = await this.createCuradoriaItems(data.itens, {
      projetoId: data.projetoId,
      solicitadoPorId,
      descontoAplicadoEm: data.descontoAplicadoEm,
      descontoTotal: data.descontoTotal,
      observacao: data.observacao,
      registroId,
    });

    return {
      message: 'Registro de curadoria criado com sucesso.',
      ...result,
    };
  }

  async importPurchasesFromXlsx(
    fileBuffer: Buffer,
    options: ImportPurchasesXlsxDto,
    solicitadoPorId: number,
  ) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('Planilha XLSX sem abas válidas');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });

    if (!rows.length) {
      throw new BadRequestException('Planilha sem linhas de dados');
    }

    const overwriteCurrent = options.overwriteCurrent === true;
    const projetoId = options.projetoId;
    const categoriaId = options.categoriaId;
    const descontoAplicadoEm = options.descontoAplicadoEm ?? 'item';
    const descontoTotal = options.descontoTotal;

    if (overwriteCurrent && !projetoId) {
      throw new BadRequestException(
        'Para sobrescrever orçamento atual, informe o projeto (projetoId).',
      );
    }

    if (projetoId) {
      await this.ensureProjectExists(projetoId);
    }

    if (categoriaId) {
      const category = await this.prisma.categoriaCompra.findUnique({
        where: { id: categoriaId },
      });
      if (!category) {
        throw new BadRequestException('Categoria informada não existe');
      }
    }

    if (descontoAplicadoEm === 'total' && (descontoTotal == null || descontoTotal < 0)) {
      throw new BadRequestException('Informe descontoTotal para desconto aplicado no total.');
    }

    const removed = overwriteCurrent && projetoId
      ? await this.prisma.compra.deleteMany({
          where: {
            projetoId,
            status: { in: [CompraStatus.SOLICITADO, CompraStatus.PENDENTE, CompraStatus.REPROVADO] },
          },
        })
      : { count: 0 };

    const categoryNameMap = new Map<string, number>();
    if (!categoriaId) {
      const allCategories = await this.prisma.categoriaCompra.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
      });
      for (const category of allCategories) {
        categoryNameMap.set(this.normalizeHeader(category.nome), category.id);
      }
    }

    const importItems: CuradoriaItemInput[] = [];
    let skipped = 0;

    for (const row of rows) {
      const rowMap = new Map<string, unknown>();
      Object.entries(row).forEach(([key, value]) => {
        rowMap.set(this.normalizeHeader(key), value);
      });

      const nome = String(
        rowMap.get('nome') ??
          rowMap.get('item') ??
          rowMap.get('titulo') ??
          rowMap.get('descricao') ??
          '',
      ).trim();
      const isbn = String(
        rowMap.get('isbn') ??
          rowMap.get('codigodebarras') ??
          rowMap.get('codigobarras') ??
          '',
      ).trim();
      const valor = this.parseNumber(
        rowMap.get('valor') ??
          rowMap.get('vunit') ??
          rowMap.get('valorunitario') ??
          rowMap.get('precotabela'),
      );
      const desconto = this.parseNumber(rowMap.get('desconto') ?? rowMap.get('desc')) ?? 0;
      const categoryFromSheet = String(rowMap.get('categoria') ?? '').trim();
      const categoryIdResolved =
        categoriaId ??
        categoryNameMap.get(this.normalizeHeader(categoryFromSheet));

      if (!nome || !isbn || !valor || valor < 0 || !categoryIdResolved) {
        skipped += 1;
        continue;
      }

      importItems.push({
        nome: nome.slice(0, 120),
        isbn: isbn.slice(0, 60),
        categoriaId: categoryIdResolved,
        valor,
        desconto,
      });
    }

    if (!importItems.length) {
      throw new BadRequestException(
        'Nenhum item válido encontrado. Colunas obrigatórias: nome, isbn, categoria, valor.',
      );
    }

    const registroId = `CUR-IMP-${Date.now()}`;
    const result = await this.createCuradoriaItems(importItems, {
      projetoId,
      solicitadoPorId,
      descontoAplicadoEm,
      descontoTotal,
      observacao: 'Importado via planilha XLSX (Curadoria).',
      registroId,
    });

    return {
      message: 'Importação XLSX concluída.',
      imported: result.count,
      skipped,
      removed: removed.count,
      overwriteCurrent,
      projetoId: projetoId ?? null,
      registroId: result.registroId,
      totalBruto: result.totalBruto,
      totalDesconto: result.totalDesconto,
      totalLiquido: result.totalLiquido,
    };
  }

  async importPurchasesSheet(
    fileBuffer: Buffer,
    options: ImportPurchaseSheetDto,
    solicitadoPorId: number,
  ) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('Planilha XLSX sem abas válidas');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });
    if (!rows.length) {
      throw new BadRequestException('Planilha sem linhas de dados');
    }

    const overwriteCurrent = options.overwriteCurrent === true;
    if (options.projetoId) {
      await this.ensureProjectExists(options.projetoId);
    }

    if (options.categoriaId) {
      const categoria = await this.prisma.categoriaCompra.findUnique({
        where: { id: options.categoriaId },
        select: { id: true },
      });
      if (!categoria) {
        throw new BadRequestException('Categoria padrão informada não existe');
      }
    }

    if (options.setorId) {
      const setor = await this.prisma.setor.findUnique({
        where: { id: options.setorId },
        select: { id: true },
      });
      if (!setor) {
        throw new BadRequestException('Setor padrão informado não existe');
      }
    }

    const removed = overwriteCurrent && options.projetoId
      ? await this.prisma.compra.deleteMany({
          where: {
            projetoId: options.projetoId,
            status: { in: [CompraStatus.SOLICITADO, CompraStatus.PENDENTE, CompraStatus.REPROVADO] },
          },
        })
      : { count: 0 };

    const categoryNameMap = new Map<string, number>();
    const projectNameMap = new Map<string, number>();
    const setorNameMap = new Map<string, number>();
    const userEmailMap = new Map<string, number>();
    const allCategories = await this.prisma.categoriaCompra.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    /** Todos os projetos (incl. finalizados) para casar nome na planilha; compras podem referenciar qualquer projeto existente. */
    const allProjects = await this.prisma.projeto.findMany({
      select: { id: true, nome: true },
    });
    const projectIdSet = new Set(allProjects.map((p) => p.id));
    const allSetores = await this.prisma.setor.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    const allUsers = await this.prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, email: true },
    });
    for (const category of allCategories) {
      categoryNameMap.set(this.normalizeHeader(category.nome), category.id);
    }
    for (const project of allProjects) {
      projectNameMap.set(this.normalizeHeader(project.nome), project.id);
    }
    for (const setor of allSetores) {
      setorNameMap.set(this.normalizeHeader(setor.nome), setor.id);
    }
    for (const user of allUsers) {
      userEmailMap.set(this.normalizeHeader((user as any).email ?? ''), user.id);
    }

    let imported = 0;
    let importedAsEntregue = 0;
    let skipped = 0;
    const errors: string[] = [];
    const projetoWarnings: string[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowMap = new Map<string, unknown>();
      Object.entries(row).forEach(([key, value]) => {
        rowMap.set(this.normalizeHeader(key), value);
      });

      const item = String(
        this.pickRowValue(rowMap, ['item', 'produto', 'nome', 'descricao', 'titulo']) ?? '',
      ).trim();
      const quantidadeRaw = this.pickRowValue(rowMap, ['quantidade', 'qtd', 'qtde', 'qty', 'quantity']);
      const valorUnitarioRaw = this.pickRowValue(rowMap, ['valor unitario', 'valor', 'preco', 'vunit', 'unit price']);
      const descontoRaw = this.pickRowValue(rowMap, ['desconto', 'desc']);
      const freteRaw = this.pickRowValue(rowMap, ['frete', 'shipping']);
      const impostosRaw = this.pickRowValue(rowMap, ['impostos', 'taxas', 'tax']);
      const valorUnitario = this.parseNumber(valorUnitarioRaw);
      const desconto = this.parseNumber(descontoRaw);
      const frete = this.parseNumber(freteRaw);
      const impostos = this.parseNumber(impostosRaw);
      const link = String(this.pickRowValue(rowMap, ['link', 'url', 'href']) ?? '').trim();
      const observacao = String(this.pickRowValue(rowMap, ['observacao', 'obs', 'nota']) ?? '').trim();
      const formaPagamento = String(
        this.pickRowValue(rowMap, ['forma pagamento', 'pagamento', 'payment']) ?? '',
      ).trim();
      const fornecedor = String(
        this.pickRowValue(rowMap, ['fornecedor', 'supplier']) ?? '',
      ).trim();
      const dataCompra = this.parseDateValue(
        this.pickRowValue(rowMap, ['data da compra', 'datacompra', 'data compra', 'purchase date']),
      );
      const statusRaw = String(
        this.pickRowValue(rowMap, ['status da compra', 'statuscompra', 'status']) ?? '',
      ).trim();
      const categoriaNome = String(this.pickRowValue(rowMap, ['categoria', 'tipo']) ?? '').trim();
      const projetoRaw = this.pickRowValue(rowMap, ['projeto', 'projeto id', 'project']);
      const setorRaw = this.pickRowValue(rowMap, ['setor', 'setor id', 'department']);
      const solicitanteRaw = this.pickRowValue(rowMap, ['solicitante', 'usuario', 'requester']);

      const categoriaIdResolved =
        options.categoriaId ?? categoryNameMap.get(this.normalizeHeader(categoriaNome));

      const excelRow = i + 2;
      let projetoIdResolved: number | undefined = options.projetoId;
      let projetoWarnForRow: { projetoStr: string; byNum: number | undefined } | null = null;
      if (!options.projetoId) {
        const projetoStr = String(projetoRaw ?? '').trim();
        if (projetoStr === '') {
          projetoIdResolved = undefined;
        } else {
          const byNum = this.parseNumber(projetoRaw);
          let resolved: number | undefined;
          if (byNum !== undefined && Number.isInteger(byNum) && byNum > 0 && projectIdSet.has(byNum)) {
            resolved = byNum;
          } else {
            resolved = projectNameMap.get(this.normalizeHeader(projetoStr));
          }
          projetoIdResolved = resolved;
          if (resolved === undefined) {
            projetoWarnForRow = { projetoStr, byNum };
          }
        }
      }

      const setorIdResolved =
        options.setorId ??
        this.parseNumber(setorRaw) ??
        setorNameMap.get(this.normalizeHeader(String(setorRaw ?? '')));
      const solicitanteIdResolved =
        this.parseNumber(solicitanteRaw) ??
        userEmailMap.get(this.normalizeHeader(String(solicitanteRaw ?? ''))) ??
        solicitadoPorId;

      const cellEmpty = (v: unknown) =>
        v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

      const quantidadeParsed = this.parseNumber(quantidadeRaw);
      const quantidade =
        quantidadeParsed != null && !Number.isNaN(quantidadeParsed) ? Math.trunc(quantidadeParsed) : 0;

      const rowProblems: string[] = [];
      if (!item) rowProblems.push('item vazio ou ausente');
      if (!link) rowProblems.push('link vazio ou ausente');
      if (cellEmpty(quantidadeRaw)) rowProblems.push('quantidade ausente (célula vazia)');
      else if (quantidade <= 0) rowProblems.push(`quantidade inválida (${quantidade})`);
      if (cellEmpty(valorUnitarioRaw)) rowProblems.push('valor unitário ausente (célula vazia)');
      else if (valorUnitario == null) rowProblems.push('valor unitário inválido');
      if (cellEmpty(descontoRaw)) rowProblems.push('desconto ausente (célula vazia)');
      else if (desconto == null) rowProblems.push('desconto inválido');
      if (cellEmpty(freteRaw)) rowProblems.push('frete ausente (célula vazia)');
      else if (frete == null) rowProblems.push('frete inválido');
      if (cellEmpty(impostosRaw)) rowProblems.push('impostos ausentes (célula vazia)');
      else if (impostos == null) rowProblems.push('impostos inválidos');
      if (!categoriaIdResolved) {
        if (categoriaNome) {
          rowProblems.push(`categoria "${categoriaNome}" não encontrada (use nome igual ao cadastro ou categoria padrão no import)`);
        } else {
          rowProblems.push('categoria ausente na planilha e sem categoria padrão no import');
        }
      }

      if (rowProblems.length > 0) {
        skipped += 1;
        if (errors.length < 50) {
          errors.push(`Linha ${excelRow} (planilha): ${rowProblems.join('; ')}`);
        }
        continue;
      }

      if (projetoWarnForRow && projetoWarnings.length < 80) {
        const { projetoStr, byNum } = projetoWarnForRow;
        if (byNum !== undefined && Number.isInteger(byNum) && byNum > 0 && !projectIdSet.has(byNum)) {
          projetoWarnings.push(
            `Linha ${excelRow}: id de projeto ${byNum} não existe no cadastro; importado sem projeto.`,
          );
        } else {
          projetoWarnings.push(
            `Linha ${excelRow}: projeto «${projetoStr}» não encontrado no cadastro; importado sem projeto.`,
          );
        }
      }

      let status: CompraStatus = CompraStatus.SOLICITADO;
      if (statusRaw) {
        const statusNorm = this.normalizeHeader(statusRaw);
        if (statusNorm.includes('pendente')) status = CompraStatus.PENDENTE;
        else if (statusNorm.includes('comprado') || statusNorm.includes('acaminho')) status = CompraStatus.COMPRADO_ACAMINHO;
        else if (statusNorm.includes('entregue')) status = CompraStatus.ENTREGUE;
        else if (statusNorm.includes('reprovado')) status = CompraStatus.REPROVADO;
        else if (statusNorm.includes('solicitado')) status = CompraStatus.SOLICITADO;
      }

      const cotacoes: Record<string, unknown>[] = [];
      const freteNum = frete ?? 0;
      const impostosNum = impostos ?? 0;
      if (valorUnitario != null || freteNum > 0 || impostosNum > 0 || link || formaPagamento) {
        cotacoes.push({
          fornecedor: fornecedor || 'Importado via planilha',
          valor: valorUnitario,
          frete: freteNum,
          impostos: impostosNum,
          desconto,
          link: link || null,
          formaPagamento: formaPagamento || null,
        });
      }

      try {
        const statusImportacao = statusRaw
          ? status
          : cotacoes.length > 0
            ? CompraStatus.PENDENTE
            : CompraStatus.SOLICITADO;
        await this.createPurchase(
          {
            projetoId: projetoIdResolved,
            setorId: setorIdResolved,
            categoriaId: categoriaIdResolved,
            item: item.slice(0, 200),
            quantidade,
            valorUnitario: valorUnitario ?? undefined,
            observacao: observacao || 'Importado via planilha (compras/estoque).',
            cotacoes: cotacoes.length > 0 ? (cotacoes as any) : undefined,
            status: statusImportacao,
            dataCompra,
          } as any,
          solicitanteIdResolved,
        );
        imported += 1;
        if (statusImportacao === CompraStatus.ENTREGUE) {
          importedAsEntregue += 1;
        }
      } catch (error) {
        skipped += 1;
        if (errors.length < 50) {
          const message = error instanceof Error ? error.message : 'Erro desconhecido';
          errors.push(`Linha ${i + 2} (planilha): erro ao gravar — ${message}`);
        }
      }
    }

    if (imported === 0) {
      const detailBlock =
        errors.length > 0
          ? `\n\nDetalhes por linha:\n${errors.map((e) => `• ${e}`).join('\n')}`
          : '';

      const allRowsMissingCategoryDefault =
        errors.length > 0 &&
        errors.every((e) =>
          e.includes('categoria ausente na planilha e sem categoria padrão no import'),
        );
      const summary = allRowsMissingCategoryDefault
        ? 'A coluna «categoria» está vazia na planilha e nenhuma categoria padrão foi selecionada no modal de importação. Preencha a coluna categoria em cada linha (nome igual ao cadastro) ou escolha «Categoria (padrão)» antes de importar.\n\n'
        : '';

      throw new BadRequestException(
        `${summary}Nenhuma linha válida foi importada.${detailBlock}\n\nCampos obrigatórios: item, link, quantidade, valor unitário, desconto, frete, impostos e categoria (preencha a coluna na planilha ou use categoria padrão no modal).`,
      );
    }

    const stockInfo: string[] = [];
    if (importedAsEntregue > 0) {
      stockInfo.push(
        `${importedAsEntregue} compra(s) importada(s) com status Entregue: a quantidade correspondente foi lançada no estoque (mesmo item + projeto + etapa soma na mesma linha de estoque).`,
      );
    }

    return {
      message: 'Importação da planilha de compras concluída.',
      imported,
      importedAsEntregue,
      skipped,
      removed: removed.count,
      overwriteCurrent,
      projetoId: options.projetoId ?? null,
      warnings: [...stockInfo, ...errors, ...projetoWarnings],
    };
  }

  async importEstoqueSheet(fileBuffer: Buffer, options: ImportEstoqueSheetDto) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('Planilha XLSX sem abas válidas');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });
    if (!rows.length) {
      throw new BadRequestException('Planilha sem linhas de dados');
    }

    if (options.projetoId) {
      await this.ensureProjectExists(options.projetoId);
    }

    if (options.categoriaId) {
      const categoria = await this.prisma.categoriaCompra.findUnique({
        where: { id: options.categoriaId },
        select: { id: true },
      });
      if (!categoria) {
        throw new BadRequestException('Categoria padrão informada não existe');
      }
    }

    const categoryNameMap = new Map<string, number>();
    const projectNameMap = new Map<string, number>();
    const allCategories = await this.prisma.categoriaCompra.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    const allProjects = await this.prisma.projeto.findMany({
      select: { id: true, nome: true },
    });
    for (const category of allCategories) {
      categoryNameMap.set(this.normalizeHeader(category.nome), category.id);
    }
    for (const project of allProjects) {
      projectNameMap.set(this.normalizeHeader(project.nome), project.id);
    }
    const projectIdSet = new Set(allProjects.map((p) => p.id));

    const allUsersForAloc = await this.prisma.usuario.findMany({
      select: { id: true, email: true },
    });
    const emailLowerToUserId = new Map<string, number>();
    for (const u of allUsersForAloc) {
      const key = (u.email || '').trim().toLowerCase();
      if (key) {
        emailLowerToUserId.set(key, u.id);
      }
    }

    const allSetoresImport = await this.prisma.setor.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    const setorNameMapImport = new Map<string, number>();
    for (const se of allSetoresImport) {
      setorNameMapImport.set(this.normalizeHeader(se.nome), se.id);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const projetoWarnings: string[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowMap = new Map<string, unknown>();
      Object.entries(row).forEach(([key, value]) => {
        rowMap.set(this.normalizeHeader(key), value);
      });

      const item = String(
        this.pickRowValue(rowMap, ['item', 'produto', 'nome', 'titulo']) ?? '',
      ).trim();
      const quantidadeRaw = this.pickRowValue(rowMap, ['quantidade', 'qtd', 'qtde', 'qty', 'quantity']);
      const valorUnitarioRaw = this.pickRowValue(rowMap, ['valor unitario', 'valor', 'preco', 'vunit', 'unit price']);
      const descricao = String(this.pickRowValue(rowMap, ['descricao', 'desc', 'obs', 'observacao']) ?? '').trim();
      const categoriaNome = String(this.pickRowValue(rowMap, ['categoria', 'tipo']) ?? '').trim();
      const projetoRaw = this.pickRowValue(rowMap, ['projeto', 'projeto id', 'project']);
      const alocacoesRaw = this.pickRowValue(rowMap, [
        'alocacoes',
        'alocacao',
        'alloc',
        'alocado',
        'usuarios alocados',
        'alocado usuarios',
      ]);

      const categoriaIdResolved =
        options.categoriaId ?? categoryNameMap.get(this.normalizeHeader(categoriaNome));

      const excelRow = i + 2;
      let projetoIdResolved: number | undefined = options.projetoId;
      let projetoWarnForRow: { projetoStr: string; byNum: number | undefined } | null = null;
      if (!options.projetoId) {
        const projetoStr = String(projetoRaw ?? '').trim();
        if (projetoStr === '') {
          projetoIdResolved = undefined;
        } else {
          const byNum = this.parseNumber(projetoRaw);
          let resolved: number | undefined;
          if (byNum !== undefined && Number.isInteger(byNum) && byNum > 0 && projectIdSet.has(byNum)) {
            resolved = byNum;
          } else {
            resolved = projectNameMap.get(this.normalizeHeader(projetoStr));
          }
          projetoIdResolved = resolved;
          if (resolved === undefined) {
            projetoWarnForRow = { projetoStr, byNum };
          }
        }
      }

      const quantidadeParsed = this.parseNumber(quantidadeRaw);
      const quantidade =
        quantidadeParsed != null && !Number.isNaN(quantidadeParsed) ? Math.trunc(quantidadeParsed) : 0;

      const cellEmpty = (v: unknown) =>
        v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

      const rowProblems: string[] = [];
      let valorUnitarioFinal = 0;
      if (!cellEmpty(valorUnitarioRaw)) {
        const valorParsed = this.parseNumber(valorUnitarioRaw);
        if (valorParsed == null || Number.isNaN(valorParsed) || valorParsed < 0) {
          rowProblems.push('valor unitário inválido (use número ≥ 0 ou deixe vazio para 0)');
        } else {
          valorUnitarioFinal = valorParsed;
        }
      }

      if (!item) rowProblems.push('item vazio ou ausente');
      if (cellEmpty(quantidadeRaw)) rowProblems.push('quantidade ausente (célula vazia)');
      else if (quantidade <= 0) rowProblems.push(`quantidade inválida (${quantidade})`);
      if (!categoriaIdResolved) {
        if (categoriaNome) {
          rowProblems.push(
            `categoria "${categoriaNome}" não encontrada (use nome igual ao cadastro ou categoria padrão no import)`,
          );
        } else {
          rowProblems.push('categoria ausente na planilha e sem categoria padrão no import');
        }
      }

      let alocacoesEntries: (
        | { kind: 'usuario'; email: string; quantidade: number }
        | { kind: 'setor'; nome: string; quantidade: number }
      )[] = [];
      const alocParsed = this.parseAlocacoesFromSheetCell(alocacoesRaw ?? '');
      if ('error' in alocParsed) {
        rowProblems.push(alocParsed.error);
      } else {
        alocacoesEntries = alocParsed.entries;
      }

      if (alocacoesEntries.length > 0) {
        const sumAloc = alocacoesEntries.reduce((acc, e) => acc + e.quantidade, 0);
        if (sumAloc > quantidade) {
          rowProblems.push(
            `soma das alocações (${sumAloc}) excede a quantidade do item (${quantidade})`,
          );
        }
        const missingEmails: string[] = [];
        const missingSetores: string[] = [];
        for (const e of alocacoesEntries) {
          if (e.kind === 'usuario') {
            const key = e.email.trim().toLowerCase();
            if (!emailLowerToUserId.has(key)) {
              missingEmails.push(e.email.trim());
            }
          } else {
            const sid = setorNameMapImport.get(this.normalizeHeader(e.nome));
            if (!sid) {
              missingSetores.push(e.nome.trim());
            }
          }
        }
        if (missingEmails.length > 0) {
          rowProblems.push(`e-mail não cadastrado: ${missingEmails.join(', ')}`);
        }
        if (missingSetores.length > 0) {
          rowProblems.push(`setor não encontrado (nome igual ao cadastro): ${missingSetores.join(', ')}`);
        }
      }

      if (rowProblems.length > 0) {
        skipped += 1;
        if (errors.length < 50) {
          errors.push(`Linha ${excelRow} (planilha): ${rowProblems.join('; ')}`);
        }
        continue;
      }

      if (projetoWarnForRow && projetoWarnings.length < 80) {
        const { projetoStr, byNum } = projetoWarnForRow;
        if (byNum !== undefined && Number.isInteger(byNum) && byNum > 0 && !projectIdSet.has(byNum)) {
          projetoWarnings.push(
            `Linha ${excelRow}: id de projeto ${byNum} não existe no cadastro; importado sem projeto.`,
          );
        } else {
          projetoWarnings.push(
            `Linha ${excelRow}: projeto «${projetoStr}» não encontrado no cadastro; importado sem projeto.`,
          );
        }
      }

      try {
        if (projetoIdResolved) {
          await this.ensureProjectExists(projetoIdResolved);
        }
        await this.prisma.$transaction(async (tx) => {
          const created = await tx.estoque.create({
            data: {
              item: item.slice(0, 120),
              quantidade,
              valorUnitario: valorUnitarioFinal,
              descricao: descricao.length > 0 ? descricao.slice(0, 500) : null,
              categoriaId: categoriaIdResolved,
              projetoId: projetoIdResolved ?? null,
              status: EstoqueStatus.DISPONIVEL,
            },
          });
          const alocRepo = tx.estoqueAlocacao as any;

          if (alocacoesEntries.length > 0) {
            const cat = await tx.categoriaCompra.findUnique({
              where: { id: categoriaIdResolved! },
              select: { permiteAlocacao: true, isAssinatura: true, recorrenciaMensal: true },
            });
            if (cat && (cat.permiteAlocacao === false || this.isAssinaturaCategoria(cat))) {
              throw new BadRequestException(
                'Esta categoria não permite alocações; deixe a coluna de alocações vazia ou use outra categoria.',
              );
            }

            for (const e of alocacoesEntries) {
              const q = e.quantidade;
              if (e.kind === 'usuario') {
                const uid = emailLowerToUserId.get(e.email.trim().toLowerCase());
                if (!uid) {
                  throw new BadRequestException(`Usuário não encontrado: ${e.email.trim()}`);
                }
                const existing = await alocRepo.findFirst({
                  where: {
                    estoqueId: created.id,
                    projetoId: null,
                    etapaId: null,
                    usuarioId: uid,
                    setorId: null,
                  },
                });
                if (existing) {
                  await alocRepo.update({
                    where: { id: existing.id },
                    data: { quantidade: existing.quantidade + q },
                  });
                } else {
                  await alocRepo.create({
                    data: {
                      estoqueId: created.id,
                      projetoId: null,
                      etapaId: null,
                      usuarioId: uid,
                      setorId: null,
                      quantidade: q,
                    },
                  });
                }
              } else {
                const setorId = setorNameMapImport.get(this.normalizeHeader(e.nome));
                if (!setorId) {
                  throw new BadRequestException(`Setor não encontrado: ${e.nome.trim()}`);
                }
                const existing = await alocRepo.findFirst({
                  where: {
                    estoqueId: created.id,
                    projetoId: null,
                    etapaId: null,
                    usuarioId: null,
                    setorId,
                  },
                });
                if (existing) {
                  await alocRepo.update({
                    where: { id: existing.id },
                    data: { quantidade: existing.quantidade + q },
                  });
                } else {
                  await alocRepo.create({
                    data: {
                      estoqueId: created.id,
                      projetoId: null,
                      etapaId: null,
                      usuarioId: null,
                      setorId,
                      quantidade: q,
                    },
                  });
                }
              }
            }
          }
        });
        imported += 1;
      } catch (error) {
        skipped += 1;
        if (errors.length < 50) {
          const message =
            error instanceof BadRequestException
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Erro desconhecido';
          errors.push(`Linha ${excelRow} (planilha): erro ao gravar — ${message}`);
        }
      }
    }

    if (imported === 0) {
      const detailBlock =
        errors.length > 0
          ? `\n\nDetalhes por linha:\n${errors.map((e) => `• ${e}`).join('\n')}`
          : '';
      throw new BadRequestException(
        `Nenhuma linha válida foi importada.${detailBlock}\n\nCampos obrigatórios: item, quantidade e categoria (preencha a coluna na planilha ou use categoria padrão no modal). Valor unitário é opcional (padrão 0). Alocações são opcionais: coluna «alocações» no formato email (qtd) ou nome do setor (qtd), separados por ; (soma ≤ quantidade do item).`,
      );
    }

    return {
      message: 'Importação da planilha de estoque concluída.',
      imported,
      skipped,
      warnings: [...errors, ...projetoWarnings],
    };
  }

  /** Linhas da planilha (inclui cabeçalho na primeira linha), mesmo layout do import — o front aplica estilo xlsx-js-style. */
  async getEstoqueExportSheetRows(ids: number[]): Promise<(string | number)[][]> {
    const uniqueInOrder: number[] = [];
    const seen = new Set<number>();
    for (const raw of ids) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      uniqueInOrder.push(id);
    }
    if (uniqueInOrder.length === 0) {
      throw new BadRequestException('Informe ao menos um id de item válido.');
    }
    if (uniqueInOrder.length > 500) {
      throw new BadRequestException('No máximo 500 itens por exportação.');
    }

    const items = await this.prisma.estoque.findMany({
      where: { id: { in: uniqueInOrder } },
      include: {
        projeto: { select: { nome: true } },
        categoria: { select: { nome: true } },
      },
    });
    const byId = new Map(items.map((e) => [e.id, e]));
    const ordered = uniqueInOrder.map((id) => byId.get(id)).filter((e): e is (typeof items)[number] => Boolean(e));

    if (ordered.length === 0) {
      throw new BadRequestException('Nenhum item de estoque encontrado para os ids informados.');
    }

    const alocs = await this.prisma.estoqueAlocacao.findMany({
      where: {
        estoqueId: { in: ordered.map((e) => e.id) },
        projetoId: null,
        etapaId: null,
      },
      include: {
        usuario: { select: { email: true } },
        setor: { select: { nome: true } },
      },
    });

    const alocByEstoque = new Map<number, typeof alocs>();
    for (const a of alocs) {
      const list = alocByEstoque.get(a.estoqueId) ?? [];
      list.push(a);
      alocByEstoque.set(a.estoqueId, list);
    }

    const headers = [
      'item *',
      'quantidade *',
      'valor unitario',
      'descricao',
      'categoria *',
      'projeto',
      'alocacoes',
    ];
    const aoa: (string | number)[][] = [headers];

    for (const est of ordered) {
      const list = alocByEstoque.get(est.id) ?? [];
      const parts: string[] = [];
      for (const a of list) {
        if (a.usuarioId && a.usuario?.email?.trim()) {
          parts.push(`${a.usuario.email.trim()} (${a.quantidade})`);
        } else if (a.setorId && a.setor?.nome?.trim()) {
          parts.push(`${a.setor.nome.trim()} (${a.quantidade})`);
        }
      }
      aoa.push([
        est.item,
        est.quantidade,
        est.valorUnitario ?? 0,
        est.descricao?.trim() ?? '',
        est.categoria?.nome ?? '',
        est.projeto?.nome ?? '',
        parts.join('; '),
      ]);
    }

    return aoa;
  }

  async listItems(filter: { search?: string }) {
    const where: any = {};

    if (filter.search) {
      where.item = { 
        contains: filter.search,
        mode: 'insensitive' as any, // Prisma PostgreSQL suporta insensitive
      };
    }

    const items = await this.prisma.estoque.findMany({
      where,
      include: {
        projeto: true,
        etapa: true,
        categoria: true,
        entradas: {
          orderBy: { dataEntrada: 'desc' },
          include: {
            compra: {
              select: {
                id: true,
                dataCompra: true,
                dataEntrega: true,
                dataSolicitacao: true,
                dataConfirmacao: true,
                status: true,
              },
            },
          },
        },
      } as any,
      orderBy: { item: 'asc' },
    });

    // Buscar alocações para todos os itens
    const itemIds = items.map(item => item.id);
    const alocacoes = itemIds.length > 0 ? await (this.prisma as any).estoqueAlocacao.findMany({
      where: { estoqueId: { in: itemIds } },
      include: {
        projeto: true,
        etapa: true,
        setor: { select: { id: true, nome: true } },
        usuario: {
          select: {
            id: true,
            nome: true,
            cargo: { select: { nome: true } },
          },
        },
      },
    }) : [];

    // Calcular quantidade disponível e alocada para cada item
    return items.map((item) => {
      const itemAlocacoes = alocacoes.filter(aloc => aloc.estoqueId === item.id);
      const quantidadeAlocada = itemAlocacoes.reduce((sum, aloc) => sum + aloc.quantidade, 0);
      const quantidadeDisponivel = item.quantidade - quantidadeAlocada;
      
      return {
        ...item,
        quantidadeAlocada,
        quantidadeDisponivel,
        alocacoes: itemAlocacoes,
      };
    });
  }

  async createItem(data: CreateStockItemDto) {
    const createData: any = {
      item: data.item,
      quantidade: data.quantidade,
      valorUnitario: data.valorUnitario != null && Number.isFinite(Number(data.valorUnitario)) ? Number(data.valorUnitario) : 0,
      status: EstoqueStatus.DISPONIVEL, // Status padrão
    };

    // Adicionar campos opcionais apenas se existirem
    if (data.descricao !== undefined && data.descricao !== null) {
      createData.descricao = data.descricao;
    }
    if (data.imagemUrl?.trim()) {
      createData.imagemUrl = data.imagemUrl.trim();
    }
    if (data.nfUrl?.trim()) {
      createData.nfUrl = data.nfUrl.trim();
    }
    if (data.comprovantePagamentoUrl?.trim()) {
      createData.comprovantePagamentoUrl = data.comprovantePagamentoUrl.trim();
    }
    if (data.cotacoes) {
      createData.cotacoesJson = data.cotacoes as any;
    }
    if (data.categoriaId) {
      createData.categoriaId = data.categoriaId;
    }

    // Criar o item (alocações são feitas separadamente através do modal de alocações)
    return this.prisma.estoque.create({
      data: createData,
    });
  }

  async updateItem(id: number, data: UpdateStockItemDto) {
    await this.ensureItemExists(id);

    const updateData: any = {};
    
    if (data.item !== undefined) {
      updateData.item = data.item;
    }
    if (data.descricao !== undefined) {
      updateData.descricao = data.descricao;
    }
    if (data.quantidade !== undefined) {
      // Validar que a nova quantidade não seja menor que a quantidade já alocada
      const alocacoesExistentes = await (this.prisma as any).estoqueAlocacao.findMany({
        where: { estoqueId: id },
      });
      const quantidadeAlocada = alocacoesExistentes.reduce((sum: number, aloc: any) => sum + aloc.quantidade, 0);
      
      if (data.quantidade < quantidadeAlocada) {
        throw new BadRequestException(
          `A quantidade não pode ser menor que a quantidade já alocada (${quantidadeAlocada})`
        );
      }
      
      updateData.quantidade = data.quantidade;
    }
    if (data.valorUnitario !== undefined) {
      updateData.valorUnitario = data.valorUnitario;
    }
    if (data.imagemUrl !== undefined) {
      updateData.imagemUrl = data.imagemUrl?.trim() || null;
    }
    if (data.nfUrl !== undefined) {
      updateData.nfUrl = data.nfUrl?.trim() || null;
    }
    if (data.comprovantePagamentoUrl !== undefined) {
      updateData.comprovantePagamentoUrl = data.comprovantePagamentoUrl?.trim() || null;
    }
    if (data.cotacoes !== undefined) {
      // Converter cotacoes para cotacoesJson (formato do Prisma)
      if (Array.isArray(data.cotacoes) && data.cotacoes.length > 0) {
        updateData.cotacoesJson = data.cotacoes as any;
      } else if (data.cotacoes === null || (Array.isArray(data.cotacoes) && data.cotacoes.length === 0)) {
        // Permitir limpar cotações
        updateData.cotacoesJson = null;
      }
    }
    if (data.categoriaId !== undefined) {
      updateData.categoriaId = data.categoriaId || null;
    }

    return this.prisma.estoque.update({ where: { id }, data: updateData });
  }

  async deleteItem(id: number) {
    await this.ensureItemExists(id);
    await this.prisma.estoque.delete({ where: { id } });
    return { deleted: true };
  }

  async deleteItemsBatch(ids: number[]) {
    const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
    if (unique.length === 0) {
      throw new BadRequestException('Nenhum id válido');
    }
    if (unique.length > 500) {
      throw new BadRequestException('Máximo de 500 itens por requisição');
    }
    const result = await this.prisma.estoque.deleteMany({
      where: { id: { in: unique } },
    });
    return { deleted: result.count, requested: unique.length };
  }

  async listPurchases(filter: {
    status?: CompraStatus;
    projetoId?: number;
    etapaId?: number;
    excludeSolicitado?: boolean;
    mesReferenciaAssinatura?: string;
  }) {
    const where: any = {};

    if (filter.status) {
      where.status = filter.status;
    }

    // Se excludeSolicitado for true, excluir compras com status SOLICITADO
    if (filter.excludeSolicitado) {
      if (where.status) {
        // Se já tem filtro de status, combinar com AND
        where.AND = where.AND || [];
        where.AND.push({ status: { not: 'SOLICITADO' as any } });
        delete where.status;
      } else {
        where.status = { not: 'SOLICITADO' as any };
      }
    }

    // Se projetoId for fornecido, incluir compras do projeto OU compras sem projeto
    if (filter.projetoId) {
      if (where.AND) {
        where.AND.push({
          OR: [
            { projetoId: filter.projetoId },
            { projetoId: null },
          ],
        });
      } else {
        where.AND = [
          {
            OR: [
              { projetoId: filter.projetoId },
              { projetoId: null },
            ],
          },
        ];
      }
    }

    if (filter.etapaId) {
      // Se etapaId for fornecido, só mostrar compras sem etapa ou da etapa especificada
      if (where.AND) {
        where.AND.push({
          OR: [
            { etapaId: filter.etapaId },
            { etapaId: null },
          ],
        });
      } else {
        where.AND = [
          {
            OR: [
              { etapaId: filter.etapaId },
              { etapaId: null },
            ],
          },
        ];
      }
    }

    let mesAssinaturaRef: string | undefined;
    const include: any = {
      projeto: true,
      etapa: true,
      setor: { select: { id: true, nome: true } },
      solicitadoPor: { include: { cargo: true } },
      categoria: true,
    };
    if (filter.mesReferenciaAssinatura) {
      mesAssinaturaRef = this.normalizeMonthRef(filter.mesReferenciaAssinatura);
      include.assinaturaMeses = {
        where: { mesReferencia: mesAssinaturaRef },
        take: 1,
      };
    }

    const rows = await this.prisma.compra.findMany({
      where,
      include,
      orderBy: { dataSolicitacao: 'desc' },
    });

    if (!mesAssinaturaRef) {
      return rows;
    }

    return rows.map((r: any) => {
      const { assinaturaMeses, ...rest } = r;
      const entry = Array.isArray(assinaturaMeses) && assinaturaMeses.length > 0 ? assinaturaMeses[0] : null;
      return { ...rest, assinaturaMesSelecionado: entry };
    });
  }

  async listSignatureMonthlyAlerts(referenceMonth?: string) {
    const mesRef = this.normalizeMonthRef(referenceMonth);
    const compras = await this.prisma.compra.findMany({
      where: {
        categoria: {
          isAssinatura: true,
          recorrenciaMensal: true,
        },
        status: {
          not: CompraStatus.REPROVADO,
        },
      },
      include: {
        categoria: true,
        projeto: true,
        solicitadoPor: {
          select: {
            id: true,
            nome: true,
          },
        },
        assinaturaMeses: {
          where: { mesReferencia: mesRef },
          take: 1,
        },
      },
      orderBy: { dataSolicitacao: 'desc' },
    });

    return compras.map((compra: any) => {
      const row = compra.assinaturaMeses?.[0] ?? null;
      const docOk = this.isAssinaturaMesDocumentacaoCompleta(row);
      const { assinaturaMeses, ...rest } = compra;
      return {
        ...rest,
        assinaturaMesAtual: row,
        mesReferencia: mesRef,
        precisaConfirmacao: !docOk,
      };
    });
  }

  async confirmSignatureMonth(purchaseId: number, referenceMonth: string | undefined, userId: number) {
    const mesRef = this.normalizeMonthRef(referenceMonth);
    const compra = await this.prisma.compra.findUnique({
      where: { id: purchaseId },
      include: {
        categoria: true,
      },
    });

    if (!compra) {
      throw new NotFoundException('Compra não encontrada');
    }

    if (!this.isAssinaturaCategoria(compra.categoria)) {
      throw new BadRequestException('Esta compra não é do tipo assinatura mensal.');
    }

    await this.prisma.compraAssinaturaMes.upsert({
      where: {
        compraId_mesReferencia: { compraId: purchaseId, mesReferencia: mesRef },
      },
      create: {
        compraId: purchaseId,
        mesReferencia: mesRef,
        confirmadoPorId: userId,
        confirmadoEm: new Date(),
      },
      update: {
        confirmadoPorId: userId,
        confirmadoEm: new Date(),
      },
    });

    return this.prisma.compra.update({
      where: { id: purchaseId },
      data: {
        assinaturaConfirmadaMes: mesRef,
      },
      include: {
        categoria: true,
        projeto: true,
        solicitadoPor: {
          select: {
            id: true,
            nome: true,
          },
        },
        assinaturaMeses: {
          where: { mesReferencia: mesRef },
          take: 1,
        },
      },
    });
  }

  async upsertSignatureMonth(purchaseId: number, dto: UpsertSignatureMonthDto, userId: number) {
    const mesRef = this.normalizeMonthRef(dto.mesReferencia);
    const compra = await this.prisma.compra.findUnique({
      where: { id: purchaseId },
      include: { categoria: true },
    });
    if (!compra) {
      throw new NotFoundException('Compra não encontrada');
    }
    if (!this.isAssinaturaCategoria(compra.categoria)) {
      throw new BadRequestException('Esta compra não é do tipo assinatura.');
    }

    const existing = await this.prisma.compraAssinaturaMes.findUnique({
      where: {
        compraId_mesReferencia: { compraId: purchaseId, mesReferencia: mesRef },
      },
    });

    const nfUrl =
      dto.nfUrl !== undefined ? this.emptyToNullUrl(dto.nfUrl as string) : existing?.nfUrl ?? null;
    const comprovantePagamentoUrl =
      dto.comprovantePagamentoUrl !== undefined
        ? this.emptyToNullUrl(dto.comprovantePagamentoUrl as string)
        : existing?.comprovantePagamentoUrl ?? null;
    const observacao =
      dto.observacao !== undefined
        ? dto.observacao === null || String(dto.observacao).trim() === ''
          ? null
          : String(dto.observacao).trim().slice(0, 8000)
        : existing?.observacao ?? null;

    const updated = await this.prisma.compraAssinaturaMes.upsert({
      where: {
        compraId_mesReferencia: { compraId: purchaseId, mesReferencia: mesRef },
      },
      create: {
        compraId: purchaseId,
        mesReferencia: mesRef,
        nfUrl,
        comprovantePagamentoUrl,
        observacao,
        confirmadoPorId: userId,
        confirmadoEm: new Date(),
      },
      update: {
        ...(dto.nfUrl !== undefined ? { nfUrl } : {}),
        ...(dto.comprovantePagamentoUrl !== undefined ? { comprovantePagamentoUrl } : {}),
        ...(dto.observacao !== undefined ? { observacao } : {}),
        confirmadoPorId: userId,
        confirmadoEm: new Date(),
      },
      include: {
        confirmadoPor: { select: { id: true, nome: true } },
      },
    });

    if (this.isAssinaturaMesDocumentacaoCompleta(updated)) {
      await this.prisma.compra.update({
        where: { id: purchaseId },
        data: { assinaturaConfirmadaMes: mesRef },
      });
    }

    return updated;
  }

  async listSignatureMonthReport(query: SignatureMonthReportQueryDto) {
    const mesRef = this.normalizeMonthRef(query.mesReferencia);
    const whereCompra: Prisma.CompraWhereInput = {
      categoria: {
        isAssinatura: true,
        recorrenciaMensal: true,
      },
      status: { not: CompraStatus.REPROVADO },
      assinaturaMeses: {
        some: { mesReferencia: mesRef },
      },
    };

    if (query.projetoId) {
      whereCompra.AND = [
        ...(Array.isArray(whereCompra.AND) ? whereCompra.AND : []),
        {
          OR: [{ projetoId: query.projetoId }, { projetoId: null }],
        },
      ];
    }
    if (query.setorId) {
      whereCompra.AND = [
        ...(Array.isArray(whereCompra.AND) ? whereCompra.AND : []),
        {
          OR: [{ setorId: query.setorId }, { setorId: null }],
        },
      ];
    }
    if (query.categoriaId) {
      whereCompra.categoriaId = query.categoriaId;
    }

    const compras = await this.prisma.compra.findMany({
      where: whereCompra,
      include: {
        projeto: true,
        etapa: true,
        setor: { select: { id: true, nome: true } },
        solicitadoPor: { include: { cargo: true } },
        categoria: true,
        assinaturaMeses: {
          where: { mesReferencia: mesRef },
          take: 1,
        },
      },
      orderBy: { dataSolicitacao: 'desc' },
    });

    const itens = compras
      .map((c) => {
        const mes = c.assinaturaMeses[0];
        if (!this.isAssinaturaMesDocumentacaoCompleta(mes)) {
          return null;
        }
        const { assinaturaMeses, ...compraRest } = c as any;
        return {
          compra: compraRest,
          mes: {
            mesReferencia: mesRef,
            nfUrl: mes.nfUrl,
            comprovantePagamentoUrl: mes.comprovantePagamentoUrl,
            observacao: mes.observacao,
            confirmadoEm: mes.confirmadoEm,
          },
        };
      })
      .filter(Boolean);

    return {
      mesReferencia: mesRef,
      totalItens: itens.length,
      itens,
    };
  }

  async createPurchase(data: CreatePurchaseDto, solicitadoPorId?: number) {
    if (data.projetoId) {
    await this.ensureProjectExists(data.projetoId);
    }
    
    if (data.etapaId) {
      await this.ensureTaskExists(data.etapaId);
    }

    if (data.setorId) {
      const setor = await this.prisma.setor.findUnique({ where: { id: data.setorId }, select: { id: true } });
      if (!setor) {
        throw new BadRequestException('Setor informado não existe');
      }
    }

    // Se não houver cotação, definir status como SOLICITADO
    const hasCotacoes = data.cotacoes && data.cotacoes.length > 0;
    const status = data.status ?? (hasCotacoes ? CompraStatus.PENDENTE : ('SOLICITADO' as CompraStatus));

    const createData: any = {
      projetoId: data.projetoId || null,
      item: data.item,
      quantidade: data.quantidade,
      valorUnitario:
        data.valorUnitario != null && Number.isFinite(Number(data.valorUnitario))
          ? Number(data.valorUnitario)
          : null,
      status: status,
    };

    const solicitanteFinal = data.solicitadoPorId ?? solicitadoPorId;
    if (solicitanteFinal) {
      await this.ensureUserExists(solicitanteFinal);
      createData.solicitadoPorId = solicitanteFinal;
    }

    if (data.etapaId) {
      createData.etapaId = data.etapaId;
    }

    if (data.setorId !== undefined) {
      createData.setorId = data.setorId || null;
    }

    // Adicionar campos opcionais apenas se existirem
    if (
      data.descricao !== undefined &&
      data.descricao !== null &&
      data.descricao.trim().length > 0
    ) {
      createData.descricao = data.descricao;
    }
    if (data.imagemUrl?.trim()) {
      createData.imagemUrl = data.imagemUrl.trim();
    }
    if (data.nfUrl?.trim()) {
      createData.nfUrl = data.nfUrl.trim();
    }
    if (data.comprovantePagamentoUrl?.trim()) {
      createData.comprovantePagamentoUrl = data.comprovantePagamentoUrl.trim();
    }
    if (data.cotacoes) {
      createData.cotacoesJson = data.cotacoes as any;
    }
    if (data.dataCompra) {
      createData.dataCompra = new Date(data.dataCompra);
    }
    if (data.categoriaId) {
      createData.categoriaId = data.categoriaId;
    }
    createData.classe = await this.resolveCompraClasse(data.classe, data.categoriaId);
    if (data.observacao && data.observacao.trim().length > 0) {
      createData.observacao = data.observacao.trim();
    }

    if (data.pagoPor !== undefined && data.pagoPor.length > 0) {
      const pago = await this.sanitizePagoPorJson(data.pagoPor);
      if (pago !== undefined) {
        createData.pagoPorJson = pago;
      }
    }

    const compra = await this.prisma.compra.create({
      data: createData,
    });

    if (status === CompraStatus.ENTREGUE) {
      await this.appendToStock(this.compraRowToStockAppendPayload(compra));
    }

    return compra;
  }

  async updatePurchaseStatus(id: number, data: UpdatePurchaseStatusDto) {
    // Buscar a compra ANTES do update para ter o status anterior e solicitadoPorId
    const compraAntes = await this.prisma.compra.findUnique({
      where: { id },
      include: {
        solicitadoPor: true,
        projeto: true,
      },
    });

    if (!compraAntes) {
      throw new NotFoundException('Compra não encontrada');
    }

    const statusAnterior = compraAntes.status;
    const novoStatus = data.status;

    const updateData: any = {
      status: data.status,
    };

    if (data.status === CompraStatus.COMPRADO_ACAMINHO || data.status === CompraStatus.ENTREGUE) {
      updateData.dataConfirmacao = new Date();
    }

    // Incluir statusEntrega se fornecido e status for COMPRADO_ACAMINHO
    if (data.statusEntrega !== undefined) {
      updateData.statusEntrega = data.statusEntrega;
    }
    
    // Previsão de entrega (quando status for COMPRADO_ACAMINHO)
    if (data.previsaoEntrega !== undefined) {
      updateData.previsaoEntrega = data.previsaoEntrega ? new Date(data.previsaoEntrega) : null;
    }
    
    // Campos de entrega
    if (data.dataEntrega !== undefined) {
      updateData.dataEntrega = data.dataEntrega ? new Date(data.dataEntrega) : null;
    }
    if (data.enderecoEntrega !== undefined) {
      updateData.enderecoEntrega = data.enderecoEntrega || null;
    }
    if (data.recebidoPor !== undefined) {
      updateData.recebidoPor = data.recebidoPor || null;
    }
    if (data.observacao !== undefined) {
      updateData.observacao = data.observacao || null;
    }

    const compra = await this.prisma.compra.update({
      where: { id },
      data: updateData,
      include: {
        solicitadoPor: true,
        projeto: true,
      },
    });

    // Notificar o solicitante quando o status mudar para COMPRADO_ACAMINHO ou ENTREGUE
    if (compra.solicitadoPorId && statusAnterior !== novoStatus) {
      if (novoStatus === CompraStatus.COMPRADO_ACAMINHO) {
        try {
          const mensagem = compra.previsaoEntrega
            ? `Sua compra "${compra.item}" está a caminho. Previsão de entrega: ${new Date(compra.previsaoEntrega).toLocaleDateString('pt-BR')}.`
            : `Sua compra "${compra.item}" está a caminho.`;
          
          await this.notificationsService.create({
            usuarioId: compra.solicitadoPorId,
            titulo: 'Compra a Caminho',
            mensagem,
            tipo: NotificacaoTipo.INFO,
          });
        } catch (err) {
          this.logger.warn(`Falha ao criar notificação para compra a caminho (compra ${id}, usuário ${compra.solicitadoPorId}): ${err}`);
        }
      } else if (novoStatus === CompraStatus.ENTREGUE) {
        try {
          const mensagem = compra.recebidoPor
            ? `Sua compra "${compra.item}" foi entregue. Recebido por: ${compra.recebidoPor}.`
            : `Sua compra "${compra.item}" foi entregue.`;
          
          await this.notificationsService.create({
            usuarioId: compra.solicitadoPorId,
            titulo: 'Compra Entregue',
            mensagem,
            tipo: NotificacaoTipo.SUCCESS,
          });
        } catch (err) {
          this.logger.warn(`Falha ao criar notificação para compra entregue (compra ${id}, usuário ${compra.solicitadoPorId}): ${err}`);
        }
      }
    }

    if (data.status === CompraStatus.ENTREGUE) {
      await this.appendToStock(this.compraRowToStockAppendPayload(compra));
    }

    return compra;
  }

  /** Marca várias compras (PENDENTE) como COMPRADO_ACAMINHO em lote, com dados comuns (NF, forma pagamento, desconto, etc.). */
  async batchPurchaseToAcaminho(dto: BatchPurchaseToAcaminhoDto) {
    const compras = await this.prisma.compra.findMany({
      where: { id: { in: dto.purchaseIds } },
      include: { solicitadoPor: true, projeto: true },
    });

    if (compras.length !== dto.purchaseIds.length) {
      throw new BadRequestException('Um ou mais IDs de compra não foram encontrados.');
    }

    const naoPendentes = compras.filter((c) => c.status !== CompraStatus.PENDENTE);
    if (naoPendentes.length > 0) {
      throw new BadRequestException(
        `Apenas compras com status Pendente podem ser processadas em lote. Itens inválidos: ${naoPendentes.map((c) => c.id).join(', ')}.`
      );
    }

    let observacaoLote = dto.observacao?.trim() || '';
    if (dto.descontoTipo && dto.descontoValor != null && dto.descontoValor > 0) {
      const desc =
        dto.descontoTipo === 'porcentagem'
          ? `${dto.descontoValor}%`
          : `R$ ${dto.descontoValor.toFixed(2)}`;
      observacaoLote = observacaoLote
        ? `${observacaoLote} | Compra em lote. Desconto: ${desc}.`
        : `Compra em lote. Desconto: ${desc}.`;
    } else if (compras.length > 1) {
      observacaoLote = observacaoLote
        ? `${observacaoLote} | Compra em lote (${compras.length} itens).`
        : `Compra em lote (${compras.length} itens).`;
    }

    if (dto.freteLote != null && dto.freteLote > 0) {
      const freteTxt = `Frete (lote): R$ ${dto.freteLote.toFixed(2)} repartido entre ${compras.length} item(ns).`;
      observacaoLote = observacaoLote ? `${observacaoLote} | ${freteTxt}` : freteTxt;
    }

    const updateData: any = {
      status: CompraStatus.COMPRADO_ACAMINHO,
      dataConfirmacao: new Date(),
    };
    if (dto.formaPagamento !== undefined) updateData.formaPagamento = dto.formaPagamento || null;
    if (dto.nfUrl !== undefined) {
      updateData.nfUrl = dto.nfUrl?.trim() || null;
    }
    if (dto.comprovantePagamentoUrl !== undefined) {
      updateData.comprovantePagamentoUrl = dto.comprovantePagamentoUrl?.trim() || null;
    }
    if (dto.dataCompra) updateData.dataCompra = new Date(dto.dataCompra);
    if (dto.previsaoEntrega !== undefined)
      updateData.previsaoEntrega = dto.previsaoEntrega ? new Date(dto.previsaoEntrega) : null;
    if (dto.statusEntrega !== undefined) updateData.statusEntrega = dto.statusEntrega;
    if (dto.enderecoEntrega !== undefined) updateData.enderecoEntrega = dto.enderecoEntrega || null;
    if (observacaoLote) {
      updateData.observacao = observacaoLote;
    }

    const freteLote = dto.freteLote != null && dto.freteLote > 0 ? dto.freteLote : 0;
    const fretePorCompra =
      freteLote > 0 ? this.buildDiscountsByTotal(compras.map(() => 1), freteLote) : null;

    let updatedCount = 0;

    if (fretePorCompra) {
      await this.prisma.$transaction(
        compras.map((compra, i) => {
          const hadCotacoes =
            Array.isArray(compra.cotacoesJson) && (compra.cotacoesJson as unknown[]).length > 0;
          return this.prisma.compra.update({
            where: { id: compra.id },
            data: {
              ...updateData,
              cotacoesJson: this.applyFreightShareToCompraCotacoes(
                compra,
                fretePorCompra[i] ?? 0,
              ) as Prisma.InputJsonValue,
              ...(hadCotacoes ? {} : { cotacaoSelecionadaIndex: 0 }),
            },
          });
        }),
      );
      updatedCount = compras.length;
    } else {
      const updated = await this.prisma.compra.updateMany({
        where: { id: { in: dto.purchaseIds } },
        data: updateData,
      });
      updatedCount = updated.count;
    }

    const comprasAtualizadas = await this.prisma.compra.findMany({
      where: { id: { in: dto.purchaseIds } },
      include: { solicitadoPor: true, projeto: true },
    });

    for (const compra of comprasAtualizadas) {
      if (compra.solicitadoPorId) {
        try {
          const msg = compra.previsaoEntrega
            ? `Sua compra "${compra.item}" está a caminho. Previsão de entrega: ${new Date(compra.previsaoEntrega).toLocaleDateString('pt-BR')}.`
            : `Sua compra "${compra.item}" está a caminho.`;
          await this.notificationsService.create({
            usuarioId: compra.solicitadoPorId,
            titulo: 'Compra a Caminho',
            mensagem: msg,
            tipo: NotificacaoTipo.INFO,
          });
        } catch (err) {
          this.logger.warn(
            `Falha ao notificar compra em lote (compra ${compra.id}, usuário ${compra.solicitadoPorId}): ${err}`
          );
        }
      }
    }

    return { count: updatedCount, compras: comprasAtualizadas };
  }

  async applyTagToPurchases(purchaseIds: number[], nome: string, cor: string) {
    const tagNome = nome.trim().slice(0, 40);
    if (!tagNome) {
      throw new BadRequestException('Nome da tag é obrigatório.');
    }
    const tagCor = cor.trim();
    if (!/^#([0-9A-Fa-f]{6})$/.test(tagCor)) {
      throw new BadRequestException('Cor da tag inválida. Use formato hexadecimal, ex: #3B82F6');
    }

    const prismaAny = this.prisma as any;
    const compras = await prismaAny.compra.findMany({
      where: { id: { in: purchaseIds } },
      select: { id: true, tagsJson: true },
    });
    if (compras.length !== purchaseIds.length) {
      throw new BadRequestException('Uma ou mais compras não foram encontradas.');
    }

    await this.prisma.$transaction(
      compras.map((compra) => {
        const existing = Array.isArray(compra.tagsJson)
          ? (compra.tagsJson as Array<{ nome?: string; cor?: string }>)
          : [];
        const withoutSameName = existing.filter(
          (t) => String(t?.nome || '').toLowerCase().trim() !== tagNome.toLowerCase(),
        );
        const nextTags = [...withoutSameName, { nome: tagNome, cor: tagCor }];
        return prismaAny.compra.update({
          where: { id: compra.id },
          data: { tagsJson: nextTags as any },
        });
      }),
    );

    return { updated: compras.length };
  }

  async removeTagFromPurchases(purchaseIds: number[], nome: string) {
    const tagNome = nome.trim().slice(0, 40);
    if (!tagNome) {
      throw new BadRequestException('Nome da tag é obrigatório.');
    }

    const prismaAny = this.prisma as any;
    const compras = await prismaAny.compra.findMany({
      where: { id: { in: purchaseIds } },
      select: { id: true, tagsJson: true },
    });
    if (compras.length !== purchaseIds.length) {
      throw new BadRequestException('Uma ou mais compras não foram encontradas.');
    }

    await this.prisma.$transaction(
      compras.map((compra) => {
        const existing = Array.isArray(compra.tagsJson)
          ? (compra.tagsJson as Array<{ nome?: string; cor?: string }>)
          : [];
        const nextTags = existing.filter(
          (t) => String(t?.nome || '').toLowerCase().trim() !== tagNome.toLowerCase(),
        );
        return prismaAny.compra.update({
          where: { id: compra.id },
          data: { tagsJson: nextTags as any },
        });
      }),
    );

    return { updated: compras.length };
  }

  async updatePurchase(id: number, data: UpdatePurchaseDto) {
    await this.ensurePurchaseExists(id);

    const updateData: any = {};
    
    if (data.item !== undefined) {
      updateData.item = data.item;
    }
    if (data.descricao !== undefined) {
      updateData.descricao = data.descricao;
    }
    if (data.quantidade !== undefined) {
      updateData.quantidade = data.quantidade;
    }
    if (data.valorUnitario !== undefined) {
      updateData.valorUnitario = data.valorUnitario;
    }
    if (data.imagemUrl !== undefined) {
      updateData.imagemUrl = data.imagemUrl?.trim() || null;
    }
    if (data.nfUrl !== undefined) {
      updateData.nfUrl = data.nfUrl?.trim() || null;
    }
    if (data.comprovantePagamentoUrl !== undefined) {
      updateData.comprovantePagamentoUrl = data.comprovantePagamentoUrl?.trim() || null;
    }
    if (data.cotacoes !== undefined) {
      if (Array.isArray(data.cotacoes) && data.cotacoes.length > 0) {
        updateData.cotacoesJson = data.cotacoes as any;
      } else if (data.cotacoes === null || (Array.isArray(data.cotacoes) && data.cotacoes.length === 0)) {
        updateData.cotacoesJson = null;
      }
    }
    if (data.etapaId !== undefined) {
      if (data.etapaId) {
        await this.ensureTaskExists(data.etapaId);
        updateData.etapaId = data.etapaId;
      } else {
        updateData.etapaId = null;
      }
    }

    if (data.setorId !== undefined) {
      if (data.setorId) {
        const setor = await this.prisma.setor.findUnique({ where: { id: data.setorId }, select: { id: true } });
        if (!setor) {
          throw new BadRequestException('Setor informado não existe');
        }
        updateData.setorId = data.setorId;
      } else {
        updateData.setorId = null;
      }
    }
    if (data.projetoId !== undefined) {
      if (data.projetoId) {
        await this.ensureProjectExists(data.projetoId);
        updateData.projetoId = data.projetoId;
      } else {
        updateData.projetoId = null;
      }
    }
    if (data.solicitadoPorId !== undefined) {
      if (data.solicitadoPorId) {
        await this.ensureUserExists(data.solicitadoPorId);
        updateData.solicitadoPorId = data.solicitadoPorId;
      } else {
        updateData.solicitadoPorId = null;
      }
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === CompraStatus.COMPRADO_ACAMINHO || data.status === CompraStatus.ENTREGUE) {
        updateData.dataConfirmacao = new Date();
      }
    }
    if (data.dataCompra !== undefined) {
      updateData.dataCompra = data.dataCompra ? new Date(data.dataCompra) : null;
    }
    if (data.categoriaId !== undefined) {
      updateData.categoriaId = data.categoriaId || null;
    }
    if (data.statusEntrega !== undefined) {
      updateData.statusEntrega = data.statusEntrega || null;
    }
    if (data.dataEntrega !== undefined) {
      updateData.dataEntrega = data.dataEntrega ? new Date(data.dataEntrega) : null;
    }
    if (data.enderecoEntrega !== undefined) {
      updateData.enderecoEntrega = data.enderecoEntrega || null;
    }
    if (data.recebidoPor !== undefined) {
      updateData.recebidoPor = data.recebidoPor || null;
    }
    if (data.observacao !== undefined) {
      updateData.observacao = data.observacao || null;
    }

    if (data.pagoPor !== undefined) {
      if (!data.pagoPor.length) {
        updateData.pagoPorJson = Prisma.DbNull;
      } else {
        const pago = await this.sanitizePagoPorJson(data.pagoPor);
        updateData.pagoPorJson = pago === undefined ? Prisma.DbNull : pago;
      }
    }

    // Atualizar a compra primeiro para garantir que todos os dados estejam atualizados
    const compraAtualizada = await this.prisma.compra.update({ where: { id }, data: updateData });

    // Se o status foi alterado para ENTREGUE, transferir para o estoque
    if (data.status === CompraStatus.ENTREGUE) {
      await this.appendToStock(this.compraRowToStockAppendPayload(compraAtualizada));
    }

    return compraAtualizada;
  }

  async deletePurchase(id: number) {
    await this.ensurePurchaseExists(id);
    await this.prisma.compra.delete({ where: { id } });
    return { deleted: true };
  }

  async deletePurchasesBatch(ids: number[]) {
    const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
    if (unique.length === 0) {
      throw new BadRequestException('Nenhum id válido');
    }
    if (unique.length > 500) {
      throw new BadRequestException('Máximo de 500 compras por requisição');
    }
    const result = await this.prisma.compra.deleteMany({
      where: { id: { in: unique } },
    });
    return { deleted: result.count, requested: unique.length };
  }

  /** Campos da compra usados ao consolidar linha de estoque + registro de entrada. */
  private compraRowToStockAppendPayload(compra: {
    id: number;
    projetoId: number | null;
    etapaId: number | null;
    item: string;
    descricao: string | null;
    quantidade: number;
    valorUnitario: number | null;
    imagemUrl: string | null;
    cotacoesJson: any;
    categoriaId: number | null;
    classe?: CompraClasse;
    nfUrl: string | null;
    comprovantePagamentoUrl: string | null;
    formaPagamento: string | null;
    observacao: string | null;
  }) {
    return {
      id: compra.id,
      projetoId: compra.projetoId,
      etapaId: compra.etapaId,
      item: compra.item,
      descricao: compra.descricao,
      quantidade: compra.quantidade,
      valorUnitario: compra.valorUnitario,
      imagemUrl: compra.imagemUrl,
      cotacoesJson: compra.cotacoesJson,
      categoriaId: compra.categoriaId,
      classe: compra.classe,
      nfUrl: compra.nfUrl,
      comprovantePagamentoUrl: compra.comprovantePagamentoUrl,
      formaPagamento: compra.formaPagamento,
      observacao: compra.observacao,
    };
  }

  /**
   * Consolida quantidade no estoque por item + projeto + etapa + categoria.
   * Valor unitário da linha = média ponderada pelas quantidades.
   * Cada compra entregue gera uma EstoqueEntrada (idempotente por compraId).
   */
  private async appendToStock(compra: {
    id: number;
    projetoId?: number | null;
    etapaId?: number | null;
    item: string;
    descricao?: string | null;
    quantidade: number;
    valorUnitario?: number | null;
    imagemUrl?: string | null;
    cotacoesJson?: any;
    categoriaId?: number | null;
    classe?: CompraClasse;
    nfUrl?: string | null;
    comprovantePagamentoUrl?: string | null;
    formaPagamento?: string | null;
    observacao?: string | null;
  }) {
    if (compra.classe && compra.classe !== CompraClasse.ESTOQUE) {
      return;
    }
    const categoria = await this.findCategoriaCompraById(compra.categoriaId);
    if (categoria && (categoria.entraNoEstoque === false || this.isAssinaturaCategoria(categoria))) {
      return;
    }

    const jaEntrou = await this.prisma.estoqueEntrada.findUnique({
      where: { compraId: compra.id },
    });
    if (jaEntrou) {
      return;
    }

    const qAdd = Math.max(0, Number(compra.quantidade) || 0);
    if (qAdd === 0) {
      return;
    }

    const unitVal = Number(compra.valorUnitario ?? 0);

    const existing = await this.prisma.estoque.findFirst({
      where: {
        item: compra.item,
        projetoId: compra.projetoId ?? null,
        etapaId: compra.etapaId ?? null,
        categoriaId: compra.categoriaId ?? null,
      },
    });

    let estoqueId: number;

    if (existing) {
      const oldQ = existing.quantidade;
      const newTotalQ = oldQ + qAdd;
      const oldP = Number(existing.valorUnitario ?? 0);
      const mergedUnit = newTotalQ > 0 ? (oldQ * oldP + qAdd * unitVal) / newTotalQ : unitVal;

      const imagemUrlFinal =
        compra.imagemUrl && compra.imagemUrl.trim().length > 0
          ? compra.imagemUrl.trim()
          : existing.imagemUrl;

      const nfMerged =
        compra.nfUrl && compra.nfUrl.trim().length > 0
          ? compra.nfUrl.trim()
          : existing.nfUrl ?? null;
      const compMerged =
        compra.comprovantePagamentoUrl && compra.comprovantePagamentoUrl.trim().length > 0
          ? compra.comprovantePagamentoUrl.trim()
          : existing.comprovantePagamentoUrl ?? null;

      await this.prisma.estoque.update({
        where: { id: existing.id },
        data: {
          quantidade: newTotalQ,
          valorUnitario: mergedUnit,
          imagemUrl: imagemUrlFinal,
          nfUrl: nfMerged,
          comprovantePagamentoUrl: compMerged,
          descricao:
            compra.descricao && compra.descricao.trim().length > 0
              ? compra.descricao.trim()
              : existing.descricao,
          cotacoesJson: compra.cotacoesJson ?? existing.cotacoesJson,
          ...(compra.categoriaId != null ? { categoriaId: compra.categoriaId } : {}),
        },
      });
      estoqueId = existing.id;
    } else {
      const imagemUrlFinal =
        compra.imagemUrl && compra.imagemUrl.trim().length > 0 ? compra.imagemUrl.trim() : null;

      const created = await this.prisma.estoque.create({
        data: {
          item: compra.item,
          descricao:
            compra.descricao && compra.descricao.trim().length > 0 ? compra.descricao.trim() : null,
          quantidade: qAdd,
          valorUnitario: unitVal,
          imagemUrl: imagemUrlFinal,
          nfUrl: compra.nfUrl?.trim() || null,
          comprovantePagamentoUrl: compra.comprovantePagamentoUrl?.trim() || null,
          cotacoesJson: compra.cotacoesJson ?? null,
          status: EstoqueStatus.DISPONIVEL,
          projetoId: compra.projetoId ?? null,
          etapaId: compra.etapaId ?? null,
          categoriaId: compra.categoriaId ?? null,
        },
      });
      estoqueId = created.id;
    }

    await this.prisma.estoqueEntrada.create({
      data: {
        estoqueId,
        compraId: compra.id,
        quantidade: qAdd,
        valorUnitario: unitVal,
        cotacoesJson: compra.cotacoesJson ?? undefined,
        nfUrl: compra.nfUrl?.trim() || null,
        comprovantePagamentoUrl: compra.comprovantePagamentoUrl?.trim() || null,
        formaPagamento: compra.formaPagamento?.trim() || null,
        observacao: compra.observacao?.trim() || null,
      },
    });
  }

  private async ensureProjectExists(id: number) {
    const project = await this.prisma.projeto.findUnique({ where: { id } });
    if (!project) {
      throw new BadRequestException('Projeto informado não existe');
    }
  }

  private async ensureTaskExists(id: number) {
    const task = await this.prisma.etapa.findUnique({ where: { id } });
    if (!task) {
      throw new BadRequestException('Etapa informada não existe');
    }
  }

  private async ensureUserExists(id: number) {
    const user = await this.prisma.usuario.findUnique({ where: { id } });
    if (!user) {
      throw new BadRequestException('Usuário informado não existe');
    }
  }

  private async ensureSetorExists(id: number) {
    const setor = await this.prisma.setor.findFirst({ where: { id, ativo: true } });
    if (!setor) {
      throw new BadRequestException('Setor informado não existe ou está inativo');
    }
  }

  private async ensureItemExists(id: number) {
    const item = await this.prisma.estoque.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Item de estoque não encontrado');
    }
    return item;
  }

  private async ensurePurchaseExists(id: number) {
    const compra = await this.prisma.compra.findUnique({ where: { id } });
    if (!compra) {
      throw new NotFoundException('Compra não encontrada');
    }
    return compra;
  }

  async approvePurchase(
    id: number,
    data: {
      cotacoes?: any[];
      selectedCotacaoIndex?: number;
      withChanges?: boolean;
      approvedQuantity?: number;
      reducedQuantityAction?: 'COMPRAR_DEPOIS' | 'REMOVER';
      categoriaId?: number;
    },
  ) {
    const compra = await this.ensurePurchaseExists(id);
    
    if (compra.status !== ('SOLICITADO' as CompraStatus)) {
      throw new BadRequestException('Apenas solicitações podem ser aprovadas');
    }

    let valorUnitario = compra.valorUnitario;
    let cotacoesJson = compra.cotacoesJson;
    let cotacaoSelecionadaIndex: number | undefined;
    const oldCotacoes = Array.isArray(compra.cotacoesJson) ? (compra.cotacoesJson as any[]) : [];
    const oldIdx = compra.cotacaoSelecionadaIndex ?? 0;
    const quantidadeOriginal = compra.quantidade;
    const quantidadeAprovada = data.approvedQuantity ?? quantidadeOriginal;

    if (!Number.isInteger(quantidadeAprovada) || quantidadeAprovada <= 0) {
      throw new BadRequestException('A quantidade aprovada deve ser um número inteiro maior que zero.');
    }
    if (quantidadeAprovada < quantidadeOriginal && !data.reducedQuantityAction) {
      throw new BadRequestException(
        'Informe como tratar a quantidade removida: comprar depois ou apenas remover.',
      );
    }

    // Se houver cotações fornecidas, usar a selecionada
    if (data.cotacoes && data.cotacoes.length > 0) {
      const selectedIndex = data.selectedCotacaoIndex ?? 0;
      cotacaoSelecionadaIndex = selectedIndex;
      const selectedCotacao = data.cotacoes[selectedIndex];
      if (selectedCotacao) {
        valorUnitario = this.cotacaoValorUnitarioMedioAprovado(selectedCotacao, quantidadeAprovada);
        cotacoesJson = data.cotacoes as any;
      }
    }

    if (!valorUnitario || valorUnitario <= 0) {
      throw new BadRequestException('É necessário fornecer cotações ou valor unitário para aprovar a solicitação');
    }

    if (data.categoriaId !== undefined) {
      const categoria = await this.findCategoriaCompraById(data.categoriaId);
      if (!categoria) {
        throw new BadRequestException('Categoria de compra inválida para aprovação');
      }
    }

    const compraAprovada = await this.prisma.compra.update({
      where: { id },
      data: {
        status: CompraStatus.PENDENTE,
        quantidade: quantidadeAprovada,
        valorUnitario: valorUnitario,
        cotacoesJson: cotacoesJson as any,
        solicitacaoAprovadaEm: new Date(),
        cotacaoSelecionadaIndex: cotacaoSelecionadaIndex ?? 0,
        ...(data.categoriaId !== undefined ? { categoriaId: data.categoriaId } : {}),
      } as any,
      include: {
        projeto: true,
        etapa: true,
        solicitadoPor: { include: { cargo: true } },
        categoria: true,
      } as any,
    });

    // Se aprovou com quantidade menor e optou por comprar depois, cria nova solicitação para o saldo.
    if (
      quantidadeAprovada < quantidadeOriginal &&
      data.reducedQuantityAction === 'COMPRAR_DEPOIS'
    ) {
      const quantidadeRemanescente = quantidadeOriginal - quantidadeAprovada;
      await this.prisma.compra.create({
        data: {
          item: compra.item,
          descricao: compra.descricao,
          quantidade: quantidadeRemanescente,
          status: CompraStatus.SOLICITADO,
          solicitadoPorId: compra.solicitadoPorId ?? null,
          projetoId: compra.projetoId ?? null,
          etapaId: compra.etapaId ?? null,
          setorId: compra.setorId ?? null,
          categoriaId: compra.categoriaId ?? null,
          observacao: `Remanescente da solicitação #${compra.id} para compra futura (${quantidadeRemanescente} unidade(s)).`,
          cotacoesJson: compra.cotacoesJson as any,
        } as any,
      });
    }

    // Criar requerimento e notificação linkada para o solicitante
    if ((compraAprovada as any).solicitadoPorId) {
      const novoIdx = cotacaoSelecionadaIndex ?? 0;
      const novasCotacoes = Array.isArray(cotacoesJson) ? (cotacoesJson as any[]) : [];
      const houveAlteracaoQuantidade = quantidadeAprovada !== quantidadeOriginal;
      const houveAlteracaoDeCotacao =
        data.withChanges === true ||
        (data.cotacoes &&
          data.cotacoes.length > 0 &&
          oldCotacoes.length > 0);

      if (houveAlteracaoDeCotacao || houveAlteracaoQuantidade) {
        const relatorio = await this.buildRelatorioAlteracaoAprovacao(
          oldCotacoes,
          oldIdx,
          novasCotacoes,
          novoIdx,
          quantidadeAprovada,
        );
        const relatorioQuantidade: string[] = [];
        if (houveAlteracaoQuantidade) {
          relatorioQuantidade.push(
            `Quantidade aprovada: ${quantidadeOriginal} → ${quantidadeAprovada}.`,
          );
          if (quantidadeAprovada < quantidadeOriginal) {
            const diff = quantidadeOriginal - quantidadeAprovada;
            relatorioQuantidade.push(
              data.reducedQuantityAction === 'COMPRAR_DEPOIS'
                ? `Saldo removido: ${diff} unidade(s), marcado para compra futura (nova solicitação criada).`
                : `Saldo removido: ${diff} unidade(s), sem nova solicitação de compra.`,
            );
          } else {
            relatorioQuantidade.push(
              `A quantidade foi aumentada em ${quantidadeAprovada - quantidadeOriginal} unidade(s).`,
            );
          }
        }
        const relatorioFinal =
          [relatorio.trim(), ...relatorioQuantidade].filter(Boolean).join('\n') ||
          'As cotações/quantidade da solicitação foram ajustadas e confirmadas na aprovação.';
        const requerimentoId = await this.criarRequerimentoAlteracaoAprovacaoCompra(
          (compraAprovada as any).solicitadoPorId,
          compraAprovada.item,
          relatorioFinal,
        );
        const msgResumo =
          relatorioFinal.length > 900
            ? `${relatorioFinal.slice(0, 897)}...`
            : relatorioFinal;
        await this.notificationsService.create({
          usuarioId: (compraAprovada as any).solicitadoPorId,
          titulo: 'Solicitação aprovada com alterações',
          mensagem: `Sua solicitação de compra "${compraAprovada.item}" foi aprovada com ajustes. Resumo:\n${msgResumo}`,
          tipo: NotificacaoTipo.INFO,
          requerimentoId: requerimentoId ?? undefined,
        });
      } else {
        // Primeiro criar o requerimento (detalhes completos)
        const requerimentoId = await this.criarRequerimentoAprovacaoCompra(
          (compraAprovada as any).solicitadoPorId,
          compraAprovada.item,
        );

        // Depois criar a notificação linkada ao requerimento (aviso resumido)
        await this.notificationsService.create({
          usuarioId: (compraAprovada as any).solicitadoPorId,
          titulo: 'Solicitação de Compra Aprovada',
          mensagem: `Sua solicitação de compra "${compraAprovada.item}" foi aprovada. Clique para ver detalhes.`,
          tipo: NotificacaoTipo.INFO,
          requerimentoId: requerimentoId ?? undefined, // Link para o requerimento
        });
      }
    }

    return compraAprovada;
  }

  /**
   * Ajusta cotação/valor após aprovar solicitação (compra PENDENTE originada de SOLICITADO).
   * Notifica o solicitante com relatório do que mudou.
   */
  async reviseApprovalPurchase(id: number, data: { cotacoes?: any[]; selectedCotacaoIndex?: number }) {
    const compra = await this.prisma.compra.findUnique({
      where: { id },
      include: {
        projeto: true,
        etapa: true,
        solicitadoPor: { include: { cargo: true } },
        categoria: true,
      } as any,
    });
    if (!compra) {
      throw new NotFoundException('Compra não encontrada');
    }
    if (compra.status !== CompraStatus.PENDENTE) {
      throw new BadRequestException('Apenas compras pendentes podem ter a aprovação revisada');
    }
    if (!compra.solicitacaoAprovadaEm) {
      throw new BadRequestException('Esta compra não foi aprovada a partir de uma solicitação; não é possível usar este fluxo');
    }
    if (!data.cotacoes || data.cotacoes.length === 0) {
      throw new BadRequestException('Informe as cotações para revisar a aprovação');
    }

    const newIdx = data.selectedCotacaoIndex ?? 0;
    const selectedCotacao = data.cotacoes[newIdx];
    if (!selectedCotacao) {
      throw new BadRequestException('Cotação selecionada inválida');
    }

    const valorUnitario = this.cotacaoValorUnitarioMedioAprovado(
      selectedCotacao,
      Math.max(1, Number(compra.quantidade) || 1),
    );
    if (!valorUnitario || valorUnitario <= 0) {
      throw new BadRequestException('É necessário um valor total da cotação maior que zero');
    }

    const oldCotacoes = Array.isArray(compra.cotacoesJson) ? (compra.cotacoesJson as any[]) : [];
    const oldIdx = compra.cotacaoSelecionadaIndex ?? 0;

    const relatorio = await this.buildRelatorioAlteracaoAprovacao(
      oldCotacoes,
      oldIdx,
      data.cotacoes,
      newIdx,
      Math.max(1, Number(compra.quantidade) || 1),
    );

    const compraAtualizada = await this.prisma.compra.update({
      where: { id },
      data: {
        valorUnitario,
        cotacoesJson: data.cotacoes as any,
        cotacaoSelecionadaIndex: newIdx,
      } as any,
      include: {
        projeto: true,
        etapa: true,
        solicitadoPor: { include: { cargo: true } },
        categoria: true,
      } as any,
    });

    if (relatorio.trim() && compra.solicitadoPorId) {
      const requerimentoId = await this.criarRequerimentoAlteracaoAprovacaoCompra(
        compra.solicitadoPorId,
        compra.item,
        relatorio,
      );
      const msgResumo =
        relatorio.length > 900
          ? `${relatorio.slice(0, 897)}...`
          : relatorio;
      await this.notificationsService.create({
        usuarioId: compra.solicitadoPorId,
        titulo: 'Aprovação da solicitação atualizada',
        mensagem: `A cotação aprovada do item "${compra.item}" foi alterada. Resumo:\n${msgResumo}`,
        tipo: NotificacaoTipo.INFO,
        requerimentoId: requerimentoId ?? undefined,
      });
    }

    return compraAtualizada;
  }

  private formatBrl(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  /** (VU × Q) + frete + impostos — frete/impostos são valores da linha, não por unidade. */
  private cotacaoBaseAntesDesconto(c: any, quantidade: number): number {
    const vu = Number(c?.valorUnitario ?? 0);
    const q = Math.max(0, Math.floor(Number(quantidade) || 0));
    const fr = Number(c?.frete ?? 0);
    const im = Number(c?.impostos ?? 0);
    return vu * q + fr + im;
  }

  private descontoTotalCotacao(c: any, quantidade: number): number {
    const base = this.cotacaoBaseAntesDesconto(c, quantidade);
    const tipo = c?.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor';
    const v = Number(c?.desconto ?? 0);
    if (tipo === 'porcentagem') {
      return base * (v / 100);
    }
    return Math.min(Math.max(0, v), base);
  }

  /** Custo médio por unidade após desconto (para gravar em `compra.valorUnitario`). */
  private cotacaoValorUnitarioMedioAprovado(c: any, quantidade: number): number {
    const q = Math.max(1, Math.floor(Number(quantidade) || 1));
    const total = Math.max(0, this.cotacaoBaseAntesDesconto(c, q) - this.descontoTotalCotacao(c, q));
    return total / q;
  }

  private normalizeCotacaoSnapshot(c: any) {
    return {
      valorUnitario: Number(c?.valorUnitario ?? 0),
      frete: Number(c?.frete ?? 0),
      impostos: Number(c?.impostos ?? 0),
      desconto: Number(c?.desconto ?? 0),
      descontoTipo: c?.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor',
      link: String(c?.link ?? '').trim(),
      fornecedorId:
        c?.fornecedorId != null && c?.fornecedorId !== '' ? Number(c.fornecedorId) : null,
      formaPagamento: String(c?.formaPagamento ?? '').trim(),
    };
  }

  private async buildRelatorioAlteracaoAprovacao(
    oldCotacoes: any[],
    oldIdx: number,
    newCotacoes: any[],
    newIdx: number,
    quantidadeCompra: number,
  ): Promise<string> {
    const lines: string[] = [];
    const oldArr = Array.isArray(oldCotacoes) ? oldCotacoes : [];
    const newArr = Array.isArray(newCotacoes) ? newCotacoes : [];

    if (oldArr.length !== newArr.length) {
      lines.push(`Quantidade de cotações na lista: ${oldArr.length} → ${newArr.length}.`);
    }

    if (oldIdx !== newIdx) {
      lines.push(`Cotação selecionada: de «Cotação ${oldIdx + 1}» para «Cotação ${newIdx + 1}».`);
    }

    const o = this.normalizeCotacaoSnapshot(oldArr[oldIdx] ?? {});
    const n = this.normalizeCotacaoSnapshot(newArr[newIdx] ?? {});

    const ids = [...new Set([o.fornecedorId, n.fornecedorId].filter((x): x is number => x != null && !Number.isNaN(x)))];
    const names = new Map<number, string>();
    if (ids.length) {
      const fornecedores = await this.prisma.fornecedor.findMany({
        where: { id: { in: ids } },
        select: { id: true, nomeFantasia: true, razaoSocial: true },
      });
      for (const f of fornecedores) {
        names.set(f.id, f.nomeFantasia || f.razaoSocial || `#${f.id}`);
      }
    }
    const labelFornecedor = (id: number | null) =>
      id == null ? '—' : names.get(id) ?? `Fornecedor #${id}`;

    if (o.valorUnitario !== n.valorUnitario) {
      lines.push(`Valor unitário: ${this.formatBrl(o.valorUnitario)} → ${this.formatBrl(n.valorUnitario)}.`);
    }
    if (o.frete !== n.frete) {
      lines.push(`Frete: ${this.formatBrl(o.frete)} → ${this.formatBrl(n.frete)}.`);
    }
    if (o.impostos !== n.impostos) {
      lines.push(`Impostos: ${this.formatBrl(o.impostos)} → ${this.formatBrl(n.impostos)}.`);
    }
    if (o.desconto !== n.desconto || o.descontoTipo !== n.descontoTipo) {
      const fmt = (d: number, t: string) => (t === 'porcentagem' ? `${d}%` : this.formatBrl(d));
      lines.push(`Desconto: ${fmt(o.desconto, o.descontoTipo)} → ${fmt(n.desconto, n.descontoTipo)}.`);
    }
    if (o.link !== n.link) {
      lines.push(`Link de compra: «${o.link || '—'}» → «${n.link || '—'}».`);
    }
    if (o.fornecedorId !== n.fornecedorId) {
      lines.push(`Fornecedor: ${labelFornecedor(o.fornecedorId)} → ${labelFornecedor(n.fornecedorId)}.`);
    }
    if (o.formaPagamento !== n.formaPagamento) {
      lines.push(`Forma de pagamento: «${o.formaPagamento || '—'}» → «${n.formaPagamento || '—'}».`);
    }

    const cotOld = {
      valorUnitario: o.valorUnitario,
      frete: o.frete,
      impostos: o.impostos,
      desconto: o.desconto,
      descontoTipo: o.descontoTipo,
    };
    const cotNew = {
      valorUnitario: n.valorUnitario,
      frete: n.frete,
      impostos: n.impostos,
      desconto: n.desconto,
      descontoTipo: n.descontoTipo,
    };
    const qRef = Math.max(1, Math.floor(Number(quantidadeCompra) || 1));
    const totalUnitOld = this.cotacaoValorUnitarioMedioAprovado(cotOld, qRef);
    const totalUnitNew = this.cotacaoValorUnitarioMedioAprovado(cotNew, qRef);
    if (Math.abs(totalUnitOld - totalUnitNew) > 0.005) {
      lines.push(`Total por unidade (com desconto): ${this.formatBrl(totalUnitOld)} → ${this.formatBrl(totalUnitNew)}.`);
    }

    return lines.join('\n');
  }

  private async criarRequerimentoAlteracaoAprovacaoCompra(
    destinatarioId: number,
    itemNome: string,
    relatorio: string,
  ): Promise<number | null> {
    try {
      const remetenteSistemaId = await this.findSystemSenderId(destinatarioId);

      if (!remetenteSistemaId) {
      }

      if (!remetenteSistemaId) {
        return null;
      }

      const texto = `Alteração na aprovação da solicitação de compra "${itemNome}".\n\n${relatorio}`;

      const requerimento = await this.prisma.requerimento.create({
        data: {
          usuarioId: remetenteSistemaId,
          destinatarioId: destinatarioId,
          tipo: RequerimentoTipo.INFORMACAO,
          texto,
          etapaId: null,
        },
      });

      return requerimento.id;
    } catch {
      return null;
    }
  }

  async rejectPurchase(id: number, motivoRejeicao: string) {
    const compra = await this.ensurePurchaseExists(id);
    
    if (compra.status !== ('SOLICITADO' as CompraStatus)) {
      throw new BadRequestException('Apenas solicitações podem ser reprovadas');
    }

    const compraReprovada = await this.prisma.compra.update({
      where: { id },
      data: {
        status: 'REPROVADO' as CompraStatus,
        motivoRejeicao: motivoRejeicao.trim(),
      } as any,
      include: {
        projeto: true,
        etapa: true,
        solicitadoPor: { include: { cargo: true } },
        categoria: true,
      } as any,
    });

    // Criar requerimento e notificação linkada para o solicitante
    if ((compraReprovada as any).solicitadoPorId) {
      // Primeiro criar o requerimento (detalhes completos)
      const requerimentoId = await this.criarRequerimentoRecusaCompra(
        (compraReprovada as any).solicitadoPorId,
        compraReprovada.item,
        motivoRejeicao.trim(),
      );

      // Depois criar a notificação linkada ao requerimento (aviso resumido)
      await this.notificationsService.create({
        usuarioId: (compraReprovada as any).solicitadoPorId,
        titulo: 'Solicitação de Compra Reprovada',
        mensagem: `Sua solicitação de compra "${compraReprovada.item}" foi reprovada. Clique para ver detalhes.`,
        tipo: NotificacaoTipo.INFO,
        requerimentoId: requerimentoId ?? undefined, // Link para o requerimento
      });
    }

    // Notificar supervisor do projeto se houver
    if ((compraReprovada as any).projeto?.supervisorId) {
      await this.notificationsService.create({
        usuarioId: (compraReprovada as any).projeto.supervisorId,
        titulo: 'Solicitação de Compra Reprovada',
        mensagem: `A solicitação de compra "${compraReprovada.item}" do projeto "${(compraReprovada as any).projeto.nome}" foi reprovada. Clique para ver detalhes.`,
        tipo: NotificacaoTipo.INFO,
      });
    }

    return compraReprovada;
  }

  /**
   * Cria um requerimento do tipo INFORMACAO para o solicitante quando uma compra é recusada
   * Retorna o ID do requerimento criado para linkar com a notificação
   */
  private async criarRequerimentoRecusaCompra(
    destinatarioId: number,
    itemNome: string,
    motivoRejeicao: string,
  ): Promise<number | null> {
    try {
      const remetenteSistemaId = await this.findSystemSenderId(destinatarioId);

      if (!remetenteSistemaId) {
        return null;
      }

      const requerimento = await this.prisma.requerimento.create({
        data: {
          usuarioId: remetenteSistemaId,
          destinatarioId: destinatarioId,
          tipo: RequerimentoTipo.INFORMACAO,
          texto: `Sua solicitação de compra "${itemNome}" foi REPROVADA.\n\nMotivo: ${motivoRejeicao}`,
          etapaId: null,
        },
      });

      return requerimento.id;
    } catch {
      return null;
    }
  }

  /**
   * Cria um requerimento do tipo INFORMACAO para o solicitante quando uma compra é aprovada
   * Retorna o ID do requerimento criado para linkar com a notificação
   */
  private async criarRequerimentoAprovacaoCompra(
    destinatarioId: number,
    itemNome: string,
  ): Promise<number | null> {
    try {
      const remetenteSistemaId = await this.findSystemSenderId(destinatarioId);

      if (!remetenteSistemaId) {
        return null;
      }

      const requerimento = await this.prisma.requerimento.create({
        data: {
          usuarioId: remetenteSistemaId,
          destinatarioId: destinatarioId,
          tipo: RequerimentoTipo.INFORMACAO,
          texto: `Sua solicitação de compra "${itemNome}" foi APROVADA e está aguardando pagamento.`,
          etapaId: null,
        },
      });

      return requerimento.id;
    } catch {
      return null;
    }
  }

  async createAlocacao(data: {
    estoqueId: number;
    projetoId?: number;
    etapaId?: number;
    usuarioId?: number;
    setorId?: number;
    validarUsuarioNoSetorId?: number;
    quantidade: number;
  }) {
    const item = await this.ensureItemExists(data.estoqueId);
    const categoria = await this.findCategoriaCompraById((item as any).categoriaId);
    if (categoria && (categoria.permiteAlocacao === false || this.isAssinaturaCategoria(categoria))) {
      throw new BadRequestException('Itens da categoria de assinatura não permitem alocação.');
    }

    const hasProjeto = Boolean(data.projetoId);
    const hasUsuario = Boolean(data.usuarioId);
    const hasSetor = Boolean(data.setorId);
    if (!hasProjeto && !hasUsuario && !hasSetor) {
      throw new BadRequestException(
        'É necessário informar um projeto, um usuário ou um setor para alocar o item',
      );
    }
    const destinos = [hasProjeto, hasUsuario, hasSetor].filter(Boolean).length;
    if (destinos > 1) {
      throw new BadRequestException('Informe apenas um destino: projeto (com etapa opcional), usuário ou setor');
    }

    // Verificar quantidade disponível
    const alocacoesExistentes = await (this.prisma as any).estoqueAlocacao.findMany({
      where: { estoqueId: data.estoqueId },
    });
    const quantidadeAlocada = alocacoesExistentes.reduce((sum: number, aloc: any) => sum + aloc.quantidade, 0);
    const quantidadeDisponivel = item.quantidade - quantidadeAlocada;
    
    if (data.quantidade > quantidadeDisponivel) {
      throw new BadRequestException(
        `Quantidade solicitada (${data.quantidade}) excede a quantidade disponível (${quantidadeDisponivel})`
      );
    }

    if (data.projetoId) {
      await this.ensureProjectExists(data.projetoId);
    }
    if (data.etapaId) {
      await this.ensureTaskExists(data.etapaId);
    }
    if (data.usuarioId) {
      await this.ensureUserExists(data.usuarioId);
    }
    if (data.setorId) {
      await this.ensureSetorExists(data.setorId);
    }

    if (data.validarUsuarioNoSetorId != null && data.usuarioId != null) {
      const link = await this.prisma.setorUsuario.findUnique({
        where: {
          setorId_usuarioId: {
            setorId: data.validarUsuarioNoSetorId,
            usuarioId: data.usuarioId,
          },
        },
      });
      if (!link) {
        throw new BadRequestException('O colaborador selecionado não é integrante deste setor.');
      }
    }

    // Verificar se já existe alocação para este estoque+projeto+etapa+usuario+setor
    const alocacaoExistente = await (this.prisma as any).estoqueAlocacao.findFirst({
      where: {
        estoqueId: data.estoqueId,
        projetoId: data.projetoId || null,
        etapaId: data.etapaId || null,
        usuarioId: data.usuarioId || null,
        setorId: data.setorId || null,
      },
    });

    if (alocacaoExistente) {
      // Atualizar alocação existente
      const novaQuantidade = alocacaoExistente.quantidade + data.quantidade;
      if (novaQuantidade > quantidadeDisponivel + alocacaoExistente.quantidade) {
        throw new BadRequestException(
          `Quantidade total (${novaQuantidade}) excede a quantidade disponível (${quantidadeDisponivel + alocacaoExistente.quantidade})`
        );
      }
      return (this.prisma as any).estoqueAlocacao.update({
        where: { id: alocacaoExistente.id },
        data: { quantidade: novaQuantidade },
        include: {
          estoque: true,
          projeto: true,
          etapa: true,
          setor: { select: { id: true, nome: true } },
          usuario: {
            select: {
              id: true,
              nome: true,
              cargo: {
                select: {
                  nome: true,
                },
              },
            },
          },
        },
      });
    }

    return (this.prisma as any).estoqueAlocacao.create({
      data: {
        estoqueId: data.estoqueId,
        projetoId: data.projetoId || null,
        etapaId: data.etapaId || null,
        usuarioId: data.usuarioId || null,
        setorId: data.setorId || null,
        quantidade: data.quantidade,
      },
      include: {
        estoque: true,
        projeto: true,
        etapa: true,
        setor: { select: { id: true, nome: true } },
        usuario: {
          select: {
            id: true,
            nome: true,
            cargo: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
    });
  }

  async updateAlocacao(id: number, quantidade: number) {
    const alocacao = await (this.prisma as any).estoqueAlocacao.findUnique({
      where: { id },
      include: { estoque: true },
    });

    if (!alocacao) {
      throw new NotFoundException('Alocação não encontrada');
    }

    // Verificar quantidade disponível
    const alocacoesExistentes = await (this.prisma as any).estoqueAlocacao.findMany({
      where: { estoqueId: alocacao.estoqueId },
    });
    const quantidadeAlocada = alocacoesExistentes.reduce((sum: number, aloc: any) => {
      if (aloc.id === id) return sum; // Excluir a alocação atual
      return sum + aloc.quantidade;
    }, 0);
    const quantidadeDisponivel = alocacao.estoque.quantidade - quantidadeAlocada;
    
    if (quantidade > quantidadeDisponivel) {
      throw new BadRequestException(
        `Quantidade solicitada (${quantidade}) excede a quantidade disponível (${quantidadeDisponivel})`
      );
    }

    return (this.prisma as any).estoqueAlocacao.update({
      where: { id },
      data: { quantidade },
      include: {
        estoque: true,
        projeto: true,
        etapa: true,
        setor: { select: { id: true, nome: true } },
        usuario: {
          select: {
            id: true,
            nome: true,
            cargo: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Troca titular de carga alocada sem projeto (somente usuário ou setor).
   * Ex.: repasse entre pesquisadores do mesmo setor sem devolver ao estoque.
   */
  async reassignAlocacaoDestino(
    id: number,
    data: { usuarioId?: number; setorId?: number; validarUsuarioNoSetorId?: number },
  ) {
    const alocacao = await (this.prisma as any).estoqueAlocacao.findUnique({
      where: { id },
      include: { estoque: true },
    });

    if (!alocacao) {
      throw new NotFoundException('Alocação não encontrada');
    }
    if (alocacao.projetoId != null) {
      throw new BadRequestException(
        'Alocações vinculadas a projeto não podem ser transferidas por esta ação. Use a tela de Compras & Estoque.',
      );
    }

    const hasU = Boolean(data.usuarioId);
    const hasS = Boolean(data.setorId);
    if (hasU === hasS) {
      throw new BadRequestException('Informe exatamente um destino: usuário ou setor.');
    }

    if (data.usuarioId) {
      await this.ensureUserExists(data.usuarioId);
    }
    if (data.setorId) {
      await this.ensureSetorExists(data.setorId);
    }

    if (data.validarUsuarioNoSetorId != null && data.usuarioId != null) {
      const link = await this.prisma.setorUsuario.findUnique({
        where: {
          setorId_usuarioId: {
            setorId: data.validarUsuarioNoSetorId,
            usuarioId: data.usuarioId,
          },
        },
      });
      if (!link) {
        throw new BadRequestException('O colaborador selecionado não é integrante deste setor.');
      }
    }

    return (this.prisma as any).estoqueAlocacao.update({
      where: { id },
      data: {
        usuarioId: data.usuarioId ?? null,
        setorId: data.setorId ?? null,
        projetoId: null,
        etapaId: null,
      },
      include: {
        estoque: true,
        projeto: true,
        etapa: true,
        setor: { select: { id: true, nome: true } },
        usuario: {
          select: {
            id: true,
            nome: true,
            cargo: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteAlocacao(id: number) {
    await (this.prisma as any).estoqueAlocacao.delete({ where: { id } });
    return { deleted: true };
  }

  async listAlocacoes(
    estoqueId?: number,
    projetoId?: number,
    etapaId?: number,
    usuarioId?: number,
    setorId?: number,
    contextSetorId?: number,
  ) {
    const include = {
      estoque: true,
      projeto: true,
      etapa: true,
      setor: { select: { id: true, nome: true } },
      usuario: {
        select: {
          id: true,
          nome: true,
          cargo: {
            select: {
              nome: true,
            },
          },
        },
      },
    };

    if (contextSetorId != null && Number.isFinite(contextSetorId) && contextSetorId > 0) {
      const setorCtx = await this.prisma.setor.findUnique({
        where: { id: contextSetorId },
        select: { membros: { select: { usuarioId: true } } },
      });
      const membroIds = (setorCtx?.membros ?? []).map((m) => m.usuarioId);
      const orClause: any[] = [{ setorId: contextSetorId }];
      if (membroIds.length > 0) {
        orClause.push({ usuarioId: { in: membroIds } });
      }
      const where: any = {
        AND: [{ OR: orClause }],
      };
      if (estoqueId) where.AND.push({ estoqueId });
      if (projetoId) where.AND.push({ projetoId });
      if (etapaId) where.AND.push({ etapaId });
      if (usuarioId) where.AND.push({ usuarioId });
      if (setorId) where.AND.push({ setorId });

      return (this.prisma as any).estoqueAlocacao.findMany({
        where,
        include,
        orderBy: { dataAlocacao: 'desc' },
      });
    }

    const where: any = {};
    if (estoqueId) where.estoqueId = estoqueId;
    if (projetoId) where.projetoId = projetoId;
    if (etapaId) where.etapaId = etapaId;
    if (usuarioId) where.usuarioId = usuarioId;
    if (setorId) where.setorId = setorId;

    return (this.prisma as any).estoqueAlocacao.findMany({
      where,
      include,
      orderBy: { dataAlocacao: 'desc' },
    });
  }
}
