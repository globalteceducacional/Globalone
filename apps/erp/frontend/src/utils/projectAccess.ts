import { Usuario } from '../types';

/** Rota canónica da área de tarefas (substitui `/tasks/my` na UI). */
export const TASKS_ROUTE = '/tasks';

/** Aba «Tarefas em análise» em Projetos (fila de avaliação de entregas). */
export const PROJECTS_ANALISE_ROUTE = '/projects?tab=analise';

/** Nome do cargo, compatível com cargo legado em string ou objeto. */
export function getCargoNome(user: Usuario | null): string | undefined {
  if (!user) return undefined;
  if (typeof user.cargo === 'string') return user.cargo;
  if (user.cargo && typeof user.cargo === 'object' && 'nome' in user.cargo) {
    return user.cargo.nome;
  }
  return undefined;
}

/**
 * Verifica se o usuário possui uma permissão granular específica.
 * Chave no formato "modulo:acao" (ex.: "projetos:editar").
 */
export function userHasPermission(user: Usuario | null, key: string): boolean {
  if (!user || typeof user.cargo === 'string') return false;
  const perms = user.cargo?.permissions ?? [];
  return perms.some((p) => (p.chave ?? `${p.modulo}:${p.acao}`) === key);
}

/**
 * Verifica se o usuário possui QUALQUER uma das permissões listadas.
 */
export function userHasAnyPermission(user: Usuario | null, ...keys: string[]): boolean {
  if (!user || typeof user.cargo === 'string') return false;
  const perms = user.cargo?.permissions ?? [];
  const set = new Set(perms.map((p) => p.chave ?? `${p.modulo}:${p.acao}`));
  return keys.some((k) => set.has(k));
}

/**
 * Permissões que, com responsável/supervisor da etapa, autorizam avaliar entregas no backend.
 * A própria entrega do usuário continua bloqueada (exceto sistema:administrar), em espelho com a API.
 */
export function userHasProjectDeliveryReviewerPermission(user: Usuario | null): boolean {
  return userHasAnyPermission(
    user,
    'trabalhos:avaliar',
    'projetos:aprovar',
    'projetos:aprovar_entrega_terceiros',
    'sistema:administrar',
  );
}

/** Pode aprovar/reprovar esta entrega em relação ao executor (bloqueia auto-aprovação). */
export function userMayReviewDeliveryAsNonExecutor(
  user: Usuario | null,
  executorId: number | null | undefined,
): boolean {
  if (!user?.id) return false;
  if (userHasPermission(user, 'sistema:administrar')) return true;
  if (executorId == null || Number.isNaN(Number(executorId))) return true;
  return Number(user.id) !== Number(executorId);
}

type ProjetoPapelAvaliacao = {
  supervisor?: { id?: number } | null;
  responsaveis?: Array<{ usuario: { id: number } }> | null;
};

type EtapaPapelAvaliacao = {
  responsavelId?: number | null;
  responsavel?: { id?: number } | null;
};

/** É o supervisor cadastrado no projeto. */
export function userIsSupervisorOfProject(
  user: Usuario | null,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  if (!user?.id) return false;
  return projeto.supervisor?.id != null && Number(projeto.supervisor.id) === Number(user.id);
}

/** Supervisiona ao menos um projeto na lista. */
export function userSupervisesAnyInProjectList(
  user: Usuario | null,
  projetos: ProjetoPapelAvaliacao[],
): boolean {
  if (!user?.id) return false;
  return projetos.some((p) => userIsSupervisorOfProject(user, p));
}

/**
 * Pode avaliar entregas no projeto (supervisor, visão global com permissão de avaliação, ou admin).
 */
export function userCanReviewDeliveriesInProject(
  user: Usuario | null,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  if (!user?.id) return false;
  if (userHasPermission(user, 'sistema:administrar')) return true;
  if (userHasPermission(user, 'projetos:ver_todos') && userHasProjectDeliveryReviewerPermission(user)) {
    return true;
  }
  if (userIsSupervisorOfProject(user, projeto)) return true;
  return false;
}

/**
 * Pode avaliar entregas nesta etapa (inclui responsável pela etapa com permissão de avaliação).
 */
export function userCanReviewDeliveriesInEtapaContext(
  user: Usuario | null,
  etapa: EtapaPapelAvaliacao,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  if (!user?.id) return false;
  if (userCanReviewDeliveriesInProject(user, projeto)) return true;
  if (!userHasProjectDeliveryReviewerPermission(user)) return false;
  const respEtapaId = etapa.responsavelId ?? etapa.responsavel?.id;
  return respEtapaId != null && Number(respEtapaId) === Number(user.id);
}

/**
 * Papel de avaliação inferido só pelos vínculos do projeto/etapa (sem permissões globais do cargo).
 * Usado no Dashboard GM ao filtrar outro usuário.
 */
export function userIdCanReviewDeliveriesInEtapaContext(
  userId: number,
  etapa: EtapaPapelAvaliacao,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  if (projeto.supervisor?.id != null && Number(projeto.supervisor.id) === Number(userId)) {
    return true;
  }
  const respEtapaId = etapa.responsavelId ?? etapa.responsavel?.id;
  return respEtapaId != null && Number(respEtapaId) === Number(userId);
}

/** @deprecated Use {@link userCanReviewDeliveriesInProject} */
export function userMaySupervisorReviewChecklistInProject(
  user: Usuario | null,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  return userCanReviewDeliveriesInProject(user, projeto);
}

/**
 * Supervisor do projeto ou responsável pela etapa (campo da etapa, não confundir com equipe do projeto).
 */
export function userIsSupervisorOuResponsavelProjetoOuEtapa(
  user: Usuario | null,
  etapa: EtapaPapelAvaliacao,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  if (!user?.id) return false;
  const uid = Number(user.id);
  if (userHasPermission(user, 'sistema:administrar')) return true;
  if (projeto.supervisor?.id != null && Number(projeto.supervisor.id) === uid) return true;
  if (etapa.responsavelId != null && Number(etapa.responsavelId) === uid) return true;
  return false;
}

/** Pode avaliar entregas de terceiros neste contexto (permissão + papel no projeto/etapa). */
export function userMayReviewOthersDeliveriesInEtapaContext(
  user: Usuario | null,
  etapa: EtapaPapelAvaliacao,
  projeto: ProjetoPapelAvaliacao,
): boolean {
  return userCanReviewDeliveriesInEtapaContext(user, etapa, projeto);
}


function normalizePagePath(path: string): string {
  return path === '/tasks/my' ? TASKS_ROUTE : path;
}

/** Lista de rotas com `/tasks` no lugar de `/tasks/my`, sem duplicatas. */
function finalizePages(pages: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const q = normalizePagePath(p);
    if (!seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
  }
  return out;
}

/**
 * Páginas permitidas pelo cargo (usa `paginasPermitidas` da API).
 * Fallback mínimo: `/tasks`, `/notifications`.
 */
export function getPaginasPermitidas(user: Usuario | null): string[] {
  if (!user) return [];

  if (typeof user.cargo === 'object' && user.cargo !== null && 'paginasPermitidas' in user.cargo) {
    if (user.cargo.paginasPermitidas && Array.isArray(user.cargo.paginasPermitidas)) {
      let pages = [...user.cargo.paginasPermitidas];
      const permissionKeys = Array.isArray(user.cargo.permissions)
        ? user.cargo.permissions.map((p) => p.chave ?? `${p.modulo}:${p.acao}`)
        : [];
      const isAdmin = permissionKeys.includes('sistema:administrar');
      const has = (prefix: string) => isAdmin || permissionKeys.some((k) => k.startsWith(prefix));

      // Garante aba "Ponto" para quem tem permissão de ponto OU jornada
      // (a configuração de jornada virou uma aba dentro de /rh/ponto).
      if ((has('ponto:') || has('jornada:')) && !pages.includes('/rh/ponto')) {
        pages = ['/rh/ponto', ...pages];
      }
      // Página geral "RH" agrupando: solicitações, banco de horas, férias, afastamentos,
      // documentos, desempenho, treinamentos e dashboard.
      const temAlgoEmRh =
        has('solicitacoes_ponto:') ||
        has('banco_horas:') ||
        has('ferias:') ||
        has('afastamentos:') ||
        has('documentos_rh:') ||
        has('avaliacoes:') ||
        has('treinamentos:') ||
        has('rh_dashboard:') ||
        has('folha:');
      if (temAlgoEmRh && !pages.includes('/rh')) {
        pages = ['/rh', ...pages];
      }

      const temPermissaoFinanceiro =
        permissionKeys.includes('financeiro:visualizar') ||
        permissionKeys.some((k) => k.startsWith('financeiro:'));
      if (temPermissaoFinanceiro && !pages.includes('/financeiro')) {
        pages = ['/financeiro', ...pages];
      }

      if (!pages.includes('/dashboard')) {
        pages = ['/dashboard', ...pages];
      }
      if (!pages.includes('/notifications')) {
        pages = [...pages, '/notifications'];
      }
      return finalizePages(pages);
    }
  }

  return finalizePages([TASKS_ROUTE, '/notifications']);
}

export function cargoAllowsProjectsPage(user: Usuario | null): boolean {
  return getPaginasPermitidas(user).includes('/projects');
}

/**
 * Pode abrir a rota de detalhe do projeto se:
 * - tem acesso à página de projetos, E
 * - tem `projetos:ver_todos` OU é supervisor/responsável daquele projeto
 */
export function canUserOpenProjectDetails(
  user: Usuario | null,
  project: { supervisor?: { id?: number } | null },
): boolean {
  if (!user || !cargoAllowsProjectsPage(user)) return false;
  if (userHasPermission(user, 'projetos:ver_todos')) return true;
  return Number(project.supervisor?.id) === Number(user.id);
}
