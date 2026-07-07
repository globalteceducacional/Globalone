import { useAuthStore } from '../../store/auth';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { btn } from '../../utils/buttonStyles';
import { Notifications } from '../Notifications';
import { Notificacao } from '../../types';
import { subscribeWebPushIfGranted } from '../../utils/webPush';

interface HeaderProps {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
  onOpenMobileMenu?: () => void;
}

export function Header({ title, subtitle, isMobile, onOpenMobileMenu }: HeaderProps) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const knownUnreadIdsRef = useRef<Set<number>>(new Set());
  const unreadBootstrapDoneRef = useRef(false);

  function handleLogout() { 
    navigate('/login', { replace: true });
  }

  function getNotificationRoute(item: Notificacao): string | null {
    if (item.etapa?.id) return `/tasks?etapaId=${item.etapa.id}`;
    if (item.calendarioEventoId != null) return `/calendario?eventoId=${item.calendarioEventoId}`;
    if (item.requerimentoId != null) return `/communications?tab=received&id=${item.requerimentoId}`;
    return null;
  }

  function maybeShowDeviceNotifications(newItems: Notificacao[]) {
    if (newItems.length === 0) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    // Evita pop-up enquanto usuário já está vendo a tela.
    if (document.visibilityState === 'visible') return;

    newItems.slice(0, 4).forEach((item) => {
      const body = item.mensagem?.trim() || 'Você recebeu uma nova notificação.';
      const n = new Notification(item.titulo || 'Nova notificação', {
        body,
        tag: `erp-notification-${item.id}`,
      });
      n.onclick = () => {
        window.focus();
        const route = getNotificationRoute(item);
        if (route) navigate(route);
      };
    });
  }

  // Carregar contador de notificações não lidas e atualizar periodicamente / ao voltar à aba
  useEffect(() => {
    async function loadUnreadCount() {
      try {
        const { data } = await api.get<Notificacao[]>('/notifications?unread=true');
        setUnreadCount(data.length);

        const currentUnreadIds = new Set<number>((data ?? []).map((n) => n.id));
        if (!unreadBootstrapDoneRef.current) {
          // Primeira carga: somente sincroniza estado, sem notificar backlog antigo.
          knownUnreadIdsRef.current = currentUnreadIds;
          unreadBootstrapDoneRef.current = true;
        } else {
          const newlyArrived = (data ?? []).filter((n) => !knownUnreadIdsRef.current.has(n.id));
          maybeShowDeviceNotifications(newlyArrived);
          knownUnreadIdsRef.current = currentUnreadIds;
        }
      } catch (err) {
        console.error('Erro ao carregar contador de notificações:', err);
      }
    }

    loadUnreadCount();

    // Atualizar a cada 15 segundos
    const interval = setInterval(loadUnreadCount, 15000);

    // Quando o usuário voltar à aba, atualizar na hora
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadUnreadCount();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Com permissão já concedida, associa este dispositivo ao Web Push (notificação no sistema).
  useEffect(() => {
    if (!user) return;
    void subscribeWebPushIfGranted().catch(() => undefined);
  }, [user]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-white/10 px-3 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sticky top-0 bg-neutral/80 backdrop-blur supports-[backdrop-filter]:bg-neutral/60 z-20">
        <div className="flex items-center gap-2.5 min-w-0 w-full sm:flex-1 sm:gap-3 order-1">
          {isMobile && onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className={`${btn.iconBtn} shrink-0`}
              title="Abrir menu"
              aria-label="Abrir menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold min-w-0 break-words sm:text-xl sm:truncate lg:text-2xl">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-white/60 mt-0.5 min-w-0 break-words leading-snug sm:text-sm sm:truncate sm:mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 order-2 w-full min-w-0 sm:w-auto sm:shrink-0 sm:items-end sm:gap-3">
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            {user && (
              <>
                <div className="relative" ref={notificationsRef}>
                  <button
                    onClick={async () => {
                      if (typeof window !== 'undefined' && 'Notification' in window) {
                        if (Notification.permission === 'default') {
                          const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
                          if (p === 'granted') {
                            void subscribeWebPushIfGranted().catch(() => undefined);
                          }
                        } else if (Notification.permission === 'granted') {
                          void subscribeWebPushIfGranted().catch(() => undefined);
                        }
                      }
                      if (window.innerWidth < 640) {
                        setShowNotifications(false);
                        navigate('/notifications');
                        return;
                      }
                      setShowNotifications((prev) => !prev);
                    }}
                    className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md bg-white/10 px-2.5 py-2 hover:bg-white/20 text-white transition-colors sm:min-h-0 sm:min-w-0 sm:px-3"
                    title="Notificações"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {showNotifications && (
                    <Notifications onClose={() => setShowNotifications(false)} onUpdateCount={setUnreadCount} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/perfil/${user.id}`)}
                  className={`inline-flex min-h-[40px] items-center justify-center ${btn.secondary} text-xs sm:text-sm px-3 py-2 sm:min-h-0 sm:px-3 sm:py-2`}
                >
                  Perfil
                </button>
                <span
                  className="hidden max-w-[14rem] truncate text-xs text-white/70 sm:inline-block sm:text-sm md:max-w-[220px]"
                  title={user.email}
                >
                  {user.email}
                </span>
              </>
            )}
            <button onClick={handleLogout} className={`${btn.dangerSm} min-h-[40px] px-3 sm:min-h-0`}>
              Sair
            </button>
          </div>
          {user?.email && (
            <p className="truncate text-center text-[11px] leading-snug text-white/55 sm:hidden" title={user.email}>
              {user.email}
            </p>
          )}
        </div>
      </header>
    </>
  );
}
