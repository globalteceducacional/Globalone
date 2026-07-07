import axios from 'axios';
import { useAuthStore } from '../store/auth';
import { formatApiError } from '../utils/toast';

// VPS e dev local: vazio ou '/api' = mesma origem (Nginx ou proxy Vite → backend).
// Evita CSP bloquear connect-src em dev (front :5173 → API via /api, não :3000 direto).
const raw = import.meta.env.VITE_API_URL != null ? String(import.meta.env.VITE_API_URL).trim() : '';
const baseURL = raw === '' || raw === '/api' ? '/api' : raw;

export const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers) {
    // Remover header de autorização se não houver token
    delete config.headers.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const renewedToken = response.headers?.['x-renewed-token'];
    if (typeof renewedToken === 'string' && renewedToken.trim().length > 0) {
      useAuthStore.getState().setToken(renewedToken.trim());
    }
    return response;
  },
  (error) => {
    const url = String(error.config?.url ?? '');
    const isLoginRequest = url.includes('/auth/login');
    const isRegisterRequest = url.includes('/auth/register');

    const friendly = formatApiError(error, {
      authAction: isLoginRequest ? 'login' : isRegisterRequest ? 'register' : undefined,
    });
    if (error.response?.data && typeof error.response.data === 'object') {
      error.response.data.message = friendly;
      if (!Array.isArray(error.response.data.messages)) {
        error.response.data.messages = [friendly];
      }
    }
    error.message = friendly;

    // 401 fora do login = sessão expirada
    if (error.response?.status === 401 && !isLoginRequest && !isRegisterRequest) {
      // Logout e limpar localStorage
      useAuthStore.getState().logout();
      // Redirecionar para login se não estiver já lá (usar replace para não adicionar ao histórico)
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Instância Axios sem JWT — usada nas páginas públicas de preenchimento de documentos
 * (Termo de Confidencialidade / Fornecedor via link de convite).
 */
export const apiPublico = axios.create({ baseURL });
