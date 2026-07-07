import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  actorHasReviewableDeliveryInProjeto,
  assertCanReadProjetoForDelivery,
  buildProjetoWhereForDeliveryReviewQueue,
  canUserReviewDeliveriesInEtapaContext,
  deliveryCountsAsPendingForReviewer,
  isChecklistDeliveryVisibleInReviewQueue,
  userCanAccessDeliveryReviewQueue,
} from '../../common/utils/delivery-review.util';
import {
  assertCanAccessProjeto,
  hasGlobalProjectsAccess,
  notifyProjetosVerTodosAboutSupervisorChange,
  type ProjectAccessActor,
} from '../../common/utils/project-scope.util';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateResponsiblesDto } from './dto/update-responsibles.dto';
import { ReorderEtapasDto } from './dto/reorder-etapas.dto';
import { DeleteAbaDto, RenameAbaDto } from './dto/update-aba.dto';
import { CreateSessaoDto } from './dto/create-sessao.dto';
import { UpdateSessaoDto } from './dto/update-sessao.dto';
import {
  ChecklistItemStatus,
  EtapaEntregaStatus,
  EtapaStatus,
  ProjetoStatus,
  NotificacaoTipo,
  RequerimentoTipo,
  Prisma,
} from '@prisma/client';
import * as fs from 'fs';
import { join } from 'path';
import { TasksService } from '../tasks/tasks.service';
import {
  buildEtapaProgressMetrics,
  computeProjectProgressPercent,
} from '../../common/utils/checklist-progress.util';
import {
  buildProjetoDiffLines,
  fmtMoedaPt,
  projetoRowToSnapshot,
  statusProjetoLabel,
} from '../../common/utils/project-change-report.util';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Lista projetos para selects (compra, vínculos, etc.).
   * `todas=true` só é honrado quando o usuário tem acesso global (projetos:ver_todos ou
   * sistema:administrar); caso contrário retorna apenas projetos nos quais o usuário é
   * supervisor, responsável ou integrante de etapa.
   */
  async listOptions(actor: ProjectAccessActor, todas?: boolean) {
    if (hasGlobalProjectsAccess(actor.permissions)) {
      return this.prisma.projeto.findMany({
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      });
    }

    if (todas) {
      // Usuário pediu "todas" mas não tem acesso global — ignora silenciosamente
      // e cai na query filtrada abaixo.
    }

    // Retorna apenas projetos em que o usuário tem algum papel.
    return this.prisma.projeto.findMany({
      where: {
        OR: [
          { supervisorId: actor.userId },
          { responsaveis: { some: { usuarioId: actor.userId } } },
          { etapas: { some: { responsavelId: actor.userId } } },
          { etapas: { some: { integrantes: { some: { usuarioId: actor.userId } } } } },
          { etapas: { some: { executorId: actor.userId } } },
        ],
      },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  /** Rótulo legível da linha do checklist (tarefa ou subtarefa) para listagens. */
  private checklistLineLabelFromJson(
    checklistJson: unknown,
    checklistIndex: number,
    subitemIndex: number | null,
  ): string {
    const list = Array.isArray(checklistJson) ? checklistJson : [];
    const raw = list[checklistIndex] as
      | { texto?: unknown; subitens?: Array<{ texto?: unknown }> }
      | undefined;
    if (!raw) return `Tarefa ${checklistIndex + 1}`;
    if (subitemIndex != null) {
      const sub = raw.subitens?.[subitemIndex];
      const st = sub && typeof sub.texto === 'string' ? sub.texto.trim() : '';
      return st || `Subtarefa ${checklistIndex + 1}.${subitemIndex + 1}`;
    }
    const t = typeof raw.texto === 'string' ? raw.texto.trim() : '';
    return t || `Tarefa ${checklistIndex + 1}`;
  }

  /**
   * Etapas em análise (entrega de tarefa/subtarefa ou entrega geral da etapa aguardando avaliação),
   * agrupadas por projeto. Escopo conforme permissões: visão global, supervisão ou responsável no projeto.
   */
  async findTasksEmAnaliseByProject(actor: ProjectAccessActor) {
    if (!userCanAccessDeliveryReviewQueue(actor.permissions)) {
      return [];
    }

    const perms = new Set(actor.permissions);
    const projetoWhere = buildProjetoWhereForDeliveryReviewQueue(actor);

    const etapas = await this.prisma.etapa.findMany({
      where: {
        OR: [
          { status: EtapaStatus.EM_ANALISE },
          {
            checklistEntregas: {
              some: { status: ChecklistItemStatus.EM_ANALISE },
            },
          },
        ],
        projeto: projetoWhere,
      },
      orderBy: [{ projetoId: 'asc' }, { ordem: 'asc' }],
      include: {
        projeto: {
          select: {
            id: true,
            nome: true,
            supervisorId: true,
            supervisor: { select: { id: true } },
            responsaveis: { include: { usuario: { select: { id: true } } } },
          },
        },
        executor: { select: { id: true, nome: true } },
        sessao: { select: { id: true, nome: true } },
        integrantes: {
          select: { usuarioId: true, checklistItemIndices: true },
        },
        checklistEntregas: {
          where: { status: ChecklistItemStatus.EM_ANALISE },
          include: { executor: { select: { id: true, nome: true } } },
          orderBy: { dataEnvio: 'asc' },
        },
        entregas: {
          where: { status: EtapaEntregaStatus.EM_ANALISE },
          include: { executor: { select: { id: true, nome: true } } },
          orderBy: { dataEnvio: 'asc' },
        },
      },
    });

    const byProj = new Map<
      number,
      {
        projeto: { id: number; nome: string; supervisorId: number | null };
        etapas: Array<{
          id: number;
          nome: string;
          ordem: number;
          aba: string | null;
          sessaoNome: string | null;
          executor: { id: number; nome: string };
          pendenciasChecklist: Array<{
            checklistIndex: number;
            subitemIndex: number | null;
            textoLinha: string;
            dataEnvio: string;
            executor: { id: number; nome: string };
          }>;
          pendenciasEtapaEntrega: Array<{
            id: number;
            dataEnvio: string;
            executor: { id: number; nome: string };
          }>;
        }>;
      }
    >();

    for (const e of etapas) {
      if (
        !canUserReviewDeliveriesInEtapaContext(actor.userId, perms, {
          responsavelId: e.responsavelId,
          projeto: e.projeto,
        })
      ) {
        continue;
      }

      const pid = e.projeto.id;
      if (!byProj.has(pid)) {
        byProj.set(pid, {
          projeto: {
            id: e.projeto.id,
            nome: e.projeto.nome,
            supervisorId: e.projeto.supervisorId ?? null,
          },
          etapas: [],
        });
      }
      const projetoCtx = {
        supervisorId: e.projeto.supervisorId,
        responsaveis: e.projeto.responsaveis?.map((r) => ({
          usuarioId: r.usuario.id,
        })),
      };
      const etapaVis = {
        executorId: e.executorId,
        responsavelId: e.responsavelId,
        checklistJson: e.checklistJson,
        integrantes: e.integrantes,
      };

      const pendenciasChecklist = e.checklistEntregas
        .filter(
          (ce) =>
            deliveryCountsAsPendingForReviewer(actor.userId, ce.executorId, perms) &&
            isChecklistDeliveryVisibleInReviewQueue(ce.checklistIndex, actor, etapaVis, projetoCtx),
        )
        .map((ce) => ({
          checklistIndex: ce.checklistIndex,
          subitemIndex: ce.subitemIndex,
          textoLinha: this.checklistLineLabelFromJson(e.checklistJson, ce.checklistIndex, ce.subitemIndex),
          dataEnvio: ce.dataEnvio.toISOString(),
          executor: { id: ce.executor.id, nome: ce.executor.nome },
        }));
      const pendenciasEtapaEntrega = e.entregas
        .filter((en) => deliveryCountsAsPendingForReviewer(actor.userId, en.executorId, perms))
        .map((en) => ({
          id: en.id,
          dataEnvio: en.dataEnvio.toISOString(),
          executor: { id: en.executor.id, nome: en.executor.nome },
        }));

      if (pendenciasChecklist.length === 0 && pendenciasEtapaEntrega.length === 0) {
        continue;
      }

      byProj.get(pid)!.etapas.push({
        id: e.id,
        nome: e.nome,
        ordem: e.ordem,
        aba: e.aba,
        sessaoNome: e.sessao?.nome ?? null,
        executor: { id: e.executor.id, nome: e.executor.nome },
        pendenciasChecklist,
        pendenciasEtapaEntrega,
      });
    }

    const grupos = Array.from(byProj.values()).filter((g) => g.etapas.length > 0);

    if (projetoWhere && Object.keys(projetoWhere).length === 0) {
      const filtrados: typeof grupos = [];
      for (const g of grupos) {
        const pode = await actorHasReviewableDeliveryInProjeto(this.prisma, g.projeto.id, actor);
        if (pode) filtrados.push(g);
      }
      return filtrados;
    }

    return grupos;
  }

  async findAll(params: { status?: ProjetoStatus; search?: string }, actor: ProjectAccessActor) {
    const where: Record<string, unknown> = {};

    if (!hasGlobalProjectsAccess(actor.permissions)) {
      where.supervisorId = actor.userId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.nome = { 
        contains: params.search,
        mode: 'insensitive' as any, // Prisma PostgreSQL suporta insensitive
      };
    }

    const projects = await this.prisma.projeto.findMany({
      where,
      orderBy: { dataCriacao: 'desc' },
      include: {
        supervisor: { include: { cargo: true } },
        setores: { select: { id: true, nome: true } },
        responsaveis: { include: { usuario: { include: { cargo: true } } } },
        responsaveisExcluidos: { select: { usuarioId: true } },
        _count: { select: { etapas: true } },
        etapas: {
          orderBy: { ordem: 'asc' } as any,
          select: {
            id: true,
            status: true,
            dataFim: true,
            executorId: true,
            responsavelId: true,
            valorInsumos: true,
            integrantes: {
              select: {
                usuarioId: true,
              },
            },
          },
        },
      } as any,
    });

    // Atualizar status do projeto no banco se necessário e calcular progresso
    const updatedProjects = await Promise.all(
      projects.map(async (row) => {
        const { etapas, ...project } = row as typeof row & { etapas: Array<{ id: number; status: string; valorInsumos: number }> };
        const totalEtapas = etapas.length;
        
        const etapasCompletas = await Promise.all(
          etapas.map(async (etapa) => {
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

        const checklistItensTotal = etapasCompletas.reduce((s, e) => s + e.checklistItensTotal, 0);
        const checklistItensConcluidos = etapasCompletas.reduce(
          (s, e) => s + e.checklistItensConcluidos,
          0,
        );
        const progress = computeProjectProgressPercent(etapasCompletas, totalEtapas);

        // Calcular valorInsumos como soma das etapas
        const valorInsumosCalculado = etapas.reduce((sum, etapa) => {
          return sum + (etapa.valorInsumos || 0);
        }, 0);

        let novoStatus = project.status;
        if (progress === 100 && totalEtapas > 0) {
          novoStatus = ProjetoStatus.FINALIZADO;
        } else if (totalEtapas > 0) {
          novoStatus = ProjetoStatus.EM_ANDAMENTO;
        }

        // Sincronizar status no banco se houver discrepância
        if (novoStatus !== project.status) {
          await this.prisma.projeto.update({
            where: { id: project.id },
            data: { status: novoStatus },
          });
        }

        // Atualizar valorInsumos no banco se houver discrepância
        if (valorInsumosCalculado !== project.valorInsumos) {
          await this.prisma.projeto.update({
            where: { id: project.id },
            data: { valorInsumos: valorInsumosCalculado },
          });
        }

        return {
          ...project,
          etapas,
          status: novoStatus,
          valorInsumos: valorInsumosCalculado,
          progress: progress, // Garantir que progress seja sempre incluído
          checklistItensTotal,
          checklistItensConcluidos,
        };
      }),
    );

    return updatedProjects;
  }

  async findOne(id: number, actor: ProjectAccessActor) {
    await assertCanReadProjetoForDelivery(this.prisma, id, actor);

    await this.tasksService.reconcileAllEtapasOfProjeto(id);

    const projectAfter = await this.prisma.projeto.findUnique({
      where: { id },
      include: {
        supervisor: { include: { cargo: true } },
        setores: { select: { id: true, nome: true } },
        responsaveis: { include: { usuario: { include: { cargo: true } } } },
        responsaveisExcluidos: { select: { usuarioId: true } },
        sessoes: { orderBy: { ordem: 'asc' } },
        etapas: {
          orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
          include: {
            sessao: true,
            executor: true,
            responsavel: true,
            integrantes: { include: { usuario: true } },
            subetapas: true,
            entregas: {
              orderBy: { dataEnvio: 'desc' },
              include: { executor: true, avaliadoPor: true },
            },
            checklistEntregas: {
              orderBy: { checklistIndex: 'asc' },
              include: {
                executor: true,
                avaliadoPor: true,
              },
            },
            setores: { select: { id: true, nome: true } },
          },
        },
        compras: {
          include: {
            etapa: true,
            setor: { select: { id: true, nome: true } },
            solicitadoPor: { include: { cargo: true } },
          },
        },
      } as any,
    });

    if (!projectAfter) {
      throw new NotFoundException('Projeto não encontrado');
    }

    // Calcular valorInsumos como soma das etapas
    const valorInsumosCalculado = (projectAfter as any).etapas.reduce((sum: number, etapa: any) => {
      return sum + (etapa.valorInsumos || 0);
    }, 0);

    // Atualizar valorInsumos no banco se houver discrepância
    if (valorInsumosCalculado !== projectAfter.valorInsumos) {
      await this.prisma.projeto.update({
        where: { id },
        data: { valorInsumos: valorInsumosCalculado },
      });
    }

    return {
      ...projectAfter,
      valorInsumos: valorInsumosCalculado,
    };
  }

  async create(data: CreateProjectDto, actor: ProjectAccessActor) {
    if (!hasGlobalProjectsAccess(actor.permissions)) {
      if (Number(data.supervisorId) !== Number(actor.userId)) {
        throw new BadRequestException(
          'Sem permissão para visualizar todos os projetos: você só pode criar projetos em que for o supervisor.',
        );
      }
    }

    const nomeTrim = data.nome?.trim();
    if (!nomeTrim) {
      throw new BadRequestException('Nome do projeto é obrigatório');
    }
    const existente = await this.prisma.projeto.findFirst({
      where: { nome: nomeTrim },
      select: { id: true },
    });
    if (existente) {
      throw new BadRequestException(`Já existe um projeto com o nome "${nomeTrim}". Projetos não podem ter o mesmo nome.`);
    }

    const payload: any = {
      nome: nomeTrim,
      resumo: data.resumo,
      objetivo: data.objetivo,
      descricaoLonga: data.descricaoLonga,
      descricaoArquivos: data.descricaoArquivos ?? null,
      valorTotal: data.valorTotal ?? 0,
      valorInsumos: 0, // Sempre inicia com 0, será calculado automaticamente quando houver etapas
      planilhaJson: data.planilhaJson ?? null,
    };

    const setorIdsToConnect =
      (Array.isArray(data.setorIds) ? data.setorIds : undefined) ??
      (typeof data.setorId !== 'undefined' && data.setorId ? [data.setorId] : []);

    const setorIdsUnique: number[] = Array.from(new Set(setorIdsToConnect)) as number[];
    if (setorIdsUnique.length > 0) {
      const setoresExistentes = await this.prisma.setor.findMany({
        where: { id: { in: setorIdsUnique } },
        select: { id: true },
      });
      if (setoresExistentes.length !== setorIdsUnique.length) {
        throw new BadRequestException('Um ou mais setores informados não existem');
      }

      payload.setores = { connect: setorIdsUnique.map((id) => ({ id })) };
    }

    if (data.supervisorId) {
      const supervisorExists = await this.prisma.usuario.findUnique({ where: { id: data.supervisorId } });
      if (!supervisorExists) {
        throw new BadRequestException('Supervisor informado não existe');
      }
      payload.supervisor = { connect: { id: data.supervisorId } };
    }

    const responsavelIdsDesired = Array.isArray(data.responsavelIds) ? Array.from(new Set(data.responsavelIds)) : [];

    if (responsavelIdsDesired.length > 0) {
      for (const usuarioId of responsavelIdsDesired) {
        if (!Number.isInteger(usuarioId) || usuarioId < 1) {
          throw new BadRequestException(`ID de usuário inválido: ${usuarioId}`);
        }
      }

      const usersExistentes = await this.prisma.usuario.findMany({
        where: { id: { in: responsavelIdsDesired } },
        select: { id: true },
      });

      if (usersExistentes.length !== responsavelIdsDesired.length) {
        throw new BadRequestException('Um ou mais usuários informados não existem');
      }
    }

    const autoMemberIds: number[] =
      setorIdsUnique.length > 0
        ? await this.prisma.setorUsuario
            .findMany({
              where: { setorId: { in: setorIdsUnique } },
              select: { usuarioId: true },
            })
            .then((rows: Array<{ usuarioId: number } | any>) =>
              Array.from(new Set(rows.map((r) => Number(r.usuarioId)))) as number[],
            )
        : [];

    const responsaveisAutoExcluidos = autoMemberIds.filter((id) => !responsavelIdsDesired.includes(id));

    const projeto = await this.prisma.projeto.create({
      data: payload,
      include: {
        supervisor: { include: { cargo: true } },
        setores: { select: { id: true, nome: true } },
      } as any,
    });

    await this.prisma.$transaction(async (tx) => {
      if (responsavelIdsDesired.length > 0) {
        await tx.projetoResponsavel.createMany({
          data: responsavelIdsDesired.map((usuarioId) => ({
            projetoId: projeto.id,
            usuarioId,
          })),
        });
      }

      if (responsaveisAutoExcluidos.length > 0) {
        await (tx as any).projetoResponsavelExcluido.createMany({
          data: responsaveisAutoExcluidos.map((usuarioId) => ({
            projetoId: projeto.id,
            usuarioId,
          })),
        });
      }
    });

    // Criar sessão e "aba" padrão (Geral) para novos projetos — não aplicar na importação
    await this.prisma.sessao.create({
      data: { projetoId: projeto.id, nome: 'Geral', ordem: 0 },
    });

    const pAny = projeto as any;
    const detalhesCriacao = [
      `• Nome: "${projeto.nome}"`,
      `• Valor total planejado: ${fmtMoedaPt(projeto.valorTotal ?? 0)}`,
      pAny.supervisor
        ? `• Supervisor: ${pAny.supervisor.nome} (id ${pAny.supervisor.id})`
        : '',
      Array.isArray(pAny.setores) && pAny.setores.length > 0
        ? `• Setores: ${pAny.setores.map((s: { nome: string }) => s.nome).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: projeto.id,
      projetoNome: projeto.nome,
      acaoResumo: 'projeto criado',
      detalhes: detalhesCriacao,
    });

    return this.findOne(projeto.id, actor);
  }

  async update(id: number, data: UpdateProjectDto, actor: ProjectAccessActor) {
    await assertCanAccessProjeto(this.prisma, id, actor);

    // Buscar projeto atual para comparar status
    const projetoAtual = await this.prisma.projeto.findUnique({
      where: { id },
      include: {
        supervisor: true,
        responsaveis: { include: { usuario: true } },
        setores: { select: { id: true, nome: true } },
      },
    });

    if (!projetoAtual) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const statusAnterior = projetoAtual.status;
    const novoStatus = data.status;

    // Preparar payload para o Prisma (campos básicos do projeto)
    const payload: any = {
      nome: data.nome,
      resumo: data.resumo,
      objetivo: data.objetivo,
      descricaoLonga: data.descricaoLonga,
      // descricaoArquivos agora é gerenciado pelos métodos específicos
      valorTotal: data.valorTotal,
      // valorInsumos não é mais editável, será calculado automaticamente
      status: data.status,
      planilhaJson: data.planilhaJson,
    };

    const setorIdsToSet =
      (Array.isArray((data as any).setorIds) ? (data as any).setorIds : undefined) ??
      (typeof data.setorId !== 'undefined' ? (data.setorId ? [data.setorId] : []) : undefined);

    if (typeof setorIdsToSet !== 'undefined') {
      const setorIdsUnique: number[] = Array.from(new Set(setorIdsToSet)) as number[];

      if (setorIdsUnique.length > 0) {
        const setoresExistentes = await this.prisma.setor.findMany({
          where: { id: { in: setorIdsUnique } },
          select: { id: true },
        });

        if (setoresExistentes.length !== setorIdsUnique.length) {
          throw new BadRequestException('Um ou mais setores informados não existem');
        }
      }

      payload.setores = { set: setorIdsUnique.map((id) => ({ id })) };
    }

    // Tratar supervisor (relação) - não pode ser removido, apenas alterado
    if (data.supervisorId !== undefined) {
      if (data.supervisorId === null || data.supervisorId === 0) {
        throw new BadRequestException('Supervisor é obrigatório e não pode ser removido');
      }
        const supervisorExists = await this.prisma.usuario.findUnique({ where: { id: data.supervisorId } });
        if (!supervisorExists) {
          throw new BadRequestException('Supervisor informado não existe');
        }
        payload.supervisor = { connect: { id: data.supervisorId } };
    }

    // Remover campos undefined do payload
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    if (payload.nome !== undefined && payload.nome !== projetoAtual.nome) {
      const nomeTrim = String(payload.nome).trim();
      const outro = await this.prisma.projeto.findFirst({
        where: { nome: nomeTrim, id: { not: id } },
        select: { id: true },
      });
      if (outro) {
        throw new BadRequestException(`Já existe um projeto com o nome "${nomeTrim}". Projetos não podem ter o mesmo nome.`);
      }
      payload.nome = nomeTrim;
    }

    const projetoAtualizado = await this.prisma.projeto.update({
      where: { id },
      data: payload,
      include: {
        supervisor: { include: { cargo: true } },
        responsaveis: { include: { usuario: { include: { cargo: true } } } },
        responsaveisExcluidos: { select: { usuarioId: true } },
        setores: { select: { id: true, nome: true } },
      } as any,
    });

    // Se o status mudou para FINALIZADO (aprovado), criar notificações e requerimentos
    if (novoStatus && novoStatus !== statusAnterior && novoStatus === ProjetoStatus.FINALIZADO) {
      await this.notificarAprovacaoReprovacao(projetoAtualizado, novoStatus);
    }

    let detalhesPatch = buildProjetoDiffLines(
      projetoRowToSnapshot(projetoAtual as any),
      projetoRowToSnapshot(projetoAtualizado as any),
    );
    if (!detalhesPatch.trim()) {
      detalhesPatch = '• Nenhum campo principal foi alterado (valores enviados iguais aos já salvos).';
    }

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: id,
      projetoNome: projetoAtualizado.nome,
      acaoResumo: 'dados do projeto atualizados',
      detalhes: detalhesPatch,
    });

    return projetoAtualizado;
  }

  private async notificarAprovacaoReprovacao(projeto: any, status: ProjetoStatus) {
    // FINALIZADO é considerado como aprovado
    const isAprovado = status === ProjetoStatus.FINALIZADO;
    const usuariosParaNotificar: number[] = [];

    // Adicionar supervisor se existir
    if (projeto.supervisor && projeto.supervisor.id) {
      usuariosParaNotificar.push(projeto.supervisor.id);
    }

    // Adicionar responsáveis
    if (projeto.responsaveis && Array.isArray(projeto.responsaveis)) {
      projeto.responsaveis.forEach((responsavel: any) => {
        if (responsavel.usuario && responsavel.usuario.id && !usuariosParaNotificar.includes(responsavel.usuario.id)) {
          usuariosParaNotificar.push(responsavel.usuario.id);
        }
      });
    }

    let remetenteSistemaId: number | null = null;
    const adminUser = await this.prisma.usuario.findFirst({
      where: {
        ativo: true,
        cargo: { permissions: { some: { permission: { modulo: 'sistema', acao: 'administrar' } } } },
      },
      orderBy: { id: 'asc' },
    });
    if (adminUser) {
      remetenteSistemaId = adminUser.id;
    }

    // Se não encontrar diretor, usar o primeiro usuário ativo (fallback)
    if (!remetenteSistemaId) {
      const usuarioFallback = await this.prisma.usuario.findFirst({
        where: { ativo: true },
        orderBy: { id: 'asc' },
      });
      if (usuarioFallback) {
        remetenteSistemaId = usuarioFallback.id;
      }
    }

    // Se ainda não houver remetente, não criar requerimentos (mas criar notificações)
    if (!remetenteSistemaId) {
      console.warn('Não foi possível encontrar um remetente para os requerimentos de aprovação/reprovação de projeto');
    }

    const statusLabel = isAprovado ? 'finalizado' : 'alterado';
    const titulo = `Projeto ${statusLabel}`;
    const mensagem = `O projeto "${projeto.nome}" foi ${statusLabel}.`;

    // Criar notificações e requerimentos para cada usuário
    for (const usuarioId of usuariosParaNotificar) {
      // Criar notificação
      await this.prisma.notificacao.create({
        data: {
          usuarioId,
          titulo,
          mensagem,
          tipo: NotificacaoTipo.INFO, // Sempre usar INFO ao invés de SUCCESS/WARNING
        },
      });

      // Criar requerimento do tipo INFORMACAO (sistema envia para o solicitante)
      // Só criar se o usuário estiver relacionado ao projeto (supervisor ou responsável)
      if (remetenteSistemaId) {
        try {
          const requerimento = await this.prisma.requerimento.create({
            data: {
              usuarioId: remetenteSistemaId, // Remetente: sistema (diretor/GM)
              destinatarioId: usuarioId, // Destinatário: solicitante
              tipo: RequerimentoTipo.INFORMACAO,
              texto: `O projeto "${projeto.nome}" foi ${statusLabel}.`,
              etapaId: null, // Não associar a etapa específica
            },
          });
          console.log(`Requerimento criado com sucesso: ID=${requerimento.id}, destinatarioId=${usuarioId}, remetenteId=${remetenteSistemaId}`);
        } catch (error) {
          console.error(`Erro ao criar requerimento para usuário ${usuarioId}:`, error);
        }
      } else {
        console.warn(`Não foi possível criar requerimento para usuário ${usuarioId}: remetenteSistemaId é null`);
      }
    }
  }

  async updateResponsibles(id: number, data: UpdateResponsiblesDto, actor: ProjectAccessActor) {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, id, actor);

    const respAntesRows = await this.prisma.projetoResponsavel.findMany({
      where: { projetoId: id },
      include: { usuario: { select: { nome: true } } },
    });
    const nomesResponsaveisAntes =
      respAntesRows
        .map((r) => r.usuario?.nome)
        .filter(Boolean)
        .sort()
        .join(', ') || '(nenhum)';

    const responsavelIdsDesired = Array.isArray(data.responsavelIds)
      ? Array.from(new Set(data.responsavelIds))
      : [];

    if (responsavelIdsDesired.length > 0) {
      for (const usuarioId of responsavelIdsDesired) {
        if (!Number.isInteger(usuarioId) || usuarioId < 1) {
          throw new BadRequestException(`ID de usuário inválido: ${usuarioId}`);
        }
      }

      const usersExistentes = await this.prisma.usuario.findMany({
        where: { id: { in: responsavelIdsDesired } },
        select: { id: true },
      });

      if (usersExistentes.length !== responsavelIdsDesired.length) {
        throw new NotFoundException('Um ou mais usuários informados não existem');
      }
    }

    const projetoAtual = await (this.prisma.projeto as any).findUnique({
      where: { id },
      select: { setores: { select: { id: true } } },
    });

    const setorIds = projetoAtual?.setores.map((s) => s.id) ?? [];

    const autoMemberIds: number[] =
      setorIds.length > 0
        ? await this.prisma.setorUsuario
            .findMany({
              where: { setorId: { in: setorIds } },
              select: { usuarioId: true },
            })
            .then((rows: Array<{ usuarioId: number } | any>) =>
              Array.from(new Set(rows.map((r) => Number(r.usuarioId)))) as number[],
            )
        : [];

    // Se o usuário é membro automático (do setor selecionado) mas NÃO está no array desejado,
    // ele deve entrar na lista de "excluídos" para não ser reaplicado automaticamente.
    const excluidosAutoIds = autoMemberIds.filter((usuarioId) => !responsavelIdsDesired.includes(usuarioId));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Sempre deletar e recriar os responsáveis (lista final).
      await tx.projetoResponsavel.deleteMany({ where: { projetoId: id } });

      if (responsavelIdsDesired.length > 0) {
        await tx.projetoResponsavel.createMany({
          data: responsavelIdsDesired.map((usuarioId) => ({
            projetoId: id,
            usuarioId,
          })),
        });
      }

      // Resetar exclusões e recriar somente as excluídas vindas automaticamente.
      await (tx as any).projetoResponsavelExcluido.deleteMany({ where: { projetoId: id } });

      if (excluidosAutoIds.length > 0) {
        await (tx as any).projetoResponsavelExcluido.createMany({
          data: excluidosAutoIds.map((usuarioId) => ({
            projetoId: id,
            usuarioId,
          })),
        });
      }

      return tx.projeto.findUnique({
        where: { id },
        include: {
          supervisor: { include: { cargo: true } },
          setores: { select: { id: true, nome: true } },
          responsaveis: { include: { usuario: { include: { cargo: true } } } },
          responsaveisExcluidos: { select: { usuarioId: true } },
        } as any,
      } as any);
    });

    const updatedAny = updated as any;
    const nomesResponsaveisDepois =
      (updatedAny?.responsaveis ?? [])
        .map((r: { usuario?: { nome?: string } }) => r.usuario?.nome)
        .filter(Boolean)
        .sort()
        .join(', ') || '(nenhum)';

    const detalhesResp = `• Equipe do projeto:\n  Antes: ${nomesResponsaveisAntes}\n  Depois: ${nomesResponsaveisDepois}`;

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: id,
      projetoNome,
      acaoResumo: 'equipe do projeto atualizada',
      detalhes: detalhesResp,
    });

    return updated;
  }

  async finalize(id: number, actor: ProjectAccessActor) {
    const projetoAtual = await this.findOne(id, actor);
    
    const projetoAtualizado = await this.prisma.projeto.update({
      where: { id },
      data: { status: ProjetoStatus.FINALIZADO, dataFinalizacao: new Date() },
      include: {
        supervisor: true,
        responsaveis: { include: { usuario: true } },
      },
    });

    // Se o status mudou para FINALIZADO, criar notificações e requerimentos
    if (projetoAtual.status !== ProjetoStatus.FINALIZADO) {
      await this.notificarAprovacaoReprovacao(projetoAtualizado, ProjetoStatus.FINALIZADO);
    }

    const detalhesFin =
      projetoAtual.status !== ProjetoStatus.FINALIZADO
        ? `• Status do projeto: "${statusProjetoLabel(projetoAtual.status)}" → "Finalizado"`
        : '• Projeto já estava finalizado (ação registrada).';

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: id,
      projetoNome: projetoAtualizado.nome,
      acaoResumo: 'projeto finalizado',
      detalhes: detalhesFin,
    });

    return projetoAtualizado;
  }

  async remove(id: number, actor: ProjectAccessActor) {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, id, actor);

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId: id,
      projetoNome,
      acaoResumo: 'projeto excluído',
      detalhes: `• Projeto "${projetoNome}" (id ${id}) foi excluído permanentemente do sistema.`,
    });

    await this.prisma.projeto.delete({ where: { id } });
  }

  /** Reordena as etapas do projeto conforme o array etapaIds (índice = ordem). */
  async reorderEtapas(projetoId: number, dto: ReorderEtapasDto, actor: ProjectAccessActor) {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);

    const etapasDoProjeto = (await this.prisma.etapa.findMany({
      where: { projetoId },
      select: { id: true, ordem: true } as any,
    })) as unknown as { id: number; ordem: number }[];
    const idsExistentes = new Set<number>(etapasDoProjeto.map((e) => e.id));

    const idsRecebidos = dto.etapaIds.filter((id) => idsExistentes.has(id));
    if (idsRecebidos.length !== idsExistentes.size) {
      throw new BadRequestException(
        'A lista de etapas deve conter exatamente os IDs das etapas deste projeto, na nova ordem.',
      );
    }

    const etapasComNomes = await this.prisma.etapa.findMany({
      where: { projetoId },
      select: { id: true, nome: true, ordem: true },
      orderBy: { ordem: 'asc' },
    });
    const nomePorId = new Map(etapasComNomes.map((e) => [e.id, e.nome]));
    const strOrdemAntes = etapasComNomes.map((e) => e.nome).join(' → ');
    const strOrdemDepois = idsRecebidos.map((eid) => nomePorId.get(eid) ?? `#${eid}`).join(' → ');
    const detalhesOrdem = `• Ordem das etapas (da esquerda para a direita = 1º ao último):\n  Antes: ${strOrdemAntes}\n  Depois: ${strOrdemDepois}`;

    await this.prisma.$transaction(
      idsRecebidos.map((etapaId, index) =>
        this.prisma.etapa.update({
          where: { id: etapaId },
          data: { ordem: index } as any,
        }),
      ),
    );

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: 'ordem das etapas alterada',
      detalhes: detalhesOrdem,
    });

    return this.findOne(projetoId, actor);
  }

  async renameAba(projetoId: number, dto: RenameAbaDto, actor: ProjectAccessActor) {
    const from = dto.from?.trim();
    const to = dto.to?.trim();

    if (!from || !to) {
      throw new BadRequestException('Nome atual e novo nome da aba são obrigatórios.');
    }
    if (from === to) {
      throw new BadRequestException('O novo nome da aba é igual ao atual.');
    }
    // "Geral" é aba virtual no front (representa etapas sem aba); não permitir renomear/excluir.
    if (from.toLowerCase() === 'geral') {
      throw new BadRequestException(
        'A aba "Geral" representa etapas sem aba e não pode ser renomeada. Crie uma aba específica e mova as etapas.',
      );
    }

    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);

    // Filtrar pelo NOME da aba (e opcionalmente pela sessão) para não afetar outras abas.
    const where: Record<string, unknown> = { projetoId, aba: from };
    if (dto.sessaoId !== undefined) {
      where.sessaoId = dto.sessaoId; // número | null
    }

    const result = await this.prisma.etapa.updateMany({
      where: where as any,
      data: { aba: to } as any,
    });

    if (result.count === 0) {
      // Não bloqueia (ex.: aba criada só no front sem etapas), mas avisa via log/notificação.
    }

    const escopoTxt = this.descreverEscopoSessao(dto.sessaoId);

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: `aba renomeada (${from} → ${to})`,
      detalhes: `• Etapas com aba "${from}"${escopoTxt} renomeadas para "${to}" (${result.count} etapa(s) afetada(s)).`,
    });

    return this.findOne(projetoId, actor);
  }

  async deleteAba(projetoId: number, dto: DeleteAbaDto, actor: ProjectAccessActor) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Nome da aba é obrigatório para exclusão.');
    }
    if (name.toLowerCase() === 'geral') {
      throw new BadRequestException(
        'A aba "Geral" representa etapas sem aba e não pode ser excluída.',
      );
    }

    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);

    // Limpar `aba` SOMENTE das etapas que estão nessa aba (e opcionalmente nessa sessão).
    const where: Record<string, unknown> = { projetoId, aba: name };
    if (dto.sessaoId !== undefined) {
      where.sessaoId = dto.sessaoId;
    }

    const result = await this.prisma.etapa.updateMany({
      where: where as any,
      data: { aba: null } as any,
    });

    const escopoTxt = this.descreverEscopoSessao(dto.sessaoId);

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: `aba removida (${name})`,
      detalhes: `• Etapas com aba "${name}"${escopoTxt} voltaram para "sem aba" (${result.count} etapa(s) afetada(s)).`,
    });

    return this.findOne(projetoId, actor);
  }

  /** Texto descritivo curto do escopo de sessão para logs/notificações. */
  private descreverEscopoSessao(sessaoId?: number | null): string {
    if (sessaoId === undefined) return ' em todas as sessões';
    if (sessaoId === null) return ' nas etapas sem sessão';
    return ` na sessão #${sessaoId}`;
  }

  async createSessao(projetoId: number, dto: CreateSessaoDto, actor: ProjectAccessActor) {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);
    const nome = dto.nome?.trim();
    if (!nome || nome.length < 2) {
      throw new BadRequestException('Nome da sessão deve ter pelo menos 2 caracteres.');
    }
    // Evita duplicar nomes (case-insensitive) no mesmo projeto: confunde o usuário e
    // dificulta filtrar/renomear/excluir a sessão correta.
    const existente = await this.prisma.sessao.findFirst({
      where: { projetoId, nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true, nome: true },
    });
    if (existente) {
      throw new BadRequestException(
        `Já existe uma sessão com o nome "${existente.nome}" neste projeto. Use um nome diferente.`,
      );
    }
    const ordem = dto.ordem ?? 0;
    const created = await this.prisma.sessao.create({
      data: { projetoId, nome, ordem },
    });

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: `sessão criada (${nome})`,
      detalhes: `• Sessão criada: "${nome}" (ordem ${ordem}, id ${created.id}).`,
    });

    return created;
  }

  async updateSessao(projetoId: number, sessaoId: number, dto: UpdateSessaoDto, actor: ProjectAccessActor) {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);
    const sessao = await this.prisma.sessao.findFirst({
      where: { id: sessaoId, projetoId },
    });
    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada neste projeto.');
    }
    const data: { nome?: string; ordem?: number } = {};
    if (dto.nome !== undefined) {
      const nome = String(dto.nome).trim();
      if (nome.length < 2) throw new BadRequestException('Nome da sessão deve ter pelo menos 2 caracteres.');
      // Bloqueia renomear para um nome já usado por outra sessão deste projeto.
      const conflito = await this.prisma.sessao.findFirst({
        where: {
          projetoId,
          id: { not: sessaoId },
          nome: { equals: nome, mode: 'insensitive' },
        },
        select: { id: true, nome: true },
      });
      if (conflito) {
        throw new BadRequestException(
          `Já existe outra sessão com o nome "${conflito.nome}" neste projeto. Use um nome diferente.`,
        );
      }
      data.nome = nome;
    }
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (Object.keys(data).length === 0) return sessao;
    const updated = await this.prisma.sessao.update({
      where: { id: sessaoId },
      data,
    });

    const linhasSessao: string[] = [];
    if (dto.nome !== undefined && sessao.nome !== updated.nome) {
      linhasSessao.push(`• Nome da sessão: "${sessao.nome}" → "${updated.nome}"`);
    }
    if (dto.ordem !== undefined && sessao.ordem !== updated.ordem) {
      linhasSessao.push(`• Ordem: ${sessao.ordem} → ${updated.ordem}`);
    }

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: 'sessão atualizada',
      detalhes: linhasSessao.length ? linhasSessao.join('\n') : '• Sessão salva (sem mudança detectada nos campos enviados).',
    });

    return updated;
  }

  async deleteSessao(projetoId: number, sessaoId: number, actor: ProjectAccessActor) {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);
    const sessao = await this.prisma.sessao.findFirst({
      where: { id: sessaoId, projetoId },
    });
    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada neste projeto.');
    }
    // Desvincular etapas da sessão (SET NULL) e depois excluir a sessão.
    // Filtra por projetoId também (defensivo) para garantir que só etapas deste projeto sejam afetadas.
    const desvinculadas = await this.prisma.etapa.updateMany({
      where: { sessaoId, projetoId },
      data: { sessaoId: null },
    });
    await this.prisma.sessao.delete({ where: { id: sessaoId } });

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: `sessão excluída (${sessao.nome})`,
      detalhes: `• Sessão removida: "${sessao.nome}" (id ${sessaoId}). Etapas vinculadas foram desassociadas desta sessão (${desvinculadas.count} etapa(s) afetada(s)).`,
    });
  }

  /**
   * Adiciona arquivos à descrição do projeto, salvando no campo descricaoArquivos
   * e retornando a lista completa atualizada.
   */
  async addDescricaoArquivos(
    projetoId: number,
    files: Express.Multer.File[],
    actor: ProjectAccessActor,
  ): Promise<
    {
      originalName: string;
      url: string;
      mimeType?: string;
      size?: number;
    }[]
  > {
    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);

    const projeto = await this.prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { descricaoArquivos: true },
    });

    if (!projeto) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const existentes = Array.isArray(projeto.descricaoArquivos)
      ? (projeto.descricaoArquivos as any[])
      : [];

    const baseUrl = '/uploads/projects';
    const novos = (files || []).map((file) => ({
      originalName: file.originalname,
      url: `${baseUrl}/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    }));

    const atualizados = [...existentes, ...novos];

    await this.prisma.projeto.update({
      where: { id: projetoId },
      data: { descricaoArquivos: atualizados as any },
    });

    const detalhesAnexos = novos
      .map((n) => `• Arquivo adicionado: "${n.originalName}" (${n.url})`)
      .join('\n');

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: 'anexos na descrição do projeto adicionados',
      detalhes: detalhesAnexos,
    });

    return atualizados;
  }

  /**
   * Remove um arquivo específico da descrição do projeto (por URL)
   * e também apaga o arquivo físico do storage, se existir.
   */
  async removeDescricaoArquivo(
    projetoId: number,
    url: string,
    actor: ProjectAccessActor,
  ): Promise<
    {
      originalName: string;
      url: string;
      mimeType?: string;
      size?: number;
    }[]
  > {
    if (!url) {
      throw new BadRequestException('URL do arquivo é obrigatória');
    }

    const { nome: projetoNome } = await assertCanAccessProjeto(this.prisma, projetoId, actor);

    const projeto = await this.prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { descricaoArquivos: true },
    });

    if (!projeto) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const existentes = Array.isArray(projeto.descricaoArquivos)
      ? (projeto.descricaoArquivos as any[])
      : [];

    const atualizados = existentes.filter(
      (file) => file && typeof file.url === 'string' && file.url !== url,
    );

    await this.prisma.projeto.update({
      where: { id: projetoId },
      data: { descricaoArquivos: atualizados as any },
    });

    await this.deleteProjectFilesFromStorage([url]);

    const removido = existentes.find((file: { url?: string; originalName?: string }) => file?.url === url);
    const detalheRem = `• Arquivo removido: "${removido?.originalName ?? '(nome desconhecido)'}"\n• URL: ${url}`;

    await notifyProjetosVerTodosAboutSupervisorChange(this.prisma, {
      actor,
      projetoId,
      projetoNome,
      acaoResumo: 'anexo removido da descrição do projeto',
      detalhes: detalheRem,
    });

    return atualizados;
  }

  /**
   * Apaga arquivos físicos do diretório de uploads de projetos,
   * usado ao remover anexos da descrição.
   */
  private async deleteProjectFilesFromStorage(urls: string[]): Promise<void> {
    if (!urls || !Array.isArray(urls)) {
      return;
    }

    for (const url of urls) {
      if (!url || typeof url !== 'string') continue;
      if (!url.startsWith('/uploads/projects/')) continue;

      const relativePath = url.replace(/^\/+/, '');
      const absolutePath = join(process.cwd(), relativePath);

      try {
        await fs.promises.stat(absolutePath);
      } catch {
        // Arquivo não existe mais, seguir em frente
        continue;
      }

      try {
        await fs.promises.unlink(absolutePath);
      } catch {
        // Falha ao remover arquivo não deve quebrar a requisição
      }
    }
  }
}
