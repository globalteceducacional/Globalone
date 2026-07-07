import { ChangeEvent, ReactNode } from 'react';

export interface AppSelectOption {
  value: string | number;
  label: ReactNode;
}

interface AppSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  label?: string;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
  required?: boolean;
}

const baseSelectClass =
  'w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

const arrowStyle = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23ffffff\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'right 0.75rem center',
  paddingRight: '2rem',
};

export function AppSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  className = '',
  selectClassName = '',
  disabled = false,
  required = false,
}: AppSelectProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-white/90 mb-1">{label}</label>
      )}
      <select
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className={`${baseSelectClass} ${selectClassName}`}
        style={{ ...arrowStyle, colorScheme: 'dark' }}
        disabled={disabled}
        required={required}
        data-app-select
      >
        {placeholder && (
          <option value="" className="bg-neutral text-white">
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={String(option.value)} value={option.value} className="bg-neutral text-white">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

