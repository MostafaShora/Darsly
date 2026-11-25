import { HttpErrorResponse } from '@angular/common/http';

interface ApiErrorBody {
  message?: unknown;
  details?: Array<{ path?: string; message?: string }>;
}

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  if (error.status === 0) {
    return 'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.';
  }

  const body = error.error as ApiErrorBody | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  const details = Array.isArray(body?.details)
    ? body.details
        .map((detail) => [detail.path, detail.message].filter(Boolean).join(': '))
        .filter(Boolean)
        .join('؛ ')
    : '';
  const serverDetails = [message, details].filter(Boolean).join(' — ');

  return serverDetails ? `${fallback} (${serverDetails})` : fallback;
};
