import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { userHasPermission } from '../utils/projectAccess';
import { getEtapaTimelineStatus } from '../utils/etapaChecklistStatus';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppSelect } from '../components/ui/AppSelect';
import {
  CalendarioEventoDatetimeFields,
  buildCalendarioEventoIsoRange,
  calendarioDatetimesFromIso,
  defaultCalendarioEventoDatetimes,
  type CalendarioEventoDatetimeState,
} from '../components/calendario/CalendarioEventoDatetimeFields';
import { formatEventPeriod } from '../utils/calendarioEventoDatetimes';
import type { Projeto, Etapa } from '../types';

// ─── Mobile detection ────────────────────────────────────────────────────────

const SM_BREAKPOINT = 640;

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < SM_BREAKPOINT);
  useEffect(() => {
    function onResize() { setMobile(window.innerWidth < SM_BREAKPOINT); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'list';
type EventColor = 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'purple' | 'custom' | 'feriado';

interface CalendarEvent {
  id: number;
  tipo: 'etapa' | 'custom';
  etapaNome: string;
  etapaStatus: string;
  projetoId: number;
  projetoNome: string;
  setores: { id: number; nome: string }[];
  executorId: number;
  executorNome: string;
  participantIds: number[];
  /** Quando true, o evento customizado notifica/atinge todos os usuários (filtro por pessoa não exclui). */
  alvoTodos?: boolean;
  customEventId?: number;
  /** Só integrantes explícitos (API); o criador pode estar fora desta lista. */
  customParticipanteIds?: number[];
  descricaoCustom?: string | null;
  criadorId?: number;
  /** Evento gerado automaticamente a partir de um feriado de RH. */
  feriadoId?: number | null;
  start: Date | null;
  end: Date | null;
  color: EventColor;
  timelineLabel: string;
}

/** Chave estável na lista (etapa.id pode coincidir numericamente com outros contextos). */
function eventRowKey(ev: CalendarEvent): string {
  return ev.tipo === 'custom' && ev.customEventId != null ? `c-${ev.customEventId}` : `e-${ev.id}`;
}

/** Eventos extras do calendário primeiro; depois etapas (ordem estável por nome). */
function sortEventsCustomFirst(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const ca = a.tipo === 'custom' ? 0 : 1;
    const cb = b.tipo === 'custom' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return a.etapaNome.localeCompare(b.etapaNome, 'pt-BR', { sensitivity: 'base' });
  });
}

interface CalendarioEventoApi {
  id: number;
  titulo: string;
  descricao: string | null;
  dataInicio: string;
  dataFim: string;
  alvo: 'TODOS_USUARIOS' | 'SELECIONADOS';
  criadorId: number;
  feriadoId?: number | null;
  projetoId?: number | null;
  projeto?: { id: number; nome: string } | null;
  criador: { id: number; nome: string };
  participantes: Array<{ usuarioId: number; usuario: { id: number; nome: string } }>;
}

interface ProjectWithEtapas extends Projeto {
  etapas?: Etapa[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MAX_PILLS_PER_DAY = 3;

const COLOR_MAP: Record<EventColor, { bg: string; text: string; border: string; dot: string }> = {
  green:  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  blue:   { bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/40',    dot: 'bg-blue-400'   },
  amber:  { bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/40',   dot: 'bg-amber-400'  },
  red:    { bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/40',     dot: 'bg-red-400'    },
  gray:   { bg: 'bg-gray-500/20',    text: 'text-gray-400',    border: 'border-gray-500/40',    dot: 'bg-gray-400'   },
  purple: { bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/40',  dot: 'bg-purple-400' },
  custom: { bg: 'bg-indigo-500/20',  text: 'text-indigo-300',  border: 'border-indigo-500/40',  dot: 'bg-indigo-400' },
  feriado: { bg: 'bg-rose-500/20',   text: 'text-rose-300',    border: 'border-rose-500/40',    dot: 'bg-rose-400'   },
};

const ETAPA_STATUS_OPTIONS = [
  { value: 'PENDENTE',     label: 'Pendente' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento' },
  { value: 'EM_ANALISE',   label: 'Em Análise' },
  { value: 'APROVADA',     label: 'Aprovada' },
  { value: 'REPROVADA',    label: 'Reprovada' },
];

// ─── Date Helpers ────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthGrid(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  for (let i = first.getDay() - 1; i >= 0; i--) days.push(addDays(first, -i - 1));
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(addDays(last, days.length - (first.getDay() + last.getDate()) + 1));
  return days;
}

function getWeekGrid(ref: Date): Date[] {
  const d = startOfDay(ref);
  const sun = addDays(d, -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
}

function eventOverlapsDay(ev: CalendarEvent, day: Date): boolean {
  if (!ev.start && !ev.end) return false;
  const dMs = startOfDay(day).getTime();
  const dEnd = dMs + 86_400_000 - 1;
  const eStart = ev.start ? startOfDay(ev.start).getTime() : dMs;
  const eEnd = ev.end ? startOfDay(ev.end).getTime() + 86_400_000 - 1 : eStart + 86_400_000 - 1;
  return eStart <= dEnd && eEnd >= dMs;
}

function eventInRange(ev: CalendarEvent, rangeStart: Date, rangeEnd: Date): boolean {
  if (!ev.start && !ev.end) return true;
  const rS = startOfDay(rangeStart).getTime();
  const rE = startOfDay(rangeEnd).getTime() + 86_400_000 - 1;
  const eS = ev.start ? startOfDay(ev.start).getTime() : rS;
  const eE = ev.end ? startOfDay(ev.end).getTime() + 86_400_000 - 1 : eS + 86_400_000 - 1;
  return eS <= rE && eE >= rS;
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Event Helpers ───────────────────────────────────────────────────────────

function resolveColor(etapa: Etapa): EventColor {
  if (!etapa.dataInicio && !etapa.dataFim) return 'purple';

  // getEtapaTimelineStatus espera checklistJson/checklistEntregas; a API inclui esses campos
  const tl = getEtapaTimelineStatus(etapa as any);
  if (tl === 'FINALIZADO') return 'green';
  if (tl === 'VENCIDA') return 'red';
  if (tl === 'NAO_INICIADO') return 'gray';

  if (etapa.dataFim) {
    const today = startOfDay(new Date()).getTime();
    const fim = startOfDay(new Date(etapa.dataFim)).getTime();
    const diff = Math.floor((fim - today) / 86_400_000);
    if (diff >= 0 && diff <= 7) return 'amber';
  }

  return 'blue';
}

const COLOR_LABEL: Record<EventColor, string> = {
  green: 'Concluída', blue: 'Em andamento', amber: 'Vencendo',
  red: 'Atrasada', gray: 'Não iniciada', purple: 'Sem data', custom: 'Evento', feriado: 'Feriado',
};

function mapCalendarioApiToEvent(ev: CalendarioEventoApi): CalendarEvent {
  const participanteIds = ev.participantes.map((p) => p.usuarioId);
  const ids = new Set<number>();
  ids.add(ev.criadorId);
  participanteIds.forEach((id) => ids.add(id));
  const alvoTodos = ev.alvo === 'TODOS_USUARIOS';
  const isFeriado = ev.feriadoId != null;
  return {
    id: -ev.id,
    tipo: 'custom',
    customEventId: ev.id,
    customParticipanteIds: participanteIds,
    etapaNome: ev.titulo,
    etapaStatus: isFeriado ? 'FERIADO' : 'EVENTO',
    projetoId: ev.projetoId ?? 0,
    projetoNome: isFeriado
      ? 'Feriado — sem exigência de ponto'
      : ev.projeto?.nome ?? (alvoTodos ? 'Todos os usuários' : 'Integrantes selecionados'),
    setores: [],
    executorId: ev.criador.id,
    executorNome: ev.criador.nome,
    participantIds: [...ids],
    alvoTodos,
    descricaoCustom: ev.descricao,
    criadorId: ev.criadorId,
    feriadoId: ev.feriadoId ?? null,
    start: new Date(ev.dataInicio),
    end: new Date(ev.dataFim),
    color: isFeriado ? 'feriado' : 'custom',
    timelineLabel: isFeriado ? COLOR_LABEL.feriado : COLOR_LABEL.custom,
  };
}

function calendarEventToApiStub(ev: CalendarEvent): CalendarioEventoApi | null {
  if (ev.tipo !== 'custom' || ev.customEventId == null || !ev.start || !ev.end || ev.criadorId == null) return null;
  const part = ev.customParticipanteIds ?? [];
  return {
    id: ev.customEventId,
    titulo: ev.etapaNome,
    descricao: ev.descricaoCustom ?? null,
    dataInicio: ev.start.toISOString(),
    dataFim: ev.end.toISOString(),
    alvo: ev.alvoTodos ? 'TODOS_USUARIOS' : 'SELECIONADOS',
    criadorId: ev.criadorId,
    projetoId: ev.projetoId || null,
    criador: { id: ev.criadorId, nome: ev.executorNome },
    participantes: part.map((usuarioId) => ({ usuarioId, usuario: { id: usuarioId, nome: '' } })),
  };
}

function buildEvent(etapa: Etapa, proj: ProjectWithEtapas): CalendarEvent {
  const ids: number[] = [];
  if (etapa.executor?.id) ids.push(etapa.executor.id);
  etapa.integrantes?.forEach((i) => {
    if (i.usuario?.id && !ids.includes(i.usuario.id)) ids.push(i.usuario.id);
  });

  const color = resolveColor(etapa);

  return {
    id: etapa.id,
    tipo: 'etapa',
    etapaNome: etapa.nome,
    etapaStatus: etapa.status,
    projetoId: proj.id,
    projetoNome: proj.nome,
    setores: proj.setores ?? (proj.setor ? [proj.setor] : []),
    executorId: etapa.executor?.id ?? 0,
    executorNome: etapa.executor?.nome ?? '—',
    participantIds: ids,
    start: etapa.dataInicio ? new Date(etapa.dataInicio) : null,
    end: etapa.dataFim ? new Date(etapa.dataFim) : null,
    color,
    timelineLabel: COLOR_LABEL[color],
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: (e: CalendarEvent) => void }) {
  const c = COLOR_MAP[event.color];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      className={`w-full text-left truncate px-1.5 py-0.5 rounded text-[11px] leading-tight font-medium ${c.bg} ${c.text} border ${c.border} hover:brightness-125 transition-all`}
      title={`${event.etapaNome} — ${event.projetoNome}`}
    >
      {event.etapaNome}
    </button>
  );
}

function EventPopover({
  event,
  onClose,
  onViewProject,
  onEditCustom,
  onDeleteCustom,
  canEditCustom,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onViewProject: (id: number) => void;
  onEditCustom?: (e: CalendarEvent) => void;
  onDeleteCustom?: (e: CalendarEvent) => void;
  canEditCustom: boolean;
}) {
  const c = COLOR_MAP[event.color];
  const box = useRef<HTMLDivElement>(null);
  const isCustom = event.tipo === 'custom';

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={box}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral border border-white/20 rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            {event.timelineLabel}
          </span>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <h3 className="text-white font-semibold text-base mb-1">{event.etapaNome}</h3>
        {isCustom ? (
          <p className="text-white/55 text-xs mb-2">{event.projetoNome}</p>
        ) : (
          <p className="text-white/60 text-sm mb-4">{event.projetoNome}</p>
        )}
        {isCustom && event.descricaoCustom ? (
          <p className="text-white/70 text-sm mb-4 whitespace-pre-wrap">{event.descricaoCustom}</p>
        ) : null}

        <dl className="space-y-2 text-sm">
          {(isCustom
            ? [
                ['Criado por', event.executorNome],
                ['Integrantes', event.alvoTodos ? 'Todos os usuários ativos' : 'Selecionados (notificados)'],
                ['Período', formatEventPeriod(event.start, event.end)],
              ]
            : [
                ['Participante', event.executorNome],
                ['Início', fmtDate(event.start)],
                ['Prazo', fmtDate(event.end)],
                ['Status', event.etapaStatus.replace(/_/g, ' ')],
                event.setores.length > 0 ? ['Setor', event.setores.map((s) => s.nome).join(', ')] : null,
              ]
          )
            .filter(Boolean)
            .map((row) => {
              const [label, value] = row as [string, string];
              return (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-white/50 shrink-0">{label}</dt>
                  <dd className="text-white/90 text-right">{value}</dd>
                </div>
              );
            })}
        </dl>

        {!isCustom && event.projetoId > 0 && (
          <button
            type="button"
            onClick={() => onViewProject(event.projetoId)}
            className="mt-4 w-full px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-sm font-medium transition-colors"
          >
            Ver projeto
          </button>
        )}

        {isCustom && canEditCustom && onEditCustom && onDeleteCustom && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onEditCustom(event)}
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white/90 hover:bg-white/15 text-sm font-medium transition-colors"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => onDeleteCustom(event)}
              className="flex-1 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium transition-colors"
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day Detail (mobile bottom-sheet) ────────────────────────────────────────

function DayDetailSheet({
  day, events, onClose, onEventClick,
}: {
  day: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={box}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral border-t sm:border border-white/20 sm:rounded-xl rounded-t-xl shadow-2xl w-full sm:max-w-sm max-h-[70vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-neutral border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">
            {day.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </h4>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-3 space-y-2">
          {events.length === 0 && <p className="text-white/40 text-sm text-center py-4">Nenhum item neste dia.</p>}
          {events.map((ev) => {
            const cl = COLOR_MAP[ev.color];
            return (
              <button
                key={eventRowKey(ev)}
                onClick={() => onEventClick(ev)}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-lg ${cl.bg} border ${cl.border} active:brightness-125 transition-all`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cl.dot}`} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${cl.text} truncate`}>{ev.etapaNome}</span>
                  <span className="block text-xs text-white/50 truncate">{ev.projetoNome}</span>
                </span>
                <span className={`text-[10px] shrink-0 ${cl.text}`}>{ev.timelineLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────────────────────

const MAX_DOTS_MOBILE = 4;

function MonthView({
  days, events, month, onEventClick, isMobile,
}: {
  days: Date[];
  events: CalendarEvent[];
  month: number;
  onEventClick: (e: CalendarEvent) => void;
  isMobile: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return sortEventsCustomFirst(events.filter((e) => eventOverlapsDay(e, selectedDay)));
  }, [selectedDay, events]);

  const headers = isMobile ? WEEKDAYS_SHORT : WEEKDAYS;

  return (
    <>
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-white/5">
          {headers.map((w, i) => (
            <div key={i} className="px-1 sm:px-2 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-white/60 border-b border-white/10">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const inMonth = day.getMonth() === month;
            const today = isSameDay(day, new Date());
            const dayEvts = sortEventsCustomFirst(events.filter((e) => eventOverlapsDay(e, day)));

            return (
              <div
                key={idx}
                role={isMobile && dayEvts.length > 0 ? 'button' : undefined}
                tabIndex={isMobile && dayEvts.length > 0 ? 0 : undefined}
                onClick={() => {
                  if (isMobile && dayEvts.length > 0) setSelectedDay(day);
                }}
                className={`min-h-[56px] sm:min-h-[100px] border-b border-r border-white/5 p-0.5 sm:p-1 text-left ${
                  inMonth ? '' : 'bg-white/[0.02]'
                } ${today ? 'ring-1 ring-inset ring-primary/50 bg-primary/[0.08]' : ''} ${
                  isMobile && dayEvts.length > 0 ? 'active:bg-white/5 cursor-pointer' : ''
                }`}
              >
                <div className="mb-0.5 sm:mb-1 px-0.5 sm:px-1">
                  {today ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <span
                        aria-current="date"
                        title="Hoje"
                        className="inline-flex items-center justify-center bg-primary text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 text-[10px] sm:text-xs font-bold shadow-sm shadow-primary/30"
                      >
                        {day.getDate()}
                      </span>
                      <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-primary leading-none">
                        Hoje
                      </span>
                    </div>
                  ) : (
                    <span className={`text-[10px] sm:text-xs ${inMonth ? 'text-white/70' : 'text-white/30'}`}>
                      {day.getDate()}
                    </span>
                  )}
                </div>

                {/* Mobile: colored dots */}
                {isMobile && dayEvts.length > 0 && (
                  <div className="flex flex-wrap gap-[3px] justify-start px-0.5 mt-0.5">
                    {dayEvts.slice(0, MAX_DOTS_MOBILE).map((ev) => (
                      <span key={eventRowKey(ev)} className={`w-[6px] h-[6px] rounded-full ${COLOR_MAP[ev.color].dot}`} />
                    ))}
                    {dayEvts.length > MAX_DOTS_MOBILE && (
                      <span className="text-[8px] text-white/40 leading-none">+{dayEvts.length - MAX_DOTS_MOBILE}</span>
                    )}
                  </div>
                )}

                {/* Desktop: text pills */}
                {!isMobile && (
                  <div className="space-y-0.5">
                    {dayEvts.slice(0, MAX_PILLS_PER_DAY).map((ev) => (
                      <EventPill key={eventRowKey(ev)} event={ev} onClick={onEventClick} />
                    ))}
                    {dayEvts.length > MAX_PILLS_PER_DAY && (
                      <span className="block text-[10px] text-white/40 px-1">+{dayEvts.length - MAX_PILLS_PER_DAY} mais</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile day-detail bottom sheet */}
      {selectedDay && (
        <DayDetailSheet
          day={selectedDay}
          events={selectedDayEvents}
          onClose={() => setSelectedDay(null)}
          onEventClick={(ev) => { setSelectedDay(null); onEventClick(ev); }}
        />
      )}
    </>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

function WeekView({
  days, events, onEventClick, isMobile,
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  isMobile: boolean;
}) {
  if (isMobile) {
    // Mobile: vertical list por dia (mais legível que 7 colunas estreitas)
    return (
      <div className="space-y-3">
        {days.map((day, i) => {
          const today = isSameDay(day, new Date());
          const dayEvts = sortEventsCustomFirst(events.filter((e) => eventOverlapsDay(e, day)));
          return (
            <div key={i} className="border border-white/10 rounded-lg overflow-hidden">
              <div className={`px-3 py-2 flex items-center gap-2 ${today ? 'bg-primary/20' : 'bg-white/5'}`}>
                <span className={`text-xs font-medium ${today ? 'text-primary' : 'text-white/60'}`}>
                  {WEEKDAYS[i]}
                </span>
                <span className={`text-sm font-semibold ${today ? 'text-white' : 'text-white/80'}`}>
                  {day.getDate()}
                </span>
                {today && <span className="text-[10px] text-primary font-medium ml-auto">Hoje</span>}
              </div>
              <div className="p-2 space-y-1.5">
                {dayEvts.length === 0 && <p className="text-[11px] text-white/20 text-center py-2">—</p>}
                {dayEvts.map((ev) => {
                  const cl = COLOR_MAP[ev.color];
                  return (
                    <button
                      key={eventRowKey(ev)}
                      onClick={() => onEventClick(ev)}
                      className={`w-full text-left flex items-center gap-2.5 p-2.5 rounded-lg ${cl.bg} border ${cl.border} active:brightness-125 transition-all`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${cl.dot}`} />
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm font-medium ${cl.text} truncate`}>{ev.etapaNome}</span>
                        <span className="block text-xs text-white/50 truncate">{ev.projetoNome}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop: grid 7 colunas
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-white/5">
        {days.map((day, i) => {
          const today = isSameDay(day, new Date());
          return (
            <div
              key={i}
              className={`px-2 py-2 text-center border-b border-white/10 ${
                today ? 'ring-1 ring-inset ring-primary/50 bg-primary/[0.08]' : ''
              }`}
            >
              <div className="text-xs text-white/60">{WEEKDAYS[i]}</div>
              {today ? (
                <div className="mt-1 flex flex-col items-center gap-1">
                  <span
                    aria-current="date"
                    title="Hoje"
                    className="inline-flex items-center justify-center bg-primary text-white rounded-full w-7 h-7 text-sm font-bold shadow-sm shadow-primary/30"
                  >
                    {day.getDate()}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Hoje</span>
                </div>
              ) : (
                <div className="text-sm mt-0.5 text-white/80">{day.getDate()}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-7 divide-x divide-white/5">
        {days.map((day, i) => {
          const dayEvts = sortEventsCustomFirst(events.filter((e) => eventOverlapsDay(e, day)));
          return (
            <div key={i} className="min-h-[220px] p-1.5 space-y-1">
              {dayEvts.length === 0 && <span className="block text-[10px] text-white/20 text-center pt-8">—</span>}
              {dayEvts.map((ev) => {
                const cl = COLOR_MAP[ev.color];
                return (
                  <button
                    key={eventRowKey(ev)}
                    onClick={() => onEventClick(ev)}
                    className={`w-full text-left p-2 rounded-lg ${cl.bg} border ${cl.border} hover:brightness-125 transition-all`}
                  >
                    <div className={`text-xs font-medium ${cl.text} truncate`}>{ev.etapaNome}</div>
                    <div className="text-[10px] text-white/50 truncate mt-0.5">{ev.projetoNome}</div>
                    <div className="text-[10px] text-white/40 truncate">{ev.executorNome}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List / Agenda View ──────────────────────────────────────────────────────

function ListView({
  events, onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const noDate: CalendarEvent[] = [];

    for (const ev of events) {
      if (!ev.start && !ev.end) { noDate.push(ev); continue; }
      const key = (ev.start ?? ev.end)!.toISOString().split('T')[0];
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }

    for (const arr of map.values()) {
      arr.splice(0, arr.length, ...sortEventsCustomFirst(arr));
    }
    const noDateSorted = sortEventsCustomFirst(noDate);

    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (noDateSorted.length > 0) sorted.push(['sem-data', noDateSorted]);
    return sorted;
  }, [events]);

  if (events.length === 0) {
    return <p className="text-center py-12 text-white/40 text-sm">Nenhum item encontrado no período.</p>;
  }

  return (
    <div className="space-y-5">
      {grouped.map(([dateKey, list]) => (
        <div key={dateKey}>
          <h4 className="text-xs font-medium text-white/50 mb-2 px-1 capitalize">
            {dateKey === 'sem-data'
              ? 'Sem data definida'
              : new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR', {
                  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                })}
          </h4>
          <div className="space-y-1.5">
            {list.map((ev) => {
              const cl = COLOR_MAP[ev.color];
              return (
                <button
                  key={eventRowKey(ev)}
                  onClick={() => onEventClick(ev)}
                  className={`w-full text-left flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-3 rounded-lg ${cl.bg} border ${cl.border} hover:brightness-125 active:brightness-125 transition-all`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cl.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${cl.text} truncate`}>{ev.etapaNome}</span>
                      <span className="block text-xs text-white/50 truncate">{ev.projetoNome} · {ev.executorNome}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:block sm:text-right pl-[18px] sm:pl-0 shrink-0">
                    <span className="text-[11px] sm:text-xs text-white/40">
                      {formatEventPeriod(ev.start, ev.end)}
                    </span>
                    <span className={`block text-[10px] sm:mt-0.5 ${cl.text}`}>{ev.timelineLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
      {(Object.entries(COLOR_LABEL) as [EventColor, string][]).map(([c, label]) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAP[c].dot}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── Modal: evento customizado (métrica / viagem etc.) ───────────────────────

interface UserOption {
  id: number;
  nome: string;
}

function CustomEventModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: CalendarioEventoApi | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [schedule, setSchedule] = useState<CalendarioEventoDatetimeState>(defaultCalendarioEventoDatetimes());
  const [alvo, setAlvo] = useState<'TODOS_USUARIOS' | 'SELECIONADOS'>('SELECIONADOS');
  const [projetoId, setProjetoId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: number; nome: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (initial) {
      setTitulo(initial.titulo);
      setDescricao(initial.descricao ?? '');
      setSchedule(calendarioDatetimesFromIso(initial.dataInicio, initial.dataFim));
      setAlvo(initial.alvo);
      setProjetoId(initial.projetoId ? String(initial.projetoId) : '');
      setSelectedIds(new Set(initial.participantes.map((p) => p.usuarioId)));
    } else {
      setTitulo('');
      setDescricao('');
      setSchedule(defaultCalendarioEventoDatetimes());
      setAlvo('SELECIONADOS');
      setProjetoId('');
      setSelectedIds(new Set());
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<UserOption[]>('/users/options');
        if (!cancelled) setUserOptions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setUserOptions([]);
      }
      try {
        const { data } = await api.get<Array<{ id: number; nome: string }>>('/projects/options');
        if (!cancelled) setProjectOptions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setProjectOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  function toggleUser(id: number) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!titulo.trim()) {
      setFormError('Informe o nome do evento.');
      return;
    }
    if (alvo === 'SELECIONADOS' && selectedIds.size === 0) {
      setFormError('Selecione ao menos um integrante ou marque «Todos os usuários».');
      return;
    }
    const range = buildCalendarioEventoIsoRange(schedule);
    if (range.error) {
      setFormError(range.error);
      return;
    }

    setSaving(true);
    try {
      const body = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        dataInicio: range.dataInicio,
        dataFim: range.dataFim,
        alvo,
        projetoId: projetoId ? Number(projetoId) : 0,
        ...(alvo === 'SELECIONADOS' ? { usuarioIds: [...selectedIds] } : {}),
      };
      if (initial) {
        await api.patch(`/calendario/eventos/${initial.id}`, body);
      } else {
        await api.post('/calendario/eventos', body);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-neutral border border-white/20 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">{initial ? 'Editar evento' : 'Novo evento no calendário'}</h3>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {formError && <p className="text-red-400 text-xs">{formError}</p>}
          <div>
            <label className="block text-xs text-white/70 mb-1">Nome do evento</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white"
              placeholder="Ex.: Viagem, treinamento…"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Projeto (opcional)</label>
            <select
              value={projetoId}
              onChange={(e) => setProjetoId(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white"
            >
              <option value="" className="bg-neutral text-white">
                Sem vínculo de projeto
              </option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id} className="bg-neutral text-white">
                  {project.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Descrição (opcional)</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white min-h-[72px]"
              maxLength={2000}
            />
          </div>
          <CalendarioEventoDatetimeFields value={schedule} onChange={setSchedule} />
          <div>
            <span className="block text-xs text-white/70 mb-2">Integrantes (recebem notificação e veem no calendário)</span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white/85 cursor-pointer">
                <input
                  type="radio"
                  name="alvo"
                  checked={alvo === 'TODOS_USUARIOS'}
                  onChange={() => setAlvo('TODOS_USUARIOS')}
                  className="accent-primary"
                />
                Todos os usuários ativos
              </label>
              <label className="flex items-center gap-2 text-sm text-white/85 cursor-pointer">
                <input
                  type="radio"
                  name="alvo"
                  checked={alvo === 'SELECIONADOS'}
                  onChange={() => setAlvo('SELECIONADOS')}
                  className="accent-primary"
                />
                Selecionar pessoas
              </label>
            </div>
          </div>
          {alvo === 'SELECIONADOS' && (
            <div className="max-h-40 overflow-y-auto border border-white/10 rounded-md p-2 space-y-1">
              {userOptions.length === 0 ? (
                <p className="text-white/40 text-xs">Carregando usuários…</p>
              ) : (
                userOptions.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-xs text-white/80 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="accent-primary rounded"
                    />
                    {u.nome}
                  </label>
                ))
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/10 text-white/90 text-sm hover:bg-white/15">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Calendar() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  /** Visão geral: todas as etapas + filtros por pessoa e setor */
  const canGlobalCalendar = useMemo(() => userHasPermission(user, 'calendario:ver_todos'), [user]);
  /** Acesso à página (visualizar próprias etapas ou visão global) */
  const canViewCalendar = useMemo(
    () => userHasPermission(user, 'calendario:visualizar') || userHasPermission(user, 'calendario:ver_todos'),
    [user],
  );
  const isMobile = useIsMobile();

  const [etapaEvents, setEtapaEvents] = useState<CalendarEvent[]>([]);
  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const allEvents = useMemo(() => [...etapaEvents, ...customEvents], [etapaEvents, customEvents]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManageCustomEvents = useMemo(() => userHasPermission(user, 'calendario:eventos'), [user]);
  const canAdmin = useMemo(() => userHasPermission(user, 'sistema:administrar'), [user]);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [refDate, setRefDate] = useState(() => new Date());

  const [showFilters, setShowFilters] = useState(false);
  const [filterProjeto, setFilterProjeto] = useState('all');
  const [filterUsuario, setFilterUsuario] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSetor, setFilterSetor] = useState('all');

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCustomEventModal, setShowCustomEventModal] = useState(false);
  const [editingCustomEvent, setEditingCustomEvent] = useState<CalendarioEventoApi | null>(null);

  useEffect(() => {
    const rawEventoId = searchParams.get('eventoId');
    if (!rawEventoId) return;
    const eventoId = Number(rawEventoId);
    if (!Number.isInteger(eventoId) || eventoId < 1) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('eventoId');
        return next;
      }, { replace: true });
      return;
    }

    const target = customEvents.find((ev) => ev.customEventId === eventoId);
    if (!target) return;

    setSelectedEvent(target);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('eventoId');
      return next;
    }, { replace: true });
  }, [customEvents, searchParams, setSearchParams]);

  // Visão simples: não usar filtros de pessoa/setor (nem estado residual)
  useEffect(() => {
    if (!canGlobalCalendar) {
      setFilterUsuario('all');
      setFilterSetor('all');
    }
  }, [canGlobalCalendar]);

  // ── Derived filter options ──
  const projetoOpts = useMemo(() => {
    const m = new Map<number, string>();
    allEvents.forEach((e) => {
      if (e.tipo === 'custom') return;
      m.set(e.projetoId, e.projetoNome);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: String(id), label: n }));
  }, [allEvents]);

  const usuarioOpts = useMemo(() => {
    const m = new Map<number, string>();
    allEvents.forEach((e) => {
      if (e.executorId) m.set(e.executorId, e.executorNome);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: String(id), label: n }));
  }, [allEvents]);

  const setorOpts = useMemo(() => {
    const m = new Map<number, string>();
    allEvents.forEach((e) => e.setores.forEach((s) => m.set(s.id, s.nome)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: String(id), label: n }));
  }, [allEvents]);

  // ── Filtered events ──
  const filtered = useMemo(() => {
    return allEvents.filter((ev) => {
      if (filterProjeto !== 'all') {
        if (ev.tipo === 'custom') return false;
        if (String(ev.projetoId) !== filterProjeto) return false;
      }
      if (canGlobalCalendar) {
        if (filterUsuario !== 'all') {
          if (ev.tipo === 'custom') {
            if (!ev.alvoTodos && !ev.participantIds.includes(Number(filterUsuario))) return false;
          } else if (!ev.participantIds.includes(Number(filterUsuario))) {
            return false;
          }
        }
        if (filterSetor !== 'all') {
          if (ev.tipo === 'custom') return false;
          if (!ev.setores.some((s) => s.id === Number(filterSetor))) return false;
        }
      }
      if (filterStatus !== 'all') {
        if (ev.tipo === 'custom') return false;
        if (ev.etapaStatus !== filterStatus) return false;
      }
      return true;
    });
  }, [allEvents, filterProjeto, filterUsuario, filterStatus, filterSetor, canGlobalCalendar]);

  const hasActiveFilters = canGlobalCalendar
    ? filterProjeto !== 'all' || filterUsuario !== 'all' || filterStatus !== 'all' || filterSetor !== 'all'
    : filterProjeto !== 'all' || filterStatus !== 'all';

  // ── Calendar grids ──
  const yr = refDate.getFullYear();
  const mo = refDate.getMonth();
  const monthDays = useMemo(() => getMonthGrid(yr, mo), [yr, mo]);
  const weekDays = useMemo(() => getWeekGrid(refDate), [refDate]);

  // ── Events visible in the current view ──
  const viewEvents = useMemo(() => {
    if (viewMode === 'month') {
      const s = monthDays[0];
      const e = monthDays[monthDays.length - 1];
      return filtered.filter((ev) => (ev.start || ev.end) && eventInRange(ev, s, e));
    }
    if (viewMode === 'week') {
      return filtered.filter((ev) => (ev.start || ev.end) && eventInRange(ev, weekDays[0], weekDays[6]));
    }
    const ms = new Date(yr, mo, 1);
    const me = new Date(yr, mo + 1, 0);
    return filtered.filter((ev) => (!ev.start && !ev.end) || eventInRange(ev, ms, me));
  }, [viewMode, filtered, monthDays, weekDays, yr, mo]);

  // ── Navigation ──
  const goToday = useCallback(() => setRefDate(new Date()), []);

  const goPrev = useCallback(() => {
    setRefDate((d) => (viewMode === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, 1)));
  }, [viewMode]);

  const goNext = useCallback(() => {
    setRefDate((d) => (viewMode === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, 1)));
  }, [viewMode]);

  const navTitle = useMemo(() => {
    if (viewMode !== 'week') {
      return isMobile ? `${MONTHS[mo].slice(0, 3)} ${yr}` : `${MONTHS[mo]} ${yr}`;
    }
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return isMobile
        ? `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)}`
        : `${s.getDate()} – ${e.getDate()} de ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
  }, [viewMode, mo, yr, weekDays, isMobile]);

  // ── Data fetch ──
  useEffect(() => {
    if (!canViewCalendar) {
      setLoading(false);
      setEtapaEvents([]);
      setCustomEvents([]);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        let projects: ProjectWithEtapas[];

        if (canGlobalCalendar) {
          const { data } = await api.get<Projeto[]>('/projects');
          projects = await Promise.all(
            data.map(async (p) => {
              try {
                const { data: d } = await api.get<ProjectWithEtapas>(`/projects/${p.id}`);
                return { ...p, etapas: d.etapas ?? [] } as ProjectWithEtapas;
              } catch { return { ...p, etapas: [] } as ProjectWithEtapas; }
            }),
          );
        } else {
          const { data } = await api.get<{ projetos: Projeto[]; etapasPendentes: any[] }>('/tasks/my');
          const seen = new Set<number>();
          const unique = (data.projetos ?? []).filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
          projects = await Promise.all(
            unique.map(async (p) => {
              try {
                const { data: d } = await api.get<ProjectWithEtapas>(`/projects/${p.id}`);
                return { ...p, etapas: d.etapas ?? [] } as ProjectWithEtapas;
              } catch { return { ...p, etapas: [] } as ProjectWithEtapas; }
            }),
          );
        }

        if (cancelled) return;

        const events: CalendarEvent[] = [];
        const uid = user?.id;

        for (const proj of projects) {
          if (!Array.isArray(proj.etapas)) continue;
          for (const etapa of proj.etapas) {
            if (!canGlobalCalendar && uid) {
              const ok =
                etapa.executor?.id === uid ||
                etapa.integrantes?.some((i) => i.usuario?.id === uid);
              if (!ok) continue;
            }
            events.push(buildEvent(etapa, proj));
          }
        }

        setEtapaEvents(events);

        try {
          const { data: customList } = await api.get<CalendarioEventoApi[]>('/calendario/eventos');
          if (!cancelled) setCustomEvents((customList ?? []).map(mapCalendarioApiToEvent));
        } catch {
          if (!cancelled) setCustomEvents([]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message ?? 'Falha ao carregar calendário');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [canGlobalCalendar, canViewCalendar, user?.id]);

  const reloadCustomEvents = useCallback(async () => {
    if (!canViewCalendar) return;
    try {
      const { data } = await api.get<CalendarioEventoApi[]>('/calendario/eventos');
      setCustomEvents((data ?? []).map(mapCalendarioApiToEvent));
    } catch {
      setCustomEvents([]);
    }
  }, [canViewCalendar]);

  const handleViewProject = useCallback(
    (id: number) => { setSelectedEvent(null); navigate(`/projects/${id}`); },
    [navigate],
  );

  const handleEditCustom = useCallback((ev: CalendarEvent) => {
    const stub = calendarEventToApiStub(ev);
    if (!stub) return;
    setEditingCustomEvent(stub);
    setShowCustomEventModal(true);
    setSelectedEvent(null);
  }, []);

  const handleDeleteCustom = useCallback(
    async (ev: CalendarEvent) => {
      if (ev.tipo !== 'custom' || ev.customEventId == null) return;
      if (!window.confirm('Excluir este evento? Ele some do calendário e o vínculo nas notificações é desfeito.')) return;
      try {
        await api.delete(`/calendario/eventos/${ev.customEventId}`);
        setSelectedEvent(null);
        await reloadCustomEvents();
      } catch (err: any) {
        window.alert(err.response?.data?.message ?? 'Falha ao excluir o evento.');
      }
    },
    [reloadCustomEvents],
  );

  // ── Render ──
  if (user && !canViewCalendar) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center max-w-md mx-auto">
        <p className="text-white/90 text-sm font-medium mb-1">Sem acesso ao calendário</p>
        <p className="text-white/50 text-xs leading-relaxed">
          É necessária a permissão <span className="text-white/70">calendario:visualizar</span> ou{' '}
          <span className="text-white/70">calendario:ver_todos</span>. Peça ao administrador para ajustar seu cargo.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white/60 text-sm">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Carregando calendário…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Modo de visão + criar evento ── */}
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
        <div
          className={`flex-1 rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm leading-snug ${
            canGlobalCalendar
              ? 'border-primary/30 bg-primary/10 text-white/85'
              : 'border-white/15 bg-white/[0.04] text-white/80'
          }`}
        >
          {canGlobalCalendar ? (
            <>
              <span className="font-semibold text-primary">Visão geral</span>
              <span className="text-white/60"> — </span>
              <span className="text-white/70">
                Etapas de projetos e eventos avulsos. Filtre por projeto, pessoa, setor ou status. Eventos extras aparecem em roxo/índigo.
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-white/90">Minhas etapas</span>
              <span className="text-white/50"> — </span>
              <span className="text-white/65">
                Projetos em que você participa e eventos em que foi marcado. Filtre por projeto e status da etapa.
              </span>
            </>
          )}
        </div>
        {canManageCustomEvents && (
          <button
            type="button"
            onClick={() => {
              setEditingCustomEvent(null);
              setShowCustomEventModal(true);
            }}
            className="shrink-0 px-4 py-2.5 rounded-lg bg-indigo-500/20 text-indigo-200 text-xs sm:text-sm font-medium hover:bg-indigo-500/30 border border-indigo-500/35 whitespace-nowrap self-start sm:self-stretch sm:min-w-[140px]"
          >
            + Novo evento
          </button>
        )}
      </div>

      {/* ── Navigation + view toggle ── */}
      <div className="flex flex-col gap-3">
        {/* Row 1: nav arrows + title + today */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={goPrev} className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors" aria-label="Anterior">
              <ChevronLeft />
            </button>
            <h2 className="text-white font-semibold text-base sm:text-lg min-w-[90px] sm:min-w-[220px] text-center select-none">{navTitle}</h2>
            <button onClick={goNext} className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors" aria-label="Próximo">
              <ChevronRight />
            </button>
            <button onClick={goToday} className="ml-1 sm:ml-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors">
              Hoje
            </button>
          </div>

          {/* View mode toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(['month', 'week', 'list'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-colors ${
                  viewMode === m ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {m === 'month' ? 'Mês' : m === 'week' ? 'Sem' : 'Lista'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <CollapsibleFilters
        title={canGlobalCalendar ? 'Filtros de busca' : 'Filtros (projeto e status)'}
        show={showFilters}
        setShow={setShowFilters}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setFilterProjeto('all');
          setFilterStatus('all');
          if (canGlobalCalendar) {
            setFilterUsuario('all');
            setFilterSetor('all');
          }
        }}
      >
        <div
          className={`grid grid-cols-1 gap-4 ${
            canGlobalCalendar ? 'md:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'
          }`}
        >
          <AppSelect label="Projeto" value={filterProjeto} onChange={setFilterProjeto} placeholder="Todos os projetos" options={projetoOpts} />
          {canGlobalCalendar && (
            <AppSelect label="Usuário" value={filterUsuario} onChange={setFilterUsuario} placeholder="Todos os usuários" options={usuarioOpts} />
          )}
          <AppSelect label="Status da etapa" value={filterStatus} onChange={setFilterStatus} placeholder="Todos os status" options={ETAPA_STATUS_OPTIONS} />
          {canGlobalCalendar && (
            <AppSelect label="Setor" value={filterSetor} onChange={setFilterSetor} placeholder="Todos os setores" options={setorOpts} />
          )}
        </div>
      </CollapsibleFilters>

      {/* ── Legend + stats ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <Legend />
        <span className="text-xs text-white/40">
          {viewEvents.length} {viewEvents.length !== 1 ? 'itens' : 'item'} no período
          {canGlobalCalendar ? ` · ${allEvents.length} no total` : ` · ${allEvents.length} no recorte`}
        </span>
      </div>

      {/* ── View ── */}
      {viewMode === 'month' && <MonthView days={monthDays} events={viewEvents} month={mo} onEventClick={setSelectedEvent} isMobile={isMobile} />}
      {viewMode === 'week' && <WeekView days={weekDays} events={viewEvents} onEventClick={setSelectedEvent} isMobile={isMobile} />}
      {viewMode === 'list' && <ListView events={viewEvents} onEventClick={setSelectedEvent} />}

      {/* ── Popover ── */}
      {selectedEvent && (
        <EventPopover
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onViewProject={handleViewProject}
          onEditCustom={canManageCustomEvents ? handleEditCustom : undefined}
          onDeleteCustom={canManageCustomEvents ? handleDeleteCustom : undefined}
          canEditCustom={
            selectedEvent.tipo === 'custom' &&
            selectedEvent.feriadoId == null &&
            canManageCustomEvents &&
            (selectedEvent.criadorId === user?.id || canAdmin)
          }
        />
      )}

      <CustomEventModal
        open={showCustomEventModal}
        initial={editingCustomEvent}
        onClose={() => {
          setShowCustomEventModal(false);
          setEditingCustomEvent(null);
        }}
        onSaved={reloadCustomEvents}
      />
    </div>
  );
}
