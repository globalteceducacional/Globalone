import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ChangeTaskStatusDto } from './dto/change-task-status.dto';
import { FilterMyTasksDto } from './dto/filter-my-tasks.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { SubmitDeliveryDto } from './dto/submit-delivery.dto';
import { ChecklistItemStatus, EtapaEntregaStatus, EtapaStatus, ProjetoStatus, SubetapaStatus, Prisma } from '@prisma/client';
import { SubmitChecklistItemDto } from './dto/submit-checklist-item.dto';
import { ReviewChecklistItemDto } from './dto/review-checklist-item.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ETAPA_INTEGRANTE_PUBLIC_INCLUDE,
  PROJETO_RESPONSAVEL_PUBLIC_INCLUDE,
  stripSensitiveUserFields,
  USUARIO_PUBLIC_SELECT,
} from '../../common/utils/user-public.util';
import * as fs from 'fs';
import { join } from 'path';
import {
  buildEtapaProgressMetrics,
  computeProjectProgressPercent,
} from '../../common/utils/checklist-progress.util';
import { canUserReviewDeliveriesInEtapaContext } from '../../common/utils/delivery-review.util';
import {
  buildChecklistOldToNewMap,
  buildSubitemOldToNewMap,
  ensureChecklistStableIds,
  findChecklistIndexByItemId,
  findSubitemIndexById,
  reconcileChecklistIdsForPersist,
  type ChecklistJsonRow,
} from '../../common/utils/checklist-stable-id.util';
import {
  assertCanAccessProjeto,
  notifyProjetosVerTodosAboutSupervisorChange,
  type ProjectAccessActor,
} from '../../common/utils/project-scope.util';
import {
  buildEtapaDiffLines,
  fmtDataPt,
  fmtMoedaPt,
  snapshotFromEtapaRow,
  statusEtapaLabel,
} from '../../common/utils/project-change-report.util';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private checklistItemFullyDone(item: {
    concluido?: boolean;
    subitens?: Array<{ concluido?: boolean }>;
  }): boolean {
    const subitensOk =
      !item.subitens || item.subitens.length === 0
        ? true
        : item.subitens.every((sub) => sub.concluido === true);
    return item.concluido === true && subitensOk;
  }

  /** Pontos configurados no JSON do checklist (1..9999; ausente ou inválido → 1). */
  private clampPontosFromChecklistConfig(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.min(9999, Math.max(1, Math.floor(raw)));
    }
    return 1;
  }

  private async getUserPermissionKeys(userId: number): Promise<Set<string>> {
    const u = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: { cargo: { include: { permissions: { include: { permission: true } } } } },
    });
    const keys = new Set<string>();
    for (const cp of u?.cargo?.permissions ?? []) {
      keys.add(`${cp.permission.modulo}:${cp.permission.acao}`);
    }
    return keys;
  }

  /**
   * Impede aprovar/reprovar a própria entrega.
   * Administrador do sistema mantém bypass para suporte.
   */
  private assertReviewerNotOwnDelivery(
    reviewerId: number,
    executorId: number | null | undefined,
    perms: Set<string>,
  ): void {
    if (executorId == null) return;
    if (Number(executorId) === Number(reviewerId) && !perms.has('sistema:administrar')) {
      throw new ForbiddenException(
        'Não é permitido aprovar ou reprovar a própria entrega. Solicite a avaliação de outro responsável ou supervisor.',
      );
    }
  }

  private async userMayEditTaskPontos(userId: number): Promise<boolean> {
    const perms = await this.getUserPermissionKeys(userId);
    return perms.has('projetos:pontos');
  }

  private normalizeChecklistItemTextoKey(texto: unknown): string {
    return String(texto ?? '')
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * Para não-GM: reaproveita `pontos` do checklist já persistido quando o texto da tarefa coincide;
   * tarefa nova (texto sem par) → 1 ponto.
   */
  private pickPontosPreservingNonGmEdit(
    itemTexto: unknown,
    existing: Array<{ texto?: unknown; pontos?: unknown }>,
    consumed: Set<number>,
  ): number {
    const key = this.normalizeChecklistItemTextoKey(itemTexto);
    for (let i = 0; i < existing.length; i++) {
      if (consumed.has(i)) continue;
      if (this.normalizeChecklistItemTextoKey(existing[i]?.texto) === key) {
        consumed.add(i);
        return this.clampPontosFromChecklistConfig(existing[i]?.pontos);
      }
    }
    return 1;
  }

  private async finalizeChecklistJsonForPersist(
    checklist: Array<Record<string, unknown>>,
    editorUserId: number,
    existingChecklist: unknown[] | null,
    oldPrepared?: ChecklistJsonRow[],
  ): Promise<Array<Record<string, unknown>>> {
    const canEdit = await this.userMayEditTaskPontos(editorUserId);
    let result: Array<Record<string, unknown>>;
    if (canEdit) {
      result = this.ensureChecklistJsonPontos(checklist);
    } else {
      const existing = Array.isArray(existingChecklist)
        ? (existingChecklist as Array<{ texto?: unknown; pontos?: unknown }>)
        : [];
      const consumed = new Set<number>();
      result = checklist.map((item) => {
        const pontos = this.pickPontosPreservingNonGmEdit(item.texto, existing, consumed);
        const next: Record<string, unknown> = { ...item, pontos };
        if (Array.isArray(item.subitens)) {
          next.subitens = (item.subitens as Array<Record<string, unknown>>).map((sub) => {
            const { pontos: _p, ...rest } = sub;
            void _p;
            return rest;
          });
        }
        return next;
      });
    }

    const existingRows: ChecklistJsonRow[] = Array.isArray(existingChecklist)
      ? (existingChecklist as ChecklistJsonRow[])
      : [];
    const resultRows = result as ChecklistJsonRow[];
    const reconciled =
      existingRows.length > 0
        ? reconcileChecklistIdsForPersist(resultRows, existingRows, oldPrepared)
        : ensureChecklistStableIds(resultRows);

    return reconciled as Array<Record<string, unknown>>;
  }

  /**
   * Garante `pontos` explícitos no item ao persistir `checklistJson`.
   * Subitens NÃO armazenam `pontos` próprio — o valor é calculado em runtime
   * (parent.pontos / qtd_subitens, arredondado p/ baixo, mínimo 1).
   */
  private ensureChecklistJsonPontos(checklist: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return checklist.map((item) => {
      const next: Record<string, unknown> = {
        ...item,
        pontos: this.clampPontosFromChecklistConfig(item.pontos),
      };
      if (Array.isArray(item.subitens)) {
        next.subitens = (item.subitens as Array<Record<string, unknown>>).map((sub) => {
          const { pontos: _p, ...rest } = sub;
          void _p;
          return rest;
        });
      }
      return next;
    });
  }

  /**
   * Pontos a creditar quando uma entrega é **aprovada**.
   *
   * - Se o item tem subitens → o item principal vale **0 pts** (pontos ficam nas subtarefas).
   * - Cada subtarefa vale `floor(parent.pontos / total_subitens)`.
   *   Se `parent.pontos < total_subitens`, as primeiras subtarefas recebem 1 pt
   *   até distribuir exatamente `parent.pontos` (e o resto recebe 0).
   */
  private resolvePontosChecklistItem(
    checklist: Array<{ pontos?: unknown; subitens?: Array<unknown> }>,
    checklistIndex: number,
    subitemIndex?: number | null,
  ): number {
    const item = checklist[checklistIndex];
    if (!item) return 0;

    const hasSubitens = Array.isArray(item.subitens) && item.subitens.length > 0;

    if (subitemIndex !== undefined && subitemIndex !== null) {
      const totalSubitens = (item.subitens as unknown[]).length;
      const parentPts = this.clampPontosFromChecklistConfig(item.pontos);
      const base = Math.floor(parentPts / totalSubitens);
      const remainder = parentPts - base * totalSubitens;
      return subitemIndex < remainder ? base + 1 : base;
    }

    if (hasSubitens) return 0;

    return this.clampPontosFromChecklistConfig(item.pontos);
  }

  /**
   * Regras de negócio do status da etapa:
   * - REPROVADA: mantida (fluxo manual de reprovação da etapa).
   * - APROVADA: entrega da etapa aprovada OU todos os itens do checklist concluídos.
   * - EM_ANALISE: existe entrega de checklist aguardando análise.
   * - PENDENTE: data de início ainda não chegou (calendário local).
   * - EM_ANDAMENTO: demais casos.
   */
  computeEtapaStatusFromBusinessRules(input: {
    currentStatus: EtapaStatus;
    dataInicio: Date | null;
    checklistJson: unknown;
    checklistEntregas: Array<{ status: ChecklistItemStatus }>;
    /** Entrega geral da etapa (fora do checklist) aguardando análise */
    etapaEntregasEmAnaliseCount?: number;
    /** Entrega geral da etapa já aprovada — preserva APROVADA */
    etapaEntregasAprovadasCount?: number;
    now?: Date;
  }): EtapaStatus {
    const now = input.now ?? new Date();
    if (input.currentStatus === EtapaStatus.REPROVADA) {
      return EtapaStatus.REPROVADA;
    }

    if ((input.etapaEntregasAprovadasCount ?? 0) > 0) {
      return EtapaStatus.APROVADA;
    }

    const checklist = Array.isArray(input.checklistJson)
      ? (input.checklistJson as Array<{ concluido?: boolean; subitens?: Array<{ concluido?: boolean }> }>)
      : [];

    const todosConcluidos =
      checklist.length > 0 && checklist.every((item) => this.checklistItemFullyDone(item));

    if (todosConcluidos) {
      return EtapaStatus.APROVADA;
    }

    const algumaEntregaChecklistEmAnalise = input.checklistEntregas.some(
      (e) => e.status === ChecklistItemStatus.EM_ANALISE,
    );
    const algumaEntregaEtapaEmAnalise = (input.etapaEntregasEmAnaliseCount ?? 0) > 0;
    if (algumaEntregaChecklistEmAnalise || algumaEntregaEtapaEmAnalise) {
      return EtapaStatus.EM_ANALISE;
    }

    if (input.dataInicio) {
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const t1 = new Date(
        input.dataInicio.getFullYear(),
        input.dataInicio.getMonth(),
        input.dataInicio.getDate(),
      ).getTime();
      if (t0 < t1) {
        return EtapaStatus.PENDENTE;
      }
    }

    return EtapaStatus.EM_ANDAMENTO;
  }

  /** Persiste o status calculado; retorna o status final. */
  async reconcileEtapaStatus(etapaId: number): Promise<EtapaStatus | null> {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id: etapaId },
      select: {
        id: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        checklistJson: true,
        projetoId: true,
        checklistEntregas: { select: { status: true } },
        entregas: { select: { status: true } },
      },
    });
    if (!etapa) return null;

    const entregasEtapa = etapa.entregas ?? [];
    const next = this.computeEtapaStatusFromBusinessRules({
      currentStatus: etapa.status as EtapaStatus,
      dataInicio: etapa.dataInicio,
      checklistJson: etapa.checklistJson,
      checklistEntregas: etapa.checklistEntregas,
      etapaEntregasEmAnaliseCount: entregasEtapa.filter(
        (e) => (e.status as string) === EtapaEntregaStatus.EM_ANALISE,
      ).length,
      etapaEntregasAprovadasCount: entregasEtapa.filter(
        (e) => (e.status as string) === EtapaEntregaStatus.APROVADA,
      ).length,
    });

    const data: Record<string, unknown> = {};
    if (next !== etapa.status) {
      data.status = next;
    }
    if (next === EtapaStatus.APROVADA && !etapa.dataFim) {
      data.dataFim = new Date();
    }
    if (next !== EtapaStatus.APROVADA && etapa.status === EtapaStatus.APROVADA) {
      data.dataFim = null;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.etapa.update({
        where: { id: etapaId },
        data: data as any,
      });
      await this.updateProjetoStatus(etapa.projetoId);
    } else if (next === EtapaStatus.APROVADA && !etapa.dataFim) {
      await this.prisma.etapa.update({
        where: { id: etapaId },
        data: { dataFim: new Date() },
      });
      await this.updateProjetoStatus(etapa.projetoId);
    }

    return next;
  }

  async reconcileAllEtapasOfProjeto(projetoId: number): Promise<void> {
    const etapas = await this.prisma.etapa.findMany({
      where: { projetoId },
      select: { id: true },
    });
    await Promise.all(etapas.map((e) => this.reconcileEtapaStatus(e.id)));
  }

  /**
   * Mapa índice antigo → novo ao reordenar/editar itens do checklist.
   *
   * Algoritmo em duas passagens:
   *  1ª) Tenta casar pelo par (texto + descrição) — detecta reordenação exata.
   *  2ª) Fallback posicional (somente quando old e new têm o mesmo comprimento):
   *      itens sem match por texto são casados pela posição, cobrindo o caso
   *      de renomeação sem adição/remoção de itens. Quando o comprimento difere,
   *      a 2ª passagem é omitida para evitar que itens novos herdem entregas antigas.
   */
  /**
   * Remapeia índices das entregas quando o checklist muda.
   * Usa ids estáveis (checklistItemId / subitemId) — só remove entrega se a tarefa foi excluída de fato.
   */
  private async reindexChecklistEntregas(
    etapaId: number,
    oldList: ChecklistJsonRow[],
    newList: ChecklistJsonRow[],
  ): Promise<void> {
    const oldPrepared = ensureChecklistStableIds(oldList);
    const newPrepared = ensureChecklistStableIds(newList);
    const oldToNew = buildChecklistOldToNewMap(oldPrepared, newPrepared);

    const entregas = await this.prisma.checklistItemEntrega.findMany({
      where: { etapaId },
      select: {
        id: true,
        checklistIndex: true,
        subitemIndex: true,
        checklistItemId: true,
        subitemId: true,
        status: true,
        pontosAtribuidos: true,
        executorId: true,
      },
    });

    for (const entrega of entregas) {
      const oldItem = oldPrepared[entrega.checklistIndex];
      const checklistItemId =
        entrega.checklistItemId ?? oldItem?.id ?? null;
      const subitemId =
        entrega.subitemId ??
        (entrega.subitemIndex != null && oldItem?.subitens?.[entrega.subitemIndex]
          ? oldItem.subitens[entrega.subitemIndex]?.id ?? null
          : null);

      let newChecklistIdx = findChecklistIndexByItemId(newPrepared, checklistItemId);
      if (newChecklistIdx < 0) {
        newChecklistIdx = oldToNew[entrega.checklistIndex] ?? -1;
      }

      if (newChecklistIdx < 0 || newChecklistIdx >= newPrepared.length) {
        this.logger.warn(
          `Entrega ${entrega.id} da etapa ${etapaId} sem tarefa correspondente após edição do checklist — mantida no índice ${entrega.checklistIndex}.`,
        );
        await this.prisma.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: {
            checklistItemId,
            subitemId,
          },
        });
        continue;
      }

      let newSubIdx: number | null = entrega.subitemIndex;
      if (entrega.subitemIndex != null || subitemId) {
        const newItem = newPrepared[newChecklistIdx];
        const newSubs = newItem?.subitens ?? [];
        const oldSubs = oldItem?.subitens ?? [];

        if (subitemId) {
          const byId = findSubitemIndexById(newSubs, subitemId);
          if (byId >= 0) {
            newSubIdx = byId;
          } else if (oldSubs.length > 0 && newSubs.length > 0 && entrega.subitemIndex != null) {
            const subMap = buildSubitemOldToNewMap(oldSubs, newSubs);
            const mapped = subMap[entrega.subitemIndex];
            if (mapped !== undefined) {
              newSubIdx = mapped;
            } else {
              this.logger.warn(
                `Entrega ${entrega.id} (subitemId=${subitemId}) sem subtarefa correspondente — mantida.`,
              );
              await this.prisma.checklistItemEntrega.update({
                where: { id: entrega.id },
                data: { checklistIndex: newChecklistIdx, checklistItemId, subitemId },
              });
              continue;
            }
          } else if (newSubs.length === 0) {
            this.logger.warn(
              `Entrega ${entrega.id} era de subtarefa removida (subitemId=${subitemId}) — mantida no item principal.`,
            );
            newSubIdx = null;
          }
        } else if (entrega.subitemIndex != null && oldSubs.length > 0 && newSubs.length > 0) {
          const subMap = buildSubitemOldToNewMap(oldSubs, newSubs);
          const mapped = subMap[entrega.subitemIndex];
          if (mapped !== undefined) {
            newSubIdx = mapped;
          }
        }
      }

      const resolvedSubitemId =
        newSubIdx != null && newPrepared[newChecklistIdx]?.subitens?.[newSubIdx]
          ? newPrepared[newChecklistIdx]!.subitens![newSubIdx]!.id ?? subitemId
          : null;

      if (
        newChecklistIdx !== entrega.checklistIndex ||
        newSubIdx !== entrega.subitemIndex ||
        checklistItemId !== entrega.checklistItemId ||
        resolvedSubitemId !== entrega.subitemId
      ) {
        await this.prisma.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: {
            checklistIndex: newChecklistIdx,
            subitemIndex: newSubIdx,
            checklistItemId: newPrepared[newChecklistIdx]?.id ?? checklistItemId,
            subitemId: resolvedSubitemId,
          },
        });
      }
    }

    // Reparo: entregas com checklistItemId mas índice desatualizado (ex.: remapeamento anterior incompleto)
    const entregasApos = await this.prisma.checklistItemEntrega.findMany({
      where: { etapaId },
      select: {
        id: true,
        checklistIndex: true,
        subitemIndex: true,
        checklistItemId: true,
        subitemId: true,
      },
    });
    for (const entrega of entregasApos) {
      if (!entrega.checklistItemId) {
        const itemAtIdx = newPrepared[entrega.checklistIndex];
        if (!itemAtIdx?.id) continue;
        const subId =
          entrega.subitemIndex != null && itemAtIdx.subitens?.[entrega.subitemIndex]
            ? itemAtIdx.subitens[entrega.subitemIndex]?.id ?? null
            : null;
        await this.prisma.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: {
            checklistItemId: itemAtIdx.id,
            subitemId: subId,
          },
        });
        continue;
      }
      const idxById = findChecklistIndexByItemId(newPrepared, entrega.checklistItemId);
      if (idxById < 0) continue;
      const item = newPrepared[idxById];
      let newSub: number | null = entrega.subitemIndex;
      let newSubId: string | null = entrega.subitemId;
      if (entrega.subitemId && item?.subitens) {
        const bySubId = findSubitemIndexById(item.subitens, entrega.subitemId);
        if (bySubId >= 0) {
          newSub = bySubId;
          newSubId = item.subitens[bySubId]?.id ?? entrega.subitemId;
        }
      }
      if (
        idxById !== entrega.checklistIndex ||
        newSub !== entrega.subitemIndex ||
        newSubId !== entrega.subitemId
      ) {
        await this.prisma.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: {
            checklistIndex: idxById,
            subitemIndex: newSub,
            subitemId: newSubId,
          },
        });
      }
    }
  }

  private async revertPointsAndDeleteEntrega(entrega: {
    id: number;
    status: string;
    pontosAtribuidos: number | null;
    executorId: number;
  }): Promise<void> {
    if (entrega.status === ChecklistItemStatus.APROVADO && entrega.pontosAtribuidos != null && entrega.pontosAtribuidos > 0) {
      await this.prisma.usuario.update({
        where: { id: entrega.executorId },
        data: { pontosTarefas: { decrement: entrega.pontosAtribuidos } },
      });
    }
    await this.prisma.checklistItemEntrega.delete({ where: { id: entrega.id } });
  }

  private prismaIntegranteChecklistField(
    checklistItemIndices: number[] | null | undefined,
  ): { checklistItemIndices: Prisma.InputJsonValue } | Record<string, never> {
    if (checklistItemIndices === undefined || checklistItemIndices === null) {
      return {};
    }
    return { checklistItemIndices: checklistItemIndices as Prisma.InputJsonValue };
  }

  /** Mantém em cada item do checklist só IDs que são integrantes da etapa. */
  private sanitizeChecklistItemIntegrantesIds(
    checklist: Array<Record<string, unknown>>,
    allowedIntegranteIds: Set<number>,
  ): Array<Record<string, unknown>> {
    return checklist.map((item) => {
      const raw = item.integrantesIds;
      if (!Array.isArray(raw) || raw.length === 0) return { ...item };
      const filtered = [
        ...new Set(
          raw
            .map((n) => Number(n))
            .filter((id) => Number.isInteger(id) && id > 0 && allowedIntegranteIds.has(id)),
        ),
      ];
      const next = { ...item };
      if (filtered.length === 0) {
        delete next.integrantesIds;
      } else {
        next.integrantesIds = filtered;
      }
      return next;
    });
  }

  private sanitizeIntegranteIndicesList(
    list: Array<{ usuarioId: number; checklistItemIndices?: number[] | null }>,
    checklistLength: number,
  ): Array<{ usuarioId: number; checklistItemIndices?: number[] | null }> {
    if (checklistLength <= 0) return list;
    return list.map((row) => {
      if (row.checklistItemIndices === undefined || row.checklistItemIndices === null) return row;
      if (!Array.isArray(row.checklistItemIndices)) return row;
      const filtered = row.checklistItemIndices.filter(
        (i) => Number.isInteger(i) && i >= 0 && i < checklistLength,
      );
      return { ...row, checklistItemIndices: filtered };
    });
  }

  private parseIntegranteChecklistIndices(raw: unknown, checklistLength: number): number[] | null {
    if (raw === undefined || raw === null) return null;
    if (!Array.isArray(raw)) return null;
    const nums = raw
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < checklistLength);
    return nums.length > 0 ? nums : null;
  }

  private normalizeVisibleIndices(visible: number[], checklistLength: number): number[] | null {
    if (checklistLength <= 0) return null;
    const full = Array.from({ length: checklistLength }, (_, idx) => idx);
    const same =
      visible.length === full.length && full.every((idx) => visible.includes(idx));
    if (same) return null;
    return visible.sort((a, b) => a - b);
  }

  /**
   * Por item do checklistJson: sem `integrantesIds` ou array vazio = todos os integrantes veem o item.
   * Com IDs = só esses integrantes. Executor/responsável da etapa vê tudo (retorno null).
   * null = sem filtro na UI; [] = nenhum item visível.
   */
  private meuTrabalhoChecklistIndicesForUser(
    etapa: {
      executorId: number;
      responsavelId?: number | null;
      checklistJson?: unknown;
      integrantes?: Array<{ usuarioId: number; checklistItemIndices?: unknown }>;
    },
    userId: number,
  ): number[] | null {
    if (etapa.executorId === userId) return null;
    if (etapa.responsavelId != null && Number(etapa.responsavelId) === userId) return null;

    const integranteRow = etapa.integrantes?.find((i) => i.usuarioId === userId);
    if (!integranteRow) return [];

    const list = etapa.checklistJson;
    if (!Array.isArray(list) || list.length === 0) return null;

    const fromDb = this.parseIntegranteChecklistIndices(
      integranteRow.checklistItemIndices,
      list.length,
    );
    if (fromDb) {
      return this.normalizeVisibleIndices(fromDb, list.length);
    }

    const visible: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i] as { integrantesIds?: unknown };
      const ids = row?.integrantesIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        visible.push(i);
        continue;
      }
      const allowed = new Set(ids.map((n) => Number(n)));
      if (allowed.has(userId)) visible.push(i);
    }

    return this.normalizeVisibleIndices(visible, list.length);
  }

  async listMyTasks(userId: number, filter: FilterMyTasksDto) {
    const whereEtapas: Record<string, unknown> = {
      status: {
        in: [
          EtapaStatus.PENDENTE,
          EtapaStatus.EM_ANDAMENTO,
          EtapaStatus.EM_ANALISE,
          EtapaStatus.APROVADA,
          EtapaStatus.REPROVADA,
        ],
      },
      /** Só etapas em que o usuário executa, integra ou é responsável direto pela etapa. */
      OR: [
        { executorId: userId },
        { integrantes: { some: { usuarioId: userId } } },
        { responsavelId: userId },
      ],
    };

    if (filter.projetoId) {
      whereEtapas.projetoId = filter.projetoId;
    }

    const etapasPendentes = await this.prisma.etapa.findMany({
      where: whereEtapas,
      include: {
        projeto: { include: { supervisor: { select: USUARIO_PUBLIC_SELECT } } },
        sessao: true,
        subetapas: true,
        executor: { select: USUARIO_PUBLIC_SELECT },
        responsavel: { select: USUARIO_PUBLIC_SELECT },
        integrantes: ETAPA_INTEGRANTE_PUBLIC_INCLUDE,
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: {
            executor: { select: USUARIO_PUBLIC_SELECT },
            avaliadoPor: { select: USUARIO_PUBLIC_SELECT },
            editadoPor: { select: USUARIO_PUBLIC_SELECT },
          } as any,
        },
        checklistEntregas: {
          orderBy: { checklistIndex: 'asc' },
          include: {
            executor: { select: USUARIO_PUBLIC_SELECT },
            avaliadoPor: { select: USUARIO_PUBLIC_SELECT },
          },
        },
      },
      /** Dentro do mesmo projeto: ordem de exibição (Kanban/detalhes); desempate por id. Entre projetos: id estável. */
      orderBy: [{ projetoId: 'asc' }, { ordem: 'asc' }, { id: 'asc' }],
    });

    // Projetos a exibir: os que têm pelo menos uma etapa vinculada (executor, integrante, supervisor, responsável de etapa/projeto)
    const projetosIdsComEtapas = [...new Set(etapasPendentes.map((e) => e.projetoId))];
    const projetosResponsavel = await this.prisma.projeto.findMany({
      where: { id: { in: projetosIdsComEtapas } },
      include: {
        supervisor: { select: USUARIO_PUBLIC_SELECT },
        responsaveis: PROJETO_RESPONSAVEL_PUBLIC_INCLUDE,
        etapas: {
          select: {
            id: true,
            status: true,
            valorInsumos: true,
          },
        },
      },
    });

    // Calcular progresso para cada projeto
    const projetosComProgresso = await Promise.all(
      projetosResponsavel.map(async (projeto) => {
        const totalEtapas = projeto.etapas.length;
        
        if (totalEtapas === 0) {
          return { ...projeto, progress: 0 };
        }
        
        const etapasCompletas = await Promise.all(
          projeto.etapas.map(async (etapa) => {
            const etapaCompleta = await this.prisma.etapa.findUnique({
              where: { id: etapa.id },
              include: {
                checklistEntregas: true,
                entregas: { select: { status: true } },
              },
            });
            const status = etapa.status as EtapaStatus;
            return buildEtapaProgressMetrics(etapaCompleta, status);
          }),
        );

        const progress = computeProjectProgressPercent(etapasCompletas, totalEtapas);
        const checklistItensTotal = etapasCompletas.reduce((s, e) => s + e.checklistItensTotal, 0);
        const checklistItensConcluidos = etapasCompletas.reduce(
          (s, e) => s + e.checklistItensConcluidos,
          0,
        );

        return { ...projeto, progress, checklistItensTotal, checklistItensConcluidos };
      })
    );

    // Número global da etapa no projeto (mesma regra que a tela de detalhes: ordem asc, desempate por id)
    let etapasPendentesComNumero = etapasPendentes;
    if (etapasPendentes.length > 0) {
      const projetoIdsUnicos = [...new Set(etapasPendentes.map((e) => e.projetoId))];
      const todasEtapasOrdem = await this.prisma.etapa.findMany({
        where: { projetoId: { in: projetoIdsUnicos } },
        select: { id: true, ordem: true, projetoId: true },
      });
      const grupos = new Map<number, { id: number; ordem: number }[]>();
      for (const row of todasEtapasOrdem) {
        const arr = grupos.get(row.projetoId) ?? [];
        arr.push({ id: row.id, ordem: row.ordem });
        grupos.set(row.projetoId, arr);
      }
      const numeroGlobalPorEtapaId = new Map<number, number>();
      for (const [, rows] of grupos) {
        rows.sort((a, b) => {
          const oa = typeof a.ordem === 'number' ? a.ordem : Number.MAX_SAFE_INTEGER;
          const ob = typeof b.ordem === 'number' ? b.ordem : Number.MAX_SAFE_INTEGER;
          return oa - ob || a.id - b.id;
        });
        rows.forEach((row, idx) => numeroGlobalPorEtapaId.set(row.id, idx + 1));
      }
      etapasPendentesComNumero = etapasPendentes.map((e) => ({
        ...e,
        numeroNoProjeto: numeroGlobalPorEtapaId.get(e.id) ?? 1,
      }));
    }

    const etapasComFiltroChecklist = etapasPendentesComNumero.map((e) => ({
      ...e,
      meuTrabalhoChecklistIndices: this.meuTrabalhoChecklistIndicesForUser(e, userId),
    }));

    const idsUnicos = [...new Set(etapasComFiltroChecklist.map((e) => e.id))];
    let etapasPendentesOut = etapasComFiltroChecklist;
    if (idsUnicos.length > 0) {
      await Promise.all(idsUnicos.map((id) => this.reconcileEtapaStatus(id)));
      const statusRows = await this.prisma.etapa.findMany({
        where: { id: { in: idsUnicos } },
        select: { id: true, status: true, dataFim: true },
      });
      const stMap = new Map(statusRows.map((r) => [r.id, r]));
      etapasPendentesOut = etapasComFiltroChecklist.map((e) => {
        const row = stMap.get(e.id);
        return row ? { ...e, status: row.status, dataFim: row.dataFim } : e;
      });
    }

    return stripSensitiveUserFields({
      projetos: projetosComProgresso,
      etapasPendentes: etapasPendentesOut,
    });
  }

  async findOne(id: number) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: { include: { supervisor: true } },
        executor: true,
        responsavel: true,
        integrantes: { include: { usuario: true } },
        subetapas: true,
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: {
            executor: true,
            avaliadoPor: true,
            editadoPor: true,
          } as any,
        },
        checklistEntregas: {
          orderBy: { checklistIndex: 'asc' },
          include: {
            executor: true,
            avaliadoPor: true,
          },
        },
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    await this.reconcileEtapaStatus(id);

    const refreshed = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: { include: { supervisor: true } },
        executor: true,
        responsavel: true,
        integrantes: { include: { usuario: true } },
        subetapas: true,
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: {
            executor: true,
            avaliadoPor: true,
            editadoPor: true,
          } as any,
        },
        checklistEntregas: {
          orderBy: { checklistIndex: 'asc' },
          include: {
            executor: true,
            avaliadoPor: true,
          },
        },
      },
    });

    return refreshed ?? etapa;
  }

  async create(data: CreateTaskDto, actor: ProjectAccessActor) {
    await assertCanAccessProjeto(this.prisma, data.projetoId, actor);
    await this.ensureProjectExists(data.projetoId);
    await this.ensureUserExists(data.executorId);

    const maxOrdem = await this.prisma.etapa.aggregate({
      where: { projetoId: data.projetoId },
      _max: { ordem: true },
    });
    const proximaOrdem = (maxOrdem._max?.ordem ?? -1) + 1;

    const abaCreateNorm = typeof data.aba === 'string' ? data.aba.trim() : undefined;
    const createData: any = {
      ordem: proximaOrdem,
      nome: data.nome,
      descricao: data.descricao,
      aba: abaCreateNorm && abaCreateNorm.length > 0 ? abaCreateNorm : undefined,
      projeto: { connect: { id: data.projetoId } },
      executor: { connect: { id: data.executorId } },
      ...(data.sessaoId != null && data.sessaoId > 0
        ? { sessao: { connect: { id: data.sessaoId } } }
        : {}),
      dataInicio: data.dataInicio ? new Date(data.dataInicio) : undefined,
      dataFim: data.dataFim ? new Date(data.dataFim) : undefined,
      valorInsumos: data.valorInsumos ?? 0,
    };

    if (data.checklist && Array.isArray(data.checklist) && data.checklist.length > 0) {
      createData.checklistJson = data.checklist as any;
    }

    // responsavelId da etapa não é mais utilizado; aprovação fica com o supervisor do projeto.

    const setorIdsToConnect: number[] | undefined =
      (Array.isArray((data as any).setorIds) ? (data as any).setorIds : undefined) ??
      (typeof data.setorId !== 'undefined'
        ? data.setorId > 0
          ? [data.setorId]
          : []
        : undefined);

    if (setorIdsToConnect && setorIdsToConnect.length > 0) {
      const idsUnique: number[] = Array.from(new Set(setorIdsToConnect)) as number[];
      for (const setorId of idsUnique) {
        await this.ensureSetorExists(setorId);
      }
      createData.setores = { connect: idsUnique.map((id) => ({ id })) };
    }

    // Tratar integrantes (preferir `integrantes` com índices; senão legado `integrantesIds`)
    const integrantesLista: Array<{ usuarioId: number; checklistItemIndices?: number[] | null }> =
      data.integrantes !== undefined && Array.isArray(data.integrantes)
        ? data.integrantes.map((i) => ({
            usuarioId: Number(i.usuarioId),
            checklistItemIndices: i.checklistItemIndices,
          }))
        : data.integrantesIds && Array.isArray(data.integrantesIds) && data.integrantesIds.length > 0
          ? data.integrantesIds.map((usuarioId) => ({ usuarioId: Number(usuarioId) }))
          : [];
    const checklistLen =
      data.checklist && Array.isArray(data.checklist) && data.checklist.length > 0 ? data.checklist.length : 0;
    const integrantesSanitizados =
      checklistLen > 0 ? this.sanitizeIntegranteIndicesList(integrantesLista, checklistLen) : integrantesLista;
    if (integrantesSanitizados.length > 0) {
      for (const row of integrantesSanitizados) {
        await this.ensureUserExists(row.usuarioId);
      }
      createData.integrantes = {
        create: integrantesSanitizados.map((row) => ({
          usuarioId: row.usuarioId,
          ...this.prismaIntegranteChecklistField(
            row.checklistItemIndices === undefined || row.checklistItemIndices === null
              ? undefined
              : row.checklistItemIndices,
          ),
        })),
      };
    }

    if (createData.checklistJson && Array.isArray(createData.checklistJson)) {
      const allowedIntegrantes = new Set(integrantesSanitizados.map((r) => r.usuarioId));
      const sanitized = this.sanitizeChecklistItemIntegrantesIds(
        createData.checklistJson as Array<Record<string, unknown>>,
        allowedIntegrantes,
      );
      createData.checklistJson = (await this.finalizeChecklistJsonForPersist(
        sanitized,
        actor.userId,
        null,
      )) as unknown[];
    }

    const created = await this.prisma.etapa.create({
      data: createData,
      include: {
        executor: true,
        responsavel: true,
        projeto: true,
        sessao: true,
        setores: true,
        integrantes: { include: { usuario: true } },
      } as any,
    });

    const createdAny = created as any;

    await this.updateProjetoStatus(createdAny.projetoId);

    // Notificar cada integrante (não falhar a criação da etapa se a notificação falhar)
    if (integrantesSanitizados.length > 0 && createdAny.projeto) {
      const projetoNome = createdAny.projeto.nome ?? 'Projeto';
      const etapaNome = createdAny.nome ?? 'Etapa';
      const mensagem = `Você foi adicionado como integrante da etapa "${etapaNome}" do projeto "${projetoNome}".`;
      const ids = integrantesSanitizados.map((r) => r.usuarioId).filter((id) => !Number.isNaN(id) && id > 0);
      for (const usuarioId of ids) {
        try {
          await this.notificationsService.create({
            usuarioId,
            titulo: 'Você foi adicionado a uma etapa',
            mensagem,
            tipo: 'INFO',
            etapaId: created.id,
          });
        } catch (err) {
          this.logger.warn(`Falha ao criar notificação para integrante ${usuarioId} (etapa ${created.id}): ${err}`);
        }
      }
    }

    const projetoNome = createdAny.projeto?.nome ?? 'Projeto';
    const c = created as any;
    const detalhesCreate = [
      `• Nova etapa: "${createdAny.nome ?? 'etapa'}" (id ${created.id})`,
      c.executor ? `• Executor: ${c.executor.nome} (id ${created.executorId})` : '',
      c.responsavel ? `• Responsável da etapa: ${c.responsavel.nome} (id ${created.responsavelId})` : '',
      `• Valor insumos: ${fmtMoedaPt(createdAny.valorInsumos ?? 0)}`,
      createdAny.dataInicio ? `• Data início: ${fmtDataPt(createdAny.dataInicio)}` : '',
      createdAny.dataFim ? `• Data fim: ${fmtDataPt(createdAny.dataFim)}` : '',
      c.sessao ? `• Sessão: ${c.sessao.nome} (id ${c.sessao.id})` : '',
    ]
      .filter(Boolean)
      .join('\n');

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: createdAny.projetoId,
      projetoNome,
      acaoResumo: `nova etapa criada (${createdAny.nome ?? 'etapa'})`,
      detalhes: detalhesCreate,
    });

    return created;
  }

  async update(id: number, data: UpdateTaskDto, actor: ProjectAccessActor) {
    const etapaLoc = await this.prisma.etapa.findUnique({
      where: { id },
      select: { projetoId: true },
    });
    if (!etapaLoc) {
      throw new NotFoundException('Etapa não encontrada');
    }
    await assertCanAccessProjeto(this.prisma, etapaLoc.projetoId, actor);
    if (data.projetoId !== undefined && data.projetoId !== etapaLoc.projetoId) {
      await assertCanAccessProjeto(this.prisma, data.projetoId, actor);
    }

    const etapaAntes = await this.prisma.etapa.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        descricao: true,
        aba: true,
        status: true,
        valorInsumos: true,
        dataInicio: true,
        dataFim: true,
        executorId: true,
        responsavelId: true,
        projetoId: true,
        sessaoId: true,
        checklistJson: true,
        executor: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        projeto: { select: { id: true, nome: true } },
        sessao: { select: { id: true, nome: true } },
        setores: { select: { id: true, nome: true } },
        integrantes: { select: { usuarioId: true, usuario: { select: { nome: true } } } },
      },
    });
    if (!etapaAntes) {
      throw new NotFoundException('Etapa não encontrada');
    }

    // Normaliza `aba`: undefined = não muda; '' (após trim) = remove (null); string com texto = grava.
    let abaUpdate: string | null | undefined = undefined;
    if (data.aba !== undefined) {
      const t = typeof data.aba === 'string' ? data.aba.trim() : '';
      abaUpdate = t.length > 0 ? t : null;
    }

    // Preparar payload para o Prisma
    const payload: any = {
      nome: data.nome,
      descricao: data.descricao,
      ...(abaUpdate !== undefined ? { aba: abaUpdate } : {}),
      status: data.status,
      valorInsumos: data.valorInsumos,
    };
    if (data.sessaoId !== undefined) {
      if (data.sessaoId == null || data.sessaoId === 0) {
        payload.sessao = { disconnect: true };
      } else {
        payload.sessao = { connect: { id: data.sessaoId } };
      }
    }

    // Tratar checklist
    if (data.checklist !== undefined) {
      if (Array.isArray(data.checklist) && data.checklist.length > 0) {
        payload.checklistJson = data.checklist as any;
      } else {
        payload.checklistJson = null;
      }
    }

    // Tratar datas
    if (data.dataInicio) {
      payload.dataInicio = new Date(data.dataInicio);
    }

    if (data.dataFim) {
      payload.dataFim = new Date(data.dataFim);
    }

    // Tratar executor (relação)
    if (data.executorId !== undefined) {
      if (data.executorId === null || data.executorId === 0) {
        throw new BadRequestException('Executor é obrigatório');
      } else {
        await this.ensureUserExists(data.executorId);
        payload.executor = { connect: { id: data.executorId } };
      }
    }

    // responsavelId da etapa não é mais utilizado; aprovação fica com o supervisor do projeto.

    // Tratar projeto (relação)
    if (data.projetoId !== undefined) {
      if (data.projetoId === null || data.projetoId === 0) {
        throw new BadRequestException('Projeto é obrigatório');
      } else {
        await this.ensureProjectExists(data.projetoId);
        payload.projeto = { connect: { id: data.projetoId } };
      }
    }

    // Tratar setores da etapa
    const hasSetorIds = (data as any).setorIds !== undefined;
    const hasSetorIdLegacy = (data as any).setorId !== undefined;

    if (hasSetorIds || hasSetorIdLegacy) {
      const setorIdsToSet: number[] =
        (hasSetorIds ? (Array.isArray((data as any).setorIds) ? (data as any).setorIds : []) : undefined) ??
        (typeof (data as any).setorId !== 'undefined' ? ((data as any).setorId > 0 ? [(data as any).setorId] : []) : []);

      const setorIdsUnique: number[] = Array.from(new Set(setorIdsToSet)) as number[];
      for (const setorId of setorIdsUnique) {
        await this.ensureSetorExists(setorId);
      }

      payload.setores = { set: setorIdsUnique.map((id) => ({ id })) };
    }

    const idsAntigos = etapaAntes.integrantes?.map((i) => i.usuarioId) ?? [];

    // Tratar integrantes: `integrantes` (com índices) substitui a lista inteira; senão legado `integrantesIds`
    const dataIntegrantes = (data as { integrantes?: Array<{ usuarioId: number; checklistItemIndices?: number[] | null }> })
      .integrantes;
    if (dataIntegrantes !== undefined) {
      let list = Array.isArray(dataIntegrantes) ? [...dataIntegrantes] : [];
      const checklistLenPatch =
        data.checklist !== undefined && Array.isArray(data.checklist) && data.checklist.length > 0
          ? data.checklist.length
          : 0;
      if (checklistLenPatch > 0 && list.length > 0) {
        list = this.sanitizeIntegranteIndicesList(
          list.map((row) => ({
            usuarioId: Number(row.usuarioId),
            checklistItemIndices: row.checklistItemIndices,
          })),
          checklistLenPatch,
        );
      }
      for (const row of list) {
        await this.ensureUserExists(Number(row.usuarioId));
      }
      await this.prisma.etapaIntegrante.deleteMany({
        where: { etapaId: id },
      });
      if (list.length > 0) {
        payload.integrantes = {
          create: list.map((row) => ({
            usuarioId: Number(row.usuarioId),
            ...this.prismaIntegranteChecklistField(
              row.checklistItemIndices === undefined || row.checklistItemIndices === null
                ? undefined
                : row.checklistItemIndices,
            ),
          })),
        };
      }
    } else if (data.integrantesIds !== undefined) {
      if (Array.isArray(data.integrantesIds) && data.integrantesIds.length > 0) {
        for (const integranteId of data.integrantesIds) {
          await this.ensureUserExists(integranteId);
        }
        await this.prisma.etapaIntegrante.deleteMany({
          where: { etapaId: id },
        });
        payload.integrantes = {
          create: data.integrantesIds.map((usuarioId) => ({ usuarioId })),
        };
      } else {
        await this.prisma.etapaIntegrante.deleteMany({
          where: { etapaId: id },
        });
      }
    }

    let oldPreparedForReindex: ChecklistJsonRow[] | undefined;

    if (payload.checklistJson && Array.isArray(payload.checklistJson)) {
      let allowedIntegrantes: Set<number>;
      if (dataIntegrantes !== undefined) {
        const list = Array.isArray(dataIntegrantes) ? dataIntegrantes : [];
        allowedIntegrantes = new Set(list.map((r) => Number(r.usuarioId)));
      } else if (data.integrantesIds !== undefined) {
        allowedIntegrantes = new Set(
          (Array.isArray(data.integrantesIds) ? data.integrantesIds : [])
            .map((x) => Number(x))
            .filter((n) => !Number.isNaN(n) && n > 0),
        );
      } else {
        allowedIntegrantes = new Set(idsAntigos);
      }
      const sanitized = this.sanitizeChecklistItemIntegrantesIds(
        payload.checklistJson as Array<Record<string, unknown>>,
        allowedIntegrantes,
      );
      const existingList = Array.isArray(etapaAntes.checklistJson)
        ? (etapaAntes.checklistJson as unknown[])
        : null;
      const oldChecklistRows: ChecklistJsonRow[] = Array.isArray(existingList)
        ? (existingList as ChecklistJsonRow[])
        : [];
      oldPreparedForReindex =
        oldChecklistRows.length > 0 ? ensureChecklistStableIds(oldChecklistRows) : undefined;
      payload.checklistJson = (await this.finalizeChecklistJsonForPersist(
        sanitized,
        actor.userId,
        existingList,
        oldPreparedForReindex,
      )) as any;
    }

    // Remover campos undefined do payload
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    const updated = await this.prisma.etapa.update({
      where: { id },
      data: payload,
      include: {
        executor: true,
        responsavel: true,
        projeto: true,
        sessao: { select: { id: true, nome: true } },
        setores: { select: { id: true, nome: true } },
        integrantes: { include: { usuario: { select: { nome: true } } } },
      },
    });

    // Reindexar ChecklistItemEntrega quando o checklist foi enviado na edição
    const integrantesSubstituidosNoPayload =
      dataIntegrantes !== undefined || data.integrantesIds !== undefined;
    if (data.checklist !== undefined && etapaAntes.checklistJson && Array.isArray(etapaAntes.checklistJson) && etapaAntes.checklistJson.length > 0) {
      const oldPrepared =
        oldPreparedForReindex ?? ensureChecklistStableIds(etapaAntes.checklistJson as ChecklistJsonRow[]);
      const newList: ChecklistJsonRow[] =
        Array.isArray(payload.checklistJson) && payload.checklistJson.length > 0
          ? (payload.checklistJson as ChecklistJsonRow[])
          : [];

      if (newList.length > 0) {
        await this.reindexChecklistEntregas(id, oldPrepared, newList);
      } else {
        // Checklist esvaziado: remover todas as entregas para evitar registros órfãos
        const entregasOrfas = await this.prisma.checklistItemEntrega.findMany({
          where: { etapaId: id },
          select: { id: true, status: true, pontosAtribuidos: true, executorId: true },
        });
        for (const entrega of entregasOrfas) {
          await this.revertPointsAndDeleteEntrega(entrega);
        }
      }

      if (!integrantesSubstituidosNoPayload) {
        const oldToNew = buildChecklistOldToNewMap(oldPrepared, newList);
        const integrantesRows = (await this.prisma.etapaIntegrante.findMany({
          where: { etapaId: id },
          select: { usuarioId: true, checklistItemIndices: true },
        } as any)) as unknown as Array<{ usuarioId: number; checklistItemIndices: unknown }>;
        for (const row of integrantesRows) {
          const raw = row.checklistItemIndices;
          if (!Array.isArray(raw) || raw.length === 0) continue;
          const newIndices = (raw as number[])
            .map((oldIdx) => oldToNew[oldIdx])
            .filter((n): n is number => n !== undefined);
          await this.prisma.etapaIntegrante.update({
            where: { etapaId_usuarioId: { etapaId: id, usuarioId: row.usuarioId } },
            data: { checklistItemIndices: newIndices } as Prisma.EtapaIntegranteUpdateInput,
          });
        }
      }
    }

    await this.updateProjetoStatus(updated.projetoId);

    // Notificar somente quando houve alteração explícita da lista de integrantes
    // e apenas para usuários realmente novos após o update.
    const idsAntigosSet = new Set(idsAntigos);
    const idsAtuaisSet = new Set(
      (updated.integrantes ?? [])
        .map((row) => Number(row.usuarioId))
        .filter((uid) => !Number.isNaN(uid) && uid > 0),
    );
    const idsNovos = integrantesSubstituidosNoPayload
      ? [...idsAtuaisSet].filter((uid) => !idsAntigosSet.has(uid) && uid !== actor.userId)
      : [];
    if (idsNovos.length > 0 && updated.projeto) {
      const projetoNome = updated.projeto.nome ?? 'Projeto';
      const etapaNome = updated.nome ?? 'Etapa';
      const mensagem = `Você foi adicionado como integrante da etapa "${etapaNome}" do projeto "${projetoNome}".`;
      for (const usuarioId of idsNovos) {
        try {
          await this.notificationsService.create({
            usuarioId,
            titulo: 'Você foi adicionado a uma etapa',
            mensagem,
            tipo: 'INFO',
            etapaId: updated.id,
          });
        } catch (err) {
          this.logger.warn(`Falha ao criar notificação para integrante ${usuarioId} (etapa ${id}): ${err}`);
        }
      }
    }

    const projetoNome = updated.projeto?.nome ?? 'Projeto';
    const antesSnap = snapshotFromEtapaRow(etapaAntes as any);
    const depoisSnap = snapshotFromEtapaRow(updated as any);
    let detalhesUpdate = buildEtapaDiffLines(antesSnap, depoisSnap);
    if (data.checklist !== undefined) {
      detalhesUpdate = [detalhesUpdate, '• Checklist (tarefas): textos, subitens ou pontos foram alterados.'].filter(Boolean).join('\n');
    }
    if (!detalhesUpdate.trim()) {
      detalhesUpdate = '• Nenhum campo principal divergiu (possível reenvio dos mesmos dados).';
    }
    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: updated.projetoId,
      projetoNome,
      acaoResumo: `etapa atualizada (${updated.nome ?? 'etapa'})`,
      detalhes: detalhesUpdate,
    });

    return updated;
  }

  async changeStatus(id: number, data: ChangeTaskStatusDto, actor: ProjectAccessActor) {
    const etapaLoc = await this.prisma.etapa.findUnique({
      where: { id },
      select: { projetoId: true, nome: true, status: true },
    });
    if (!etapaLoc) {
      throw new NotFoundException('Etapa não encontrada');
    }
    await assertCanAccessProjeto(this.prisma, etapaLoc.projetoId, actor);

    await this.findOne(id);

    const updated = await this.prisma.etapa.update({
      where: { id },
      data: {
        status: data.status,
        iniciada: typeof data.iniciada === 'boolean' ? data.iniciada : undefined,
      },
      include: { projeto: { select: { nome: true } } },
    });

    await this.updateProjetoStatus(updated.projetoId);

    const projetoNome = (updated as any).projeto?.nome ?? 'Projeto';
    const detalhesStatus = [
      `• Etapa: "${etapaLoc.nome}" (id ${id})`,
      `• Status: "${statusEtapaLabel(etapaLoc.status)}" → "${statusEtapaLabel(data.status)}"`,
      typeof data.iniciada === 'boolean' ? `• Iniciada: ${data.iniciada ? 'sim' : 'não'}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: updated.projetoId,
      projetoNome,
      acaoResumo: `status da etapa alterado (${String(data.status)})`,
      detalhes: detalhesStatus,
    });

    return updated;
  }

  async deliver(id: number, userId: number, data: SubmitDeliveryDto) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: { executor: true, avaliadoPor: true },
        },
        integrantes: {
          include: { usuario: true },
        },
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    // Verificar se o usuário é executor OU integrante da etapa
    const isExecutor = etapa.executorId === userId;
    const isIntegrante = etapa.integrantes?.some(
      (integrante) => integrante.usuarioId === userId,
    ) || false;

    if (!isExecutor && !isIntegrante) {
      throw new UnauthorizedException('Somente o executor ou integrantes podem entregar a etapa');
    }

    const statusAtual = etapa.status as EtapaStatus;
    const podeEntregarStatuses: EtapaStatus[] = [
      EtapaStatus.EM_ANDAMENTO,
      EtapaStatus.PENDENTE,
      EtapaStatus.REPROVADA,
    ];
    const podeEntregar = podeEntregarStatuses.includes(statusAtual as EtapaStatus);

    if (!podeEntregar) {
      throw new BadRequestException('A etapa não está disponível para entrega no status atual');
    }

    if (!data.descricao || data.descricao.trim().length < 5) {
      throw new BadRequestException('Descrição da entrega é obrigatória e deve ter pelo menos 5 caracteres');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.etapaEntrega.create({
        data: {
          descricao: data.descricao.trim(),
          imagemUrl: data.imagem ? data.imagem.trim() : null,
          etapaId: id,
          executorId: userId,
        },
      });

      await tx.etapa.update({
        where: { id },
        data: {
          status: EtapaStatus.EM_ANALISE,
          iniciada: true,
          dataFim: etapa.dataFim ?? new Date(),
        },
      });
    });

    const updated = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: true,
        subetapas: true,
        executor: true,
        integrantes: { include: { usuario: true } },
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: { executor: true, avaliadoPor: true },
        },
      },
    });

    if (updated) {
      await this.updateProjetoStatus(updated.projetoId);
    }

    return updated;
  }

  async updateDelivery(etapaId: number, entregaId: number, userId: number, data: SubmitDeliveryDto) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id: etapaId },
      include: {
        entregas: {
          where: { id: entregaId },
          include: { executor: true },
        },
        integrantes: {
          include: { usuario: true },
        },
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const entrega = etapa.entregas[0];
    if (!entrega) {
      throw new NotFoundException('Entrega não encontrada');
    }

    // Verificar se o usuário é executor OU integrante da etapa
    const isExecutor = etapa.executorId === userId;
    const isIntegrante = etapa.integrantes?.some(
      (integrante) => integrante.usuarioId === userId,
    ) || false;

    if (!isExecutor && !isIntegrante) {
      throw new UnauthorizedException('Somente o executor ou integrantes podem editar a entrega');
    }

    if (!data.descricao || data.descricao.trim().length < 5) {
      throw new BadRequestException('Descrição da entrega é obrigatória e deve ter pelo menos 5 caracteres');
    }

    // Atualizar a entrega e marcar quem editou
    await this.prisma.etapaEntrega.update({
      where: { id: entregaId },
      data: {
        descricao: data.descricao.trim(),
        imagemUrl: data.imagem ? data.imagem.trim() : entrega.imagemUrl,
        foiEditada: true,
        editadoPorId: userId,
        dataEdicao: new Date(),
      } as any,
    });

    const updated = await this.prisma.etapa.findUnique({
      where: { id: etapaId },
      include: {
        projeto: true,
        subetapas: true,
        executor: true,
        integrantes: { include: { usuario: true } },
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: { executor: true, avaliadoPor: true, editadoPor: true } as any,
        },
      },
    });

    return updated;
  }

  private latestChecklistEntregaForUnit(
    entregas: Array<{ checklistIndex: number; subitemIndex: number | null; dataEnvio: Date }>,
    checklistIndex: number,
    subitemIndex: number | null,
  ): (typeof entregas)[0] | null {
    const wantSub = subitemIndex;
    const matches = entregas.filter((e) => {
      const eSub = e.subitemIndex ?? null;
      return e.checklistIndex === checklistIndex && eSub === wantSub;
    });
    if (matches.length === 0) return null;
    return matches.sort(
      (a, b) => new Date(b.dataEnvio).getTime() - new Date(a.dataEnvio).getTime(),
    )[0];
  }

  private boolChecklistConcluido(raw: unknown): boolean {
    return Boolean(raw === true || raw === 'true' || raw === 1 || raw === '1');
  }

  /** Impede alterar `concluido` no JSON quando já existe entrega na unidade (PATCH manual / UI). */
  private assertCadastroConcluidoChangesAllowedForManualPatch(
    oldJson: unknown,
    normalizedNew: Array<{
      texto: string;
      concluido: boolean;
      subitens: Array<{ concluido: boolean; texto: string; descricao: string }>;
    }>,
    entregas: Array<{ checklistIndex: number; subitemIndex: number | null; dataEnvio: Date }>,
  ) {
    const oldList = Array.isArray(oldJson) ? oldJson : [];
    for (let i = 0; i < normalizedNew.length; i++) {
      const neu = normalizedNew[i];
      const old = oldList[i] as
        | { concluido?: unknown; subitens?: Array<{ concluido?: unknown }> }
        | undefined;
      const newSubs = neu.subitens || [];

      if (newSubs.length === 0) {
        const oldC = this.boolChecklistConcluido(old?.concluido);
        if (oldC !== neu.concluido && this.latestChecklistEntregaForUnit(entregas, i, null)) {
          throw new BadRequestException(
            'Não é possível alterar o cadastro desta tarefa enquanto existir entrega registrada (em análise, aprovada ou reprovada). Use o fluxo de entregas.',
          );
        }
        continue;
      }

      const oldP = this.boolChecklistConcluido(old?.concluido);
      if (oldP !== neu.concluido && this.latestChecklistEntregaForUnit(entregas, i, null)) {
        throw new BadRequestException(
          'Não é possível alterar o cadastro do item principal enquanto existir entrega registrada para ele. Use o fluxo de entregas.',
        );
      }

      for (let s = 0; s < newSubs.length; s++) {
        const oldEff = oldP || this.boolChecklistConcluido(old?.subitens?.[s]?.concluido);
        const newEff = neu.concluido || Boolean(newSubs[s].concluido);
        if (oldEff !== newEff && this.latestChecklistEntregaForUnit(entregas, i, s)) {
          throw new BadRequestException(
            'Não é possível alterar o cadastro de uma subtarefa enquanto existir entrega registrada para ela. Use o fluxo de entregas.',
          );
        }
      }
    }
  }

  /** Payload bruto do PATCH de checklist (API ou importação). */
  private async persistChecklistJsonUpdate(
    id: number,
    etapa: {
      checklistJson: unknown;
    },
    userPerms: Set<string>,
    checklist: Array<{
      texto: string;
      concluido?: boolean | string | number;
      descricao?: string;
      integrantesIds?: number[];
      pontos?: unknown;
      subitens?: Array<{ texto: string; concluido?: boolean; descricao?: string; pontos?: unknown }>;
    }>,
    entregasCadastroGuard?: Array<{
      checklistIndex: number;
      subitemIndex: number | null;
      dataEnvio: Date;
    }>,
  ) {
    const canEditPontosChecklist = userPerms.has('projetos:pontos');
    const existingChecklistRows = Array.isArray(etapa.checklistJson)
      ? (etapa.checklistJson as Array<{ texto?: unknown; pontos?: unknown }>)
      : [];
    const consumedPontosRows = new Set<number>();

    const normalizedChecklist = checklist.map((item) => {
      const concluido = Boolean(
        item.concluido === true ||
          item.concluido === 'true' ||
          item.concluido === 1 ||
          item.concluido === '1',
      );

      const normalizedSubitens =
        item.subitens?.map((sub) => {
          const subId = (sub as { id?: string }).id;
          return {
            ...(subId ? { id: subId } : {}),
            texto: sub.texto,
            concluido: concluido ? true : Boolean(sub.concluido),
            descricao: sub.descricao || '',
          };
        }) || [];

      const rawIds = (item as { integrantesIds?: unknown }).integrantesIds;
      const integrantesIds =
        Array.isArray(rawIds) && rawIds.length > 0
          ? [...new Set(rawIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))]
          : undefined;

      const pontos = canEditPontosChecklist
        ? this.clampPontosFromChecklistConfig((item as { pontos?: unknown }).pontos)
        : this.pickPontosPreservingNonGmEdit(item.texto, existingChecklistRows, consumedPontosRows);

      const itemId = (item as { id?: string }).id;

      return {
        ...(itemId ? { id: itemId } : {}),
        texto: item.texto,
        concluido,
        descricao: item.descricao || '',
        pontos,
        subitens: normalizedSubitens,
        ...(integrantesIds && integrantesIds.length > 0 ? { integrantesIds } : {}),
      };
    });

    if (entregasCadastroGuard !== undefined) {
      this.assertCadastroConcluidoChangesAllowedForManualPatch(
        etapa.checklistJson,
        normalizedChecklist,
        entregasCadastroGuard,
      );
    }

    const oldChecklistForReindex: ChecklistJsonRow[] = Array.isArray(etapa.checklistJson)
      ? (etapa.checklistJson as ChecklistJsonRow[])
      : [];

    const oldPrepared = ensureChecklistStableIds(oldChecklistForReindex);
    const checklistToSave =
      oldPrepared.length > 0
        ? reconcileChecklistIdsForPersist(normalizedChecklist, oldChecklistForReindex, oldPrepared)
        : ensureChecklistStableIds(normalizedChecklist);

    await this.prisma.etapa.update({
      where: { id },
      data: { checklistJson: checklistToSave as any },
    });

    if (oldPrepared.length > 0 && checklistToSave.length > 0) {
      await this.reindexChecklistEntregas(id, oldPrepared, checklistToSave);
    }

    await this.reconcileEtapaStatus(id);

    const updated = await this.prisma.etapa.findUnique({
      where: { id },
      include: { executor: true, responsavel: true, projeto: true, integrantes: { include: { usuario: true } } },
    });

    if (!updated) {
      throw new NotFoundException('Etapa não encontrada após atualização');
    }

    return updated;
  }

  /**
   * Marcar itens no cadastro (checkbox) — mesma base de quem pode avaliar entregas do checklist,
   * espelhando `reviewChecklistItem` (sem exigir entrega em análise).
   */
  async updateChecklist(
    id: number,
    userId: number,
    checklist: Array<{
      texto: string;
      concluido?: boolean | string | number;
      descricao?: string;
      integrantesIds?: number[];
      pontos?: unknown;
      subitens?: Array<{ texto: string; concluido?: boolean; descricao?: string; pontos?: unknown }>;
    }>,
  ) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: {
          include: {
            supervisor: true,
            responsaveis: { include: { usuario: true } },
          },
        },
        responsavel: true,
        integrantes: {
          include: { usuario: true },
        },
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const userPerms = await this.getUserPermissionKeys(userId);
    if (userPerms.size === 0) {
      const userExists = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) throw new NotFoundException('Usuário não encontrado');
    }

    if (!canUserReviewDeliveriesInEtapaContext(userId, userPerms, etapa)) {
      throw new UnauthorizedException(
        'Sem permissão para marcar tarefas no cadastro desta etapa. É necessário ser supervisor, responsável ou ter permissão de avaliação com escopo adequado.',
      );
    }

    const entregas = await this.prisma.checklistItemEntrega.findMany({
      where: { etapaId: id },
      select: { checklistIndex: true, subitemIndex: true, dataEnvio: true },
    });
    const entregasGuard = entregas.map((e) => ({
      checklistIndex: e.checklistIndex,
      subitemIndex: e.subitemIndex ?? null,
      dataEnvio: e.dataEnvio,
    }));

    return this.persistChecklistJsonUpdate(id, etapa, userPerms, checklist, entregasGuard);
  }

  /** Importação Excel / rotinas internas: quem pode editar projeto persiste o JSON completo (inclui concluído). */
  async updateChecklistFromImport(
    id: number,
    userId: number,
    checklist: Array<{
      texto: string;
      concluido?: boolean | string | number;
      descricao?: string;
      integrantesIds?: number[];
      pontos?: unknown;
      subitens?: Array<{ texto: string; concluido?: boolean; descricao?: string; pontos?: unknown }>;
    }>,
  ) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: {
          include: {
            supervisor: true,
          },
        },
        responsavel: true,
        integrantes: {
          include: { usuario: true },
        },
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const userPerms = await this.getUserPermissionKeys(userId);
    if (userPerms.size === 0) {
      const userExists = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) throw new NotFoundException('Usuário não encontrado');
    }

    const canImport =
      userPerms.has('projetos:editar') || userPerms.has('sistema:administrar');
    if (!canImport) {
      throw new ForbiddenException(
        'Sem permissão para importar checklist. É necessário poder editar projetos ou administrar o sistema.',
      );
    }

    return this.persistChecklistJsonUpdate(id, etapa, userPerms, checklist);
  }

  async submitChecklistItem(
    etapaId: number,
    checklistIndex: number,
    userId: number,
    data: SubmitChecklistItemDto,
    subitemIndex?: number,
  ) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id: etapaId },
      include: {
        integrantes: {
          include: { usuario: true },
        },
        checklistEntregas: true,
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    // Verificar se o usuário é executor OU integrante
    const isExecutor = etapa.executorId === userId;
    const isIntegrante = etapa.integrantes?.some(
      (integrante) => integrante.usuarioId === userId,
    ) || false;

    if (!isExecutor && !isIntegrante) {
      throw new UnauthorizedException('Somente o executor ou integrantes podem enviar entregas');
    }

    // Validar que o índice do checklist existe
    const checklist = (etapa.checklistJson as Array<{
      id?: string;
      texto: string;
      concluido?: boolean;
      integrantesIds?: unknown;
      subitens?: Array<{ id?: string; texto: string; concluido?: boolean }>;
    }>) || [];
    
    if (checklistIndex < 0 || checklistIndex >= checklist.length) {
      throw new BadRequestException('Índice do checklist inválido');
    }

    const checklistRow = checklist[checklistIndex];
    const checklistItemId = checklistRow?.id ?? null;
    const subitemId =
      subitemIndex !== undefined && subitemIndex !== null
        ? checklistRow?.subitens?.[subitemIndex]?.id ?? null
        : null;

    // Integrante (não executor): item sem lista ou vazio = todos; com lista = só quem está nela
    if (isIntegrante && !isExecutor) {
      const itemRow = checklist[checklistIndex] as { integrantesIds?: unknown };
      const ids = itemRow?.integrantesIds;
      if (Array.isArray(ids) && ids.length > 0) {
        const allowed = new Set(ids.map((n) => Number(n)));
        if (!allowed.has(userId)) {
          throw new ForbiddenException('Este item do checklist não está atribuído a você.');
        }
      }
    }

    // Se for subitem, validar que o subitem existe
    if (subitemIndex !== undefined && subitemIndex !== null) {
      const item = checklist[checklistIndex];
      if (!item.subitens || subitemIndex < 0 || subitemIndex >= item.subitens.length) {
        throw new BadRequestException('Índice do subitem inválido');
      }
    }

    if (!data.descricao || data.descricao.trim().length < 5) {
      throw new BadRequestException('Descrição é obrigatória e deve ter pelo menos 5 caracteres');
    }

    // Processar imagens: usar array se fornecido, senão usar campo único (compatibilidade)
    const imagensFieldProvided = data.imagens !== undefined || data.imagem !== undefined;
    let imagensUrls: string[] | null = null;
    if (Array.isArray(data.imagens)) {
      imagensUrls = data.imagens.filter((img) => img && img.trim().length > 0);
    } else if (data.imagem && data.imagem.trim().length > 0) {
      // Compatibilidade com formato antigo
      imagensUrls = [data.imagem.trim()];
    }

    // Processar documentos: usar array se fornecido, senão usar campo único (compatibilidade)
    const documentosFieldProvided = data.documentos !== undefined || data.documento !== undefined;
    let documentosUrls: string[] | null = null;
    if (Array.isArray(data.documentos)) {
      documentosUrls = data.documentos.filter((doc) => doc && doc.trim().length > 0);
    } else if (data.documento && data.documento.trim().length > 0) {
      // Compatibilidade com formato antigo
      documentosUrls = [data.documento.trim()];
    }

    // Buscar entrega existente (item principal ou subitem)
    // Primeiro tentar buscar com subitemIndex específico
    let entregaExistente: any = null;
    
    if (subitemIndex !== undefined && subitemIndex !== null) {
      // Buscar entrega do subitem específico
      entregaExistente = await this.prisma.checklistItemEntrega.findFirst({
      where: {
          etapaId,
          checklistIndex,
          subitemIndex: subitemIndex,
        } as any,
      });
    } else {
      // Buscar entrega do item principal (subitemIndex = null)
      entregaExistente = await this.prisma.checklistItemEntrega.findFirst({
        where: {
          etapaId,
          checklistIndex,
          subitemIndex: null,
        } as any,
      });
    }
    
    // Se não encontrou e é um subitem, também tentar buscar sem filtrar por subitemIndex
    // (para compatibilidade com constraint antiga que pode não ter subitemIndex)
    if (!entregaExistente && subitemIndex !== undefined && subitemIndex !== null) {
      const todasEntregas = await this.prisma.checklistItemEntrega.findMany({
        where: {
          etapaId,
          checklistIndex,
        },
      });
      
      // Se só existe uma entrega e ela não tem subitemIndex (ou é null), usar ela
      if (todasEntregas.length === 1) {
        const entrega = todasEntregas[0] as any;
        if (entrega.subitemIndex === null || entrega.subitemIndex === undefined) {
          entregaExistente = entrega;
        }
      }
    }

    // Função auxiliar para preparar dados de update
    const prepareUpdateData = (existent: any) => {
      // Ao reenviar, substituir completamente as listas de arquivos
      // Regras:
      // - Se o campo foi enviado (imagens/documentos definidos), mesmo vazio -> limpar/definir conforme enviado
      // - Se o campo não foi enviado -> manter o que já existia
      let novasImagens: string[] | undefined;
      if (imagensFieldProvided) {
        // Se veio array (mesmo vazio), usamos exatamente o que veio
        novasImagens = imagensUrls && imagensUrls.length > 0 ? imagensUrls : [];
      } else if (Array.isArray(existent.imagensUrls) && existent.imagensUrls.length > 0) {
        novasImagens = existent.imagensUrls as string[];
      }

      let novosDocumentos: string[] | undefined;
      if (documentosFieldProvided) {
        novosDocumentos = documentosUrls && documentosUrls.length > 0 ? documentosUrls : [];
      } else if (Array.isArray(existent.documentosUrls) && existent.documentosUrls.length > 0) {
        novosDocumentos = existent.documentosUrls as string[];
      }

      // Calcular arquivos antigos que foram removidos nesta edição
      const arquivosRemovidosExistentes: string[] = Array.isArray(existent.arquivosRemovidos)
        ? (existent.arquivosRemovidos as string[])
        : [];

      const imagensAntigas: string[] = [];
      if (Array.isArray(existent.imagensUrls)) {
        imagensAntigas.push(...(existent.imagensUrls as string[]));
      }
      if (existent.imagemUrl) {
        imagensAntigas.push(existent.imagemUrl as string);
      }

      const documentosAntigos: string[] = [];
      if (Array.isArray(existent.documentosUrls)) {
        documentosAntigos.push(...(existent.documentosUrls as string[]));
      }
      if (existent.documentoUrl) {
        documentosAntigos.push(existent.documentoUrl as string);
      }

      const imagensFinais = novasImagens ?? imagensAntigas;
      const documentosFinais = novosDocumentos ?? documentosAntigos;

      const removidasImagens = imagensAntigas.filter((url) => !imagensFinais.includes(url));
      const removidosDocumentos = documentosAntigos.filter((url) => !documentosFinais.includes(url));

      const arquivosRemovidos: string[] = [...arquivosRemovidosExistentes];
      [...removidasImagens, ...removidosDocumentos].forEach((url) => {
        if (url && typeof url === 'string' && !arquivosRemovidos.includes(url)) {
          arquivosRemovidos.push(url);
        }
      });

      // Controlar também os campos legados imagemUrl/documentoUrl:
      // - Se o campo foi enviado e a nova lista está vazia -> limpar (null)
      // - Se o campo foi enviado e há itens -> usar o primeiro da lista
      // - Se o campo não foi enviado -> manter o valor atual
      let imagemUrl = existent.imagemUrl as string | null | undefined;
      if (imagensFieldProvided) {
        if (imagensFinais && imagensFinais.length > 0) {
          imagemUrl = imagensFinais[0];
        } else {
          imagemUrl = null;
        }
      }

      let documentoUrl = existent.documentoUrl as string | null | undefined;
      if (documentosFieldProvided) {
        if (documentosFinais && documentosFinais.length > 0) {
          documentoUrl = documentosFinais[0];
        } else {
          documentoUrl = null;
        }
      }

      return {
        descricao: data.descricao.trim(),
        executorId: userId,
        imagemUrl,
        documentoUrl,
        imagensUrls: imagensFinais,
        documentosUrls: documentosFinais,
        arquivosRemovidos: arquivosRemovidos.length > 0 ? (arquivosRemovidos as any) : Prisma.DbNull,
        status: ChecklistItemStatus.EM_ANALISE,
        dataEnvio: new Date(),
        comentario: null,
        avaliadoPorId: null,
        dataAvaliacao: null,
        pontosAtribuidos: null,
        checklistItemId,
        subitemId,
      };
    };

    // Criar ou atualizar a entrega do item do checklist (ou subitem)
    let entrega;

    const atualizarEntregaComReversaoPontos = async (row: {
      id: number;
      status: ChecklistItemStatus;
      pontosAtribuidos: number | null;
      executorId: number;
    }) =>
      this.prisma.$transaction(async (tx) => {
        if (row.status === ChecklistItemStatus.APROVADO && row.pontosAtribuidos != null) {
          await tx.usuario.update({
            where: { id: row.executorId },
            data: { pontosTarefas: { decrement: row.pontosAtribuidos } },
          });
        }
        return tx.checklistItemEntrega.update({
          where: { id: row.id },
          data: prepareUpdateData(row as any),
          include: {
            executor: true,
            avaliadoPor: true,
          },
        });
      });

    if (entregaExistente) {
      entrega = await atualizarEntregaComReversaoPontos({
        id: entregaExistente.id,
        status: entregaExistente.status,
        pontosAtribuidos: entregaExistente.pontosAtribuidos ?? null,
        executorId: entregaExistente.executorId,
      });
    } else {
      // Tentar criar nova entrega
      try {
        entrega = await this.prisma.checklistItemEntrega.create({
          data: {
            etapaId,
            checklistIndex,
            ...(subitemIndex !== undefined && subitemIndex !== null ? { subitemIndex } : { subitemIndex: null }),
            checklistItemId,
            subitemId,
            descricao: data.descricao.trim(),
            imagemUrl: imagensUrls && imagensUrls.length > 0 ? imagensUrls[0] : null,
            documentoUrl: documentosUrls && documentosUrls.length > 0 ? documentosUrls[0] : null,
            imagensUrls: imagensUrls && imagensUrls.length > 0 ? imagensUrls : undefined,
            documentosUrls: documentosUrls && documentosUrls.length > 0 ? documentosUrls : undefined,
            status: ChecklistItemStatus.EM_ANALISE,
            executorId: userId,
          } as any,
          include: {
            executor: true,
            avaliadoPor: true,
          },
        });
      } catch (error: any) {
        // Se der erro de constraint única, buscar novamente e atualizar
        if (
          error.code === 'P2002' ||
          error.message?.includes('Unique constraint') ||
          (error.message?.includes('etapaId') && error.message?.includes('checklistIndex'))
        ) {
          // Buscar qualquer entrega existente para este (etapaId, checklistIndex)
          // independente do subitemIndex (para compatibilidade com constraint antiga)
          const todasEntregas = await this.prisma.checklistItemEntrega.findMany({
            where: {
              etapaId,
              checklistIndex,
            },
          });
          
          if (todasEntregas.length > 0) {
            // Usar a primeira encontrada (ou a que tem subitemIndex correspondente se existir)
            const entregaEncontrada =
              todasEntregas.find((e: any) =>
                subitemIndex !== undefined && subitemIndex !== null
                  ? e.subitemIndex === subitemIndex
                  : e.subitemIndex === null || e.subitemIndex === undefined,
              ) || todasEntregas[0];
            
            if (entregaEncontrada) {
              entrega = await atualizarEntregaComReversaoPontos({
                id: (entregaEncontrada as any).id,
                status: (entregaEncontrada as any).status,
                pontosAtribuidos: (entregaEncontrada as any).pontosAtribuidos ?? null,
                executorId: (entregaEncontrada as any).executorId,
              });
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    // Ao reenviar uma entrega (especialmente depois de aprovada),
    // o item deve voltar para análise: limpar o "concluido" do checklist
    // e, se apropriado, colocar a etapa em EM_ANALISE novamente.
    if (checklist.length > 0 && checklistIndex >= 0 && checklistIndex < checklist.length) {
      const item = checklist[checklistIndex];
      if (item) {
        if (subitemIndex !== undefined && subitemIndex !== null && item.subitens && item.subitens[subitemIndex]) {
          item.subitens[subitemIndex].concluido = false;
        } else {
          item.concluido = false;
        }

        const patch: Record<string, unknown> = {
          checklistJson: checklist as any,
        };
        if (etapa.status === EtapaStatus.APROVADA) {
          patch.dataFim = null;
        }
        await this.prisma.etapa.update({
          where: { id: etapaId },
          data: patch as any,
        });
        await this.reconcileEtapaStatus(etapaId);
      }
    }

    return entrega;
  }

  private async decrementUsuarioPontosTarefasTx(tx: any, userId: number, pts: number) {
    if (pts <= 0) return;
    const u = await tx.usuario.findUnique({ where: { id: userId }, select: { pontosTarefas: true } });
    const cur = u?.pontosTarefas ?? 0;
    const next = Math.max(0, cur - pts);
    await tx.usuario.update({ where: { id: userId }, data: { pontosTarefas: next } });
  }

  /**
   * Efeitos colaterais da aprovação (pontos + checklistJson + entregas de subtarefas quando o pai é aprovado).
   * A linha principal da entrega já deve ter sido atualizada pelo chamador (status, pontosAtribuidos).
   */
  private async applyChecklistApprovalSideEffectsInTx(
    tx: any,
    etapaId: number,
    checklistIndex: number,
    subitemIndex: number | undefined,
    entrega: { id: number; executorId: number },
    checklistRaw: Array<{
      texto: string;
      concluido?: boolean;
      subitens?: Array<{ texto: string; concluido?: boolean }>;
    }>,
    reviewerId: number,
    pontosGanho: number,
  ) {
    await tx.usuario.update({
      where: { id: entrega.executorId },
      data: { pontosTarefas: { increment: pontosGanho } },
    });

    const checklist = JSON.parse(JSON.stringify(checklistRaw)) as typeof checklistRaw;

    if (subitemIndex !== undefined && subitemIndex !== null) {
      const item = checklist[checklistIndex];
      if (item && item.subitens && item.subitens[subitemIndex]) {
        item.subitens[subitemIndex].concluido = true;
      }
    } else if (checklist[checklistIndex]) {
      checklist[checklistIndex].concluido = true;

      const parentItem = checklist[checklistIndex];
      if (Array.isArray(parentItem.subitens) && parentItem.subitens.length > 0) {
        const existingSubEntregas = await tx.checklistItemEntrega.findMany({
          where: { etapaId, checklistIndex },
        });
        const subEntregaMap = new Map<number, (typeof existingSubEntregas)[0]>();
        for (const se of existingSubEntregas) {
          if (se.subitemIndex != null) subEntregaMap.set(se.subitemIndex, se);
        }

        const pointsByUser: Record<number, number> = {};

        for (let si = 0; si < parentItem.subitens.length; si++) {
          parentItem.subitens[si].concluido = true;

          const existingSub = subEntregaMap.get(si);
          const subPts = this.resolvePontosChecklistItem(
            checklist as Array<{ pontos?: unknown; subitens?: Array<unknown> }>,
            checklistIndex,
            si,
          );

          if (existingSub) {
            if (existingSub.status !== ChecklistItemStatus.APROVADO) {
              await tx.checklistItemEntrega.update({
                where: { id: existingSub.id },
                data: {
                  status: ChecklistItemStatus.APROVADO,
                  avaliadoPorId: reviewerId,
                  dataAvaliacao: new Date(),
                  pontosAtribuidos: subPts,
                },
              });
              pointsByUser[existingSub.executorId] = (pointsByUser[existingSub.executorId] || 0) + subPts;
            }
          } else {
            await tx.checklistItemEntrega.create({
              data: {
                etapaId,
                checklistIndex,
                subitemIndex: si,
                descricao: 'Aprovado automaticamente junto com o item pai',
                status: ChecklistItemStatus.APROVADO,
                executorId: entrega.executorId,
                avaliadoPorId: reviewerId,
                dataAvaliacao: new Date(),
                pontosAtribuidos: subPts,
              } as any,
            });
            pointsByUser[entrega.executorId] = (pointsByUser[entrega.executorId] || 0) + subPts;
          }
        }

        for (const [uid, pts] of Object.entries(pointsByUser)) {
          if (pts > 0) {
            await tx.usuario.update({
              where: { id: Number(uid) },
              data: { pontosTarefas: { increment: pts } },
            });
          }
        }
      }
    }

    checklist.forEach((item) => {
      if (item.subitens && item.subitens.length > 0) {
        const todosSubitensConcluidos = item.subitens.every((sub) => sub.concluido === true);
        if (todosSubitensConcluidos && !item.concluido) {
          item.concluido = true;
        }
      }
    });

    await tx.etapa.update({
      where: { id: etapaId },
      data: { checklistJson: checklist as any },
    });
  }

  /** Reverte aprovação: estorna pontos, atualiza entregas e desmarca checklist (inclui linha com subtarefas). */
  private async revertChecklistApprovalBundleInTx(
    tx: any,
    etapaId: number,
    checklistIndex: number,
    subitemIndex: number | undefined,
    rootEntregaId: number,
    checklistRaw: Array<{
      texto: string;
      concluido?: boolean;
      subitens?: Array<{ texto: string; concluido?: boolean }>;
    }>,
    reviewerId: number,
    comentario: string | null,
  ) {
    const rows = await tx.checklistItemEntrega.findMany({ where: { etapaId, checklistIndex } });
    const checklist = JSON.parse(JSON.stringify(checklistRaw)) as typeof checklistRaw;
    const subIdx = subitemIndex !== undefined && subitemIndex !== null ? subitemIndex : null;
    const autoMark = 'Aprovado automaticamente junto com o item pai';

    if (subIdx !== null) {
      const root = rows.find((r) => r.id === rootEntregaId);
      if (!root) throw new NotFoundException('Entrega não encontrada');
      if (root.status === ChecklistItemStatus.APROVADO) {
        await this.decrementUsuarioPontosTarefasTx(tx, root.executorId, root.pontosAtribuidos ?? 0);
      }
      await tx.checklistItemEntrega.update({
        where: { id: root.id },
        data: {
          status: ChecklistItemStatus.REPROVADO,
          pontosAtribuidos: null,
          comentario,
          avaliadoPorId: reviewerId,
          dataAvaliacao: new Date(),
        },
      });
      const item = checklist[checklistIndex];
      if (item) {
        item.concluido = false;
        if (item.subitens?.[subIdx]) item.subitens[subIdx].concluido = false;
      }
      await tx.etapa.update({ where: { id: etapaId }, data: { checklistJson: checklist as any } });
      return;
    }

    const parentItem = checklist[checklistIndex];
    const hasSubs = Array.isArray(parentItem?.subitens) && parentItem.subitens.length > 0;

    if (!hasSubs) {
      const root = rows.find((r) => r.id === rootEntregaId);
      if (!root) throw new NotFoundException('Entrega não encontrada');
      if (root.status === ChecklistItemStatus.APROVADO) {
        await this.decrementUsuarioPontosTarefasTx(tx, root.executorId, root.pontosAtribuidos ?? 0);
      }
      await tx.checklistItemEntrega.update({
        where: { id: root.id },
        data: {
          status: ChecklistItemStatus.REPROVADO,
          pontosAtribuidos: null,
          comentario,
          avaliadoPorId: reviewerId,
          dataAvaliacao: new Date(),
        },
      });
      if (parentItem) parentItem.concluido = false;
      await tx.etapa.update({ where: { id: etapaId }, data: { checklistJson: checklist as any } });
      return;
    }

    const approved = rows.filter((r) => r.status === ChecklistItemStatus.APROVADO);
    for (const r of approved) {
      await this.decrementUsuarioPontosTarefasTx(tx, r.executorId, r.pontosAtribuidos ?? 0);
    }

    for (const r of rows) {
      if (r.status !== ChecklistItemStatus.APROVADO) continue;
      const isAuto = typeof r.descricao === 'string' && r.descricao.includes(autoMark);
      if (isAuto && r.subitemIndex != null) {
        await tx.checklistItemEntrega.delete({ where: { id: r.id } });
      } else {
        await tx.checklistItemEntrega.update({
          where: { id: r.id },
          data: {
            status: ChecklistItemStatus.REPROVADO,
            pontosAtribuidos: null,
            avaliadoPorId: reviewerId,
            dataAvaliacao: new Date(),
            ...(r.id === rootEntregaId ? { comentario } : {}),
          },
        });
      }
    }

    if (parentItem) {
      parentItem.concluido = false;
      for (let i = 0; i < parentItem.subitens!.length; i++) {
        parentItem.subitens![i].concluido = false;
      }
    }

    await tx.etapa.update({ where: { id: etapaId }, data: { checklistJson: checklist as any } });
  }

  async reviewChecklistItem(
    etapaId: number,
    checklistIndex: number,
    reviewerId: number,
    data: ReviewChecklistItemDto,
    subitemIndex?: number,
  ) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id: etapaId },
      include: {
        projeto: {
          include: {
            supervisor: true,
            responsaveis: { include: { usuario: true } },
          },
        },
        responsavel: true,
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const reviewerPerms = await this.getUserPermissionKeys(reviewerId);
    if (reviewerPerms.size === 0) {
      const userExists = await this.prisma.usuario.findUnique({ where: { id: reviewerId }, select: { id: true } });
      if (!userExists) throw new NotFoundException('Usuário não encontrado');
    }

    if (!canUserReviewDeliveriesInEtapaContext(reviewerId, reviewerPerms, etapa)) {
      throw new ForbiddenException(
        'Sem permissão para avaliar entregas desta etapa. É necessário ser supervisor, responsável ou ter permissão de avaliação com escopo adequado.',
      );
    }

    const entrega = await this.prisma.checklistItemEntrega.findFirst({
      where: {
        etapaId,
        checklistIndex,
        ...(subitemIndex !== undefined && subitemIndex !== null ? { subitemIndex } : { subitemIndex: null }),
      } as any,
    });

    if (!entrega) {
      throw new NotFoundException('Entrega do item do checklist não encontrada');
    }

    if (
      data.status !== ChecklistItemStatus.APROVADO &&
      data.status !== ChecklistItemStatus.REPROVADO
    ) {
      throw new BadRequestException('Informe aprovar ou reprovar (status APROVADO ou REPROVADO).');
    }

    this.assertReviewerNotOwnDelivery(reviewerId, entrega.executorId, reviewerPerms);

    const checklistRaw = (Array.isArray(etapa.checklistJson) ? etapa.checklistJson : []) as Array<{
      texto: string;
      concluido?: boolean;
      subitens?: Array<{ texto: string; concluido?: boolean }>;
    }>;

    const comentarioTrim = data.comentario?.trim() ?? null;
    const previous = entrega.status;
    const target = data.status;

    if (previous === target) {
      const row = await this.prisma.checklistItemEntrega.update({
        where: { id: entrega.id },
        data: {
          comentario: comentarioTrim,
          avaliadoPorId: reviewerId,
          dataAvaliacao: new Date(),
        },
        include: { executor: true, avaliadoPor: true },
      });
      await this.reconcileEtapaStatus(etapaId);
      return row;
    }

    const pontosGanho =
      target === ChecklistItemStatus.APROVADO
        ? this.resolvePontosChecklistItem(
            checklistRaw as Array<{ pontos?: unknown; subitens?: Array<{ pontos?: unknown }> }>,
            checklistIndex,
            subitemIndex,
          )
        : 0;

    let updatedEntrega: Awaited<ReturnType<typeof this.prisma.checklistItemEntrega.findUnique>> & {};

    if (previous === ChecklistItemStatus.EM_ANALISE) {
      updatedEntrega = await this.prisma.$transaction(async (tx) => {
        const row = await tx.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: {
            status: target,
            comentario: comentarioTrim,
            avaliadoPorId: reviewerId,
            dataAvaliacao: new Date(),
            ...(target === ChecklistItemStatus.APROVADO ? { pontosAtribuidos: pontosGanho } : { pontosAtribuidos: null }),
          },
          include: {
            executor: true,
            avaliadoPor: true,
          },
        });

        if (target === ChecklistItemStatus.APROVADO) {
          await this.applyChecklistApprovalSideEffectsInTx(
            tx,
            etapaId,
            checklistIndex,
            subitemIndex,
            entrega,
            checklistRaw,
            reviewerId,
            pontosGanho,
          );
        }

        return row;
      });
    } else if (previous === ChecklistItemStatus.APROVADO && target === ChecklistItemStatus.REPROVADO) {
      await this.prisma.$transaction(async (tx) => {
        await this.revertChecklistApprovalBundleInTx(
          tx,
          etapaId,
          checklistIndex,
          subitemIndex,
          entrega.id,
          checklistRaw,
          reviewerId,
          comentarioTrim,
        );
      });
      updatedEntrega = (await this.prisma.checklistItemEntrega.findUnique({
        where: { id: entrega.id },
        include: { executor: true, avaliadoPor: true },
      })) as any;
    } else if (previous === ChecklistItemStatus.REPROVADO && target === ChecklistItemStatus.APROVADO) {
      updatedEntrega = await this.prisma.$transaction(async (tx) => {
        const row = await tx.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: {
            status: ChecklistItemStatus.APROVADO,
            comentario: comentarioTrim,
            avaliadoPorId: reviewerId,
            dataAvaliacao: new Date(),
            pontosAtribuidos: pontosGanho,
          },
          include: { executor: true, avaliadoPor: true },
        });
        await this.applyChecklistApprovalSideEffectsInTx(
          tx,
          etapaId,
          checklistIndex,
          subitemIndex,
          entrega,
          checklistRaw,
          reviewerId,
          pontosGanho,
        );
        return row;
      });
    } else {
      throw new BadRequestException(
        `Não é possível alterar de "${previous}" para "${target}" por esta rota.`,
      );
    }

    if (target === ChecklistItemStatus.APROVADO) {
      const arquivosRemovidos: string[] = Array.isArray((entrega as any).arquivosRemovidos)
        ? ((entrega as any).arquivosRemovidos as string[])
        : [];
      if (arquivosRemovidos.length > 0) {
        await this.deleteFilesFromStorage(arquivosRemovidos);
        await this.prisma.checklistItemEntrega.update({
          where: { id: entrega.id },
          data: { arquivosRemovidos: Prisma.DbNull },
        });
      }
    }

    await this.reconcileEtapaStatus(etapaId);

    return updatedEntrega;
  }

  async approve(id: number, reviewerId: number, comentario?: string) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: {
          include: {
            supervisor: true,
            responsaveis: { include: { usuario: true } },
          },
        },
        responsavel: true,
        entregas: {
          where: { status: EtapaEntregaStatus.EM_ANALISE },
          orderBy: { dataEnvio: 'desc' },
        },
        checklistEntregas: true,
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const approvePerms = await this.getUserPermissionKeys(reviewerId);
    {
      const userExists = await this.prisma.usuario.findUnique({ where: { id: reviewerId }, select: { id: true } });
      if (!userExists) throw new NotFoundException('Usuário não encontrado');
    }
    if (!canUserReviewDeliveriesInEtapaContext(reviewerId, approvePerms, etapa)) {
      throw new ForbiddenException(
        'Sem permissão para aprovar entregas desta etapa. É necessário ser supervisor, responsável ou ter permissão de avaliação com escopo adequado.',
      );
    }

    const entregaPendente = etapa.entregas[0];

    if (!entregaPendente) {
      throw new BadRequestException('Não há entrega pendente de análise para esta etapa');
    }

    this.assertReviewerNotOwnDelivery(reviewerId, entregaPendente.executorId, approvePerms);

    const checklist = (Array.isArray(etapa.checklistJson)
      ? JSON.parse(JSON.stringify(etapa.checklistJson))
      : []) as Array<{
      texto: string;
      concluido?: boolean;
      pontos?: unknown;
      subitens?: Array<{ texto: string; concluido?: boolean }>;
    }>;

    const existingEntregas = etapa.checklistEntregas ?? [];
    const entregaMap = new Map<string, (typeof existingEntregas)[0]>();
    for (const e of existingEntregas) {
      entregaMap.set(`${e.checklistIndex}:${e.subitemIndex ?? 'null'}`, e);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.etapaEntrega.update({
        where: { id: entregaPendente.id },
        data: {
          status: EtapaEntregaStatus.APROVADA,
          comentario: comentario?.trim() || null,
          avaliadoPorId: reviewerId,
          dataAvaliacao: new Date(),
        },
      });

      const pointsByUser: Record<number, number> = {};
      const now = new Date();

      for (let ci = 0; ci < checklist.length; ci++) {
        const item = checklist[ci];
        const hasSubitens = Array.isArray(item.subitens) && item.subitens.length > 0;

        if (hasSubitens) {
          for (let si = 0; si < item.subitens!.length; si++) {
            const pts = this.resolvePontosChecklistItem(
              checklist as Array<{ pontos?: unknown; subitens?: Array<unknown> }>,
              ci,
              si,
            );
            const existing = entregaMap.get(`${ci}:${si}`);

            if (existing) {
              if (existing.status !== ChecklistItemStatus.APROVADO) {
                await tx.checklistItemEntrega.update({
                  where: { id: existing.id },
                  data: {
                    status: ChecklistItemStatus.APROVADO,
                    avaliadoPorId: reviewerId,
                    dataAvaliacao: now,
                    pontosAtribuidos: pts,
                  },
                });
                pointsByUser[existing.executorId] = (pointsByUser[existing.executorId] || 0) + pts;
              }
            } else {
              await tx.checklistItemEntrega.create({
                data: {
                  etapaId: id,
                  checklistIndex: ci,
                  subitemIndex: si,
                  descricao: 'Aprovado automaticamente via entrega da etapa',
                  status: ChecklistItemStatus.APROVADO,
                  executorId: entregaPendente.executorId,
                  avaliadoPorId: reviewerId,
                  dataAvaliacao: now,
                  pontosAtribuidos: pts,
                } as any,
              });
              pointsByUser[entregaPendente.executorId] =
                (pointsByUser[entregaPendente.executorId] || 0) + pts;
            }
            item.subitens![si].concluido = true;
          }
          item.concluido = true;
        } else {
          const pts = this.resolvePontosChecklistItem(
            checklist as Array<{ pontos?: unknown; subitens?: Array<unknown> }>,
            ci,
          );
          const existing = entregaMap.get(`${ci}:null`);

          if (existing) {
            if (existing.status !== ChecklistItemStatus.APROVADO) {
              await tx.checklistItemEntrega.update({
                where: { id: existing.id },
                data: {
                  status: ChecklistItemStatus.APROVADO,
                  avaliadoPorId: reviewerId,
                  dataAvaliacao: now,
                  pontosAtribuidos: pts,
                },
              });
              pointsByUser[existing.executorId] = (pointsByUser[existing.executorId] || 0) + pts;
            }
          } else {
            await tx.checklistItemEntrega.create({
              data: {
                etapaId: id,
                checklistIndex: ci,
                subitemIndex: null,
                descricao: 'Aprovado automaticamente via entrega da etapa',
                status: ChecklistItemStatus.APROVADO,
                executorId: entregaPendente.executorId,
                avaliadoPorId: reviewerId,
                dataAvaliacao: now,
                pontosAtribuidos: pts,
              } as any,
            });
            pointsByUser[entregaPendente.executorId] =
              (pointsByUser[entregaPendente.executorId] || 0) + pts;
          }
          item.concluido = true;
        }
      }

      for (const [uid, pts] of Object.entries(pointsByUser)) {
        if (pts > 0) {
          await tx.usuario.update({
            where: { id: Number(uid) },
            data: { pontosTarefas: { increment: pts } },
          });
        }
      }

      await tx.etapa.update({
        where: { id },
        data: {
          status: EtapaStatus.APROVADA,
          checklistJson: checklist as any,
        },
      });
    });

    const updated = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: true,
        subetapas: true,
        executor: true,
        integrantes: { include: { usuario: true } },
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: { executor: true, avaliadoPor: true },
        },
      },
    });

    if (updated) {
      await this.updateProjetoStatus(updated.projetoId);
    }

    return updated;
  }

  async reject(id: number, reviewerId: number, reason?: string) {
    const etapa = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: {
          include: {
            supervisor: true,
            responsaveis: { include: { usuario: true } },
          },
        },
        responsavel: true,
        entregas: {
          where: { status: EtapaEntregaStatus.EM_ANALISE },
          orderBy: { dataEnvio: 'desc' },
        },
      },
    });

    if (!etapa) {
      throw new NotFoundException('Etapa não encontrada');
    }

    const rejectPerms = await this.getUserPermissionKeys(reviewerId);
    {
      const userExists = await this.prisma.usuario.findUnique({ where: { id: reviewerId }, select: { id: true } });
      if (!userExists) throw new NotFoundException('Usuário não encontrado');
    }
    if (!canUserReviewDeliveriesInEtapaContext(reviewerId, rejectPerms, etapa)) {
      throw new ForbiddenException(
        'Sem permissão para reprovar entregas desta etapa. É necessário ser supervisor, responsável ou ter permissão de avaliação com escopo adequado.',
      );
    }

    const entregaPendente = etapa.entregas[0];

    if (!entregaPendente) {
      throw new BadRequestException('Não há entrega pendente de análise para esta etapa');
    }

    this.assertReviewerNotOwnDelivery(reviewerId, entregaPendente.executorId, rejectPerms);

    await this.prisma.$transaction(async (tx) => {
      await tx.etapaEntrega.update({
        where: { id: entregaPendente.id },
        data: {
          status: EtapaEntregaStatus.RECUSADA,
          comentario: reason?.trim() || null,
          avaliadoPorId: reviewerId,
          dataAvaliacao: new Date(),
        },
      });

      await tx.etapa.update({
        where: { id },
        data: {
          status: EtapaStatus.REPROVADA,
        },
      });
    });

    const updated = await this.prisma.etapa.findUnique({
      where: { id },
      include: {
        projeto: true,
        subetapas: true,
        executor: true,
        integrantes: { include: { usuario: true } },
        entregas: {
          orderBy: { dataEnvio: 'desc' },
          include: { executor: true, avaliadoPor: true },
        },
      },
    });

    if (updated) {
      await this.updateProjetoStatus(updated.projetoId);
    }

    return updated;
  }

  private async deleteFilesFromStorage(urls: string[] | null | undefined) {
    if (!urls || !Array.isArray(urls)) {
      return;
    }

    for (const url of urls) {
      if (!url || typeof url !== 'string') {
        continue;
      }

      // Só tentar remover arquivos locais do diretório /uploads
      if (!url.startsWith('/uploads/')) {
        continue;
      }

      const relativePath = url.replace(/^\/+/, '');
      const absolutePath = join(process.cwd(), relativePath);

      try {
        await fs.promises.stat(absolutePath);
      } catch {
        // Arquivo já não existe mais
        continue;
      }

      try {
        await fs.promises.unlink(absolutePath);
      } catch (error) {
        this.logger.warn(`Falha ao excluir arquivo de upload "${absolutePath}": ${error}`);
      }
    }
  }

  private async updateProjetoStatus(projetoId: number) {
    const etapas = await this.prisma.etapa.findMany({
      where: { projetoId },
      select: { 
        status: true,
        valorInsumos: true,
      },
    });

    if (etapas.length === 0) {
      // Se não houver etapas, definir valorInsumos como 0
      await this.prisma.projeto.update({
        where: { id: projetoId },
        data: { valorInsumos: 0 },
      });
      return;
    }

    const total = etapas.length;
    const concluidas = etapas.filter((etapa) => {
      const status = etapa.status as EtapaStatus;
      return status === EtapaStatus.EM_ANALISE || status === EtapaStatus.APROVADA;
    }).length;
    const emAndamento = etapas.filter((etapa) => etapa.status === EtapaStatus.EM_ANDAMENTO).length;

    // Calcular valorInsumos como soma das etapas
    const valorInsumosCalculado = etapas.reduce((sum, etapa) => {
      return sum + (etapa.valorInsumos || 0);
    }, 0);

    let novoStatus: ProjetoStatus = ProjetoStatus.EM_ANDAMENTO;

    if (concluidas === total) {
      novoStatus = ProjetoStatus.FINALIZADO;
    } else if (concluidas === 0 && emAndamento === 0) {
      // Nenhuma etapa iniciada: manter EM_ANDAMENTO apenas se já houver etapas cadastradas
      novoStatus = ProjetoStatus.EM_ANDAMENTO;
    } else {
      novoStatus = ProjetoStatus.EM_ANDAMENTO;
    }

    await this.prisma.projeto.update({
      where: { id: projetoId },
      data: { 
        status: novoStatus,
        valorInsumos: valorInsumosCalculado,
      },
    });
  }

  async createSubtask(data: CreateSubtaskDto) {
    await this.ensureTaskExists(data.etapaId);

    return this.prisma.subetapa.create({
      data: {
        nome: data.nome,
        descricao: data.descricao,
        status: data.status ?? SubetapaStatus.PENDENTE,
        dataInicio: data.dataInicio ? new Date(data.dataInicio) : undefined,
        dataFim: data.dataFim ? new Date(data.dataFim) : undefined,
        etapa: { connect: { id: data.etapaId } },
      },
    });
  }

  async updateSubtask(id: number, data: UpdateSubtaskDto) {
    await this.ensureSubtaskExists(id);

    const payload: any = { ...data };
    if ('dataInicio' in data && data.dataInicio) {
      payload.dataInicio = new Date(data.dataInicio);
    }
    if ('dataFim' in data && data.dataFim) {
      payload.dataFim = new Date(data.dataFim);
    }

    return this.prisma.subetapa.update({ where: { id }, data: payload });
  }

  async remove(id: number, actor: ProjectAccessActor) {
    const etapa = await this.findOne(id);
    await assertCanAccessProjeto(this.prisma, etapa.projetoId, actor);

    const projetoRow = await this.prisma.projeto.findUnique({
      where: { id: etapa.projetoId },
      select: { nome: true },
    });
    const projetoNome = projetoRow?.nome ?? 'Projeto';

    // Remover entregas do checklist antes de apagar a etapa:
    // - reverte pontos creditados (CASCADE no DB não faz isso);
    // - garante que não restem linhas em ChecklistItemEntrega mesmo se o FK no banco estiver ausente.
    const entregasChecklist = etapa.checklistEntregas ?? [];
    for (const row of entregasChecklist) {
      await this.revertPointsAndDeleteEntrega({
        id: row.id,
        status: row.status as string,
        pontosAtribuidos: row.pontosAtribuidos ?? null,
        executorId: row.executorId,
      });
    }

    // Entregas “gerais” da etapa (modelo EtapaEntrega) e notificações vinculadas à etapa
    await this.prisma.etapaEntrega.deleteMany({ where: { etapaId: id } });
    await this.prisma.notificacao.deleteMany({ where: { etapaId: id } });

    await this.prisma.etapa.delete({
      where: { id },
    });

    // Atualizar status do projeto após deletar a etapa
    await this.updateProjetoStatus(etapa.projetoId);

    const detalhesRemocao = [
      `• Etapa removida: "${etapa.nome ?? 'etapa'}" (id ${id})`,
      `• Status antes da exclusão: ${statusEtapaLabel(etapa.status)}`,
      (etapa as any).executor?.nome
        ? `• Executor: ${(etapa as any).executor.nome} (id ${etapa.executorId})`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: etapa.projetoId,
      projetoNome,
      acaoResumo: `etapa excluída (${etapa.nome ?? 'etapa'})`,
      detalhes: detalhesRemocao,
    });

    return { message: 'Etapa deletada com sucesso' };
  }

  async deleteSubtask(id: number) {
    await this.ensureSubtaskExists(id);
    await this.prisma.subetapa.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureProjectExists(id: number) {
    const project = await this.prisma.projeto.findUnique({ where: { id } });
    if (!project) {
      throw new BadRequestException('Projeto não encontrado');
    }
  }

  private async ensureUserExists(id: number) {
    const user = await this.prisma.usuario.findUnique({ where: { id } });
    if (!user) {
      throw new BadRequestException('Usuário informado não existe');
    }
  }

  private async ensureSetorExists(id: number) {
    const setor = await this.prisma.setor.findUnique({ where: { id } });
    if (!setor) {
      throw new BadRequestException('Setor informado não existe');
    }
  }

  private async ensureTaskExists(id: number) {
    const task = await this.prisma.etapa.findUnique({ where: { id } });
    if (!task) {
      throw new BadRequestException('Etapa não encontrada');
    }
  }

  private async ensureSubtaskExists(id: number) {
    const subtask = await this.prisma.subetapa.findUnique({ where: { id } });
    if (!subtask) {
      throw new BadRequestException('Subetapa não encontrada');
    }
  }
}
