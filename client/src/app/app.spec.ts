import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AppComponent } from './app';
import { appConfig } from './app.config';
import { AttendanceReport, FinanceReport, ReportService } from './core/services/report.service';
import { WorkspaceService } from './core/services/workspace.service';
import {
  formatReportDateForTimezone,
  formatReportTimestampForTimezone,
  ReportsComponent,
} from './features/reports/reports.component';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    }).compileComponents();
  });

  describe('Reports export acceptance', () => {
    let attendancePage: (page: number) => AttendanceReport;
    let financePage: (page: number) => FinanceReport;
    let attendanceRequests: number[];
    let financeRequests: number[];

    const attendanceItem = (id: string): AttendanceReport['items'][number] => ({
      id,
      sessionId: 'session-1',
      sessionTitle: 'Lesson',
      groupId: 'group-1',
      groupName: 'Group',
      studentId: id,
      studentName: id,
      status: 'present',
      lateMinutes: 0,
      recordedAt: '2026-03-01T08:00:00.000Z',
      sessionStartsAt: '2026-03-01T08:00:00.000Z',
    });

    const emptyAttendance = (): AttendanceReport => ({
      period: { from: '2026-03-01T08:00:00.000Z', to: '2026-03-02T06:59:59.999Z' },
      summary: {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        attended: 0,
        denominator: 0,
        attendanceRate: null,
      },
      items: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });

    const emptyFinance = (): FinanceReport => {
      const pagination = { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 };
      return {
        period: { from: '2026-03-01T08:00:00.000Z', to: '2026-03-02T06:59:59.999Z' },
        summary: {
          issuedInvoiceCount: 0,
          issuedInvoiceTotal: '0',
          collectedInPeriod: '0',
          allocatedInPeriod: '0',
          currentOutstanding: '0',
          unallocatedPayments: '0',
          historicalOutstanding: '0',
          historicalUnallocatedPayments: '0',
        },
        historicalData: {
          asOf: '2026-03-02T06:59:59.999Z',
          available: true,
          legacyIssuedInvoiceCount: 0,
          ambiguousVoidedInvoiceCount: 0,
          limitation: null,
        },
        paymentMethods: [],
        invoices: { items: [], pagination },
        payments: { items: [], pagination },
        allocations: { items: [], pagination },
      };
    };

    beforeEach(async () => {
      attendanceRequests = [];
      financeRequests = [];
      attendancePage = () => emptyAttendance();
      financePage = () => emptyFinance();

      await TestBed.configureTestingModule({
        imports: [ReportsComponent],
        providers: [
          provideRouter([]),
          {
            provide: WorkspaceService,
            useValue: {
              getMyWorkspaces: () => of([{ _id: 'workspace-1', status: 'active' }]),
            },
          },
          {
            provide: ReportService,
            useValue: {
              getAttendance: (_workspaceId: string, query: { page?: number }) => {
                const page = query.page ?? 1;
                attendanceRequests.push(page);
                return of(attendancePage(page));
              },
              getFinance: (_workspaceId: string, query: { page?: number }) => {
                const page = query.page ?? 1;
                financeRequests.push(page);
                return of(financePage(page));
              },
            },
          },
        ],
      }).compileComponents();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('formats UTC timestamps by the requested local timezone without a day shift', () => {
      expect(
        formatReportDateForTimezone(
          '2026-03-01T07:59:59.999Z',
          'America/Los_Angeles',
          'en-US',
        ),
      ).toBe('02/28/2026');
      expect(
        formatReportDateForTimezone(
          '2026-03-01T08:00:00.000Z',
          'America/Los_Angeles',
          'en-US',
        ),
      ).toBe('03/01/2026');
      expect(
        formatReportTimestampForTimezone(
          '2026-03-01T07:59:00.000Z',
          'America/Los_Angeles',
          'en-US',
        ),
      ).toContain('02/28/2026');
    });

    it('includes all attendance pages in the downloaded HTML export', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      attendanceRequests = [];
      attendancePage = (page) => {
        const report = emptyAttendance();
        const items = page === 1
          ? Array.from({ length: 100 }, (_, index) => attendanceItem(`student-${index}`))
          : [attendanceItem('student-last')];
        return {
          ...report,
          items,
          pagination: { page, pageSize: 100, totalItems: 101, totalPages: 2 },
        };
      };
      const blobs: Blob[] = [];
      vi.stubGlobal('URL', {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob);
          return 'blob:report';
        },
        revokeObjectURL: () => undefined,
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      await component.exportExcel();

      expect(attendanceRequests).toEqual([1, 2]);
      expect(blobs).toHaveLength(1);
      expect(await blobs[0].text()).toContain('student-last');
      expect(await blobs[0].text()).toContain('الفترة:');
      expect(await blobs[0].text()).not.toContain('2026-03-01T08:00:00.000Z');
    });

    it('accepts 10,000 attendance rows and rejects results above the limit', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      attendanceRequests = [];
      let overLimit = false;
      attendancePage = (page) => ({
        ...emptyAttendance(),
        items: overLimit
          ? []
          : Array.from({ length: 100 }, (_, index) =>
              attendanceItem(`student-${(page - 1) * 100 + index}`)),
        pagination: overLimit
          ? { page: 1, pageSize: 100, totalItems: 10_001, totalPages: 101 }
          : { page, pageSize: 100, totalItems: 10_000, totalPages: 100 },
      });
      const blobs: Blob[] = [];
      const createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:report';
      });
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: () => undefined });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      await component.exportExcel();

      expect(attendanceRequests).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(await blobs[0].text()).toContain('student-9999');

      overLimit = true;
      attendanceRequests = [];
      await component.exportExcel();

      expect(attendanceRequests).toEqual([1]);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(component.error()).toContain('10,000');
    });

    it('rejects attendance exports if the result count changes during pagination', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      attendanceRequests = [];
      attendancePage = (page) => ({
        ...emptyAttendance(),
        items: page === 1 ? [attendanceItem('student-1')] : [attendanceItem('student-2')],
        pagination: {
          page,
          pageSize: 100,
          totalItems: page === 1 ? 101 : 102,
          totalPages: 2,
        },
      });
      const createObjectURL = vi.fn(() => 'blob:report');
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: () => undefined });

      await component.exportExcel();

      expect(attendanceRequests).toEqual([1, 2]);
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(component.error()).toContain('تصدير التقرير بالكامل');
    });

    it('includes all finance collection pages in the downloaded HTML export', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      let financeMode: 'complete' | 'over-limit' | 'changed-count' = 'complete';
      financePage = (page) => {
        const report = emptyFinance();
        const invoice = (id: string) => ({
          id,
          invoiceNumber: id,
          studentId: 'student-1',
          issuedAt: '2026-03-01T08:00:00.000Z',
          totalAmount: '10',
          status: 'issued',
        });
        return {
          ...report,
          invoices: {
            items: financeMode === 'over-limit'
              ? []
              : page === 1
                ? Array.from({ length: 100 }, (_, index) => invoice(`invoice-${index}`))
                : [invoice('invoice-last')],
            pagination: {
              page,
              pageSize: 100,
              totalItems: financeMode === 'over-limit'
                ? 10_001
                : financeMode === 'changed-count' && page > 1
                  ? 102
                  : 101,
              totalPages: financeMode === 'over-limit' ? 101 : 2,
            },
          },
        };
      };
      component.setTab('finance');
      financeRequests = [];
      const blobs: Blob[] = [];
      vi.stubGlobal('URL', {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob);
          return 'blob:report';
        },
        revokeObjectURL: () => undefined,
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      await component.exportExcel();

      expect(financeRequests).toEqual([1, 2]);
      expect(blobs).toHaveLength(1);
      expect(await blobs[0].text()).toContain('invoice-last');

      financeMode = 'over-limit';
      financeRequests = [];
      await component.exportExcel();
      expect(financeRequests).toEqual([1]);
      expect(blobs).toHaveLength(1);

      financeMode = 'changed-count';
      financeRequests = [];
      await component.exportExcel();
      expect(financeRequests).toEqual([1, 2]);
      expect(blobs).toHaveLength(1);
      expect(component.error()).toContain('تصدير التقرير بالكامل');
    });
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
