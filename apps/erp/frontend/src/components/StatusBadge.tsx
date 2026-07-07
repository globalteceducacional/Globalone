/**
 * Componente reutilizável para badge de status
 * Usado em MyTasks, ProjectDetails, Dashboard, etc.
 */

import { getStatusColor, getStatusLabel, getEntregaStatusColor, getEntregaStatusLabel } from '../utils/statusStyles';

interface StatusBadgeProps {
  status: string;
  type?: 'etapa' | 'entrega' | 'projeto';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function StatusBadge({ status, type = 'etapa', size = 'sm', className = '' }: StatusBadgeProps) {
  const colorClass = type === 'entrega' ? getEntregaStatusColor(status) : getStatusColor(status);
  const label = type === 'entrega' ? getEntregaStatusLabel(status) : getStatusLabel(status);

  const sizeClass = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }[size];

  return (
    <span className={`rounded-md border ${colorClass} ${sizeClass} ${className}`}>
      {label}
    </span>
  );
}
