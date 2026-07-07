import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import ProjectWiki from './pages/ProjectWiki';
import ImportProjects from './pages/ImportProjects';
import MyTasks from './pages/MyTasks';
import Stock from './pages/Stock';
import Communications from './pages/Communications';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import PerfilRedirect from './pages/PerfilRedirect';
import Cargos from './pages/Cargos';
import Suppliers from './pages/Suppliers';
import Categories from './pages/Categories';
import NotificationsPage from './pages/NotificationsPage';
import Curadoria from './pages/Curadoria';
import CuradoriaBudgetDetails from './pages/CuradoriaBudgetDetails';
import Setores from './pages/Setores';
import SetorDetails from './pages/SetorDetails';
import Galpao from './pages/Galpao';
import GalpaoProdutoDetails from './pages/GalpaoProdutoDetails';
import Calendar from './pages/Calendar';
import RhPonto from './pages/RhPonto';
import RhCentral from './pages/RhCentral';
import RhDocumentosColaborador from './pages/RhDocumentosColaborador';
import RhBancoHorasColaborador from './pages/RhBancoHorasColaborador';
import RhEspelho from './pages/RhEspelho';
import FinanceiroPlanejamento from './pages/FinanceiroPlanejamento';
import Documentos from './pages/Documentos';
import PatentesDocumentos from './pages/PatentesDocumentos';
import DocumentosNovo from './pages/DocumentosNovo';
import DocumentosPublico from './pages/DocumentosPublico';
import PerfilTermoConfidencialidade from './pages/PerfilTermoConfidencialidade';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { ToastContainer } from './components/ToastContainer';
import { useAuthStore } from './store/auth';
import { getFirstAllowedPage } from './utils/getFirstAllowedPage';

function DefaultRedirect() {
  const user = useAuthStore((state) => state.user);
  const firstPage = getFirstAllowedPage(user);
  return <Navigate to={firstPage} replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        
        <Route path="/login" element={<Login />} />

        {/* Rota pública — sem autenticação, acesso por link de convite */}
        <Route path="/doc/:token" element={<DocumentosPublico />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/financeiro" element={<FinanceiroPlanejamento />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/import" element={<ImportProjects />} />
            <Route path="/projects/:id" element={<ProjectDetails />} />
            <Route path="/projects/:id/wiki" element={<ProjectWiki />} />
            <Route path="/tasks/my" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/curadoria" element={<Curadoria />} />
            <Route path="/curadoria/:id" element={<CuradoriaBudgetDetails />} />
            <Route path="/galpao" element={<Galpao />} />
            <Route path="/galpao/:id" element={<GalpaoProdutoDetails />} />
            <Route path="/communications" element={<Communications />} />
            {/* Redirecionamento para compatibilidade com rota antiga */}
            <Route path="/requests" element={<Navigate to="/communications" replace />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/perfil" element={<PerfilRedirect />} />
            <Route path="/perfil/:id/termo-confidencialidade" element={<PerfilTermoConfidencialidade />} />
            <Route path="/perfil/:id" element={<UserProfile />} />
            <Route path="/users" element={<Users />} />
            <Route path="/cargos" element={<Cargos />} />
            <Route path="/setores" element={<Setores />} />
            <Route path="/setores/:id" element={<SetorDetails />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/calendario" element={<Calendar />} />
            <Route path="/rh" element={<RhCentral />} />
            <Route path="/rh/documentos/:usuarioId" element={<RhDocumentosColaborador />} />
            <Route path="/rh/banco-horas/:usuarioId" element={<RhBancoHorasColaborador />} />
            <Route path="/rh/espelho" element={<RhEspelho />} />
            <Route path="/rh/espelho/:usuarioId" element={<RhEspelho />} />
            <Route path="/rh/ponto" element={<RhPonto />} />
            {/* Compatibilidade: jornada migrou para uma aba dentro de /rh/ponto */}
            <Route path="/rh/jornada" element={<Navigate to="/rh/ponto?aba=jornada" replace />} />
            <Route path="/documentos" element={<Documentos />} />
            <Route path="/documentos/novo/:tipo" element={<DocumentosNovo />} />
            <Route path="/patentes-documentos" element={<PatentesDocumentos />} />
          </Route>
        </Route>

        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
