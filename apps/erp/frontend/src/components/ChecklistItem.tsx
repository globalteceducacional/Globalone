/**
 * Componente reutilizável para linha de tarefa da etapa (UI)
 * Usado em MyTasks e ProjectDetails
 */

import {
  getCheckboxStyle,
  getChecklistItemStyle,
  getChecklistTextStyle,
  getChecklistItemStatusColor,
  getChecklistItemStatusLabel,
} from '../utils/statusStyles';

interface ChecklistItemProps {
  texto: string;
  concluido: boolean;
  status: string;
  showCheckbox?: boolean;
  onCheckChange?: (checked: boolean) => void;
  checkboxDisabled?: boolean;
  onViewDetails?: () => void;
  onSubmit?: () => void;
  canSubmit?: boolean;
  canInteract?: boolean;
}

export default function ChecklistItem({
  texto,
  concluido,
  status,
  showCheckbox = true,
  onCheckChange,
  checkboxDisabled = false,
  onViewDetails,
  onSubmit,
  canSubmit = false,
  canInteract = false,
}: ChecklistItemProps) {
  const hasEntrega = ['EM_ANALISE', 'REPROVADO', 'APROVADO'].includes(status);

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
        canInteract ? 'hover:bg-white/10 hover:scale-[1.01]' : ''
      } ${getChecklistItemStyle(status)}`}
    >
      {/* Checkbox */}
      {showCheckbox && onCheckChange ? (
        <input
          type="checkbox"
          checked={concluido}
          onChange={(e) => onCheckChange(e.target.checked)}
          disabled={checkboxDisabled}
          className="sr-only"
        />
      ) : null}
      
      <div
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all cursor-${
          showCheckbox && onCheckChange && !checkboxDisabled ? 'pointer' : 'default'
        } ${getCheckboxStyle(concluido)}`}
        onClick={() => {
          if (showCheckbox && onCheckChange && !checkboxDisabled) {
            onCheckChange(!concluido);
          }
        }}
        title="Status da tarefa"
      >
        {concluido && (
          <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>

      {/* Texto */}
      <span className={`flex-1 text-sm ${getChecklistTextStyle(concluido)}`}>
        {texto}
      </span>

      {/* Badge de Status */}
      <span
        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${getChecklistItemStatusColor(status)}`}
      >
        {getChecklistItemStatusLabel(status)}
      </span>

      {/* Botão Ver Detalhes */}
      {hasEntrega && onViewDetails && (
        <button
          type="button"
          onClick={onViewDetails}
          className="ml-2 px-2 py-0.5 rounded text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 transition-colors"
          title="Ver detalhes da entrega"
        >
          Ver detalhes
        </button>
      )}

      {/* Botão Enviar */}
      {canSubmit && onSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="ml-2 px-2 py-0.5 rounded text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 transition-colors"
          title="Enviar entrega para análise"
        >
          Enviar
        </button>
      )}
    </div>
  );
}
