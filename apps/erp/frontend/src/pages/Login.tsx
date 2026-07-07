import { FormEvent, useState, useEffect } from 'react';
import { btn } from '../utils/buttonStyles';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { Usuario } from '../types';
import { getFirstAllowedPage } from '../utils/getFirstAllowedPage';
import { formatApiError } from '../utils/toast';

export default function Login() {
  const navigate = useNavigate();
  const setCredentials = useAuthStore((state) => state.setCredentials);
  const logout = useAuthStore((state) => state.logout);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Garantir que o usuário está deslogado ao entrar na página de login
  useEffect(() => {
    logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Limpar qualquer estado anterior antes de fazer login
      logout();
      
      const { data } = await api.post<{ token: string; user: Usuario }>('/auth/login', {
        email,
        senha,
      });
      setCredentials({ token: data.token, user: data.user });
      // Redirecionar para a primeira página permitida do usuário
      const firstPage = getFirstAllowedPage(data.user);
      navigate(firstPage, { replace: true });
    } catch (err: unknown) {
      setError(formatApiError(err, { authAction: 'login' }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral p-4 sm:p-6">
      <div className="w-full max-w-md bg-neutral/80 border border-white/10 rounded-xl p-6 shadow-xl sm:p-10">
        <h1 className="text-2xl font-bold mb-2 text-center sm:text-3xl">ERP Globaltec</h1>
        <p className="text-white/60 text-center mb-6 text-sm sm:mb-8 sm:text-base">Acesse com suas credenciais</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="text-sm text-white/70">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-neutral/60 px-3 py-2 focus:border-primary focus:outline-none"
              required
            />
          </label>

          <label className="text-sm text-white/70">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-neutral/60 px-3 py-2 focus:border-primary focus:outline-none"
              required
            />
          </label>

          {error && <span className="text-danger text-sm">{error}</span>}

          <button
            type="submit"
            disabled={loading}
            className={`${btn.primaryLg} w-full`}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
