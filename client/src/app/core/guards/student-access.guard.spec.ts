import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ActiveStudentContext } from '../models/student-context.models';
import { AuthService } from '../services/auth.service';
import { StudentContextService } from '../services/student-context.service';
import { studentAccessGuard } from './student-access.guard';

describe('studentAccessGuard', () => {
  const context: ActiveStudentContext = {
    studentAccountLinkId: 'link-owned-by-current-user',
    studentName: 'Student One',
    workspaceName: 'Workspace One',
  };

  const setup = (
    contexts: ActiveStudentContext[],
    savedId: string | null,
    loadError?: HttpErrorResponse,
  ) => {
    const contextService = {
      getActiveContexts: vi.fn(() =>
        loadError ? throwError(() => loadError) : of(contexts),
      ),
      getSavedSelectionId: vi.fn(() => savedId),
      selectContext: vi.fn((id: string) =>
        of(contexts.find((item) => item.studentAccountLinkId === id) ?? context),
      ),
      clearSelection: vi.fn(),
      selectionWasStale: { set: vi.fn() },
    };
    const authService = { clearCurrentUser: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StudentContextService, useValue: contextService },
        { provide: AuthService, useValue: authService },
      ],
    });
    return { contextService, authService };
  };

  const activate = async () => {
    const result = TestBed.runInInjectionContext(() =>
      studentAccessGuard(
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  };

  it('requires backend selection validation before allowing a Student route', async () => {
    const { contextService } = setup([context], context.studentAccountLinkId);

    const result = await activate();

    expect(result).toBe(true);
    expect(contextService.selectContext).toHaveBeenCalledWith(
      context.studentAccountLinkId,
    );
  });

  it('redirects an authenticated account with no active contexts to context selection', async () => {
    setup([], null);

    const result = await activate();
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/student/select-context',
    );
  });

  it('requires explicit selection when multiple active contexts have no saved hint', async () => {
    const secondContext = {
      ...context,
      studentAccountLinkId: 'second-link',
      studentName: 'Student Two',
    };
    const { contextService } = setup([context, secondContext], null);

    const result = await activate();
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(result as UrlTree)).toBe('/student/select-context');
    expect(contextService.selectContext).not.toHaveBeenCalled();
  });

  it('clears a stale saved hint and revalidates the single remaining context', async () => {
    const { contextService } = setup([context], 'revoked-link');

    const result = await activate();

    expect(result).toBe(true);
    expect(contextService.clearSelection).toHaveBeenCalledOnce();
    expect(contextService.selectContext).toHaveBeenCalledWith(
      context.studentAccountLinkId,
    );
  });

  it('redirects an expired authenticated session through the existing sign-in convention', async () => {
    const { authService } = setup(
      [],
      null,
      new HttpErrorResponse({ status: 401 }),
    );

    const result = await activate();
    const router = TestBed.inject(Router);

    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/sign-in?reason=session',
    );
    expect(authService.clearCurrentUser).toHaveBeenCalledOnce();
  });
});
