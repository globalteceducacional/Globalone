import { ChangeEvent } from 'react';

interface AppInputProps {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  type?: 'text' | 'number' | 'date';
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  inputClassName?: string;
}

const baseInputClass =
  'w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';

export function AppInput({
  value,
  onChange,
  placeholder,
  label,
  type = 'text',
  min,
  max,
  step,
  className = '',
  inputClassName = '',
}: AppInputProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-white/90 mb-1">{label}</label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={`${baseInputClass} ${inputClassName}`}
      />
    </div>
  );
}

