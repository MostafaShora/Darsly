import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppComponent } from './app';
import { appConfig } from './app.config';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('التدريس');
  });

  it('should keep each Journey step paired with its existing image', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    const journey = page.querySelector<HTMLElement>('#journey');
    const steps = journey?.querySelectorAll<HTMLButtonElement>(
      'nav[aria-label="خطوات استخدام Darsly"] button',
    );

    expect(steps).toHaveLength(6);
    for (const [index, step] of Array.from(steps ?? []).entries()) {
      step.click();
      fixture.detectChanges();
      expect(journey?.querySelector('figure img')?.getAttribute('src')).toBe(
        `/assets/journey-${index + 1}.webp`,
      );
      expect(journey?.querySelector('figure img')?.getAttribute('alt')).toBeTruthy();
      expect(journey?.querySelector('article svg')).toBeTruthy();
    }
  });

  it('should resolve the public sign-in and sign-up routes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/sign-in');
    expect(router.url).toBe('/sign-in');
    await router.navigateByUrl('/sign-up');
    expect(router.url).toBe('/sign-up');
  });

  it('should redirect unauthenticated dashboard visits to sign-in', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    const navigation = router.navigateByUrl('/dashboard');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/status');

    expect(request.request.withCredentials).toBe(true);
    request.flush(
      { message: 'Authentication required' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await navigation;
    expect(router.url).toBe('/sign-in?reason=session');
  });

  it('should render the authenticated teacher in the Arabic RTL dashboard', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    const navigation = router.navigateByUrl('/dashboard');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/status');

    request.flush({
      message: 'Authenticated user',
      user: {
        id: 'teacher-1',
        name: 'Teacher Name',
        email: 'teacher@example.com',
        status: 'active',
        lastLoginAt: null,
      },
    });

    await navigation;
    fixture.detectChanges();
    expect(router.url).toBe('/dashboard');
    const dashboard = fixture.nativeElement as HTMLElement;
    expect(dashboard.textContent).toContain('Teacher Name');
    expect(dashboard.textContent).toContain('teacher@example.com');
    expect(dashboard.textContent).toContain('لا تتوفر بيانات هذا القسم في لوحة التحكم بعد.');
    expect(dashboard.querySelector('[dir="rtl"][lang="ar"]')).toBeTruthy();
    expect(dashboard.querySelector('button[aria-label="English"]')).toBeNull();
    expect(dashboard.querySelector('svg')).toBeTruthy();

    const navigationLinks = dashboard.querySelectorAll<HTMLAnchorElement>(
      'nav[aria-label="التنقل الرئيسي"] a',
    );
    expect(navigationLinks).toHaveLength(7);
    for (const link of navigationLinks) {
      const href = link.getAttribute('href');
      expect(href).toBeTruthy();
      if (href) {
        expect(dashboard.querySelector(href)).toBeTruthy();
      }
    }

    const attendanceLink = Array.from(navigationLinks).find((link) =>
      link.textContent?.includes('الحضور'),
    );
    attendanceLink?.click();
    fixture.detectChanges();
    expect(dashboard.querySelector('header h1')?.textContent).toContain('الحضور');

    const menuButton = dashboard.querySelector(
      'button[aria-controls="dashboard-sidebar"]',
    ) as HTMLButtonElement;
    menuButton.click();
    fixture.detectChanges();
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
  });
});
