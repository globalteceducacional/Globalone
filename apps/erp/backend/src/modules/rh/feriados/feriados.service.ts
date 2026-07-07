import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CalendarioEventoAlvo } from '@prisma/client';
import {
  civilDateFromDb,
  civilDateInYear,
  endOfCivilDay,
  formatDateOnlyYmd,
  iterarDiasCivis,
  parseDateOnlyYmd,
} from '../../../common/utils/date-only.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { CoberturaDia } from '../espelho/espelho.calculator';
import { AtualizarFeriadoDto, CriarFeriadoDto } from './dto/feriado.dto';

type FeriadoRow = {
  id: number;
  nome: string;
  descricao: string | null;
  dataInicio: Date;
  dataFim: Date;
  recorrenteAnual: boolean;
  criadoPorId: number | null;
};

@Injectable()
export class FeriadosService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const feriados = await this.prisma.feriado.findMany();
      for (const f of feriados) {
        const count = await this.prisma.calendarioEvento.count({ where: { feriadoId: f.id } });
        if (count === 0) {
          await this.syncCalendarioEventos(f);
        }
      }
    } catch (err) {
      console.error('[FeriadosService] Falha ao sincronizar feriados no calendário na inicialização:', err);
    }
  }

  private normalizarIntervalo(dataInicio: string, dataFim?: string) {
    const inicio = parseDateOnlyYmd(dataInicio, 'dataInicio');
    const fim = parseDateOnlyYmd(dataFim ?? dataInicio, 'dataFim');
    if (fim.getTime() < inicio.getTime()) {
      throw new BadRequestException('dataFim não pode ser anterior a dataInicio.');
    }
    return { inicio, fim };
  }

  private async resolveCriadorId(criadoPorId: number | null | undefined): Promise<number> {
    if (criadoPorId) return criadoPorId;
    const u = await this.prisma.usuario.findFirst({
      where: { ativo: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!u) {
      throw new BadRequestException('Não há usuários ativos para vincular eventos de feriado.');
    }
    return u.id;
  }

  private datesForYear(f: FeriadoRow, ano: number): { inicio: Date; fim: Date } {
    const inicio = f.recorrenteAnual
      ? civilDateInYear(f.dataInicio, ano)
      : civilDateFromDb(f.dataInicio);
    const fimBase = f.recorrenteAnual ? civilDateInYear(f.dataFim, ano) : civilDateFromDb(f.dataFim);
    inicio.setHours(0, 0, 0, 0);
    return { inicio, fim: endOfCivilDay(fimBase) };
  }

  /** Cria/atualiza eventos no calendário (sem notificar usuários). */
  private async syncCalendarioEventos(feriado: FeriadoRow) {
    const criadorId = await this.resolveCriadorId(feriado.criadoPorId);
    await this.prisma.calendarioEvento.deleteMany({ where: { feriadoId: feriado.id } });

    const titulo = `Feriado — ${feriado.nome}`;
    const baseDesc = feriado.descricao?.trim();
    const descricao = baseDesc
      ? `${baseDesc}\n\nDia sem exigência de registro de ponto.`
      : 'Dia sem exigência de registro de ponto.';

    const currentYear = new Date().getFullYear();
    const years = feriado.recorrenteAnual
      ? Array.from({ length: 8 }, (_, i) => currentYear - 2 + i)
      : [feriado.dataInicio.getUTCFullYear()];

    for (const ano of years) {
      const { inicio, fim } = this.datesForYear(feriado, ano);
      await this.prisma.calendarioEvento.create({
        data: {
          titulo,
          descricao,
          dataInicio: inicio,
          dataFim: fim,
          alvo: CalendarioEventoAlvo.TODOS_USUARIOS,
          criadorId,
          feriadoId: feriado.id,
        },
      });
    }
  }

  async listar(ano?: number) {
    const rows = await this.prisma.feriado.findMany({
      orderBy: [{ recorrenteAnual: 'desc' }, { dataInicio: 'asc' }],
      include: {
        criadoPor: { select: { id: true, nome: true } },
      },
    });
    const alvo = ano ?? new Date().getFullYear();
    return rows
      .filter((f) => f.recorrenteAnual || f.dataInicio.getUTCFullYear() === alvo)
      .map((f) => ({
        id: f.id,
        dataInicio: formatDateOnlyYmd(f.dataInicio),
        dataFim: formatDateOnlyYmd(f.dataFim),
        nome: f.nome,
        descricao: f.descricao,
        recorrenteAnual: f.recorrenteAnual,
        criadoPor: f.criadoPor,
        dataCriacao: f.dataCriacao,
      }));
  }

  async criar(criadoPorId: number, dto: CriarFeriadoDto) {
    const { inicio, fim } = this.normalizarIntervalo(dto.dataInicio, dto.dataFim);
    const created = await this.prisma.feriado.create({
      data: {
        dataInicio: inicio,
        dataFim: fim,
        nome: dto.nome.trim(),
        descricao: dto.descricao?.trim() || null,
        recorrenteAnual: dto.recorrenteAnual === true,
        criadoPorId,
      },
      include: { criadoPor: { select: { id: true, nome: true } } },
    });
    await this.syncCalendarioEventos(created);
    return {
      id: created.id,
      dataInicio: formatDateOnlyYmd(created.dataInicio),
      dataFim: formatDateOnlyYmd(created.dataFim),
      nome: created.nome,
      descricao: created.descricao,
      recorrenteAnual: created.recorrenteAnual,
      criadoPor: created.criadoPor,
      dataCriacao: created.dataCriacao,
    };
  }

  async atualizar(id: number, dto: AtualizarFeriadoDto) {
    const existing = await this.prisma.feriado.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Feriado não encontrado.');

    const data: {
      dataInicio?: Date;
      dataFim?: Date;
      nome?: string;
      descricao?: string | null;
      recorrenteAnual?: boolean;
    } = {};

    if (dto.dataInicio !== undefined || dto.dataFim !== undefined) {
      const { inicio, fim } = this.normalizarIntervalo(
        dto.dataInicio ?? formatDateOnlyYmd(existing.dataInicio),
        dto.dataFim ?? formatDateOnlyYmd(existing.dataFim),
      );
      data.dataInicio = inicio;
      data.dataFim = fim;
    }
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.descricao !== undefined) data.descricao = dto.descricao?.trim() || null;
    if (dto.recorrenteAnual !== undefined) data.recorrenteAnual = dto.recorrenteAnual;

    const updated = await this.prisma.feriado.update({
      where: { id },
      data,
      include: { criadoPor: { select: { id: true, nome: true } } },
    });
    await this.syncCalendarioEventos(updated);
    return {
      id: updated.id,
      dataInicio: formatDateOnlyYmd(updated.dataInicio),
      dataFim: formatDateOnlyYmd(updated.dataFim),
      nome: updated.nome,
      descricao: updated.descricao,
      recorrenteAnual: updated.recorrenteAnual,
      criadoPor: updated.criadoPor,
      dataCriacao: updated.dataCriacao,
    };
  }

  async remover(id: number) {
    const existing = await this.prisma.feriado.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Feriado não encontrado.');
    await this.prisma.calendarioEvento.deleteMany({ where: { feriadoId: id } });
    await this.prisma.feriado.delete({ where: { id } });
    return { ok: true };
  }

  /** Gera coberturas de feriado para o espelho/banco de horas no intervalo [inicio, fim]. */
  async coberturasNoPeriodo(inicio: Date, fim: Date): Promise<CoberturaDia[]> {
    const feriados = await this.prisma.feriado.findMany();
    if (feriados.length === 0) return [];

    const inicioDia = new Date(inicio);
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(fim);
    fimDia.setHours(0, 0, 0, 0);

    const yStart = inicioDia.getFullYear();
    const yEnd = fimDia.getFullYear();
    const cobs: CoberturaDia[] = [];

    for (const f of feriados) {
      const motivo = f.descricao?.trim() ? `${f.nome} — ${f.descricao.trim()}` : f.nome;
      const anos: number[] = f.recorrenteAnual
        ? Array.from({ length: yEnd - yStart + 1 }, (_, i) => yStart + i)
        : [f.dataInicio.getUTCFullYear()];

      for (const ano of anos) {
        if (!f.recorrenteAnual && (ano < yStart || ano > yEnd)) continue;

        const start = f.recorrenteAnual
          ? civilDateInYear(f.dataInicio, ano)
          : civilDateFromDb(f.dataInicio);
        const end = f.recorrenteAnual
          ? civilDateInYear(f.dataFim, ano)
          : civilDateFromDb(f.dataFim);

        const clipStart = start.getTime() < inicioDia.getTime() ? inicioDia : start;
        const clipEnd = end.getTime() > fimDia.getTime() ? fimDia : end;
        if (clipStart.getTime() > clipEnd.getTime()) continue;

        for (const key of iterarDiasCivis(clipStart, clipEnd)) {
          cobs.push({ data: key, status: 'FERIADO', motivo });
        }
      }
    }

    return cobs;
  }
}
