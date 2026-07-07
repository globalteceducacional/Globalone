export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notify() {
  toastListeners.forEach(listener => listener([...toasts]));
}

export function showToast(message: string, type: ToastType = 'info', duration = 5000) {
  const id = Math.random().toString(36).substring(2, 9);
  const toast: Toast = { id, message, type, duration };
  
  toasts.push(toast);
  notify();

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
}

export function removeToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notify();
}

export function clearToasts() {
  toasts = [];
  notify();
}

export function subscribe(listener: (toasts: Toast[]) => void) {
  toastListeners.push(listener);
  return () => {
    toastListeners = toastListeners.filter(l => l !== listener);
  };
}

export function getToasts() {
  return [...toasts];
}

export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration ?? 7000),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
};

export type FormatApiErrorOptions = {
  /** Na tela de login, 401 = credenciais — não "sessão expirada". */
  authAction?: 'login' | 'register';
};

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Não foi possível processar a solicitação. Verifique os dados informados.',
  401: 'Sessão expirada. Faça login novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'Registro não encontrado.',
  409: 'Conflito ao salvar. Este registro pode já existir.',
  413: 'Arquivo ou envio muito grande. Reduza o tamanho e tente novamente.',
  422: 'Alguns campos estão incorretos. Revise o formulário.',
  429: 'Muitas tentativas em sequência. Aguarde um momento.',
  502: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
  503: 'Sistema indisponível no momento. Tente novamente em breve.',
  504: 'O servidor demorou para responder. Tente novamente.',
  500: 'Erro interno do servidor. Tente novamente mais tarde.',
};

const TECHNICAL_PATTERN =
  /prisma|typeorm|nestjs|node_modules|ECONNREFUSED|ExceptionHandler|SqlState|internal server error/i;

function looksTechnical(message: string): boolean {
  return TECHNICAL_PATTERN.test(message);
}

function isHtmlBody(data: unknown): boolean {
  return typeof data === 'string' && /<html/i.test(data);
}

function extractMessages(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;

  if (Array.isArray(record.messages)) {
    return record.messages
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      .map((m) => m.trim());
  }

  const raw = record.message;
  if (Array.isArray(raw)) {
    return raw
      .flatMap((msg) => {
        if (typeof msg === 'string') return [msg.trim()];
        if (msg && typeof msg === 'object' && 'constraints' in msg) {
          const c = (msg as { constraints?: Record<string, string> }).constraints;
          return c ? Object.values(c).map((v) => v.trim()) : [];
        }
        return [];
      })
      .filter(Boolean);
  }

  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim()];
  }

  return [];
}

function joinMessages(messages: string[]): string {
  const unique = [...new Set(messages.filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return unique.join(' ');
}

/** Formata erros da API para exibição amigável ao usuário. */
export function formatApiError(error: unknown, options?: FormatApiErrorOptions): string {
  if (!error || typeof error !== 'object') {
    return 'Erro desconhecido. Tente novamente.';
  }

  const err = error as {
    message?: string;
    code?: string;
    response?: { status?: number; data?: unknown };
  };

  if (!err.response) {
    if (err.code === 'ECONNABORTED') {
      return 'A operação demorou demais. Verifique sua conexão e tente novamente.';
    }
    if (err.message === 'Network Error') {
      return 'Sem conexão com o servidor. Verifique sua internet ou tente mais tarde.';
    }
    if (err.message && !looksTechnical(err.message)) {
      return err.message;
    }
    return 'Não foi possível conectar ao servidor.';
  }

  const status = err.response.status ?? 0;
  const data = err.response.data;

  if (isHtmlBody(data)) {
    return STATUS_MESSAGES[status] ?? STATUS_MESSAGES[502];
  }

  const backendMessages = extractMessages(data);
  const joinedBackend = joinMessages(backendMessages);

  if (status === 401) {
    if (options?.authAction === 'login') {
      return joinedBackend || 'E-mail ou senha incorretos.';
    }
    if (options?.authAction === 'register') {
      return joinedBackend || 'Não foi possível concluir o cadastro.';
    }
    return joinedBackend || STATUS_MESSAGES[401];
  }

  if (joinedBackend && !looksTechnical(joinedBackend)) {
    return joinedBackend;
  }

  if (status >= 500) {
    return STATUS_MESSAGES[status] ?? STATUS_MESSAGES[500];
  }

  return STATUS_MESSAGES[status] ?? 'Não foi possível concluir a operação.';
}
