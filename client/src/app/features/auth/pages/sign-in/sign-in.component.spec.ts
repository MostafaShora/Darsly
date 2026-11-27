import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { LucideEye, LucideEyeOff, provideLucideIcons } from '@lucide/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { SignInComponent } from './sign-in.component';

describe('SignInComponent redirects', () => {
  const currentUser = signal<AuthUser | null>(null);
  let loginUser: AuthUser;
  const activatedRoute = {
    snapshot: { queryParamMap: convertToParamMap({}) },
  };
  const authService = {
    currentUser,
    login: vi.fn(() => {
      currentUser.set(loginUser);
      return of({ message: 'Logged in', user: loginUser });
    }),
  };

  beforeEach(async () => {
    currentUser.set(null);
    authService.login.mockClear();
    activatedRoute.snapshot.queryParamMap = convertToParamMap({});
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: activatedRoute },
        provideLucideIcons(LucideEye, LucideEyeOff),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  const userWithCapabilities = (capabilities: NonNullable<AuthUser['capabilities']>): AuthUser => ({
    id: 'user-1',
    name: 'Account User',
    email: 'account@example.test',
    status: 'active',
    lastLoginAt: null,
    capabilities,
  });

  async function submitLogin(user: AuthUser, initialUrl = '/sign-in') {
    loginUser = user;
    if (initialUrl.includes('reason=session')) {
      activatedRoute.snapshot.queryParamMap = convertToParamMap({ reason: 'session' });
    }
    const fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') callback();
      return 0;
    });

    component.form.setValue({
      email: user.email,
      password: 'valid-password',
    });
    component.submit();

    return { component, navigateByUrl };
  }

  it('sends a Student-only User through the Student Portal guard flow', async () => {
    const { component, navigateByUrl } = await submitLogin(
      userWithCapabilities({ teacher: false, student: true, owner: false }),
    );

    expect(navigateByUrl).toHaveBeenCalledWith('/student/overview');
    expect(component.successMessage()).toContain('بوابة الطالب');
  });

  it('preserves the Teacher dashboard redirect for Teacher-only Users', async () => {
    const { navigateByUrl } = await submitLogin(
      userWithCapabilities({ teacher: true, student: false, owner: true }),
    );

    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps the existing dashboard default for dual-capability Users', async () => {
    const { navigateByUrl } = await submitLogin(
      userWithCapabilities({ teacher: true, student: true, owner: false }),
    );

    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('returns an expired Student-only session to the Student Portal flow after login', async () => {
    const { component, navigateByUrl } = await submitLogin(
      userWithCapabilities({ teacher: false, student: true, owner: false }),
      '/sign-in?reason=session',
    );

    expect(component.redirectMessage()).toContain('انتهت جلستك');
    expect(navigateByUrl).toHaveBeenCalledWith('/student/overview');
  });
});
