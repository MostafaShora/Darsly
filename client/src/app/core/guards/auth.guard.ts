import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.getStatus().pipe(
    map(() => true),
    catchError((error: unknown) => {
      authService.clearCurrentUser();
      const reason =
        error instanceof HttpErrorResponse && error.status === 401 ? 'session' : 'unavailable';

      return of(router.createUrlTree(['/sign-in'], { queryParams: { reason } }));
    }),
  );
};
