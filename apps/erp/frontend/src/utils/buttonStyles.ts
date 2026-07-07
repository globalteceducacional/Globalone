/**
 * Sistema de design de botões – ERP Globaltec
 *
 * Estrutura:
 *   btn.base           → reset + transição (aplique sempre junto com uma variante)
 *   btn.size.*         → padding / tamanho de fonte
 *   btn.color.*        → cor de fundo e texto
 *   btn.*              → combos prontos para uso direto no className
 *
 * Convenção de nomes:
 *   - Sem sufixo → tamanho médio (md), usado em botões de header de página
 *   - Sufixo Sm  → tamanho pequeno, usado em ações de tabela / badges
 *   - Sufixo Lg  → tamanho grande, usado em botões de modal / formulário
 */

const base =
  'inline-flex items-center justify-center rounded-md font-semibold transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

const size = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-sm',
} as const;

const color = {
  primary:     'bg-primary hover:bg-primary/80 text-white',
  secondary:   'bg-white/10 hover:bg-white/20 text-white',
  edit:        'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30',
  danger:      'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30',
  success:     'bg-success/20 hover:bg-success/30 text-success border border-success/30',
  warning:     'bg-warning/20 hover:bg-warning/30 text-warning border border-warning/30',
  dangerSolid: 'bg-danger hover:bg-danger/80 text-white',
  primarySoft: 'bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30',
  ghost:       'bg-transparent hover:bg-white/10 text-white/70 hover:text-white',
  iconBtn:     'p-2 bg-transparent hover:bg-white/10 text-white',
} as const;

// ─── Combos prontos ───────────────────────────────────────────────────────────

export const btn = {
  // ── Ações principais de página (header / filtros)
  primary:   `${base} ${size.md} ${color.primary}`,
  secondary: `${base} ${size.md} ${color.secondary}`,
  success:   `${base} ${size.md} ${color.success}`,
  warning:   `${base} ${size.md} ${color.warning}`,
  danger:    `${base} ${size.md} ${color.danger}`,
  edit:      `${base} ${size.md} ${color.edit}`,

  // ── Botões de tabela / ações inline (sm)
  primarySm:   `${base} ${size.sm} ${color.primary}`,
  editSm:      `${base} ${size.sm} ${color.edit}`,
  dangerSm:    `${base} ${size.sm} ${color.danger}`,
  successSm:   `${base} ${size.sm} ${color.success}`,
  warningSm:   `${base} ${size.sm} ${color.warning}`,
  primarySoft: `${base} ${size.sm} ${color.primarySoft}`,

  // ── Botões de modal / formulário (lg)
  primaryLg:   `${base} ${size.lg} ${color.primary}`,
  secondaryLg: `${base} ${size.lg} ${color.secondary}`,
  dangerLg:    `${base} ${size.lg} ${color.dangerSolid}`,

  // ── Especiais
  ghost:   `${base} ${color.ghost}`,
  iconBtn: `${base} rounded-md ${color.iconBtn}`,

  // ── Botão de largura total (modais responsivos)
  modalPrimary:   `w-full sm:w-auto ${base} ${size.lg} ${color.primary}`,
  modalSecondary: `w-full sm:w-auto ${base} ${size.lg} ${color.secondary}`,
  modalDanger:    `w-full sm:w-auto ${base} ${size.lg} ${color.dangerSolid}`,
} as const;

/**
 * @deprecated Use `btn.*` em vez de `buttonStyles.*`
 * Mantido para compatibilidade com código legado.
 */
export const buttonStyles = {
  primary:   btn.primary,
  secondary: btn.secondary,
  edit:      btn.editSm,
  danger:    btn.dangerSm,
  success:   btn.success,
};
