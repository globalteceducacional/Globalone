import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RemuneracaoPontoTipo } from '@prisma/client';
import { calcularCargasJornada } from '../../../common/utils/jornada-carga.util';
import { metaHorasMensalMinFromCargaSemanal } from '../../../common/utils/jornada-finance.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateJornadaDto } from './dto/update-jornada.dto';

const DEFAULT_DIAS_UTEIS = {
  '0': false,
  '1': true,
  '2': true,
  '3': true,
  '4': true,
  '5': true,
  '6': false,
};

function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class JornadaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante que o usuário tenha uma jornada (cria com defaults se não existir). */
  async ensure(usuarioId: number) {
    const existente = await this.prisma.jornadaTrabalho.findUnique({ where: { usuarioId } });
    if (existente) return existente;
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return this.prisma.jornadaTrabalho.create({
      data: { usuarioId, diasUteis: DEFAULT_DIAS_UTEIS },
    });
  }

  /** Listagem para o RH (uma jornada por usuário; entrega usuários sem jornada com null). */
  async listarTodas() {
    const usuarios = await this.prisma.usuario.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        funcao: true,
        cargo: { select: { id: true, nome: true } },
        jornada: true,
      },
    });
    const comBatidaRows = await this.prisma.registroPonto.findMany({
      select: { usuarioId: true },
      distinct: ['usuarioId'],
    });
    const idsComBatida = new Set(comBatidaRows.map((r) => r.usuarioId));

    return usuarios.map((u) => ({
      usuarioId: u.id,
      nome: u.nome,
      email: u.email,
      funcao: u.funcao,
      cargo: u.cargo,
      jornada: u.jornada,
      temBatidaPonto: idsComBatida.has(u.id),
    }));
  }

  /**
   * Atualiza `controlePonto` em lote. `controlePonto: false` ignora quem já tem
   * registro de ponto (use edição individual se precisar dispensar com histórico).
   */
  async bulkControlePonto(usuarioIds: number[], controlePonto: boolean) {
    const ids = [...new Set(usuarioIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length === 0) {
      throw new BadRequestException('Nenhum ID de colaborador válido.');
    }

    const atualizados: number[] = [];
    const ignoradosComBatida: number[] = [];

    for (const usuarioId of ids) {
      const u = await this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, ativo: true },
      });
      if (!u?.ativo) continue;

      await this.ensure(usuarioId);

      if (!controlePonto) {
        const n = await this.prisma.registroPonto.count({ where: { usuarioId } });
        if (n > 0) {
          ignoradosComBatida.push(usuarioId);
          continue;
        }
      }

      await this.prisma.jornadaTrabalho.update({
        where: { usuarioId },
        data: { controlePonto },
      });
      atualizados.push(usuarioId);
    }

    return {
      atualizados: atualizados.length,
      ignoradosComBatida: ignoradosComBatida.length,
      idsIgnoradosComBatida: ignoradosComBatida,
    };
  }

  /**
   * Só entra em BH / espelho consolidado com `controlePonto === true`.
   * Padrão no cadastro é false; a primeira batida do colaborador (zero registros) ativa automaticamente.
   */
  async participaControlePonto(usuarioId: number): Promise<boolean> {
    const j = await this.prisma.jornadaTrabalho.findUnique({
      where: { usuarioId },
      select: { controlePonto: true },
    });
    return j?.controlePonto === true;
  }

  /**
   * Colaborador dispensado (`controlePonto` false) pode registrar a **primeira** batida:
   * isso ativa o controle e passa a valer ponto + banco de horas.
   * Se já existe histórico e continua false, o RH bloqueou — não pode bater pelo app.
   */
  async assertPodeBaterPontoComoColaborador(usuarioId: number): Promise<void> {
    await this.ensure(usuarioId);
    const j = await this.prisma.jornadaTrabalho.findUnique({
      where: { usuarioId },
      select: { controlePonto: true },
    });
    if (!j) return;
    if (j.controlePonto) return;
    const n = await this.prisma.registroPonto.count({ where: { usuarioId } });
    if (n === 0) {
      await this.prisma.jornadaTrabalho.update({
        where: { usuarioId },
        data: { controlePonto: true },
      });
      return;
    }
    throw new ForbiddenException(
      'Seu cadastro está como sem controle de ponto eletrônico. Procure o RH em caso de dúvida.',
    );
  }

  /** RH ou fluxo de ajuste aprovado: qualquer registro criado deve deixar o colaborador no controle ativo. */
  async habilitarControlePontoParaRegistroRh(usuarioId: number): Promise<void> {
    await this.ensure(usuarioId);
    await this.prisma.jornadaTrabalho.update({
      where: { usuarioId },
      data: { controlePonto: true },
    });
  }

  async update(usuarioId: number, dto: UpdateJornadaDto) {
    await this.ensure(usuarioId);
    const atual = await this.prisma.jornadaTrabalho.findUnique({ where: { usuarioId } });
    if (!atual) {
      throw new NotFoundException('Jornada não encontrada.');
    }

    if (dto.almocoInicio != null && dto.almocoFim != null) {
      if (hhmmToMin(dto.almocoFim) <= hhmmToMin(dto.almocoInicio)) {
        throw new BadRequestException('O horário final do almoço deve ser depois do início.');
      }
    } else if (dto.almocoInicio != null || dto.almocoFim != null) {
      const i = dto.almocoInicio ?? atual.almocoInicio;
      const f = dto.almocoFim ?? atual.almocoFim;
      if (hhmmToMin(f) <= hhmmToMin(i)) {
        throw new BadRequestException('O horário final do almoço deve ser depois do início.');
      }
    }

    // Geocerca individual: combina o atual com o que veio no DTO; valida que
    // os 3 campos venham juntos (todos preenchidos OU todos nulos) e prepara
    // os campos a serem persistidos.
    const geocercaAlguma =
      dto.latitudeReferencia !== undefined ||
      dto.longitudeReferencia !== undefined ||
      dto.raioMetros !== undefined;
    let geocercaData: {
      latitudeReferencia?: number | null;
      longitudeReferencia?: number | null;
      raioMetros?: number | null;
    } = {};
    if (geocercaAlguma) {
      const lat =
        dto.latitudeReferencia !== undefined ? dto.latitudeReferencia : atual.latitudeReferencia;
      const lon =
        dto.longitudeReferencia !== undefined ? dto.longitudeReferencia : atual.longitudeReferencia;
      const raio = dto.raioMetros !== undefined ? dto.raioMetros : atual.raioMetros;
      const tem = (v: unknown) => v !== undefined && v !== null;
      const total = [tem(lat), tem(lon), tem(raio)].filter(Boolean).length;
      if (total !== 0 && total !== 3) {
        throw new BadRequestException(
          'Para ativar a geocerca individual, informe latitude, longitude e raio (em metros). Para desativar, deixe os 3 campos em branco.',
        );
      }
      if (dto.latitudeReferencia !== undefined) geocercaData.latitudeReferencia = dto.latitudeReferencia;
      if (dto.longitudeReferencia !== undefined) geocercaData.longitudeReferencia = dto.longitudeReferencia;
      if (dto.raioMetros !== undefined) geocercaData.raioMetros = dto.raioMetros;
    }

    const remuneracaoAlguma =
      dto.remuneracaoPontoTipo !== undefined ||
      dto.valorHora !== undefined ||
      dto.valorMensal !== undefined ||
      dto.metaHorasMensalMin !== undefined;
    if (remuneracaoAlguma) {
      const tipo = dto.remuneracaoPontoTipo ?? atual.remuneracaoPontoTipo;
      const valorHora =
        dto.valorHora !== undefined ? dto.valorHora : atual.valorHora != null ? Number(atual.valorHora) : null;
      const valorMensal =
        dto.valorMensal !== undefined
          ? dto.valorMensal
          : atual.valorMensal != null
            ? Number(atual.valorMensal)
            : null;
      const cargaSemanal = dto.cargaSemanalMin ?? atual.cargaSemanalMin;
      if (tipo === RemuneracaoPontoTipo.VALOR_HORA) {
        const v = valorHora != null ? Number(valorHora) : NaN;
        if (!Number.isFinite(v) || v <= 0) {
          throw new BadRequestException('Para remuneração por valor hora, informe um valor hora maior que zero.');
        }
      }
      if (tipo === RemuneracaoPontoTipo.MENSAL_META_HORAS) {
        const vm = valorMensal != null ? Number(valorMensal) : NaN;
        if (!Number.isFinite(vm) || vm <= 0) {
          throw new BadRequestException('Para remuneração mensal com meta, informe o valor mensal maior que zero.');
        }
        if (!cargaSemanal || cargaSemanal < 1) {
          throw new BadRequestException(
            'Para remuneração mensal com meta, defina a carga semanal (minutos) maior que zero. A meta mensal de horas é calculada automaticamente a partir dela (carga semanal × 52 ÷ 12).',
          );
        }
      }
    }

    const mergedHorarioFlexivel =
      typeof dto.horarioFlexivel === 'boolean' ? dto.horarioFlexivel : atual.horarioFlexivel;
    const mergedInicio = dto.inicioPadrao ?? atual.inicioPadrao;
    const mergedFim = dto.fimPadrao ?? atual.fimPadrao;
    if (!mergedHorarioFlexivel && hhmmToMin(mergedFim) <= hhmmToMin(mergedInicio)) {
      throw new BadRequestException('O horário final deve ser depois do início padrão.');
    }

    let cargaDiariaFinal = dto.cargaDiariaMin ?? atual.cargaDiariaMin;
    let cargaSemanalFinal = dto.cargaSemanalMin ?? atual.cargaSemanalMin;
    if (!mergedHorarioFlexivel) {
      const auto = calcularCargasJornada({
        inicioPadrao: mergedInicio,
        fimPadrao: mergedFim,
        almocoAutomatico:
          typeof dto.almocoAutomatico === 'boolean' ? dto.almocoAutomatico : atual.almocoAutomatico,
        almocoInicio: dto.almocoInicio ?? atual.almocoInicio,
        almocoFim: dto.almocoFim ?? atual.almocoFim,
        diasUteis: (dto.diasUteis ?? atual.diasUteis) as Record<string, boolean>,
      });
      cargaDiariaFinal = auto.cargaDiariaMin;
      cargaSemanalFinal = auto.cargaSemanalMin;
    }

    const mergedTipo = dto.remuneracaoPontoTipo ?? atual.remuneracaoPontoTipo;
    const mergedCargaSem = cargaSemanalFinal;
    if (mergedTipo === RemuneracaoPontoTipo.MENSAL_META_HORAS && (!mergedCargaSem || mergedCargaSem < 1)) {
      throw new BadRequestException(
        'Remuneração mensal com meta exige carga semanal (minutos) maior que zero. A meta de horas no mês é derivada da carga semanal.',
      );
    }

    const limparPorTipo: Partial<{
      valorHora: null;
      valorMensal: null;
      metaHorasMensalMin: null;
    }> = {};
    if (dto.remuneracaoPontoTipo === RemuneracaoPontoTipo.NENHUMA) {
      limparPorTipo.valorHora = null;
      limparPorTipo.valorMensal = null;
      limparPorTipo.metaHorasMensalMin = null;
    } else if (dto.remuneracaoPontoTipo === RemuneracaoPontoTipo.VALOR_HORA) {
      limparPorTipo.valorMensal = null;
      limparPorTipo.metaHorasMensalMin = null;
    } else if (dto.remuneracaoPontoTipo === RemuneracaoPontoTipo.MENSAL_META_HORAS) {
      limparPorTipo.valorHora = null;
    }

    const metaMensalAuto =
      mergedTipo === RemuneracaoPontoTipo.MENSAL_META_HORAS
        ? metaHorasMensalMinFromCargaSemanal(mergedCargaSem)
        : null;

    return this.prisma.jornadaTrabalho.update({
      where: { usuarioId },
      data: {
        cargaDiariaMin: cargaDiariaFinal,
        cargaSemanalMin: cargaSemanalFinal,
        inicioPadrao: dto.inicioPadrao ?? undefined,
        fimPadrao: dto.fimPadrao ?? undefined,
        tolerAtrasoMin: dto.tolerAtrasoMin ?? undefined,
        controlePonto: typeof dto.controlePonto === 'boolean' ? dto.controlePonto : undefined,
        almocoAutomatico: typeof dto.almocoAutomatico === 'boolean' ? dto.almocoAutomatico : undefined,
        almocoInicio: dto.almocoInicio ?? undefined,
        almocoFim: dto.almocoFim ?? undefined,
        diasUteis: dto.diasUteis ?? undefined,
        observacao: typeof dto.observacao === 'undefined' ? undefined : dto.observacao || null,
        horarioFlexivel: typeof dto.horarioFlexivel === 'boolean' ? dto.horarioFlexivel : undefined,
        remuneracaoPontoTipo: dto.remuneracaoPontoTipo ?? undefined,
        valorHora:
          dto.valorHora === undefined
            ? undefined
            : dto.valorHora === null
              ? null
              : new Prisma.Decimal(String(dto.valorHora)),
        valorMensal:
          dto.valorMensal === undefined
            ? undefined
            : dto.valorMensal === null
              ? null
              : new Prisma.Decimal(String(dto.valorMensal)),
        ...limparPorTipo,
        ...geocercaData,
        metaHorasMensalMin:
          mergedTipo === RemuneracaoPontoTipo.MENSAL_META_HORAS ? metaMensalAuto : null,
      },
    });
  }
}
