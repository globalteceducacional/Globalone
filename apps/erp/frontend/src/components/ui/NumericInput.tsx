import type { InputHTMLAttributes } from 'react';

export type NumericInputValue = number | null | undefined;

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'defaultValue'
> & {
  value: NumericInputValue;
  onValueChange: (value: number | null) => void;
  /** Após digitação, força inteiro (ex.: quantidade). */
  integer?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
};

/**
 * Campo numérico controlado que permite ficar vazio (apagar tudo, colar por cima).
 * `null` = campo vazio; números incluindo 0 são exibidos normalmente.
 */
export function NumericInput({
  value,
  onValueChange,
  integer = false,
  min,
  max,
  step,
  className,
  ...rest
}: Props) {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === 'number' && Number.isNaN(value));
  const display = empty ? '' : String(value);

  const resolvedStep = step !== undefined ? step : integer ? 1 : 'any';

  return (
    <input
      {...rest}
      type="number"
      className={className}
      min={min}
      max={max}
      step={resolvedStep}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={display}
      onChange={(e) => {
        const t = e.target.value;
        if (t === '') {
          onValueChange(null);
          return;
        }
        const n = e.target.valueAsNumber;
        if (Number.isNaN(n)) {
          return;
        }
        const final = integer ? Math.trunc(n) : n;
        onValueChange(final);
      }}
    />
  );
}
