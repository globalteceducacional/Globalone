import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompraStatus,
  ProjetoStatus,
  RemuneracaoPontoTipo,
  SolicitacaoStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hasGlobalProjectsAccess } from '../../common/utils/project-scope.util';
import { getPurchaseLineTotal } from '../../common/utils/purchase-value.util';
import { EspelhoService } from '../rh/espelho/espelho.service';
import { BancoHorasService } from '../rh/banco-horas/banco-horas.service';
import { ProjectsService } from '../projects/projects.service';

export type FinanceiroResumoDto = {
  projetos: null | {
    emAndamento: number;
    valorTotalSoma: number;
  };
  curadoria: null | { orcamentos: number };
  compras: null | { emFluxo: number };
};

export type FinanceiroPontoLinhaDto = {
  usuarioId: number;
  nome: string;
  trabalhadoMin: number;
  horarioFlexivel: boolean;
  remuneracaoPontoTipo: RemuneracaoPontoTipo;
  valorHora: number | null;
  valorMensal: number | null;
  metaHorasMensalMin: number | null;
  valorEstimado: number | null;
  metaAtingida: boolean | null;
};

export type FinanceiroPontoPlanejamentoDto = {
  mes: string;
  linhas: FinanceiroPontoLinhaDto[];
};

export type FinanceiroPagamentoLinhaDto = {
  usuarioId: number;
  nome: string;
  remuneracaoPontoTipo: RemuneracaoPontoTipo;
  trabalhadoMin: number;
  horasBasePagasMin: number;
  extraBancoMin: number;
  extrasPagosMin: number;
  saldoAnteriorMin: number;
  saldoMesMin: number;
  saldoAcumuladoMin: number;
  deficitMesMin: number;
  descontoDeficit: number | null;
  fechado: boolean;
  valorHoraEfetivo: number | null;
  valorBase: number | null;
  valorExtras: number | null;
  valorTotal: number | null;
  metaAtingida: boolean | null;
};

export type FinanceiroPagamentosMensaisDto = {
  mes: string;
  linhas: FinanceiroPagamentoLinhaDto[];
};

@Injectable()
export class FinanceiroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly espelhoService: EspelhoService,
    private readonly bancoHorasService: BancoHorasService,
    private readonly projectsService: ProjectsService,
  ) {}

  private validarMes(mes?: string): string {
    if (!mes) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      throw new BadRequestException('mes deve estar no formato YYYY-MM.');
    }
    return mes;
  }

  private competenciaAnterior(competencia: string): string {
    const [yStr, mStr] = competencia.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }

  private estimativaRemuneracao(
    tipo: RemuneracaoPontoTipo,
    trabalhadoMin: number,
    valorHora: { toNumber(): number } | null,
    valorMensal: { toNumber(): number } | null,
    metaHorasMensalMin: number | null,
  ): { valor: number; metaAtingida: boolean | null } | null {
    if (tipo === RemuneracaoPontoTipo.NENHUMA) return null;
    if (tipo === RemuneracaoPontoTipo.VALOR_HORA && valorHora != null) {
      const horas = trabalhadoMin / 60;
      return { valor: valorHora.toNumber() * horas, metaAtingida: null };
    }
    if (
      tipo === RemuneracaoPontoTipo.MENSAL_META_HORAS &&
      valorMensal != null &&
      metaHorasMensalMin != null &&
      metaHorasMensalMin > 0
    ) {
      const fator = Math.min(1, trabalhadoMin / metaHorasMensalMin);
      return {
        valor: valorMensal.toNumber() * fator,
        metaAtingida: trabalhadoMin >= metaHorasMensalMin,
      };
    }
    return null;
  }

  private valorHoraEfetivo(
    tipo: RemuneracaoPontoTipo,
    valorHora: { toNumber(): number } | null,
    valorMensal: { toNumber(): number } | null,
    metaHorasMensalMin: number | null,
  ): number | null {
    if (tipo === RemuneracaoPontoTipo.VALOR_HORA && valorHora != null) {
      return valorHora.toNumber();
    }
    if (
      tipo === RemuneracaoPontoTipo.MENSAL_META_HORAS &&
      valorMensal != null &&
      metaHorasMensalMin != null &&
      metaHorasMensalMin > 0
    ) {
      return valorMensal.toNumber() / (metaHorasMensalMin / 60);
    }
    return null;
  }

  private somarValor(
    base: number | null,
    extras: number | null,
  ): number | null {
    if (base == null && extras == null) return null;
    return (base ?? 0) + (extras ?? 0);
  }

  async getPagamentosMensais(mesParam?: string): Promise<FinanceiroPagamentosMensaisDto> {
    const mes = this.validarMes(mesParam);

    const [usuarios, fechamentos, extrasAprovados] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, jornada: true },
      }),
      this.prisma.bancoHorasFechamento.findMany({
        where: { competencia: mes },
        select: { usuarioId: true },
      }),
      this.prisma.bancoHorasUsoExtrasSolicitacao.findMany({
        where: { competencia: mes, status: SolicitacaoStatus.APROVADO },
        select: { usuarioId: true, minutosSolicitados: true },
      }),
    ]);

    const fechamentoPorUser = new Map(
      fechamentos.map((f) => [f.usuarioId, f]),
    );
    const extrasPorUser = new Map<number, number>();
    for (const e of extrasAprovados) {
      extrasPorUser.set(
        e.usuarioId,
        (extrasPorUser.get(e.usuarioId) ?? 0) + e.minutosSolicitados,
      );
    }

    const linhas: FinanceiroPagamentoLinhaDto[] = [];

    for (const u of usuarios) {
      const j = u.jornada;
      if (!j?.controlePonto) continue;

      const espelho = await this.espelhoService.espelhoUsuario(u.id, mes);
      const trab = espelho.totais.trabalhadoMin;
      const extraBancoMin = espelho.totais.extraMin;
      const extrasPagosMin = extrasPorUser.get(u.id) ?? 0;
      const fechamento = fechamentoPorUser.get(u.id);
      const compAnterior = this.competenciaAnterior(mes);
      const [saldoMesBruto, saldoAcumuladoMin, saldoAnteriorMin] = await Promise.all([
        this.bancoHorasService.saldoMesBrutoNaCompetencia(u.id, mes),
        this.bancoHorasService.saldoBancoAteCompetencia(u.id, mes),
        this.bancoHorasService.saldoBancoAteCompetencia(u.id, compAnterior),
      ]);
      const saldoMesMin = saldoMesBruto;
      const deficitMesMin = Math.max(0, -saldoMesBruto);

      const valorHoraEf = this.valorHoraEfetivo(
        j.remuneracaoPontoTipo,
        j.valorHora,
        j.valorMensal,
        j.metaHorasMensalMin,
      );

      let horasBasePagasMin = trab;
      let valorBase: number | null = null;
      let metaAtingida: boolean | null = null;

      if (j.remuneracaoPontoTipo === RemuneracaoPontoTipo.VALOR_HORA) {
        horasBasePagasMin = Math.max(0, trab - extraBancoMin);
        if (valorHoraEf != null) {
          valorBase = (horasBasePagasMin / 60) * valorHoraEf;
        }
      } else if (j.remuneracaoPontoTipo === RemuneracaoPontoTipo.MENSAL_META_HORAS) {
        const est = this.estimativaRemuneracao(
          j.remuneracaoPontoTipo,
          trab,
          j.valorHora,
          j.valorMensal,
          j.metaHorasMensalMin,
        );
        valorBase = est?.valor ?? null;
        metaAtingida = est?.metaAtingida ?? null;
        horasBasePagasMin =
          j.metaHorasMensalMin != null && j.metaHorasMensalMin > 0
            ? Math.min(trab, j.metaHorasMensalMin)
            : trab;
      }

      const valorExtras =
        extrasPagosMin > 0 && valorHoraEf != null
          ? (extrasPagosMin / 60) * valorHoraEf
          : extrasPagosMin > 0
            ? null
            : 0;

      const descontoDeficit =
        deficitMesMin > 0 && valorHoraEf != null ? (deficitMesMin / 60) * valorHoraEf : null;

      linhas.push({
        usuarioId: u.id,
        nome: u.nome,
        remuneracaoPontoTipo: j.remuneracaoPontoTipo,
        trabalhadoMin: trab,
        horasBasePagasMin,
        extraBancoMin,
        extrasPagosMin,
        saldoAnteriorMin,
        saldoMesMin,
        saldoAcumuladoMin,
        deficitMesMin,
        descontoDeficit,
        fechado: !!fechamento,
        valorHoraEfetivo: valorHoraEf,
        valorBase,
        valorExtras,
        valorTotal: this.somarValor(valorBase, valorExtras),
        metaAtingida,
      });
    }

    return { mes, linhas };
  }

  async getPontoPlanejamento(mesParam?: string): Promise<FinanceiroPontoPlanejamentoDto> {
    const mes = this.validarMes(mesParam);
    const usuarios = await this.prisma.usuario.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        jornada: true,
      },
    });

    const linhas: FinanceiroPontoLinhaDto[] = [];

    for (const u of usuarios) {
      const j = u.jornada;
      if (!j?.controlePonto) continue;

      const espelho = await this.espelhoService.espelhoUsuario(u.id, mes);
      const trab = espelho.totais.trabalhadoMin;
      const est = this.estimativaRemuneracao(
        j.remuneracaoPontoTipo,
        trab,
        j.valorHora,
        j.valorMensal,
        j.metaHorasMensalMin,
      );

      linhas.push({
        usuarioId: u.id,
        nome: u.nome,
        trabalhadoMin: trab,
        horarioFlexivel: j.horarioFlexivel,
        remuneracaoPontoTipo: j.remuneracaoPontoTipo,
        valorHora: j.valorHora != null ? j.valorHora.toNumber() : null,
        valorMensal: j.valorMensal != null ? j.valorMensal.toNumber() : null,
        metaHorasMensalMin: j.metaHorasMensalMin,
        valorEstimado: est?.valor ?? null,
        metaAtingida: est?.metaAtingida ?? null,
      });
    }

    return { mes, linhas };
  }

  /** Projetos acessíveis ao usuário com soma de compras vinculadas (exceto reprovadas). */
  async getProjetos(userId: number, permissions: string[]) {
    const actor = { userId, permissions };
    const projects = await this.projectsService.findAll({}, actor);
    const projetoIds = projects.map((p) => p.id);

    const valorPorProjeto = new Map<number, number>();
    if (projetoIds.length > 0) {
      const compras = await this.prisma.compra.findMany({
        where: {
          projetoId: { in: projetoIds },
          status: { not: CompraStatus.REPROVADO },
        },
        select: {
          projetoId: true,
          quantidade: true,
          valorUnitario: true,
          cotacoesJson: true,
          cotacaoSelecionadaIndex: true,
        },
      });

      for (const compra of compras) {
        if (!compra.projetoId) continue;
        const total = getPurchaseLineTotal(compra);
        if (total <= 0) continue;
        valorPorProjeto.set(
          compra.projetoId,
          (valorPorProjeto.get(compra.projetoId) ?? 0) + total,
        );
      }
    }

    return projects.map((p) => ({
      ...p,
      valorUsadoCompras: valorPorProjeto.get(p.id) ?? 0,
    }));
  }

  async getResumo(userId: number, permissions: string[]): Promise<FinanceiroResumoDto> {
    const perms = new Set(permissions);
    const out: FinanceiroResumoDto = {
      projetos: null,
      curadoria: null,
      compras: null,
    };

    const podeVerProjetos =
      perms.has('financeiro:visualizar') ||
      perms.has('financeiro:projetos') ||
      perms.has('projetos:visualizar') ||
      perms.has('projetos:editar') ||
      perms.has('projetos:aprovar') ||
      perms.has('projetos:ver_todos') ||
      perms.has('sistema:administrar');

    if (podeVerProjetos) {
      const projetoWhere: { supervisorId?: number; status: ProjetoStatus } = {
        status: ProjetoStatus.EM_ANDAMENTO,
      };
      if (!hasGlobalProjectsAccess(permissions)) {
        projetoWhere.supervisorId = userId;
      }
      const [emAndamento, agg] = await Promise.all([
        this.prisma.projeto.count({ where: projetoWhere }),
        this.prisma.projeto.aggregate({
          where: projetoWhere,
          _sum: { valorTotal: true },
        }),
      ]);
      out.projetos = {
        emAndamento,
        valorTotalSoma: agg._sum.valorTotal ?? 0,
      };
    }

    const podeCuradoria =
      perms.has('financeiro:visualizar') ||
      perms.has('financeiro:curadoria') ||
      perms.has('curadoria:visualizar') ||
      perms.has('curadoria:criar') ||
      perms.has('curadoria:editar') ||
      perms.has('curadoria:gerenciar');
    if (podeCuradoria) {
      const orcamentos = await this.prisma.curadoriaOrcamento.count();
      out.curadoria = { orcamentos };
    }

    const podeCompras =
      perms.has('financeiro:visualizar') ||
      perms.has('financeiro:compras') ||
      perms.has('compras:visualizar') ||
      perms.has('compras:solicitar') ||
      perms.has('compras:aprovar') ||
      perms.has('compras:excluir');
    if (podeCompras) {
      const emFluxo = await this.prisma.compra.count({
        where: {
          status: {
            in: [CompraStatus.SOLICITADO, CompraStatus.PENDENTE, CompraStatus.COMPRADO_ACAMINHO],
          },
        },
      });
      out.compras = { emFluxo };
    }

    return out;
  }
}
