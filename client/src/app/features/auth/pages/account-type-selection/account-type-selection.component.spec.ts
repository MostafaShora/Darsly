import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBookOpen,
  LucideEye,
  LucideEyeOff,
  LucideUsersRound,
  provideLucideIcons,
} from '@lucide/angular';
import { vi } from 'vitest';
import { routes } from '../../../../app.routes';
import { environment } from '../../../../../environments/environment';
import { SignUpComponent } from '../sign-up/sign-up.component';
import { StudentInvitationSignUpComponent } from '../student-invitation-sign-up/student-invitation-sign-up.component';

describe('AccountTypeSelectionComponent routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        provideLucideIcons(
          LucideArrowLeft,
          LucideBookOpen,
          LucideEye,
          LucideEyeOff,
          LucideUsersRound,
        ),
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  it('presents only the supported Student and Teacher registration choices', async () => {
    const harness = await RouterTestingHarness.create('/sign-up');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('طالب');
    expect(page.textContent).toContain('مدرس');
    expect(page.querySelector('a[routerLink="/sign-up/student"]')).not.toBeNull();
    expect(page.querySelector('a[routerLink="/sign-up/teacher"]')).not.toBeNull();
    expect(page.querySelectorAll('a[routerLink^="/sign-up/"]')).toHaveLength(2);
  });

  it('routes Teacher selection to the existing registration form with a back link', async () => {
    const harness = await RouterTestingHarness.create('/sign-up');
    const teacherLink = harness.routeNativeElement?.querySelector<HTMLAnchorElement>(
      'a[routerLink="/sign-up/teacher"]',
    );
    teacherLink?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const page = harness.routeNativeElement as HTMLElement;
    expect(page.querySelector('#sign-up-name')).not.toBeNull();
    const teacher = harness.routeDebugElement?.componentInstance as SignUpComponent;
    expect(teacher).toBeInstanceOf(SignUpComponent);
    expect(page.querySelector('a[routerLink="/sign-up"]')).not.toBeNull();

    vi.spyOn(window, 'setTimeout').mockImplementation(() => 0);
    teacher.form.setValue({
      name: 'Teacher A',
      email: 'teacher@example.test',
      password: 'teacher-password',
      confirmPassword: 'teacher-password',
    });
    teacher.submit();

    const request = TestBed.inject(HttpTestingController).expectOne(
      `${environment.apiBaseUrl}/auth/register`,
    );
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      accountType: 'teacher',
      name: 'Teacher A',
      email: 'teacher@example.test',
      password: 'teacher-password',
    });
    request.flush({
      message: 'User created and logged in successfully',
      user: {
        id: 'teacher-1',
        name: 'Teacher A',
        email: 'teacher@example.test',
        status: 'active',
        lastLoginAt: null,
      },
    });

    page.querySelector<HTMLAnchorElement>('a[routerLink="/sign-up"]')?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#account-type-heading')).not.toBeNull();
  });

  it('routes Student selection to invitation onboarding and provides a back link', async () => {
    const harness = await RouterTestingHarness.create('/sign-up');
    const studentLink = harness.routeNativeElement?.querySelector<HTMLAnchorElement>(
      'a[routerLink="/sign-up/student"]',
    );
    studentLink?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const page = harness.routeNativeElement as HTMLElement;
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(
      StudentInvitationSignUpComponent,
    );
    expect(page.textContent).toContain('أكمل دعوة مدرّسك');
    page.querySelector<HTMLAnchorElement>('a[routerLink="/sign-up"]')?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#account-type-heading')).not.toBeNull();
  });
});
