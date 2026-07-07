import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChecklistItemStatus, EtapaEntregaStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  canAccessProjectBySupervisorRule,
  hasGlobalProjectsAccess,
  type ProjectAccessActor,
  userSupervisesProject,
} from './project-scope.util';
import {
  isChecklistIndexVisibleToUser,
  type EtapaChecklistVisibilityInput,
} from './checklist-visibility.util';

export const PERM_TRABALHOS_AVALIAR = 'trabalhos:avaliar';
export const PERM_PROJETOS_APROVAR = 'projetos:aprovar';
export const PERM_PROJETOS_APROVAR_ENTREGA_TERCEIROS = 'projetos:aprovar_entrega_terceiros';
export const PERM_SISTEMA_ADMIN = 'sistema:administrar';

function toPermSet(permissions: Set<string> | string[]): Set<string> {
  return permissions instanceof Set ? permissions : new Set(permissions);
}

/** Permissões que habilitam avaliar entregas (checklist ou etapa), com escopo definido em `canUserReviewDeliveriesInEtapaContext`. */
export function reviewerHasDeliveryApprovalPerm(permissions: Set<string> | string[]): boolean {
  const perms = toPermSet(permissions);
  return (
    perms.has(PERM_TRABALHOS_AVALIAR) ||
    perms.has(PERM_PROJETOS_APROVAR) ||
    perms.has(PERM_PROJETOS_APROVAR_ENTREGA_TERCEIROS) ||
    perms.has(PERM_SISTEMA_ADMIN)
  );
}

export type EtapaDeliveryReviewContext = {
  responsavelId?: number | null;
  responsavel?: { id?: number } | null;
  projeto?: {
    supervisorId?: number | null;
    supervisor?: { id?: number } | null;
    responsaveis?: Array<{ usuario: { id: number } } | { usuarioId: number }>;
  } | null;
};

/**
 * Quem pode aprovar/reprovar entregas nesta etapa:
 * - Admin do sistema
 * - Visão global de projetos + permissão de avaliação (diretores / gestores)
 * - Supervisor do projeto (mesmo sem permissão explícita, alinhado à API legada)
 * - Responsável da etapa, com permissão de avaliação
 */
export function canUserReviewDeliveriesInEtapaContext(
  userId: number,
  permissions: Set<string> | string[],
  ctx: EtapaDeliveryReviewContext,
): boolean {
  const perms = toPermSet(permissions);
  const uid = Number(userId);

  if (perms.has(PERM_SISTEMA_ADMIN)) return true;

  const projeto = ctx.projeto;
  const supervisorId = projeto?.supervisor?.id ?? projeto?.supervisorId ?? null;
  if (userSupervisesProject(uid, supervisorId)) return true;

  if (hasGlobalProjectsAccess([...perms]) && reviewerHasDeliveryApprovalPerm(perms)) {
    return true;
  }

  if (!reviewerHasDeliveryApprovalPerm(perms)) return false;

  const respEtapaId = ctx.responsavelId ?? ctx.responsavel?.id;
  if (respEtapaId != null && Number(respEtapaId) === uid) {
    return true;
  }

  return false;
}

/**
 * Avaliador vê todas as linhas do checklist da etapa (supervisor, visão global ou resp. da etapa).
 * Quem não tem esse papel só vê pendências nas linhas atribuídas a ele (integrante / integrantesIds).
 */
export function reviewerHasFullChecklistLineAccess(
  userId: number,
  permissions: Set<string> | string[],
  etapa: EtapaChecklistVisibilityInput,
  projeto: {
    supervisorId?: number | null;
    responsaveis?: Array<{ usuarioId: number }>;
  },
): boolean {
  const perms = toPermSet(permissions);
  const uid = Number(userId);

  if (perms.has(PERM_SISTEMA_ADMIN)) return true;
  if (userSupervisesProject(uid, projeto.supervisorId)) return true;
  if (hasGlobalProjectsAccess([...perms]) && reviewerHasDeliveryApprovalPerm(perms)) return true;

  if (!reviewerHasDeliveryApprovalPerm(perms)) return false;

  if (etapa.responsavelId != null && Number(etapa.responsavelId) === uid) return true;

  return false;
}

/** Entrega entra na fila de análise (exclui auto-aprovação, exceto admin do sistema). */
export function deliveryCountsAsPendingForReviewer(
  actorUserId: number,
  executorId: number | null | undefined,
  permissions: Set<string> | string[],
): boolean {
  if (executorId == null) return true;
  if (Number(executorId) !== Number(actorUserId)) return true;
  return toPermSet(permissions).has(PERM_SISTEMA_ADMIN);
}

export function isChecklistDeliveryVisibleInReviewQueue(
  checklistIndex: number,
  actor: ProjectAccessActor,
  etapa: EtapaChecklistVisibilityInput,
  projeto: {
    supervisorId?: number | null;
    responsaveis?: Array<{ usuarioId: number }>;
  },
): boolean {
  if (reviewerHasFullChecklistLineAccess(actor.userId, actor.permissions, etapa, projeto)) {
    return true;
  }
  return isChecklistIndexVisibleToUser(checklistIndex, etapa, actor.userId);
}

/** Usuário pode ter fila de entregas em análise (supervisor, responsável com permissão ou visão global). */
export function userCanAccessDeliveryReviewQueue(permissions: string[]): boolean {
  const perms = toPermSet(permissions);
  if (perms.has(PERM_SISTEMA_ADMIN)) return true;
  if (hasGlobalProjectsAccess(permissions) && reviewerHasDeliveryApprovalPerm(perms)) return true;
  if (reviewerHasDeliveryApprovalPerm(perms)) return true;
  if (
    perms.has('projetos:visualizar') ||
    perms.has('projetos:editar') ||
    perms.has('projetos:aprovar')
  ) {
    return true;
  }
  return false;
}

/** Projetos cuja fila de entregas em análise o usuário pode ver (alinhado a quem pode abrir/avaliar). */
export function buildProjetoWhereForDeliveryReviewQueue(actor: ProjectAccessActor): Prisma.ProjetoWhereInput {
  const perms = new Set(actor.permissions);
  if (hasGlobalProjectsAccess(actor.permissions) && reviewerHasDeliveryApprovalPerm(perms)) {
    return {};
  }
  if (reviewerHasDeliveryApprovalPerm(perms)) {
    return {
      OR: [
        { supervisorId: actor.userId },
        { responsaveis: { some: { usuarioId: actor.userId } } },
        { etapas: { some: { responsavelId: actor.userId } } },
        {
          etapas: {
            some: { integrantes: { some: { usuarioId: actor.userId } } },
          },
        },
      ],
    };
  }
  return { supervisorId: actor.userId };
}

/**
 * Leitura do projeto para avaliar entrega (popup / GET :id).
 * Mais amplo que `assertCanAccessProjeto` (edição): inclui responsável da etapa com permissão de avaliação.
 */
export async function assertCanReadProjetoForDelivery(
  prisma: PrismaService,
  projetoId: number,
  actor: ProjectAccessActor,
): Promise<{ nome: string; supervisorId: number | null }> {
  const p = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: {
      id: true,
      nome: true,
      supervisorId: true,
    },
  });
  if (!p) throw new NotFoundException('Projeto não encontrado');

  if (canAccessProjectBySupervisorRule(actor.userId, actor.permissions, p.supervisorId)) {
    return { nome: p.nome, supervisorId: p.supervisorId };
  }

  const perms = new Set(actor.permissions);
  if (!reviewerHasDeliveryApprovalPerm(perms)) {
    throw new ForbiddenException('Você só pode acessar projetos dos quais é supervisor.');
  }

  const etapaComPapel = await prisma.etapa.findFirst({
    where: { projetoId, responsavelId: actor.userId },
    select: { id: true },
  });
  if (etapaComPapel) {
    return { nome: p.nome, supervisorId: p.supervisorId };
  }

  throw new ForbiddenException(
    'Você só pode avaliar entregas em projetos em que é supervisor, responsável do projeto ou responsável da etapa.',
  );
}

/** Contexto mínimo do projeto para checar se há entrega em análise que o usuário pode avaliar. */
export async function actorHasReviewableDeliveryInProjeto(
  prisma: PrismaService,
  projetoId: number,
  actor: ProjectAccessActor,
): Promise<boolean> {
  const perms = new Set(actor.permissions);
  const etapas = await prisma.etapa.findMany({
    where: { projetoId },
    select: {
      responsavelId: true,
      projeto: {
        select: {
          supervisorId: true,
          supervisor: { select: { id: true } },
          responsaveis: { include: { usuario: { select: { id: true } } } },
        },
      },
      checklistEntregas: {
        where: { status: ChecklistItemStatus.EM_ANALISE },
        select: { executorId: true },
      },
      entregas: {
        where: { status: EtapaEntregaStatus.EM_ANALISE },
        select: { executorId: true },
      },
    },
  });

  for (const e of etapas) {
    const hasForeignChecklist = e.checklistEntregas.some((ce) =>
      deliveryCountsAsPendingForReviewer(actor.userId, ce.executorId, perms),
    );
    const hasForeignEtapa = e.entregas.some((en) =>
      deliveryCountsAsPendingForReviewer(actor.userId, en.executorId, perms),
    );
    if (!hasForeignChecklist && !hasForeignEtapa) continue;

    if (
      canUserReviewDeliveriesInEtapaContext(actor.userId, perms, {
        responsavelId: e.responsavelId,
        projeto: e.projeto,
      })
    ) {
      return true;
    }
  }
  return false;
}
