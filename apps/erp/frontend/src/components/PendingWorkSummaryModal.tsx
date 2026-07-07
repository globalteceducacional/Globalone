import { AppModal } from './ui/AppModal';
import { btn } from '../utils/buttonStyles';
import type { PendingWorkSummary } from '../utils/pendingWorkSummary';
import { pendingWorkSummaryTotal } from '../utils/pendingWorkSummary';
interface PendingWorkSummaryModalProps {
  open: boolean;
  onClose: () => void;
  summary: PendingWorkSummary | null;
  onGoTasks: () => void;
  onGoProjectsAnalise: () => void;
  onGoCommunications: () => void;
}

export function PendingWorkSummaryModal({
  open,
  onClose,
  summary,
  onGoTasks,
  onGoProjectsAnalise,
  onGoCommunications,
}: PendingWorkSummaryModalProps) {
  if (!open || !summary || pendingWorkSummaryTotal(summary) === 0) return null;

  const hasReviewQueue = summary.tarefasParaAvaliar > 0;
  const hasMyWork = summary.tarefasAFazer > 0 || summary.etapasAtrasadas > 0;

  const linhas: { label: string; valor: number; detalhe?: string }[] = [
    { label: 'Tarefas a avaliar (total)', valor: summary.tarefasParaAvaliar },
    ...(summary.checklistParaAvaliar > 0
      ? [{ label: '↳ Tarefas e subtarefas do checklist', valor: summary.checklistParaAvaliar }]
      : []),
    ...(summary.etapasEntregaAnalise > 0
      ? [{ label: '↳ Entregas gerais da etapa (foto/texto)', valor: summary.etapasEntregaAnalise }]
      : []),
    {
      label: 'Suas etapas a fazer (não iniciadas ou em andamento)',
      valor: summary.tarefasAFazer,
    },
    { label: 'Suas etapas atrasadas (timeline)', valor: summary.etapasAtrasadas },
    { label: 'Requerimentos recebidos não lidos', valor: summary.requerimentosNaoLidos },
  ];

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Resumo das pendências"
      size="md"
      bodyClassName="p-5 sm:p-6 space-y-4"
    >
      <p className="text-sm text-white/70 leading-relaxed">
        Há itens que costumam exigir ação sua em Meu Trabalho ou em Requerimentos. Use os atalhos abaixo
        para ir direto às telas.
      </p>
      <ul className="rounded-lg border border-white/10 bg-black/20 divide-y divide-white/10">
        {linhas.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-white/85 min-w-0 flex-1 leading-snug">{row.label}</span>
            <span
              className={`tabular-nums font-bold shrink-0 ${
                row.valor > 0 ? 'text-amber-200' : 'text-white/35'
              }`}
            >
              {row.valor}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <button type="button" className={btn.secondary} onClick={onClose}>
          Fechar
        </button>
        {summary.requerimentosNaoLidos > 0 && (
          <button type="button" className={btn.secondary} onClick={onGoCommunications}>
            Abrir requerimentos
          </button>
        )}
        {hasReviewQueue && (
          <button type="button" className={btn.primary} onClick={onGoProjectsAnalise}>
            Ir para Tarefas em análise
          </button>
        )}
        {hasMyWork && (
          <button
            type="button"
            className={hasReviewQueue ? btn.secondary : btn.primary}
            onClick={onGoTasks}
          >
            Ir para Meu Trabalho
          </button>
        )}
      </div>
      <p className="text-[11px] text-white/45">
        Dica: no Dashboard o card «Tarefas a avaliar» abre Projetos na aba «Tarefas em análise»; o quadro
        «Sua avaliação» permite avaliar direto no painel.
      </p>
    </AppModal>
  );
}
