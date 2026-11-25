import type { ValidationErrors, ValidatorFn } from '@angular/forms';

export const isPositiveDecimalString = (value: string): boolean => {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return false;
  const significantDigits = normalized.replace('.', '').replace(/^0+/, '').length;
  return significantDigits > 0 && significantDigits <= 34;
};

export const positiveDecimalValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  return !value || isPositiveDecimalString(value) ? null : { positiveDecimal: true };
};

export const formatMoneyExact = (value: string | null | undefined): string => value ?? '0';

export const formatFinanceTimestamp = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};
