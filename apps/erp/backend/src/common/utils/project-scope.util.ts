import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificacaoTipo, RequerimentoTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const PERM_PROJETOS_VER_TODOS = 'projetos:ver_todos';
export const PERM_SISTEMA_ADMIN = 'sistema:administrar';

/** Usuário autenticado com permissões do JWT (login). */
export type ProjectAccessActor = { userId: number; permissions: string[] };

export function hasGlobalProjectsAccess(permissions: string[] | undefined): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(PERM_SISTEMA_ADMIN) || permissions.includes(PERM_PROJETOS_VER_TODOS);
}

export function userSupervisesProject(userId: number, supervisorId: number | null | undefined): boolean {
  if (supervisorId == null) return false;
  return Number(supervisorId) === Number(userId);
}

/** Ver todos / admin OU supervisor do projeto. */
export function canAccessProjectBySupervisorRule(
  userId: number,
  permissions: string[],
  supervisorId: number | null | undefined,
): boolean {
  if (hasGlobalProjectsAccess(permissions)) return true;
  return userSupervisesProject(userId, supervisorId);
}

export async function assertCanAccessProjeto(
  prisma: PrismaService,
  projetoId: number,
  actor: ProjectAccessActor,
): Promise<{ nome: string; supervisorId: number | null }> {
  const p = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { id: true, nome: true, supervisorId: true },
  });
  if (!p) throw new NotFoundException('Projeto não encontrado');
  if (!canAccessProjectBySupervisorRule(actor.userId, actor.permissions, p.supervisorId)) {
    throw new ForbiddenException('Você só pode acessar projetos dos quais é supervisor.');
  }
  return { nome: p.nome, supervisorId: p.supervisorId };
}

/** Quem deve receber alerta de alteração feita por supervisor: visão global de projetos ou admin do sistema. */
async function findUserIdsForProjectChangeAlerts(prisma: PrismaService): Promise<number[]> {
  const rows = await prisma.usuario.findMany({
    where: {
      ativo: true,
      cargo: {
        permissions: {
          some: {
            OR: [
              { permission: { modulo: 'projetos', acao: 'ver_todos' } },
              { permission: { modulo: 'sistema', acao: 'administrar' } },
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Janela para agrupar várias alterações do mesmo supervisor no mesmo projeto em 1 requerimento. */
const SUPERVISOR_CHANGE_BATCH_MS = 20000;
const REQUERIMENTO_TEXTO_MAX = 8000;
const NOTIF_MENSAGEM_MAX = 500;

type SupervisorChangeEntry = {
  acaoResumo: string;
  detalhes?: string;
};

type SupervisorChangeBatch = {
  prisma: PrismaService;
  actor: ProjectAccessActor;
  projetoId: number;
  projetoNome: string;
  changes: SupervisorChangeEntry[];
  timer: ReturnType<typeof setTimeout>;
};

const supervisorChangeBatches = new Map<string, SupervisorChangeBatch>();

function supervisorChangeBatchKey(actorId: number, projetoId: number): string {
  return `${actorId}:${projetoId}`;
}

function buildConsolidatedSupervisorChangeCopy(
  nomeAutor: string,
  projetoId: number,
  projetoNome: string,
  changes: SupervisorChangeEntry[],
): { acaoResumo: string; detalhes: string; msg: string } {
  const n = changes.length;
  const acaoResumo =
    n === 1
      ? changes[0].acaoResumo
      : `${n} alterações no projeto (etapas e demais campos)`;

  const detalhesBlocks = changes.map((c, i) => {
    const titulo = n === 1 ? c.acaoResumo : `${i + 1}. ${c.acaoResumo}`;
    if (c.detalhes?.trim()) {
      return `${titulo}\n${c.detalhes.trim()}`;
    }
    return titulo;
  });

  let detalhes = detalhesBlocks.join('\n\n');
  const detalhesBudget = REQUERIMENTO_TEXTO_MAX - 600;
  if (detalhes.length > detalhesBudget) {
    detalhes = `${detalhes.slice(0, detalhesBudget).trimEnd()}\n\n… (detalhes truncados; abra o projeto para ver tudo).`;
  }

  const msg = `${nomeAutor} alterou o projeto "${projetoNome}": ${acaoResumo}.`;
  return { acaoResumo, detalhes, msg };
}

async function flushSupervisorChangeBatch(key: string): Promise<void> {
  const batch = supervisorChangeBatches.get(key);
  if (!batch) return;
  supervisorChangeBatches.delete(key);

  const { prisma, actor, projetoId, projetoNome, changes } = batch;
  if (changes.length === 0) return;

  const destinatarios = await findUserIdsForProjectChangeAlerts(prisma);
  if (destinatarios.length === 0) return;

  const nomeAutor =
    (await prisma.usuario.findUnique({
      where: { id: actor.userId },
      select: { nome: true },
    }))?.nome?.trim() || `Usuário #${actor.userId}`;

  const { detalhes, msg } = buildConsolidatedSupervisorChangeCopy(
    nomeAutor,
    projetoId,
    projetoNome,
    changes,
  );

  const dataFmt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  const tituloRequerimento =
    changes.length === 1
      ? 'Alteração em projeto (supervisionado)'
      : `Alterações em projeto (supervisionado) — ${changes.length} itens`;

  const textoRequerimento = [
    tituloRequerimento,
    '',
    msg,
    '',
    detalhes.trim() ? ['Detalhes das alterações:', detalhes, ''].join('\n') : '',
    `Projeto: #${projetoId} — ${projetoNome}`,
    '',
    dataFmt,
  ]
    .filter((line, idx, arr) => !(line === '' && idx > 0 && arr[idx - 1] === ''))
    .join('\n');

  const mensagemNotif =
    detalhes.trim().length > 0
      ? `${msg}\n${detalhes.slice(0, 350)}${detalhes.length > 350 ? '…' : ''}`
      : msg;

  const tituloNotif =
    changes.length === 1
      ? 'Alteração em projeto supervisionado'
      : `${changes.length} alterações em projeto supervisionado`;

  for (const uid of destinatarios) {
    if (uid === actor.userId) continue;
    try {
      const requerimento = await prisma.requerimento.create({
        data: {
          usuarioId: actor.userId,
          destinatarioId: uid,
          tipo: RequerimentoTipo.INFORMACAO,
          texto: textoRequerimento.slice(0, REQUERIMENTO_TEXTO_MAX),
          etapaId: null,
        },
      });

      await prisma.notificacao.create({
        data: {
          usuarioId: uid,
          titulo: tituloNotif,
          mensagem: mensagemNotif.slice(0, NOTIF_MENSAGEM_MAX),
          tipo: NotificacaoTipo.WARNING,
          requerimentoId: requerimento.id,
        },
      });
    } catch {
      /* não bloquear operação principal */
    }
  }
}

/**
 * Quem tem visão global já vê tudo; supervisores sem `projetos:ver_todos` disparam aviso
 * para usuários com `projetos:ver_todos` ao alterarem um projeto que supervisionam.
 *
 * Várias alterações seguidas no mesmo projeto são agrupadas em um único requerimento
 * (janela de ~5s), evitando uma notificação por etapa/campo editado.
 */
export async function notifyProjetosVerTodosAboutSupervisorChange(
  prisma: PrismaService,
  opts: {
    actor: ProjectAccessActor;
    projetoId: number;
    projetoNome: string;
    acaoResumo: string;
    /** Linhas explicando o que mudou (ex.: bullets • campo: "antes" → "depois"). */
    detalhes?: string;
  },
): Promise<void> {
  if (hasGlobalProjectsAccess(opts.actor.permissions)) return;

  const row = await prisma.projeto.findUnique({
    where: { id: opts.projetoId },
    select: { supervisorId: true },
  });
  if (!row?.supervisorId || Number(row.supervisorId) !== Number(opts.actor.userId)) {
    return;
  }

  const key = supervisorChangeBatchKey(opts.actor.userId, opts.projetoId);
  const entry: SupervisorChangeEntry = {
    acaoResumo: opts.acaoResumo,
    detalhes: opts.detalhes?.trim() || undefined,
  };

  const existing = supervisorChangeBatches.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.changes.push(entry);
    existing.timer = setTimeout(() => {
      void flushSupervisorChangeBatch(key);
    }, SUPERVISOR_CHANGE_BATCH_MS);
    return;
  }

  supervisorChangeBatches.set(key, {
    prisma,
    actor: opts.actor,
    projetoId: opts.projetoId,
    projetoNome: opts.projetoNome,
    changes: [entry],
    timer: setTimeout(() => {
      void flushSupervisorChangeBatch(key);
    }, SUPERVISOR_CHANGE_BATCH_MS),
  });
}
