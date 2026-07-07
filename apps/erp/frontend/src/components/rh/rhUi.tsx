/**
 * Helpers de UI reaproveitados pelas abas do módulo de RH.
 * Mantém visual consistente com o restante do ERP (Tailwind + tema escuro).
 */
import { ReactNode } from 'react';

/**
 * Painel RH: `soft` = fundo agrupado + título; a moldura da grade fica no `DataTable` (igual Cargos / Usuários).
 * `framed` = painel com borda própria (ex.: bloco só com texto, sem tabela).
 */
export function Card({
  title,
  actions,
  children,
  surface = 'soft',
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  surface?: 'soft' | 'framed';
}) {
  const shell =
    surface === 'framed'
      ? 'rounded-xl border border-white/10 bg-white/5'
      : 'rounded-xl bg-white/5 ring-1 ring-white/10';
  return (
    <section className={shell}>
      {(title || actions) && (
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-white/60 block mb-1">{label}</label>
      {children}
    </div>
  );
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const MODAL_SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
};

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Largura máxima do modal. Default `md` (mantém comportamento legado). */
  size?: ModalSize;
}) {
  // Header/footer ficam fixos; o corpo rola quando o conteúdo passa da altura
  // disponível na viewport (evita modais "escapando" pelo rodapé da tela).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`bg-neutral text-white rounded-xl shadow-xl w-full ${MODAL_SIZE_CLASSES[size]} max-h-[90vh] flex flex-col overflow-hidden border border-white/10`}
      >
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1 min-h-0">{children}</div>
        <div className="px-5 py-3 border-t border-white/10 flex justify-end gap-2 bg-white/5 flex-shrink-0">
          {footer}
        </div>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  REPROVADO: 'Reprovado',
};

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDENTE: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30',
    APROVADO: 'bg-green-500/20 text-green-200 border-green-400/30',
    REPROVADO: 'bg-red-500/20 text-red-200 border-red-400/30',
    CANCELADO: 'bg-white/10 text-white/60 border-white/10',
    PRESENTE: 'bg-green-500/20 text-green-200 border-green-400/30',
    INCOMPLETO: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
    FALTA: 'bg-red-500/20 text-red-200 border-red-400/30',
    NAO_UTIL: 'bg-white/10 text-white/60 border-white/10',
    EM_ANDAMENTO: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
    CONCLUIDO: 'bg-green-500/20 text-green-200 border-green-400/30',
    PLANEJAMENTO: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
    ABERTO: 'bg-green-500/20 text-green-200 border-green-400/30',
    ENCERRADO: 'bg-white/10 text-white/60 border-white/10',
    RESPONDIDA: 'bg-green-500/20 text-green-200 border-green-400/30',
    REVISADA: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? 'bg-white/5 text-white/70 border-white/10'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function formatHoras(min: number): string {
  if (!Number.isFinite(min)) return '0h';
  const sinal = min < 0 ? '-' : '';
  const v = Math.abs(min);
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${sinal}${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
}

export function formatData(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

export function formatDataHora(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export function inputDateTimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function competenciaCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dataHojeYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function primeiroDiaCompetencia(competencia: string): string {
  return `${competencia}-01`;
}

export function ultimoDiaCompetencia(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${competencia}-${String(ultimo).padStart(2, '0')}`;
}

export type ModoConsultaBancoHoras = 'mes' | 'periodo';

export type EstadoFiltroBancoHoras =
  | { modo: 'mes'; competencia: string }
  | { modo: 'periodo'; dataInicio: string; dataFim: string };

export function filtroBancoHorasParaParams(
  f: EstadoFiltroBancoHoras,
): { competencia: string } | { dataInicio: string; dataFim: string } {
  if (f.modo === 'mes') return { competencia: f.competencia };
  return { dataInicio: f.dataInicio, dataFim: f.dataFim };
}

export function rotuloPeriodoBancoHoras(f: EstadoFiltroBancoHoras): string {
  if (f.modo === 'mes') return f.competencia;
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  };
  return `${fmt(f.dataInicio)} – ${fmt(f.dataFim)}`;
}

export function BancoHorasFiltroConsulta({
  filtro,
  onChange,
}: {
  filtro: EstadoFiltroBancoHoras;
  onChange: (f: EstadoFiltroBancoHoras) => void;
}) {
  const compPadrao = competenciaCorrente();
  const hoje = dataHojeYmd();

  return (
    <div className="flex flex-wrap items-end gap-3 shrink-0">
      <div className="flex rounded-lg border border-white/15 overflow-hidden text-xs">
        <button
          type="button"
          onClick={() =>
            onChange({
              modo: 'mes',
              competencia: filtro.modo === 'mes' ? filtro.competencia : compPadrao,
            })
          }
          className={`px-3 py-2 font-medium transition-colors ${
            filtro.modo === 'mes'
              ? 'bg-primary text-neutral'
              : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          Por mês
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              modo: 'periodo',
              dataInicio:
                filtro.modo === 'periodo'
                  ? filtro.dataInicio
                  : primeiroDiaCompetencia(compPadrao),
              dataFim: filtro.modo === 'periodo' ? filtro.dataFim : hoje,
            })
          }
          className={`px-3 py-2 font-medium transition-colors ${
            filtro.modo === 'periodo'
              ? 'bg-primary text-neutral'
              : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          Entre datas
        </button>
      </div>
      {filtro.modo === 'mes' ? (
        <label className="flex items-center gap-2 text-sm text-white/80">
          <span className="text-white/50">Mês</span>
          <input
            type="month"
            value={filtro.competencia}
            onChange={(e) =>
              onChange({ modo: 'mes', competencia: e.target.value || competenciaCorrente() })
            }
            className="bg-neutral border border-white/10 rounded px-2 py-1.5 text-sm"
          />
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
          <label className="flex items-center gap-2">
            <span className="text-white/50">De</span>
            <input
              type="date"
              value={filtro.dataInicio}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                onChange({
                  modo: 'periodo',
                  dataInicio: v,
                  dataFim: filtro.dataFim < v ? v : filtro.dataFim,
                });
              }}
              className="bg-neutral border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-white/50">Até</span>
            <input
              type="date"
              value={filtro.dataFim}
              min={filtro.dataInicio}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                onChange({ modo: 'periodo', dataInicio: filtro.dataInicio, dataFim: v });
              }}
              className="bg-neutral border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}
    </div>
  );
}
