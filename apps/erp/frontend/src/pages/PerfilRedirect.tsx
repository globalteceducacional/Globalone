import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

/** Redireciona `/perfil` para `/perfil/:id` do usuário logado. */
export default function PerfilRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={`/perfil/${user.id}`} replace />;
}
