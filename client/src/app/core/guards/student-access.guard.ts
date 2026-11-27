import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { StudentContextService } from '../services/student-context.service';

export const studentAccessGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const contextService = inject(StudentContextService);
  const router = inject(Router);

  const redirectForError = (error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      authService.clearCurrentUser();
      return router.createUrlTree(['/sign-in'], {
        queryParams: { reason: 'session' },
      });
    }
    return router.createUrlTree(['/student/select-context']);
  };

  return contextService.getActiveContexts().pipe(
    switchMap((contexts) => {
      const savedId = contextService.getSavedSelectionId();
      const savedContext = contexts.find(
        (context) => context.studentAccountLinkId === savedId,
      );

      if (savedId && !savedContext) {
        contextService.clearSelection();
        contextService.selectionWasStale.set(true);
      }

      const selectedContext = savedContext ?? (contexts.length === 1 ? contexts[0] : null);
      if (!selectedContext) {
        return of(router.createUrlTree(['/student/select-context']));
      }

      return contextService.selectContext(selectedContext.studentAccountLinkId).pipe(
        map(() => true),
        catchError((error: unknown) => of(redirectForError(error))),
      );
    }),
    catchError((error: unknown) => of(redirectForError(error))),
  );
};
