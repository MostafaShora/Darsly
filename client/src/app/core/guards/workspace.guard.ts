import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { WorkspaceService } from '../services/workspace.service';

export const workspaceGuard: CanActivateFn = () => {
  const workspaceService = inject(WorkspaceService);
  const router = inject(Router);

  return workspaceService.getWorkspaceAccessState().pipe(
    map((state) =>
      state.activeWorkspace ? true : router.createUrlTree(['/workspace/onboarding']),
    ),
    catchError(() => of(router.createUrlTree(['/workspace/onboarding']))),
  );
};
