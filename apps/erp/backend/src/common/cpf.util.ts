import { BadRequestException } from '@nestjs/common';

/** Mantém só dígitos (máx. 11). String vazia vira null. */
export function normalizeCpfInput(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  return digits.length > 0 ? digits : null;
}

export function isValidCpfCheckDigits(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(digits[10]);
}

export function assertValidCpfOrNull(cpf: string | null): void {
  if (cpf === null) return;
  if (cpf.length !== 11) {
    throw new BadRequestException('CPF deve conter 11 dígitos.');
  }
  if (!isValidCpfCheckDigits(cpf)) {
    throw new BadRequestException('CPF inválido.');
  }
}
