import { useEffect, useState } from 'react';
import type { PontoHoje } from '../../services/rh';

interface PontoStatusCardProps {
  status: PontoHoje | null;
  loading: boolean;
  baterEmAndamento: boolean;
  onBater: () => void;
  /** Mensagem de erro persistida da última tentativa de bater (se houver). */
  ultimoErro?: string | null;
  /** Texto do botão enquanto o fluxo está bloqueado (GPS, selfie ou envio). */
  labelEmAndamento?: string;
}

function formatHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

/** Horário da jornada (ex.: "12:00" ou "12:00:00") — exibe só HH:mm como nos cartões de almoço. */
function formatHoraJornada(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hora.trim());
  if (!m) return hora;
  const h = m[1].padStart(2, '0');
  return `${h}:${m[2]}`;
}

/** Relógio digital ao vivo, atualizado a cada segundo. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function PontoStatusCard({
  status,
  loading,
  baterEmAndamento,
  onBater,
  ultimoErro,
  labelEmAndamento = 'Registrando...',
}: PontoStatusCardProps) {
  const now = useNow();

  if (status?.dispensadoControlePonto) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-5 sm:p-6">
        <p className="text-sm font-medium text-amber-100/95">Controle de ponto não se aplica ao seu cadastro</p>
        <p className="mt-2 text-sm text-amber-100/80 leading-relaxed">
          O RH marcou sua jornada como <strong className="text-amber-50">dispensada de registro de ponto</strong>. Você
          não aparece no banco de horas e não registra batidas por aqui. Em caso de dúvida, fale com o RH.
        </p>
      </div>
    );
  }

  const dataExtenso = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const horaCorrente = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const proxima = status?.proximaBatida ?? null;
  const almocoAutomatico = status?.almoco?.automatico !== false;
  // Backends antigos podem omitir `concluido`. Com almoço manual, entrada+saída existem já na 2ª batida
  // (saída 1 = última SAÍDA até então) — não usar esse critério; exigir 4 batidas.
  const concluido =
    status?.concluido === true ||
    (status?.concluido == null &&
      (almocoAutomatico
        ? !!(status?.entrada && status?.saida)
        : (status?.batidasHoje?.length ?? 0) >= 4));
  const totalBatidas = status?.batidasHoje?.length ?? 0;
  const batida1 = status?.batidasHoje?.[0] ?? null;
  const batida2 = status?.batidasHoje?.[1] ?? null;
  const batida3 = status?.batidasHoje?.[2] ?? null;
  const batida4 = status?.batidasHoje?.[3] ?? null;

  // Label do botão de acordo com o modo da jornada.
  let labelBotao: string;
  if (concluido) {
    labelBotao = 'Ponto do dia concluído';
  } else if (almocoAutomatico) {
    labelBotao = proxima === 'SAIDA' ? 'Bater saída' : 'Bater entrada';
  } else {
    switch (totalBatidas) {
      case 0:
        labelBotao = 'Bater entrada 1';
        break;
      case 1:
        labelBotao = 'Bater saída 1';
        break;
      case 2:
        labelBotao = 'Bater entrada 2';
        break;
      default:
        labelBotao = 'Bater saída 2';
        break;
    }
  }

  const desabilitado = baterEmAndamento || concluido || loading;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-sm text-white/60 capitalize">{dataExtenso}</p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums text-white mt-1">{horaCorrente}</p>
          {!almocoAutomatico ? (
            <p className="text-xs text-amber-200/80 mt-1">
              Jornada com almoço manual: 4 batidas/dia (entrada 1 · saída 1 · entrada 2 · saída 2).
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onBater}
          disabled={desabilitado}
          className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-base transition-colors ${
            concluido
              ? 'bg-green-600 text-white cursor-not-allowed opacity-80'
              : 'bg-primary text-neutral hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {baterEmAndamento ? labelEmAndamento : labelBotao}
        </button>
      </div>

      {almocoAutomatico ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatusBox
            titulo="Entrada"
            hora={status?.entrada ? formatHora(status.entrada.dataHora) : null}
            ativo={!!status?.entrada}
            variant="green"
          />
          <StatusBox
            titulo="Saída"
            hora={status?.saida ? formatHora(status.saida.dataHora) : null}
            ativo={!!status?.saida}
            variant="green"
          />
          <StatusBox
            titulo="Saída almoço"
            hora={
              status?.almoco?.saidaAutomatica
                ? formatHora(status.almoco.saidaAutomatica)
                : status?.almoco
                  ? formatHoraJornada(status.almoco.inicio)
                  : null
            }
            ativo={!!status?.almoco?.saidaAutomatica}
            variant="amber"
            sublinha={
              !status?.almoco?.saidaAutomatica
                ? 'Fixo na jornada; descontado ao fechar o dia'
                : undefined
            }
          />
          <StatusBox
            titulo="Volta almoço"
            hora={
              status?.almoco?.voltaAutomatica
                ? formatHora(status.almoco.voltaAutomatica)
                : status?.almoco
                  ? formatHoraJornada(status.almoco.fim)
                  : null
            }
            ativo={!!status?.almoco?.voltaAutomatica}
            variant="amber"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatusBox
            titulo="Entrada 1"
            hora={batida1 ? formatHora(batida1.dataHora) : null}
            ativo={!!batida1}
            variant="green"
            sublinha={!batida1 ? 'Primeira batida do dia' : undefined}
          />
          <StatusBox
            titulo="Saída 1"
            hora={batida2 ? formatHora(batida2.dataHora) : null}
            ativo={!!batida2}
            variant="amber"
            sublinha={!batida2 ? 'Bata ao sair para o almoço' : undefined}
          />
          <StatusBox
            titulo="Entrada 2"
            hora={batida3 ? formatHora(batida3.dataHora) : null}
            ativo={!!batida3}
            variant="amber"
            sublinha={!batida3 ? 'Bata ao retornar do almoço' : undefined}
          />
          <StatusBox
            titulo="Saída 2"
            hora={batida4 ? formatHora(batida4.dataHora) : null}
            ativo={!!batida4}
            variant="green"
            sublinha={!batida4 ? 'Última batida do dia' : undefined}
          />
        </div>
      )}

      {ultimoErro ? (
        <div className="mt-4 rounded-lg bg-red-500/15 border border-red-400/40 text-red-100 p-3 text-sm">
          {ultimoErro}
        </div>
      ) : null}
    </div>
  );
}

function StatusBox({
  titulo,
  hora,
  ativo,
  variant = 'green',
  sublinha,
}: {
  titulo: string;
  hora: string | null;
  ativo: boolean;
  variant?: 'green' | 'amber';
  sublinha?: string;
}) {
  const ativoClass =
    variant === 'amber'
      ? 'border-amber-400/35 bg-amber-500/10 text-amber-50'
      : 'border-green-400/40 bg-green-500/10 text-green-100';
  return (
    <div
      className={`rounded-lg border p-4 ${
        ativo ? ativoClass : 'border-white/10 bg-white/5 text-white/70'
      }`}
    >
      <p className="text-xs uppercase tracking-wide opacity-70">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1">{hora ?? '--:--'}</p>
      {sublinha ? <p className="text-xs text-white/50 mt-2 leading-snug">{sublinha}</p> : null}
    </div>
  );
}
