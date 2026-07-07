import { ReactNode } from 'react';
import { competenciaCorrente } from '../rh/rhUi';
import { btn } from '../../utils/buttonStyles';
import { DataTable, type DataTableColumn, type DataTableProps } from '../DataTable';

export { Card } from '../rh/rhUi';
export { competenciaCorrente };

export const LABEL_REM: Record<string, string> = {
  NENHUMA: 'Sem remuneração',
  VALOR_HORA: 'Valor hora',
  MENSAL_META_HORAS: 'Mensal + meta',
};

export const inputFiltroCls =
  'w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';

export const selectFiltroCls = `${inputFiltroCls} appearance-none cursor-pointer`;

export function fmtBrl(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

export function fmtHoras(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function fmtSaldo(min: number) {
  const s = min >= 0 ? '+' : '';
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const t = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  return `${s}${t}`;
}

export function filtrarPorTexto(nome: string, termo: string) {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  return nome.toLowerCase().includes(t);
}

export function FinanceiroBarraCompetencia({
  descricao,
  mes,
  onMesChange,
  onAtualizar,
  actions,
}: {
  descricao: ReactNode;
  mes: string;
  onMesChange: (mes: string) => void;
  onAtualizar: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <p className="text-sm text-white/60 min-w-0 lg:max-w-2xl">{descricao}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end shrink-0">
          <label className="flex flex-col gap-1.5 text-sm text-white/80 sm:flex-row sm:items-center sm:gap-2 min-w-0">
            <span className="text-white/50 shrink-0">Competência</span>
            <input
              type="month"
              value={mes}
              onChange={(e) => onMesChange(e.target.value || competenciaCorrente())}
              className="w-full sm:w-auto min-w-0 bg-neutral border border-white/10 rounded-md px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex flex-col gap-3 w-full sm:flex-row sm:flex-wrap sm:gap-2 sm:w-auto">
            <button type="button" onClick={onAtualizar} className={`${btn.secondary} w-full sm:w-auto justify-center`}>
              Atualizar
            </button>
            {actions ? (
              <div className="flex flex-col gap-3 w-full sm:flex-row sm:flex-wrap sm:gap-2 sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinanceiroBarraAcoes({
  descricao,
  actions,
}: {
  descricao: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-white/60 min-w-0 sm:max-w-2xl">{descricao}</p>
        {actions ? (
          <div className="flex flex-col gap-3 w-full sm:flex-row sm:flex-wrap sm:gap-2 sm:w-auto shrink-0 [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FinanceiroResumoKpi({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 min-w-0 overflow-x-auto">
      {children}
    </div>
  );
}

export type { DataTableColumn };

/** Tabela padrão do Financeiro: cards no mobile + scroll horizontal no desktop. */
export function FinanceiroDataTable<T>(
  props: DataTableProps<T> & {
    renderMobileCard: NonNullable<DataTableProps<T>['renderMobileCard']>;
  },
) {
  return (
    <DataTable
      {...props}
      responsiveFrom="md"
      wrapperClassName={`min-w-0 ${props.wrapperClassName ?? ''}`.trim()}
    />
  );
}

export const financeiroCardMobileCls =
  'rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2';
