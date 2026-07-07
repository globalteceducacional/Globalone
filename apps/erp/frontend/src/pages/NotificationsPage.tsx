import { useNavigate } from 'react-router-dom';
import { Notifications } from '../components/Notifications';

export default function NotificationsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] sm:min-h-0 sm:block -mx-4 -my-4 sm:mx-0 sm:my-0 sm:space-y-4 sm:space-y-6">
      {/* Barra da “tela” no mobile: ocupa toda a largura e altura disponível */}
      <div className="flex flex-col flex-1 min-h-0 sm:flex-initial sm:min-h-0 bg-neutral/95 sm:bg-transparent">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 sm:border-0 sm:pb-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-primary hover:text-primary/80 transition-colors text-sm font-medium shrink-0"
          >
            ← Voltar
          </button>
          <h1 className="text-lg font-semibold truncate flex-1 sm:text-xl">
            Notificações
          </h1>
        </div>
        <div className="flex-1 min-h-0 flex flex-col sm:flex-initial">
          <Notifications asPage />
        </div>
      </div>
    </div>
  );
}

