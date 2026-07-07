import { Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Sidebar, getSidebarCollapsedDefault, setSidebarCollapsed } from './Sidebar';
import { Header } from './Header';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth';
import { getFirstAllowedPage } from '../../utils/getFirstAllowedPage';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useProjectsModuleAccess } from '../../hooks/useProjectsModuleAccess';
import { api } from '../../services/api';
import { Usuario } from '../../types';
import {
  cargoAllowsProjectsPage,
  getPaginasPermitidas,
  userHasPermission,
  TASKS_ROUTE,
  PROJECTS_ANALISE_ROUTE,
} from '../../utils/projectAccess';
import { temAcessoFinanceiro } from '../../utils/financeiroPermissions';
import { userCanViewAlmoxarifado } from '../../utils/almoxarifadoAccess';
import { PendingWorkSummaryModal } from '../PendingWorkSummaryModal';
import { FileViewerProvider } from '../../contexts/FileViewerContext';
import { fetchPendingWorkSummary, pendingWorkSummaryTotal } from '../../utils/pendingWorkSummary';

const titles: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Visão geral dos projetos e indicadores' },
  '/financeiro': {
    title: 'Financeiro e planejamento',
    subtitle: 'Ponto (horas/valores), pagamentos do mês, projetos, curadoria e compras',
  },
  '/projects': { title: 'Projetos', subtitle: 'Gestão de projetos ativos e finalizados' },
  '/projects/wiki': { title: 'Wiki do Projeto', subtitle: 'Documentação e progresso das etapas' },
  '/tasks': { title: 'Meu Trabalho', subtitle: 'Acompanhe etapas, tarefas e subtarefas' },
  '/curadoria': { title: 'Curadoria', subtitle: 'Orçamentos de livros' },
  '/galpao': { title: 'Almoxarifado', subtitle: 'Controle de entradas, alocacoes e baixas' },
  '/stock': { title: 'Compras & Estoque', subtitle: 'Controle de ativos e compras' },
  '/suppliers': { title: 'Fornecedores', subtitle: 'Gerenciamento de fornecedores' },
  '/categories': { title: 'Categorias', subtitle: 'Gerenciamento de categorias de compras' },
  '/communications': { title: 'Requerimentos', subtitle: 'Requerimentos e direcionamentos' },
  '/users': { title: 'Usuários', subtitle: 'Administração de acesso e perfis' },
  '/cargos': { title: 'Cargos', subtitle: 'Gerenciamento de cargos e permissões' },
  '/setores': { title: 'Setores', subtitle: 'Formação de equipes e associação' },
  '/calendario': { title: 'Calendário', subtitle: 'Cronograma visual de etapas e projetos' },
  '/notifications': { title: 'Notificações', subtitle: 'Central de notificações' },
  '/perfil': { title: 'Perfil', subtitle: 'Dados do usuário e cargo' },
  '/documentos': { title: 'Documentos', subtitle: 'Geração e armazenamento de documentos oficiais' },
  '/patentes-documentos': {
    title: 'Patentes e aplicações',
    subtitle: 'Organize documentos em pastas e envie arquivos dentro delas',
  },
};

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const { canAccessProjectsModule, loadingProjectsAccess } = useProjectsModuleAccess();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(getSidebarCollapsedDefault);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<Awaited<
    ReturnType<typeof fetchPendingWorkSummary>
  > | null>(null);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const syncedRef = useRef(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      setSidebarCollapsed(next);
      return next;
    });
  }, []);

  // Sincronizar user com o banco a cada montagem do layout (token válido → dados frescos).
  // Isso impede que manipulação do localStorage bypasse checks de permissão do frontend.
  useEffect(() => {
    if (!token || syncedRef.current) return;
    syncedRef.current = true;

    api
      .get<Usuario>('/auth/me')
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        // Token inválido/expirado → logout e redireciona para login
        logout();
        window.location.replace('/login');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Lembrete único por sessão: pendências em Meu Trabalho e requerimentos
  useEffect(() => {
    if (!user?.id) return;
    const key = `erp_pending_work_intro_v1_${user.id}`;
    if (sessionStorage.getItem(key)) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchPendingWorkSummary(user);
        if (cancelled) return;
        sessionStorage.setItem(key, '1');
        if (s && pendingWorkSummaryTotal(s) > 0) {
          setPendingSummary(s);
          setPendingModalOpen(true);
        }
      } catch {
        sessionStorage.setItem(key, '1');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Fechar menu mobile ao trocar de rota
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Bloquear scroll do body quando menu mobile estiver aberto
  useEffect(() => {
    if (!isDesktop && mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isDesktop, mobileMenuOpen]);

  // Verificar se o usuário tem acesso à página atual
  const hasAccess = useMemo(() => {
    if (!user) return false;

    const paginasPermitidas = getPaginasPermitidas(user);

    // Verificar se a rota atual está nas páginas permitidas
    // Para rotas dinâmicas como /projects/:id, verificar se começa com /projects
    const currentPath = location.pathname;
    if (currentPath.startsWith('/galpao')) {
      if (paginasPermitidas.includes('/galpao')) return true;
      if (user.cargo && typeof user.cargo === 'object' && Array.isArray(user.cargo.permissions)) {
        const permissionKeys = user.cargo.permissions.map((p) => p.chave ?? `${p.modulo}:${p.acao}`);
        return userCanViewAlmoxarifado(permissionKeys);
      }
      return false;
    }
    if (currentPath.startsWith('/projects/')) {
      return paginasPermitidas.includes('/projects');
    }
    if (currentPath.startsWith('/curadoria/')) {
      return paginasPermitidas.includes('/curadoria');
    }
    if (currentPath.startsWith('/tasks')) {
      return paginasPermitidas.includes(TASKS_ROUTE);
    }
    if (currentPath === '/notifications') {
      return paginasPermitidas.includes('/notifications');
    }
    if (currentPath.startsWith('/perfil')) {
      return true;
    }
    if (currentPath.startsWith('/setores/')) {
      return paginasPermitidas.includes('/setores');
    }
    if (currentPath.startsWith('/rh/documentos/')) {
      return paginasPermitidas.includes('/rh');
    }
    if (currentPath.startsWith('/rh/banco-horas/')) {
      return paginasPermitidas.includes('/rh');
    }
    if (currentPath.startsWith('/dashboard/')) {
      return paginasPermitidas.includes('/dashboard');
    }
    if (currentPath.startsWith('/financeiro')) {
      return temAcessoFinanceiro(user);
    }
    if (currentPath.startsWith('/documentos')) {
      return paginasPermitidas.includes('/documentos');
    }
    if (currentPath.startsWith('/patentes-documentos')) {
      return paginasPermitidas.includes('/patentes-documentos');
    }

    return paginasPermitidas.includes(currentPath);
  }, [user, location.pathname]);

  const header = useMemo(() => {
    if (location.pathname.includes('/termo-confidencialidade')) {
      return {
        title: 'Termo de Confidencialidade',
        subtitle: 'Funcionários, estagiários e pesquisadores',
      };
    }
    if (location.pathname.startsWith('/perfil/')) {
      return titles['/perfil'];
    }
    if (location.pathname.startsWith('/setores/') && location.pathname !== '/setores') {
      return { title: 'Setor', subtitle: 'Detalhes, integrantes e patrimônio' };
    }
    if (location.pathname.startsWith('/documentos/novo/certificado')) {
      return { title: 'Novo Certificado', subtitle: 'Certificado de programa de computador' };
    }
    if (location.pathname.startsWith('/documentos/novo/fornecedor')) {
      return { title: 'Novo Termo de Fornecedor', subtitle: 'Acordo de confidencialidade e proteção de dados' };
    }
    if (location.pathname.startsWith('/documentos/novo/estagiario')) {
      return {
        title: 'Termo de Confidencialidade',
        subtitle: 'Funcionários, estagiários e pesquisadores',
      };
    }
    const entry = Object.entries(titles).find(([path]) => location.pathname.startsWith(path));
    return entry ? entry[1] : { title: 'ERP Globaltec' };
  }, [location.pathname]);

  const onProjectsRoute = location.pathname.startsWith('/projects');
  const supervisorProjectsGate =
    onProjectsRoute &&
    user &&
    cargoAllowsProjectsPage(user) &&
    !userHasPermission(user, 'projetos:ver_todos');

  if (supervisorProjectsGate) {
    if (loadingProjectsAccess) {
      return (
        <div className="flex min-h-screen min-w-0 items-center justify-center bg-neutral/70 text-white/80 text-sm">
          Carregando permissões…
        </div>
      );
    }
    if (!canAccessProjectsModule) {
      return <Navigate to={getFirstAllowedPage(user)} replace />;
    }
  }

  // Se não tem acesso, redirecionar para a primeira página permitida
  if (!hasAccess) {
    const firstPage = getFirstAllowedPage(user);
    return <Navigate to={firstPage} replace />;
  }

  return (
    <FileViewerProvider>
    <div className="flex min-h-screen min-w-0">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        isMobile={!isDesktop}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        canAccessProjectsModule={canAccessProjectsModule}
        loadingProjectsAccess={loadingProjectsAccess}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title={header.title}
          subtitle={header.subtitle}
          isMobile={!isDesktop}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        <section className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-neutral/70 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </section>
      </main>
      <PendingWorkSummaryModal
        open={pendingModalOpen}
        summary={pendingSummary}
        onClose={() => {
          setPendingModalOpen(false);
          setPendingSummary(null);
        }}
        onGoTasks={() => {
          setPendingModalOpen(false);
          setPendingSummary(null);
          navigate(TASKS_ROUTE);
        }}
        onGoProjectsAnalise={() => {
          setPendingModalOpen(false);
          setPendingSummary(null);
          navigate(PROJECTS_ANALISE_ROUTE);
        }}
        onGoCommunications={() => {
          setPendingModalOpen(false);
          setPendingSummary(null);
          navigate('/communications?tab=received');
        }}
      />
    </div>
    </FileViewerProvider>
  );
}
