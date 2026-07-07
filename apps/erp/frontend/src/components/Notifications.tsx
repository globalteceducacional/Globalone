import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Notificacao } from '../types';

/** Avisos de evento do calendário no topo; depois demais, sempre mais recentes primeiro. */
function sortNotificationsCalendarFirst(items: Notificacao[]): Notificacao[] {
  return [...items].sort((a, b) => {
    const aCal = a.calendarioEventoId != null && a.calendarioEventoId !== undefined;
    const bCal = b.calendarioEventoId != null && b.calendarioEventoId !== undefined;
    if (aCal !== bCal) return aCal ? -1 : 1;
    return new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime();
  });
}

interface NotificationsProps {
  onClose?: () => void;
  onUpdateCount?: (count: number) => void;
  /** Quando true, renderiza como página inteira em vez de dropdown */
  asPage?: boolean;
}

export function Notifications({ onClose, onUpdateCount, asPage }: NotificationsProps) {
  const [notifications, setNotifications] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const displayNotifications = useMemo(
    () => sortNotificationsCalendarFirst(notifications),
    [notifications],
  );

  useEffect(() => {
    loadNotifications();

    // Atualizar a cada 15 segundos para novas notificações aparecerem sem recarregar
    const interval = setInterval(loadNotifications, 15000);

    // Quando o usuário voltar à aba, atualizar na hora
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Fechar dropdown ao clicar fora (apenas no modo dropdown)
  useEffect(() => {
    if (asPage) return;

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, asPage]);

  async function loadNotifications() {
    try {
      const { data } = await api.get<Notificacao[]>('/notifications');
      setNotifications(data);
      const unread = data.filter(n => !n.lida).length;
      setUnreadCount(unread);
      onUpdateCount?.(unread);
    } catch (err) {
      console.error('Erro ao carregar notificações:', err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: number, notification?: Notificacao) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, lida: true } : n))
      );
      const newCount = Math.max(0, unreadCount - 1);
      setUnreadCount(newCount);
      onUpdateCount?.(newCount);

      if (!notification) return;
      onClose?.();
      if (notification.etapa) {
        navigate(`/tasks?etapaId=${notification.etapa.id}`);
      } else if (notification.calendarioEventoId != null) {
        navigate(`/calendario?eventoId=${notification.calendarioEventoId}`);
      } else if (notification.requerimentoId != null) {
        navigate('/communications?tab=received&id=' + notification.requerimentoId);
      }
    } catch (err) {
      console.error('Erro ao marcar notificação como lida:', err);
    }
  }

  function handleNotificationClick(notification: Notificacao) {
    if (!notification.lida) {
      markAsRead(notification.id, notification);
    } else if (notification.etapa) {
      onClose?.();
      navigate(`/tasks?etapaId=${notification.etapa.id}`);
    } else if (notification.calendarioEventoId != null) {
      onClose?.();
      navigate(`/calendario?eventoId=${notification.calendarioEventoId}`);
    } else if (notification.requerimentoId != null) {
      onClose?.();
      navigate('/communications?tab=received&id=' + notification.requerimentoId);
    }
  }

  async function markAllAsRead() {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
      setUnreadCount(0);
      onUpdateCount?.(0);
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
    }
  }

  async function clearAllNotifications() {
    try {
      await api.delete('/notifications/clear');
      setNotifications([]);
      setUnreadCount(0);
      onUpdateCount?.(0);
    } catch (err) {
      console.error('Erro ao limpar notificações:', err);
    }
  }

  function getTipoColor(tipo: Notificacao['tipo']) {
    switch (tipo) {
      case 'SUCCESS':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'WARNING':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'ERROR':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  }

  function getPrazoAlertClass(notification: Notificacao): string | null {
    const etapaAny: any = notification.etapa as any;
    if (!etapaAny || !etapaAny.dataFim) return null;

    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const fim = new Date(etapaAny.dataFim);
    const fimDateOnly = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());

    const diffMs = fimDateOnly.getTime() - todayDateOnly.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'border-red-500/70 bg-red-500/10';
    }
    if (diffDays <= 7) {
      return 'border-amber-400/70 bg-amber-500/10';
    }
    return null;
  }

  function formatDate(dateString: string | undefined | null) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return date.toLocaleDateString('pt-BR');
  }

  const content = (
    <>
      {/* Header (esconde título quando asPage; a página já mostra "Notificações") */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
        {!asPage && <h3 className="text-lg font-semibold">Notificações</h3>}
        {asPage && <span className="flex-1" />}
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Marcar todas como lidas
            </button>
          )}
          {displayNotifications.length > 0 && (
            <button
              onClick={clearAllNotifications}
              className="text-xs text-danger hover:text-danger/80 transition-colors"
            >
              Limpar notificações
            </button>
          )}
        </div>
      </div>

      {/* Lista de Notificações */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="p-8 text-center text-white/60">
            <p>Carregando notificações...</p>
          </div>
        ) : displayNotifications.length === 0 ? (
          <div className="p-8 text-center text-white/60">
            <p>Nenhuma notificação</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {displayNotifications.map((notification) => {
              const prazoAlertClass = getPrazoAlertClass(notification);

              return (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-white/5 transition-colors cursor-pointer border-l-4 ${
                    !notification.lida ? 'bg-white/5' : ''
                  } ${
                    prazoAlertClass
                      ? prazoAlertClass
                      : 'border-l-transparent'
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                        !notification.lida ? 'bg-primary' : 'bg-transparent'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-white/50">
                          {formatDate(notification.dataCriacao ?? undefined)}
                        </span>
                        {notification.etapa ||
                        notification.requerimentoId != null ||
                        notification.calendarioEventoId != null ? (
                          <span className="text-xs text-primary font-medium">
                            {notification.etapa
                              ? 'Ir para etapa →'
                              : notification.calendarioEventoId != null
                                ? 'Abrir evento no calendário →'
                                : 'Ver detalhes →'}
                          </span>
                        ) : null}
                        {notification.etapa && prazoAlertClass && (
                          <span
                            className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                              prazoAlertClass.includes('red')
                                ? 'bg-red-500/30 text-red-50 border border-red-400/80'
                                : 'bg-amber-500/30 text-amber-50 border border-amber-400/80'
                            }`}
                          >
                            {prazoAlertClass.includes('red')
                              ? 'Etapa atrasada'
                              : 'Etapa vence em até 7 dias'}
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-sm mb-1">
                        {notification.titulo ?? 'Notificação'}
                      </h4>
                      <p className="text-sm text-white/70 line-clamp-2">
                        {notification.mensagem ?? ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  // Versão tela cheia (mobile: sem card, ocupa toda a área; desktop: card centralizado)
  if (asPage) {
    return (
      <div className="w-full sm:max-w-2xl sm:mx-auto sm:px-4 sm:py-6 flex flex-col flex-1 min-h-0 sm:flex-initial sm:min-h-0">
        <div
          ref={dropdownRef}
          className="flex flex-col flex-1 min-h-0 sm:flex-initial sm:max-h-[80vh] sm:bg-neutral sm:border sm:border-white/20 sm:rounded-xl sm:shadow-2xl"
        >
          {content}
        </div>
      </div>
    );
  }

  // Versão dropdown (desktop)
  return (
    <div
      ref={dropdownRef}
      className="absolute left-2 right-2 sm:left-auto sm:right-0 top-full mt-2 sm:w-96 bg-neutral border border-white/20 rounded-xl shadow-2xl z-50 max-h-[70vh] flex flex-col"
    >
      {content}
    </div>
  );
}

