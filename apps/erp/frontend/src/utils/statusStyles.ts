// Utilitários centralizados de estilos e labels de status

// Cores para status de etapa/tarefa
export function getStatusColor(status: string): string {
  switch (status) {
    case 'NAO_INICIADO':
      return 'bg-amber-500/30 text-amber-200 border border-amber-400/50 font-medium';
    case 'PENDENTE':
      return 'bg-amber-500/30 text-amber-200 border border-amber-400/50 font-medium';
    case 'EM_ANDAMENTO':
      return 'bg-sky-500/30 text-sky-200 border border-sky-400/50 font-medium';
    case 'VENCIDA':
      return 'bg-rose-500/30 text-rose-200 border border-rose-400/50 font-medium';
    case 'FINALIZADO':
      return 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/60 font-semibold';
    case 'EM_ANALISE':
      return 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/50 font-medium';
    case 'APROVADA':
      return 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 font-medium';
    case 'REPROVADA':
      return 'bg-rose-500/30 text-rose-200 border border-rose-400/50 font-medium';
    default:
      return 'bg-slate-500/30 text-slate-200 border border-slate-400/50 font-medium';
  }
}

// Labels para status de etapa
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'NAO_INICIADO':
      return 'Não iniciado';
    case 'PENDENTE':
      return 'Pendente';
    case 'EM_ANDAMENTO':
      return 'Em andamento';
    case 'VENCIDA':
      return 'Atrasada';
    case 'FINALIZADO':
      return 'Finalizado';
    case 'EM_ANALISE':
      return 'Em análise';
    case 'APROVADA':
      return 'Aprovado';
    case 'REPROVADA':
      return 'Reprovada';
    default:
      return status;
  }
}

// Cores para status de entrega (tarefa/subtarefa da etapa)
export function getEntregaStatusColor(status: string): string {
  switch (status) {
    case 'PENDENTE':
      return 'bg-amber-500/25 text-amber-100 border border-amber-400/40';
    case 'EM_ANALISE':
      return 'bg-sky-500/25 text-sky-100 border border-sky-400/40';
    case 'APROVADO':
      return 'bg-emerald-500/25 text-emerald-100 border border-emerald-400/40';
    case 'REPROVADO':
      return 'bg-rose-500/25 text-rose-100 border border-rose-400/40';
    default:
      return 'bg-slate-500/25 text-slate-100 border border-slate-400/40';
  }
}

// Labels para status de entrega (tarefa/subtarefa)
export function getEntregaStatusLabel(status: string): string {
  switch (status) {
    case 'PENDENTE':
      return 'Pendente';
    case 'EM_ANALISE':
      return 'Em análise';
    case 'APROVADO':
      return 'Aprovado';
    case 'REPROVADO':
      return 'Reprovado';
    default:
      return status;
  }
}

// Cores para status de tarefa ou subtarefa (workflow)
export function getChecklistItemStatusColor(status: string): string {
  switch (status) {
    case 'A_FAZER':
      return 'bg-slate-600/25 text-slate-200 border border-slate-500/45';
    case 'FAZENDO':
      return 'bg-amber-500/20 text-amber-100 border border-amber-400/40';
    case 'PENDENTE':
      return 'bg-amber-500/20 text-amber-100 border border-amber-400/40';
    case 'EM_ANALISE':
      return 'bg-sky-500/20 text-sky-100 border border-sky-400/40';
    case 'APROVADO':
      return 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40';
    case 'MARCADO_CADASTRO':
      return 'bg-teal-500/20 text-teal-100 border border-teal-400/45';
    case 'REPROVADO':
      return 'bg-rose-500/20 text-rose-100 border border-rose-400/40';
    default:
      return 'bg-slate-500/20 text-slate-100 border border-slate-400/40';
  }
}

// Labels para status de tarefa/subtarefa (sem emojis)
export function getChecklistItemStatusLabel(status: string): string {
  switch (status) {
    case 'A_FAZER':
      return 'A fazer';
    case 'FAZENDO':
      return 'Fazendo';
    case 'PENDENTE':
      return 'Pendente';
    case 'EM_ANALISE':
      return 'Em análise';
    case 'APROVADO':
      return 'Aprovado';
    case 'MARCADO_CADASTRO':
      return 'Marcado como feito';
    case 'REPROVADO':
      return 'Reprovado';
    default:
      return status;
  }
}

// Estilo para checkbox customizado
export function getCheckboxStyle(checked: boolean, disabled?: boolean): string {
  const base =
    'w-4 h-4 rounded-md border transition-colors duration-150 flex items-center justify-center';

  if (disabled) {
    if (checked) {
      return `${base} border-emerald-500/40 bg-emerald-900/35 text-emerald-200/70 cursor-not-allowed`;
    }
    return `${base} border-slate-500/60 bg-slate-700/40 text-slate-300/70 cursor-not-allowed`;
  }

  if (checked) {
    return `${base} border-emerald-400 bg-emerald-500/80 text-white shadow-sm shadow-emerald-500/40`;
  }

  return `${base} border-slate-400/70 bg-slate-800/40 hover:border-emerald-400/80 hover:bg-emerald-500/10 cursor-pointer`;
}

// Estilo para container de tarefa da etapa
export function getChecklistItemStyle(status: string): string {
  const base =
    'rounded-xl border px-3 py-2.5 bg-slate-900/60 backdrop-blur-sm flex items-start gap-3 transition-colors duration-150';

  switch (status) {
    case 'APROVADO':
      return `${base} border-emerald-500/40 bg-emerald-950/40`;
    case 'REPROVADO':
      return `${base} border-rose-500/40 bg-rose-950/40`;
    case 'EM_ANALISE':
      return `${base} border-sky-500/40 bg-sky-950/40`;
    case 'A_FAZER':
      return `${base} border-slate-600/70 bg-slate-900/50`;
    case 'FAZENDO':
      return `${base} border-amber-500/35 bg-amber-950/20`;
    case 'MARCADO_CADASTRO':
      return `${base} border-teal-500/40 bg-teal-950/30`;
    default:
      return `${base} border-slate-600/60 hover:border-emerald-500/40`;
  }
}

// Estilo para texto da tarefa
export function getChecklistTextStyle(checked?: boolean): string {
  if (checked) {
    return 'text-sm text-slate-200 line-through decoration-emerald-400/70 decoration-2';
  }
  return 'text-sm text-slate-50';
}

