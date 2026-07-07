import { ChangeEvent } from 'react';

const baseClass =
  'w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[5rem] resize-y';

interface AppTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  rows?: number;
  className?: string;
}

export function AppTextarea({
  value,
  onChange,
  placeholder,
  label,
  rows = 4,
  className = '',
}: AppTextareaProps) {
  return (
    <div className={className}>
      {label ? <label className="block text-xs font-medium text-white/90 mb-1">{label}</label> : null}
      <textarea
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={baseClass}
      />
    </div>
  );
}
