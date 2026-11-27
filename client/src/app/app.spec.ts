import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  NavigationEnd,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Component, Type, signal } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, filter, firstValueFrom, of, Subject as RxSubject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AppComponent } from './app';
import { appConfig } from './app.config';
import { Workspace } from './core/models/workspace.models';
import {
  Guardian,
  PageResult,
  Student,
  StudentGuardianLink,
} from './core/models/people.models';
import {
  AttendanceRecord,
  Enrollment,
  Session,
  StudyGroup,
  Subject,
} from './core/models/learning.models';
import {
  Invoice,
  Payment,
  PaymentAllocation,
} from './core/models/finance.models';
import { FinanceService } from './core/services/finance.service';
import { LearningService } from './core/services/learning.service';
import { PeopleService } from './core/services/people.service';
import {
  AttendanceReport,
  DashboardActivityItem,
  DashboardSummary,
  FinanceReport,
  ReportExportRequest,
  ReportService,
} from './core/services/report.service';
import {
  WorkspaceAvailability,
  WorkspaceActivationVerificationError,
  WorkspaceAccessState,
  WorkspaceService,
} from './core/services/workspace.service';
import { AuthService } from './core/services/auth.service';
import { AuthUser } from './core/models/auth.models';
import { authGuard } from './core/guards/auth.guard';
import { workspaceGuard } from './core/guards/workspace.guard';
import { GuardiansComponent } from './features/guardians/guardians.component';
import { GroupsComponent } from './features/groups/groups.component';
import {
  formatReportDateForTimezone,
  formatReportTimestampForTimezone,
  ReportsComponent,
} from './features/reports/reports.component';
import { StudentsComponent } from './features/students/students.component';
import { SessionsComponent, localDateBoundaryToIso, localDateTimeToIso, utcDateTimeToLocalInput } from './features/sessions/sessions.component';
import { SubjectsComponent } from './features/subjects/subjects.component';
import { AttendanceComponent } from './features/attendance/attendance.component';
import { InvoicesComponent } from './features/finance/invoices.component';
import { PaymentsComponent } from './features/finance/payments.component';
import { WorkspaceOnboardingComponent } from './features/workspace/workspace-onboarding.component';
import { WorkspaceSelectorComponent } from './features/workspace/workspace-selector.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { formatMoneyExact, isPositiveDecimalString } from './core/utils/finance';

@Component({
  selector: 'app-dashboard-route-probe',
  standalone: true,
  template: '<p>Dashboard destination</p>',
})
class DashboardRouteProbe {}

@Component({
  selector: 'app-workspace-onboarding-route-probe',
  standalone: true,
  template: '<p>Workspace onboarding destination</p>',
})
class WorkspaceOnboardingRouteProbe {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Reports export acceptance', () => {
    let attendancePage: (page: number) => AttendanceReport;
    let financePage: (page: number) => FinanceReport;
    let attendanceRequests: number[];
    let financeRequests: number[];
    let attendanceQueries: Array<{
      workspaceId: string;
      query: Parameters<ReportService['getAttendance']>[1];
    }>;
    let financeQueries: Array<{
      workspaceId: string;
      query: Parameters<ReportService['getFinance']>[1];
    }>;
    let attendanceFailure: boolean;
    let financeFailure: boolean;
    let pendingAttendanceResponses: RxSubject<AttendanceReport>[] | null;
    let pendingAttendanceIndex: number;
    let pendingFinanceResponse: RxSubject<FinanceReport> | null;
    let exportRequests: Array<{ workspaceId: string; request: ReportExportRequest }>;
    let snapshotExportUnavailable: boolean;
    let pendingExportResponse: RxSubject<AttendanceReport | FinanceReport> | null;
    let attendanceExportReport: AttendanceReport;
    let financeExportReport: FinanceReport;
    let activeWorkspaceStream: Observable<WorkspaceAvailability>;

    const reportWorkspace: Workspace = {
      _id: 'workspace-1',
      name: 'Workspace',
      slug: 'workspace',
      status: 'active',
      currency: 'EGP',
      description: '',
    };

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
      attendanceQueries = [];
      financeQueries = [];
      attendanceFailure = false;
      financeFailure = false;
      pendingAttendanceResponses = null;
      pendingAttendanceIndex = 0;
      pendingFinanceResponse = null;
      exportRequests = [];
      snapshotExportUnavailable = false;
      pendingExportResponse = null;
      activeWorkspaceStream = of({ kind: 'active', workspace: reportWorkspace });
      attendancePage = () => emptyAttendance();
      financePage = () => emptyFinance();
      attendanceExportReport = emptyAttendance();
      financeExportReport = emptyFinance();

      await TestBed.configureTestingModule({
        imports: [ReportsComponent],
        providers: [
          provideRouter([]),
          {
            provide: WorkspaceService,
            useValue: {
              getWorkspaceAvailability: () => activeWorkspaceStream,
            },
          },
          {
            provide: ReportService,
            useValue: {
              getAttendance: (workspaceId: string, query: Parameters<ReportService['getAttendance']>[1]) => {
                const page = query.page ?? 1;
                attendanceRequests.push(page);
                attendanceQueries.push({ workspaceId, query: { ...query } });
                if (pendingAttendanceResponses) {
                  return pendingAttendanceResponses[pendingAttendanceIndex++].asObservable();
                }
                if (attendanceFailure) {
                  return throwError(() => new Error('attendance unavailable'));
                }
                return of(attendancePage(page));
              },
              getFinance: (workspaceId: string, query: Parameters<ReportService['getFinance']>[1]) => {
                const page = query.page ?? 1;
                financeRequests.push(page);
                financeQueries.push({ workspaceId, query: { ...query } });
                if (pendingFinanceResponse) return pendingFinanceResponse.asObservable();
                if (financeFailure) {
                  return throwError(() => new Error('finance unavailable'));
                }
                return of(financePage(page));
              },
              exportReport: (workspaceId: string, request: ReportExportRequest) => {
                exportRequests.push({ workspaceId, request: { ...request } });
                if (pendingExportResponse) return pendingExportResponse.asObservable();
                if (snapshotExportUnavailable) {
                  return throwError(() => new HttpErrorResponse({ status: 503 }));
                }
                return of(request.type === 'attendance'
                  ? attendanceExportReport
                  : financeExportReport);
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

    it('uses one captured attendance export request and preserves Arabic HTML formatting', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.filters.patchValue({
        studentId: 'student-filter',
        groupId: 'group-filter',
      });
      component.applyFilters();
      attendanceRequests = [];
      exportRequests = [];
      attendanceExportReport = {
        ...emptyAttendance(),
        items: [{
          ...attendanceItem('student-1'),
          studentName: 'طالب <مميز>',
        }],
        pagination: { page: 1, pageSize: 10_000, totalItems: 1, totalPages: 1 },
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

      expect(attendanceRequests).toEqual([]);
      expect(exportRequests).toHaveLength(1);
      expect(exportRequests[0].workspaceId).toBe('workspace-1');
      expect(exportRequests[0].request).toEqual(expect.objectContaining({
        type: 'attendance',
        studentId: 'student-filter',
        groupId: 'group-filter',
      }));
      expect(exportRequests[0].request.timezone).toBeTruthy();
      expect(exportRequests[0].request.from).toBeTruthy();
      expect(exportRequests[0].request.to).toBeTruthy();
      expect(blobs).toHaveLength(1);
      const html = await blobs[0].text();
      expect(html).toContain('طالب &lt;مميز&gt;');
      expect(html).toContain('الفترة:');
      expect(html).toContain('<th>الطالب</th>');
      expect(html).not.toContain('2026-03-01T08:00:00.000Z');
    });

    it('sends one finance export request containing the existing finance filters', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.filters.patchValue({
        studentId: 'finance-student',
        groupId: 'ignored-group',
      });
      component.applyFilters();
      component.setTab('finance');
      financeRequests = [];
      exportRequests = [];
      financeExportReport = {
        ...emptyFinance(),
        invoices: {
          items: [{
            id: 'invoice-1',
            invoiceNumber: 'INV-001',
            studentId: 'finance-student',
            issuedAt: '2026-03-01T08:00:00.000Z',
            totalAmount: '100',
            status: 'issued',
          }],
          pagination: { page: 1, pageSize: 10_000, totalItems: 1, totalPages: 1 },
        },
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

      expect(financeRequests).toEqual([]);
      expect(exportRequests).toHaveLength(1);
      expect(exportRequests[0].workspaceId).toBe('workspace-1');
      expect(exportRequests[0].request).toEqual(expect.objectContaining({
        type: 'finance',
        studentId: 'finance-student',
      }));
      expect(exportRequests[0].request).not.toHaveProperty('groupId');
      expect(await blobs[0].text()).toContain('INV-001');
    });

    it('discards an export when Workspace changes while the request is pending', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      pendingExportResponse = new RxSubject<AttendanceReport | FinanceReport>();
      exportRequests = [];
      const createObjectURL = vi.fn(() => 'blob:report');
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: () => undefined });

      const exportPromise = component.exportExcel();
      activeWorkspaceStream = of({
        kind: 'active',
        workspace: { ...reportWorkspace, _id: 'workspace-2', name: 'Workspace 2' },
      });
      component.retryWorkspace();
      pendingExportResponse.next(emptyAttendance());
      pendingExportResponse.complete();
      await exportPromise;

      expect(exportRequests).toHaveLength(1);
      expect(exportRequests[0].workspaceId).toBe('workspace-1');
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(component.exporting()).toBe(false);
    });

    it('does not download failed exports or send duplicate concurrent requests', async () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const createObjectURL = vi.fn(() => 'blob:report');
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: () => undefined });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      snapshotExportUnavailable = true;
      await component.exportExcel();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(component.error()).toContain('تصدير متسق');

      snapshotExportUnavailable = false;
      pendingExportResponse = new RxSubject<AttendanceReport | FinanceReport>();
      exportRequests = [];
      const exportPromise = component.exportExcel();
      await component.exportExcel();
      expect(exportRequests).toHaveLength(1);
      pendingExportResponse.next(attendanceExportReport);
      pendingExportResponse.complete();
      await exportPromise;
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('paginates attendance, preserves applied filters, and resets to page one on filter apply', () => {
      attendancePage = (page) => ({
        ...emptyAttendance(),
        items: [attendanceItem(`attendance-page-${page}`)],
        pagination: { page, pageSize: 20, totalItems: 35, totalPages: 2 },
      });
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.filters.patchValue({ studentId: 'student-filter', groupId: 'group-filter' });
      component.applyFilters();
      component.changeAttendancePage(2);
      fixture.detectChanges();

      expect(component.attendance()?.items[0].id).toBe('attendance-page-2');
      expect(component.attendance()?.pagination.totalItems).toBe(35);
      expect(fixture.nativeElement.textContent).toContain('صفحة 2 من 2');
      expect(fixture.nativeElement.textContent).toContain('إجمالي السجلات: 35');
      expect(attendanceQueries.at(-1)).toEqual(
        expect.objectContaining({
          workspaceId: reportWorkspace._id,
          query: expect.objectContaining({
            page: 2,
            pageSize: 20,
            studentId: 'student-filter',
            groupId: 'group-filter',
          }),
        }),
      );

      component.filters.patchValue({ studentId: 'another-student' });
      component.applyFilters();

      expect(component.attendance()?.pagination.page).toBe(1);
      expect(attendanceQueries.at(-1)?.query).toEqual(
        expect.objectContaining({
          page: 1,
          studentId: 'another-student',
          groupId: 'group-filter',
        }),
      );
    });

    it('renders all finance collections and paginates each one independently', () => {
      financePage = (page) => {
        const report = emptyFinance();
        return {
          ...report,
          payments: {
            items: [
              {
                id: `payment-${page}`,
                studentId: 'student-1',
                amount: '25.50',
                method: 'cash',
                receivedAt: '2026-03-01T08:00:00.000Z',
              },
            ],
            pagination: { page, pageSize: 20, totalItems: 25, totalPages: 2 },
          },
          invoices: {
            items: [
              {
                id: `invoice-${page}`,
                invoiceNumber: `INV-${page}`,
                studentId: 'student-1',
                issuedAt: '2026-03-01T08:00:00.000Z',
                totalAmount: '80.00',
                status: 'issued',
              },
            ],
            pagination: { page, pageSize: 20, totalItems: 45, totalPages: 3 },
          },
          allocations: {
            items: [
              {
                id: `allocation-${page}`,
                paymentId: 'payment-1',
                invoiceId: 'invoice-1',
                amount: '20.00',
                createdAt: '2026-03-01T08:00:00.000Z',
              },
            ],
            pagination: { page, pageSize: 20, totalItems: 45, totalPages: 3 },
          },
        };
      };
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.setTab('finance');
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('المدفوعات');
      expect(fixture.nativeElement.textContent).toContain('الفواتير');
      expect(fixture.nativeElement.textContent).toContain('تخصيصات المدفوعات');
      expect(component.payments().items[0].id).toBe('payment-1');
      expect(component.invoices().items[0].invoiceNumber).toBe('INV-1');
      expect(component.allocations().items[0].paymentId).toBe('payment-1');
      expect(fixture.nativeElement.textContent).toContain('إجمالي المدفوعات: 25');
      expect(fixture.nativeElement.textContent).toContain('إجمالي الفواتير: 45');

      component.filters.patchValue({ studentId: 'student-filter' });
      component.applyFilters();
      component.changeFinancePage('invoices', 2);
      expect(component.invoices().pagination.page).toBe(2);
      expect(component.payments().pagination.page).toBe(1);
      expect(component.allocations().pagination.page).toBe(1);

      component.changeFinancePage('payments', 2);
      expect(component.payments().pagination.page).toBe(2);
      expect(component.invoices().pagination.page).toBe(2);
      expect(component.allocations().pagination.page).toBe(1);

      component.changeFinancePage('allocations', 3);
      expect(component.allocations().pagination.page).toBe(3);
      expect(component.payments().pagination.page).toBe(2);
      expect(component.invoices().pagination.page).toBe(2);
      expect(financeQueries.slice(-3).map(({ query }) => query.page)).toEqual([2, 2, 3]);
      expect(financeQueries.slice(-3).every(({ workspaceId, query }) => workspaceId === reportWorkspace._id && query.studentId === 'student-filter')).toBe(true);

      component.filters.patchValue({ studentId: 'updated-filter' });
      component.applyFilters();
      expect(component.payments().pagination.page).toBe(1);
      expect(component.invoices().pagination.page).toBe(1);
      expect(component.allocations().pagination.page).toBe(1);
      expect(financeQueries.at(-1)?.query).toEqual(
        expect.objectContaining({
          page: 1,
          studentId: 'updated-filter',
        }),
      );
    });

    it('shows empty collections and retries failed report requests', () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      financePage = () => emptyFinance();
      component.setTab('finance');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('لا توجد مدفوعات في الفترة المحددة');
      expect(fixture.nativeElement.textContent).toContain('لا توجد فواتير صادرة في الفترة المحددة');
      expect(fixture.nativeElement.textContent).toContain('لا توجد تخصيصات في الفترة المحددة');
      expect(fixture.nativeElement.textContent).toContain('صفحة 1 من 1');
      expect(fixture.nativeElement.textContent).toContain('إجمالي المدفوعات: 0');

      component.setTab('attendance');
      attendanceFailure = true;
      component.applyFilters();
      fixture.detectChanges();
      expect(component.attendanceError()).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('تعذر تحميل صفحة تقرير الحضور');

      attendanceFailure = false;
      component.retryAttendancePage();
      expect(component.attendanceError()).toBe('');
      expect(component.attendance()).not.toBeNull();

      financeFailure = true;
      component.setTab('finance');
      fixture.detectChanges();
      expect(component.payments().error).toBeTruthy();
      expect(component.invoices().error).toBeTruthy();
      expect(component.allocations().error).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('تعذر تحميل المدفوعات');

      financeFailure = false;
      component.retryFinanceCollection('invoices');
      expect(component.invoices().error).toBe('');
      expect(component.payments().error).toBeTruthy();
      expect(component.allocations().error).toBeTruthy();
    });

    it('shows loading states while Finance collections are pending', () => {
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const pendingResponse = new RxSubject<FinanceReport>();
      pendingFinanceResponse = pendingResponse;

      component.setTab('finance');
      fixture.detectChanges();

      expect(component.payments().loading).toBe(true);
      expect(component.invoices().loading).toBe(true);
      expect(component.allocations().loading).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل المدفوعات');
      expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل الفواتير');
      expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل التخصيصات');

      pendingResponse.next(emptyFinance());
      pendingResponse.complete();
      fixture.detectChanges();
      expect(component.payments().loading).toBe(false);
      expect(component.invoices().loading).toBe(false);
      expect(component.allocations().loading).toBe(false);
    });

    it('ignores stale filter and workspace responses', () => {
      const workspaceChanges = new RxSubject<WorkspaceAvailability>();
      activeWorkspaceStream = workspaceChanges.asObservable();
      pendingAttendanceResponses = [new RxSubject<AttendanceReport>(), new RxSubject<AttendanceReport>(), new RxSubject<AttendanceReport>()];
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      workspaceChanges.next({ kind: 'active', workspace: reportWorkspace });
      expect(component.attendanceLoading()).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل سجلات الحضور');
      component.filters.patchValue({ studentId: 'new-filter' });
      component.applyFilters();

      const secondWorkspace = { ...reportWorkspace, _id: 'workspace-2' };
      workspaceChanges.next({ kind: 'active', workspace: secondWorkspace });
      expect(component.attendance()).toBeNull();

      const makeReport = (id: string): AttendanceReport => ({
        ...emptyAttendance(),
        items: [attendanceItem(id)],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
      pendingAttendanceResponses[2].next(makeReport('current-workspace-row'));
      pendingAttendanceResponses[1].next(makeReport('stale-filter-row'));
      pendingAttendanceResponses[0].next(makeReport('stale-workspace-row'));

      expect(attendanceQueries.map(({ workspaceId }) => workspaceId)).toEqual([reportWorkspace._id, reportWorkspace._id, secondWorkspace._id]);
      expect(component.attendance()?.items[0].id).toBe('current-workspace-row');
      expect(component.attendanceLoading()).toBe(false);
    });

    it('does not request reports for an initially suspended workspace', () => {
      const suspendedWorkspace = { ...reportWorkspace, status: 'suspended' as const };
      activeWorkspaceStream = of({ kind: 'suspended', workspaces: [suspendedWorkspace] });
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();

      expect(attendanceRequests).toEqual([]);
      expect(financeRequests).toEqual([]);
      expect(fixture.nativeElement.textContent).toContain('مساحة العمل معلّقة');
    });

    it('clears an in-flight active report when workspace refresh finds suspension', () => {
      const suspendedWorkspace = { ...reportWorkspace, status: 'suspended' as const };
      activeWorkspaceStream = of({ kind: 'active', workspace: reportWorkspace });
      pendingAttendanceResponses = [new RxSubject<AttendanceReport>()];
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(attendanceRequests).toEqual([1]);
      expect(component.attendanceLoading()).toBe(true);

      activeWorkspaceStream = of({ kind: 'suspended', workspaces: [suspendedWorkspace] });
      component.retryWorkspace();
      fixture.detectChanges();
      expect(component.workspaceAvailability()?.kind).toBe('suspended');
      expect(component.attendance()).toBeNull();
      expect(component.finance()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('مساحة العمل معلّقة');
      expect(attendanceRequests).toEqual([1]);

      pendingAttendanceResponses[0].next(emptyAttendance());
      expect(component.attendance()).toBeNull();
      expect(attendanceRequests).toEqual([1]);
    });

    it('shows the no-workspace state without issuing report requests', () => {
      activeWorkspaceStream = of({ kind: 'unavailable' });
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();

      expect(attendanceRequests).toEqual([]);
      expect(financeRequests).toEqual([]);
      expect(fixture.nativeElement.textContent).toContain('لا توجد مساحة عمل متاحة');
    });

    it('keeps export pagination independent from the selected interactive page', async () => {
      attendancePage = (page) => ({
        ...emptyAttendance(),
        items: page === 1 ? Array.from({ length: 100 }, (_, index) => attendanceItem(`export-${index}`)) : [attendanceItem('export-last')],
        pagination: { page, pageSize: 100, totalItems: 101, totalPages: 2 },
      });
      attendanceExportReport = {
        ...emptyAttendance(),
        items: Array.from({ length: 100 }, (_, index) => attendanceItem(`export-${index}`))
          .concat(attendanceItem('export-last')),
        pagination: { page: 1, pageSize: 10_000, totalItems: 101, totalPages: 1 },
      };
      const fixture = TestBed.createComponent(ReportsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.changeAttendancePage(2);
      attendanceRequests = [];
      exportRequests = [];
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

      expect(attendanceRequests).toEqual([]);
      expect(exportRequests).toHaveLength(1);
      expect(blobs).toHaveLength(1);
      expect(await blobs[0].text()).toContain('export-last');
    });
  });

  describe('Dashboard workspace gating', () => {
    const activeWorkspace: Workspace = {
      _id: 'workspace-dashboard-gate',
      name: 'مساحة لوحة التحكم',
      slug: 'workspace-dashboard-gate',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const suspendedWorkspace: Workspace = {
      ...activeWorkspace,
      _id: 'workspace-dashboard-suspended',
      status: 'suspended',
    };
    const dashboardSummary: DashboardSummary = {
      period: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' },
      students: { total: 1, active: 1, inactive: 0, archived: 0 },
      groups: {
        total: 0,
        activeEnrollments: 0,
        pausedEnrollments: 0,
        cancelledEnrollments: 0,
        occupancy: [],
      },
      sessions: { scheduled: 0, completed: 0, cancelled: 0 },
      attendance: {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        attended: 0,
        denominator: 0,
        attendanceRate: null,
      },
      finance: {
        issuedInvoiceCount: 0,
        issuedInvoiceTotal: '0',
        currentOutstanding: '0',
        collectedInPeriod: '0',
        unallocatedPayments: '0',
      },
    };
    const upcomingSession: Session = {
      id: 'session-dashboard-upcoming',
      groupId: 'group-dashboard-upcoming',
      title: 'مراجعة الجبر',
      startsAt: '2026-11-28T10:00:00.000Z',
      endsAt: '2026-11-28T11:00:00.000Z',
      status: 'scheduled',
      notes: '',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
    };
    const upcomingGroup: StudyGroup = {
      id: upcomingSession.groupId,
      subjectId: 'subject-dashboard-upcoming',
      name: 'المجموعة الأولى',
      description: '',
      monthlyFee: '0',
      capacity: null,
      status: 'active',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    };
    const upcomingSubject: Subject = {
      id: upcomingGroup.subjectId,
      name: 'الرياضيات',
      description: '',
      status: 'active',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    };
    const recentPayment: DashboardActivityItem = {
      id: 'payment-dashboard-recent',
      type: 'payment',
      occurredAt: '2026-11-27T07:00:00.000Z',
      amount: '150.00',
      method: 'cash',
      status: 'completed',
    };
    let availabilityResponse: Observable<WorkspaceAvailability>;
    const workspaceServiceMock = {
      getWorkspaceAvailability: vi.fn<WorkspaceService['getWorkspaceAvailability']>(),
      watchWorkspaceAvailability: vi.fn<WorkspaceService['watchWorkspaceAvailability']>(),
    };
    const reportServiceMock = {
      getDashboard: vi.fn<ReportService['getDashboard']>(),
      getDashboardActivity: vi.fn<ReportService['getDashboardActivity']>(),
    };
    const learningServiceMock = {
      listSessions: vi.fn<LearningService['listSessions']>(),
      getGroup: vi.fn<LearningService['getGroup']>(),
      getSubject: vi.fn<LearningService['getSubject']>(),
    };

    beforeEach(async () => {
      TestBed.resetTestingModule();
      availabilityResponse = of({ kind: 'suspended', workspaces: [suspendedWorkspace] });
      workspaceServiceMock.getWorkspaceAvailability
        .mockReset()
        .mockImplementation(() => availabilityResponse);
      workspaceServiceMock.watchWorkspaceAvailability.mockReset();
      reportServiceMock.getDashboard.mockReset().mockReturnValue(of(dashboardSummary));
      reportServiceMock.getDashboardActivity.mockReset().mockReturnValue(of([]));
      learningServiceMock.listSessions.mockReset().mockReturnValue(
        of({
          items: [],
          pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 },
        }),
      );
      learningServiceMock.getGroup.mockReset().mockReturnValue(of(upcomingGroup));
      learningServiceMock.getSubject.mockReset().mockReturnValue(of(upcomingSubject));
      await TestBed.configureTestingModule({
        imports: [DashboardComponent],
        providers: [
          provideRouter([]),
          {
            provide: AuthService,
            useValue: {
              currentUser: signal<AuthUser | null>({
                id: 'teacher-dashboard',
                name: 'Teacher',
                email: 'teacher@example.com',
                status: 'active',
                lastLoginAt: null,
              }),
              logout: () => of({ message: 'ok' }),
            },
          },
          { provide: WorkspaceService, useValue: workspaceServiceMock },
          { provide: ReportService, useValue: reportServiceMock },
          { provide: LearningService, useValue: learningServiceMock },
        ],
      });
      TestBed.overrideComponent(DashboardComponent, {
        set: {
          template: `
            @if (workspaceLoading()) {
              <p>جارٍ التحقق من مساحة العمل</p>
            } @else if (workspaceError()) {
              <p>{{ workspaceError() }}</p>
            } @else if (workspaceAvailability()?.kind === 'suspended') {
              <p>مساحة العمل معلّقة</p>
            } @else if (summary(); as currentSummary) {
              <p>{{ currentSummary.students.total }}</p>
            }
            @if (upcomingSessionsLoading()) {
              <p>جارٍ تحميل الحصص القادمة...</p>
            } @else if (upcomingSessionsError()) {
              <p role="alert">{{ upcomingSessionsError() }}</p>
            } @else if (workspaceAvailability()?.kind === 'active' && upcomingSessions().length === 0) {
              <p>لا توجد حصص مجدولة قادمة.</p>
            }
            @if (recentActivityLoading()) {
              <p>جارٍ تحميل النشاط...</p>
            } @else if (recentActivityError()) {
              <p role="alert">{{ recentActivityError() }}</p>
            } @else if (workspaceAvailability()?.kind === 'active' && recentActivity().length === 0) {
              <p>لا توجد سجلات حضور أو مدفوعات حديثة.</p>
            }
          `,
        },
      });
      await TestBed.compileComponents();
    });

    it('never requests dashboard data for a suspended workspace', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();

      expect(reportServiceMock.getDashboard).not.toHaveBeenCalled();
      expect(fixture.componentInstance.summary()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('مساحة العمل معلّقة');
    });

    it('loads upcoming sessions and recent persisted activity for the active Workspace', () => {
      availabilityResponse = of({ kind: 'active', workspace: activeWorkspace });
      learningServiceMock.listSessions.mockReturnValue(
        of({
          items: [upcomingSession],
          pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 },
        }),
      );
      reportServiceMock.getDashboardActivity.mockReturnValue(of([recentPayment]));
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(learningServiceMock.listSessions).toHaveBeenCalledWith(
        activeWorkspace._id,
        expect.objectContaining({
          page: 1,
          pageSize: 5,
          status: 'scheduled',
          from: expect.any(String),
        }),
      );
      expect(learningServiceMock.getGroup).toHaveBeenCalledWith(
        activeWorkspace._id,
        upcomingSession.groupId,
      );
      expect(learningServiceMock.getSubject).toHaveBeenCalledWith(
        activeWorkspace._id,
        upcomingGroup.subjectId,
      );
      expect(reportServiceMock.getDashboardActivity).toHaveBeenCalledWith(
        activeWorkspace._id,
        5,
      );
      expect(component.upcomingSessions()).toEqual([
        { session: upcomingSession, group: upcomingGroup, subject: upcomingSubject },
      ]);
      expect(component.recentActivity()).toEqual([recentPayment]);
    });

    it('shows empty states when the active Workspace has no upcoming sessions or recent activity', () => {
      availabilityResponse = of({ kind: 'active', workspace: activeWorkspace });
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.upcomingSessions()).toEqual([]);
      expect(component.upcomingSessionsLoading()).toBe(false);
      expect(component.recentActivity()).toEqual([]);
      expect(component.recentActivityLoading()).toBe(false);
      expect(component.upcomingSessionsError()).toBe('');
      expect(component.recentActivityError()).toBe('');
      expect(fixture.nativeElement.textContent).toContain('لا توجد حصص مجدولة قادمة.');
      expect(fixture.nativeElement.textContent).toContain('لا توجد سجلات حضور أو مدفوعات حديثة.');
    });

    it('shows loading states while schedule and activity requests are pending', () => {
      availabilityResponse = of({ kind: 'active', workspace: activeWorkspace });
      const sessionResponse = new RxSubject<PageResult<Session>>();
      const activityResponse = new RxSubject<DashboardActivityItem[]>();
      learningServiceMock.listSessions.mockReturnValue(sessionResponse);
      reportServiceMock.getDashboardActivity.mockReturnValue(activityResponse);
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.upcomingSessionsLoading()).toBe(true);
      expect(component.recentActivityLoading()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل الحصص القادمة...');
      expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل النشاط...');

      sessionResponse.next({
        items: [],
        pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 },
      });
      activityResponse.next([]);
      expect(component.upcomingSessionsLoading()).toBe(false);
      expect(component.recentActivityLoading()).toBe(false);
    });

    it('reports upcoming-session and recent-activity API failures independently', () => {
      availabilityResponse = of({ kind: 'active', workspace: activeWorkspace });
      learningServiceMock.listSessions.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      reportServiceMock.getDashboardActivity.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.upcomingSessionsError()).toBe('تعذر تحميل الحصص القادمة.');
      expect(component.upcomingSessionsLoading()).toBe(false);
      expect(component.recentActivityError()).toBe('تعذر تحميل النشاط الأخير.');
      expect(component.recentActivityLoading()).toBe(false);
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        'تعذر تحميل الحصص القادمة.',
      );
    });

    it('clears activity and upcoming sessions on Workspace switch and ignores stale responses', () => {
      const workspaceChanges = new RxSubject<WorkspaceAvailability>();
      const previousSessionResponse = new RxSubject<PageResult<Session>>();
      const currentSessionResponse = new RxSubject<PageResult<Session>>();
      const previousActivityResponse = new RxSubject<DashboardActivityItem[]>();
      const currentActivityResponse = new RxSubject<DashboardActivityItem[]>();
      const nextWorkspace: Workspace = {
        ...activeWorkspace,
        _id: 'workspace-dashboard-activity-next',
        name: 'مساحة النشاط الثانية',
        slug: 'workspace-dashboard-activity-next',
      };
      workspaceServiceMock.watchWorkspaceAvailability.mockReturnValue(workspaceChanges);
      learningServiceMock.listSessions
        .mockReset()
        .mockReturnValueOnce(previousSessionResponse)
        .mockReturnValueOnce(currentSessionResponse);
      reportServiceMock.getDashboardActivity
        .mockReset()
        .mockReturnValueOnce(previousActivityResponse)
        .mockReturnValueOnce(currentActivityResponse);
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const emptyPage: PageResult<Session> = {
        items: [],
        pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 },
      };

      workspaceChanges.next({ kind: 'active', workspace: activeWorkspace });
      workspaceChanges.next({ kind: 'active', workspace: nextWorkspace });
      expect(component.upcomingSessions()).toEqual([]);
      expect(component.recentActivity()).toEqual([]);
      expect(reportServiceMock.getDashboardActivity).toHaveBeenNthCalledWith(
        1,
        activeWorkspace._id,
        5,
      );
      expect(reportServiceMock.getDashboardActivity).toHaveBeenNthCalledWith(
        2,
        nextWorkspace._id,
        5,
      );
      expect(learningServiceMock.listSessions).toHaveBeenNthCalledWith(
        1,
        activeWorkspace._id,
        expect.any(Object),
      );
      expect(learningServiceMock.listSessions).toHaveBeenNthCalledWith(
        2,
        nextWorkspace._id,
        expect.any(Object),
      );

      previousActivityResponse.next([recentPayment]);
      previousSessionResponse.next({
        ...emptyPage,
        items: [upcomingSession],
        pagination: { ...emptyPage.pagination, totalItems: 1, totalPages: 1 },
      });
      expect(component.recentActivity()).toEqual([]);
      expect(component.upcomingSessions()).toEqual([]);
      expect(learningServiceMock.getGroup).not.toHaveBeenCalled();

      currentActivityResponse.next([recentPayment]);
      currentSessionResponse.next({
        ...emptyPage,
        items: [upcomingSession],
        pagination: { ...emptyPage.pagination, totalItems: 1, totalPages: 1 },
      });
      expect(component.recentActivity()).toEqual([recentPayment]);
      expect(component.upcomingSessions()).toEqual([
        { session: upcomingSession, group: upcomingGroup, subject: upcomingSubject },
      ]);
    });

    it('clears dashboard data when refreshed workspace state becomes suspended', () => {
      const pendingSummary = new RxSubject<DashboardSummary>();
      reportServiceMock.getDashboard.mockReturnValue(pendingSummary);
      availabilityResponse = of({ kind: 'active', workspace: activeWorkspace });
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(reportServiceMock.getDashboard).toHaveBeenCalledWith(
        activeWorkspace._id,
        expect.any(String),
      );
      availabilityResponse = of({ kind: 'suspended', workspaces: [suspendedWorkspace] });
      component.retryWorkspace();
      pendingSummary.next(dashboardSummary);
      fixture.detectChanges();

      expect(component.workspaceAvailability()?.kind).toBe('suspended');
      expect(component.summary()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('مساحة العمل معلّقة');
    });

    it('clears dashboard data on Workspace switch and ignores a late response from the previous Workspace', () => {
      const workspaceChanges = new RxSubject<WorkspaceAvailability>();
      const previousResponse = new RxSubject<DashboardSummary>();
      const currentResponse = new RxSubject<DashboardSummary>();
      const nextWorkspace: Workspace = {
        ...activeWorkspace,
        _id: 'workspace-dashboard-next',
        name: 'مساحة لوحة التحكم الثانية',
        slug: 'workspace-dashboard-next',
      };
      workspaceServiceMock.watchWorkspaceAvailability.mockReturnValue(workspaceChanges);
      reportServiceMock.getDashboard
        .mockReset()
        .mockReturnValueOnce(previousResponse)
        .mockReturnValueOnce(currentResponse);
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      workspaceChanges.next({ kind: 'active', workspace: activeWorkspace });
      workspaceChanges.next({ kind: 'active', workspace: nextWorkspace });
      expect(component.summary()).toBeNull();
      expect(reportServiceMock.getDashboard).toHaveBeenNthCalledWith(
        1,
        activeWorkspace._id,
        expect.any(String),
      );
      expect(reportServiceMock.getDashboard).toHaveBeenNthCalledWith(
        2,
        nextWorkspace._id,
        expect.any(String),
      );

      previousResponse.next(dashboardSummary);
      expect(component.summary()).toBeNull();
      currentResponse.next(dashboardSummary);
      expect(component.summary()).toEqual(dashboardSummary);
    });

    it('shows Workspace loading failures and retries with the active Workspace', () => {
      availabilityResponse = throwError(() => new HttpErrorResponse({ status: 0 }));
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.workspaceError()).toBe('تعذر تحميل مساحة العمل.');
      expect(reportServiceMock.getDashboard).not.toHaveBeenCalled();

      availabilityResponse = of({ kind: 'active', workspace: activeWorkspace });
      component.retryWorkspace();

      expect(component.workspaceError()).toBe('');
      expect(reportServiceMock.getDashboard).toHaveBeenCalledWith(
        activeWorkspace._id,
        expect.any(String),
      );
    });
  });

  describe('Students and guardians workflows', () => {
    const workspace: Workspace = {
      _id: 'workspace-1',
      name: 'مساحة تجريبية',
      slug: 'workspace',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const student: Student = {
      id: 'student-1',
      name: 'نور أحمد',
      phone: null,
      email: null,
      schoolName: 'مدرسة النور',
      grade: 'الصف السادس',
      status: 'active',
      notes: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const guardian: Guardian = {
      id: 'guardian-1',
      name: 'أحمد محمد',
      phone: '+201000000000',
      alternatePhone: null,
      email: 'guardian@example.com',
      relationship: 'father',
      notes: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const secondGuardian: Guardian = {
      ...guardian,
      id: 'guardian-2',
      name: 'سارة محمد',
      phone: '+201111111111',
    };
    const link: StudentGuardianLink = {
      guardian: {
        id: guardian.id,
        name: guardian.name,
        phone: guardian.phone,
        alternatePhone: guardian.alternatePhone,
        email: guardian.email,
        notes: guardian.notes,
        createdAt: guardian.createdAt,
        updatedAt: guardian.updatedAt,
      },
      relationship: 'father',
      isPrimary: true,
      receivesNotifications: true,
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
    };
    const pageResult = <T>(
      items: T[],
      page = 1,
      totalItems = items.length,
      totalPages = totalItems === 0 ? 0 : 1,
    ): PageResult<T> => ({
      items,
      pagination: { page, pageSize: 20, totalItems, totalPages },
    });

    const peopleMock = {
      listStudents: vi.fn<PeopleService['listStudents']>(),
      getStudent: vi.fn<PeopleService['getStudent']>(),
      createStudent: vi.fn<PeopleService['createStudent']>(),
      updateStudent: vi.fn<PeopleService['updateStudent']>(),
      listGuardians: vi.fn<PeopleService['listGuardians']>(),
      getGuardian: vi.fn<PeopleService['getGuardian']>(),
      createGuardian: vi.fn<PeopleService['createGuardian']>(),
      updateGuardian: vi.fn<PeopleService['updateGuardian']>(),
      listStudentGuardians: vi.fn<PeopleService['listStudentGuardians']>(),
      linkGuardian: vi.fn<PeopleService['linkGuardian']>(),
      updateStudentGuardian: vi.fn<PeopleService['updateStudentGuardian']>(),
      unlinkGuardian: vi.fn<PeopleService['unlinkGuardian']>(),
    };
    const workspaceServiceMock = {
      getActiveWorkspace: vi.fn<WorkspaceService['getActiveWorkspace']>(),
      watchActiveWorkspace: vi.fn<WorkspaceService['watchActiveWorkspace']>(),
      workspaceAccessState: signal<WorkspaceAccessState | null>({
        workspaces: [workspace],
        activeWorkspace: workspace,
        suspendedWorkspaces: [],
      }),
      selectedWorkspaceId: signal<string | null>(workspace._id),
      selectWorkspace: vi.fn<WorkspaceService['selectWorkspace']>(),
    };

    beforeEach(async () => {
      TestBed.resetTestingModule();
      workspaceServiceMock.getActiveWorkspace.mockReset().mockReturnValue(of(workspace));
      workspaceServiceMock.watchActiveWorkspace.mockReset().mockReturnValue(of(workspace));
      workspaceServiceMock.selectWorkspace.mockReset().mockReturnValue(true);
      peopleMock.listStudents.mockReset().mockReturnValue(of(pageResult([student])));
      peopleMock.getStudent.mockReset().mockReturnValue(of(student));
      peopleMock.createStudent.mockReset().mockReturnValue(of(student));
      peopleMock.updateStudent.mockReset().mockReturnValue(of(student));
      peopleMock.listGuardians.mockReset().mockReturnValue(of(pageResult([guardian])));
      peopleMock.getGuardian.mockReset().mockReturnValue(of(guardian));
      peopleMock.createGuardian.mockReset().mockReturnValue(of(guardian));
      peopleMock.updateGuardian.mockReset().mockReturnValue(of(guardian));
      peopleMock.listStudentGuardians.mockReset().mockReturnValue(of([link]));
      peopleMock.linkGuardian.mockReset().mockReturnValue(of(link));
      peopleMock.updateStudentGuardian.mockReset().mockReturnValue(of(link));
      peopleMock.unlinkGuardian.mockReset().mockReturnValue(
        of({ studentId: student.id, guardianId: guardian.id }),
      );
      await TestBed.configureTestingModule({
        imports: [StudentsComponent, GuardiansComponent],
        providers: [
          provideRouter([
            { path: 'students/:studentId', component: StudentsComponent },
            { path: 'students', component: StudentsComponent },
            { path: 'guardians/:guardianId', component: GuardiansComponent },
            { path: 'guardians', component: GuardiansComponent },
          ]),
          { provide: WorkspaceService, useValue: workspaceServiceMock },
          { provide: PeopleService, useValue: peopleMock },
        ],
      }).compileComponents();
    });

    it('loads students in the active workspace and applies search and pagination', async () => {
      peopleMock.listStudents.mockReturnValue(of(pageResult([student], 1, 21, 2)));
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/students', StudentsComponent);

      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );

      component.statusFilter.setValue('inactive');
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 1, status: 'inactive' }),
      );

      component.search.setValue('نور');
      await new Promise((resolve) => setTimeout(resolve, 280));
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 1, search: 'نور', status: 'inactive' }),
      );

      component.changePage(2);
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 2, search: 'نور', status: 'inactive' }),
      );
    });

    it('clears and reloads student data on Workspace switch while ignoring the previous response', () => {
      const previousResponse = new RxSubject<PageResult<Student>>();
      const currentResponse = new RxSubject<PageResult<Student>>();
      const nextWorkspace: Workspace = {
        ...workspace,
        _id: 'workspace-2',
        name: 'مساحة ثانية',
        slug: 'workspace-2',
      };
      const workspaceChanges = new RxSubject<Workspace | null>();
      peopleMock.listStudents
        .mockReturnValueOnce(previousResponse)
        .mockReturnValueOnce(currentResponse);
      workspaceServiceMock.watchActiveWorkspace.mockReturnValue(
        workspaceChanges.asObservable(),
      );
      const fixture = TestBed.createComponent(StudentsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      workspaceChanges.next(workspace);
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.any(Object),
      );
      workspaceChanges.next(nextWorkspace);
      expect(component.students()).toEqual([]);
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        nextWorkspace._id,
        expect.any(Object),
      );

      previousResponse.next(pageResult([student]));
      expect(component.students()).toEqual([]);

      const nextStudent = { ...student, id: 'student-workspace-2', name: 'طالب المساحة الثانية' };
      currentResponse.next(pageResult([nextStudent]));
      expect(component.students()).toEqual([nextStudent]);
    });

    it('shows an explicit empty state and keeps API errors separate from empty results', async () => {
      peopleMock.listStudents.mockReturnValue(of(pageResult([])));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/students', StudentsComponent);
      expect(harness.routeNativeElement?.textContent).toContain('لا توجد ملفات طلاب بعد');

      peopleMock.listGuardians.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Internal Server Error' } })),
      );
      const guardianPage = await harness.navigateByUrl('/guardians', GuardiansComponent);
      expect(guardianPage.error()).toContain('تعذر تحميل قائمة أولياء الأمور');
      expect(harness.routeNativeElement?.textContent).not.toContain('لا توجد ملفات أولياء أمور بعد');
    });

    it('validates and creates a student using only the supported fields', async () => {
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/students/new', StudentsComponent);

      expect(peopleMock.getStudent).not.toHaveBeenCalled();
      component.submitStudent();
      expect(component.studentForm.controls.name.touched).toBe(true);
      expect(peopleMock.createStudent).not.toHaveBeenCalled();

      component.studentForm.setValue({
        name: '  نور طالبة  ',
        phone: '   ',
        email: '',
        schoolName: ' مدرسة النور ',
        grade: ' السادس ',
        status: 'active',
        notes: ' ملاحظة ',
      });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      component.submitStudent();

      expect(peopleMock.createStudent).toHaveBeenCalledWith(workspace._id, {
        name: 'نور طالبة',
        phone: null,
        email: null,
        schoolName: 'مدرسة النور',
        grade: 'السادس',
        status: 'active',
        notes: 'ملاحظة',
      });
      harness.detectChanges();
      expect(component.student()?.id).toBe(student.id);
      expect(component.success()).toContain('تم حفظ بيانات الطالب بنجاح');
      expect(navigate).toHaveBeenCalledWith('/students/student-1');
    });

    it('loads student details and updates the supported student status and profile fields', async () => {
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/students/student-1', StudentsComponent);

      expect(component.student()).toEqual(student);
      expect(component.guardians()).toEqual([link]);
      expect(harness.routeNativeElement?.querySelector('a[href="/attendance/students/student-1"]')).toBeTruthy();
      expect(harness.routeNativeElement?.querySelector('a[href="/invoices?studentId=student-1"]')).toBeTruthy();
      expect(harness.routeNativeElement?.querySelector('a[href="/payments?studentId=student-1"]')).toBeTruthy();
      component.beginEdit();
      component.studentForm.controls.name.setValue('نور أحمد محدث');
      component.studentForm.controls.status.setValue('inactive');
      component.submitStudent();

      expect(peopleMock.updateStudent).toHaveBeenCalledWith(
        workspace._id,
        student.id,
        expect.objectContaining({ name: 'نور أحمد محدث', status: 'inactive' }),
      );
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('تم حفظ بيانات الطالب بنجاح');
    });

    it('links, updates, and removes guardian relationships through the supported contract', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const linkedToSecondGuardian = {
        ...link,
        guardian: {
          ...link.guardian,
          id: secondGuardian.id,
          name: secondGuardian.name,
          phone: secondGuardian.phone,
        },
        relationship: 'mother' as const,
        isPrimary: false,
      };
      peopleMock.listGuardians.mockReturnValue(
        of(pageResult([guardian, secondGuardian])),
      );
      peopleMock.linkGuardian.mockReturnValue(of(linkedToSecondGuardian));
      peopleMock.listStudentGuardians
        .mockReturnValueOnce(of([link]))
        .mockReturnValue(of([link, linkedToSecondGuardian]));
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/students/student-1', StudentsComponent);

      component.openLinkForm();
      expect(component.isGuardianLinked(guardian.id)).toBe(true);
      component.linkForm.controls.guardianId.setValue(guardian.id);
      component.linkSelectedGuardian();
      expect(peopleMock.linkGuardian).not.toHaveBeenCalled();
      expect(component.error()).toContain('مرتبط بالفعل');

      component.closeRelationshipForms();
      component.openLinkForm();
      component.selectGuardian(secondGuardian);
      component.linkForm.controls.isPrimary.setValue(true);
      component.linkSelectedGuardian();
      expect(peopleMock.linkGuardian).toHaveBeenCalledWith(workspace._id, student.id, {
        guardianId: secondGuardian.id,
        relationship: 'other',
        isPrimary: true,
        receivesNotifications: true,
      });
      expect(component.guardians().map((item) => item.guardian.id)).toContain(secondGuardian.id);

      component.editRelationship(link);
      component.linkEditForm.controls.receivesNotifications.setValue(false);
      component.saveRelationship();
      expect(peopleMock.updateStudentGuardian).toHaveBeenCalledWith(
        workspace._id,
        student.id,
        guardian.id,
        expect.objectContaining({ isPrimary: true, receivesNotifications: false }),
      );

      component.removeRelationship(link);
      expect(peopleMock.unlinkGuardian).toHaveBeenCalledWith(workspace._id, student.id, guardian.id);
      expect(component.success()).toContain('لم يتم حذف ملف ولي الأمر');
    });

    it('searches and paginates guardians, and validates guardian creation', async () => {
      peopleMock.listGuardians.mockReturnValue(of(pageResult([guardian], 1, 21, 2)));
      const harness = await RouterTestingHarness.create();
      const listComponent = await harness.navigateByUrl('/guardians', GuardiansComponent);

      expect(peopleMock.listGuardians).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );
      listComponent.search.setValue('أحمد');
      await new Promise((resolve) => setTimeout(resolve, 280));
      listComponent.changePage(2);
      expect(peopleMock.listGuardians).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 2, search: 'أحمد' }),
      );

      const createComponent = await harness.navigateByUrl('/guardians/new', GuardiansComponent);
      expect(peopleMock.getGuardian).not.toHaveBeenCalled();
      createComponent.submitGuardian();
      expect(createComponent.guardianForm.controls.phone.touched).toBe(true);
      expect(peopleMock.createGuardian).not.toHaveBeenCalled();

      createComponent.guardianForm.setValue({
        name: 'أحمد محمد',
        phone: '+201000000000',
        alternatePhone: '',
        email: '',
        relationship: 'father',
        notes: '',
      });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      createComponent.submitGuardian();
      expect(peopleMock.createGuardian).toHaveBeenCalledWith(workspace._id, {
        name: 'أحمد محمد',
        phone: '+201000000000',
        alternatePhone: null,
        email: null,
        relationship: 'father',
        notes: '',
      });
      expect(navigate).toHaveBeenCalledWith('/guardians/guardian-1');
    });

    it('loads and edits guardian details without claiming unsupported linked-student data', async () => {
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/guardians/guardian-1', GuardiansComponent);

      expect(component.guardian()).toEqual(guardian);
      expect(harness.routeNativeElement?.textContent).toContain('لا تتيح واجهة API الحالية استرجاع الطلاب');
      component.beginEdit();
      component.guardianForm.controls.notes.setValue('ملاحظة جديدة');
      component.submitGuardian();

      expect(peopleMock.updateGuardian).toHaveBeenCalledWith(
        workspace._id,
        guardian.id,
        expect.objectContaining({ notes: 'ملاحظة جديدة' }),
      );
    });
  });

  describe('PeopleService API contracts', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();
    });

    it('scopes student search requests to the authorized workspace and preserves credentials', () => {
      const service = TestBed.inject(PeopleService);
      const http = TestBed.inject(HttpTestingController);
      service.listStudents('workspace-7', {
        page: 2,
        pageSize: 20,
        search: 'نور أحمد',
        status: 'active',
      }).subscribe();

      const request = http.expectOne(
        (candidate) =>
          candidate.url === '/api/workspaces/workspace-7/students' &&
          candidate.params.get('page') === '2' &&
          candidate.params.get('pageSize') === '20' &&
          candidate.params.get('search') === 'نور أحمد' &&
          candidate.params.get('status') === 'active',
      );
      expect(request.request.method).toBe('GET');
      expect(request.request.withCredentials).toBe(true);
      request.flush({ message: 'Students retrieved successfully', data: { items: [], pagination: { page: 2, pageSize: 20, totalItems: 0, totalPages: 0 } } });
      http.verify();
    });

    it('uses the existing link, update, and unlink routes and request fields', () => {
      const service = TestBed.inject(PeopleService);
      const http = TestBed.inject(HttpTestingController);
      const input = {
        guardianId: 'guardian-1',
        relationship: 'mother' as const,
        isPrimary: true,
        receivesNotifications: false,
      };

      service.linkGuardian('workspace-7', 'student-1', input).subscribe();
      const createRequest = http.expectOne('/api/workspaces/workspace-7/students/student-1/guardians');
      expect(createRequest.request.method).toBe('POST');
      expect(createRequest.request.body).toEqual(input);
      expect(createRequest.request.withCredentials).toBe(true);
      createRequest.flush({ message: 'Guardian linked', data: {} });

      service.updateStudentGuardian('workspace-7', 'student-1', 'guardian-1', {
        isPrimary: false,
        receivesNotifications: true,
      }).subscribe();
      const updateRequest = http.expectOne('/api/workspaces/workspace-7/students/student-1/guardians/guardian-1');
      expect(updateRequest.request.method).toBe('PATCH');
      expect(updateRequest.request.body).toEqual({ isPrimary: false, receivesNotifications: true });
      updateRequest.flush({ message: 'Relationship updated', data: {} });

      service.unlinkGuardian('workspace-7', 'student-1', 'guardian-1').subscribe();
      const deleteRequest = http.expectOne('/api/workspaces/workspace-7/students/student-1/guardians/guardian-1');
      expect(deleteRequest.request.method).toBe('DELETE');
      expect(deleteRequest.request.withCredentials).toBe(true);
      deleteRequest.flush({ message: 'Relationship removed', data: {} });
      http.verify();
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

  describe('Not Found route', () => {
    async function openUnknownUrl(fixture: ComponentFixture<AppComponent>): Promise<void> {
      await TestBed.inject(Router).navigateByUrl('/this-page-does-not-exist');
      await fixture.whenStable();
      fixture.detectChanges();
    }

    function clickDashboardLink(
      fixture: ComponentFixture<AppComponent>,
      router: Router,
    ): Promise<NavigationEnd> {
      const navigationEnd = firstValueFrom(
        router.events.pipe(
          filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        ),
      );
      const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
        'a[routerLink="/dashboard"]',
      );
      expect(link).not.toBeNull();
      link?.click();
      return navigationEnd;
    }

    it('renders the Arabic Not Found page for unknown URLs without requiring authentication', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      await openUnknownUrl(fixture);

      expect(fixture.nativeElement.textContent).toContain('الصفحة غير موجودة');
      expect(fixture.nativeElement.textContent).toContain('404');
      expect(fixture.nativeElement.querySelector('main')?.getAttribute('dir')).toBe('rtl');
      TestBed.inject(HttpTestingController).expectNone('/api/auth/status');
    });

    it('sends authenticated users with an active workspace from the CTA to Dashboard', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const httpTesting = TestBed.inject(HttpTestingController);
      await openUnknownUrl(fixture);

      const navigation = clickDashboardLink(fixture, router);
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpTesting.expectOne('/api/auth/status').flush({
        message: 'Authenticated user',
        user: {
          id: 'teacher-1',
          name: 'Teacher Name',
          email: 'teacher@example.com',
          status: 'active',
          lastLoginAt: null,
        },
      });
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'Workspaces loaded',
        data: [{
          _id: 'workspace-not-found',
          name: 'مساحة العمل',
          slug: 'workspace-not-found',
          status: 'active',
          currency: 'EGP',
          description: '',
        }],
      });

      await navigation;
      expect(router.url).toBe('/dashboard');
      httpTesting.expectOne(
        (request) =>
          request.url === '/api/workspaces/workspace-not-found/dashboard/summary',
      ).flush({
        message: 'Dashboard loaded',
        data: {},
      });
    });

    it('sends unauthenticated users from the CTA through the existing sign-in guard', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const httpTesting = TestBed.inject(HttpTestingController);
      await openUnknownUrl(fixture);

      const navigation = clickDashboardLink(fixture, router);
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpTesting.expectOne('/api/auth/status').flush(
        { message: 'Authentication required' },
        { status: 401, statusText: 'Unauthorized' },
      );

      await navigation;
      expect(router.url).toBe('/sign-in?reason=session');
    });

    it('sends authenticated users without a workspace from the CTA to onboarding', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const httpTesting = TestBed.inject(HttpTestingController);
      await openUnknownUrl(fixture);

      const navigation = clickDashboardLink(fixture, router);
      const authenticatedResponse = {
        message: 'Authenticated user',
        user: {
          id: 'teacher-1',
          name: 'Teacher Name',
          email: 'teacher@example.com',
          status: 'active',
          lastLoginAt: null,
        },
      };

      await new Promise((resolve) => setTimeout(resolve, 0));
      httpTesting.expectOne('/api/auth/status').flush(authenticatedResponse);
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'Workspaces loaded',
        data: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpTesting.expectOne('/api/auth/status').flush(authenticatedResponse);
      await new Promise((resolve) => setTimeout(resolve, 0));
      httpTesting.match('/api/workspaces/mine').forEach((request) =>
        request.flush({ message: 'Workspaces loaded', data: [] }),
      );

      await navigation;
      expect(router.url).toBe('/workspace/onboarding');
      httpTesting.expectNone(
        (request) => request.url.includes('/dashboard/summary'),
      );
    });
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

  it('should protect student and guardian routes with the existing auth guard', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    for (const path of [
      '/students',
      '/guardians',
      '/subjects',
      '/groups',
      '/sessions',
      '/attendance',
      '/finance',
      '/invoices',
      '/invoices/new',
      '/invoices/invoice-id',
      '/payments',
      '/payments/new',
      '/payments/payment-id',
      '/attendance/sessions/session-1',
      '/attendance/students/student-1',
    ]) {
      const navigation = router.navigateByUrl(path);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/status');
      expect(request.request.withCredentials).toBe(true);
      request.flush(
        { message: 'Authentication required' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await navigation;
      expect(router.url).toBe('/sign-in?reason=session');
    }
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

    const workspaceRequest = TestBed.inject(HttpTestingController).expectOne('/api/workspaces/mine');
    workspaceRequest.flush({
      message: 'Workspaces loaded',
      data: [{
        _id: 'workspace-dashboard',
        name: 'مساحة العمل',
        slug: 'workspace-dashboard',
        status: 'active',
        currency: 'EGP',
        description: '',
      }],
    });

    await navigation;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url === '/api/workspaces/workspace-dashboard/dashboard/summary')
      .flush({
        message: 'Dashboard loaded',
        data: {
          period: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' },
          students: { total: 0, active: 0, inactive: 0, archived: 0 },
          groups: {
            total: 0,
            activeEnrollments: 0,
            pausedEnrollments: 0,
            cancelledEnrollments: 0,
            occupancy: [],
          },
          sessions: { scheduled: 0, completed: 0, cancelled: 0 },
          attendance: {
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            attended: 0,
            denominator: 0,
            attendanceRate: null,
          },
          finance: {
            issuedInvoiceCount: 0,
            issuedInvoiceTotal: '0',
            currentOutstanding: '0',
            collectedInPeriod: '0',
            unallocatedPayments: '0',
          },
        },
      });
    fixture.detectChanges();
    expect(router.url).toBe('/dashboard');
    const dashboard = fixture.nativeElement as HTMLElement;
    expect(dashboard.textContent).toContain('Teacher Name');
    expect(dashboard.textContent).toContain('teacher@example.com');
    expect(dashboard.textContent).toContain('إدارة المواد وربطها بالمجموعات الدراسية.');
    expect(dashboard.querySelector('[dir="rtl"][lang="ar"]')).toBeTruthy();
    expect(dashboard.querySelector('button[aria-label="English"]')).toBeNull();
    expect(dashboard.querySelector('svg')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/students"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/guardians"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/subjects"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/groups"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/sessions"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/finance"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات والحضور والمالية"] a[href="/attendance"]')).toBeTruthy();
    expect(dashboard.querySelector('#attendance a[href="/attendance"]')).toBeTruthy();

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

  describe('Subjects, groups, and enrollments workflows', () => {
    const workspace: Workspace = {
      _id: 'workspace-learning',
      name: 'مساحة التعلم',
      slug: 'learning',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const subject: Subject = {
      id: 'subject-1',
      name: 'الرياضيات',
      description: '',
      status: 'active',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const group: StudyGroup = {
      id: 'group-1',
      subjectId: subject.id,
      name: 'المجموعة الأولى',
      description: '',
      monthlyFee: '25.00',
      capacity: null,
      status: 'active',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const student: Student = {
      id: 'student-learning-1',
      name: 'طالب تجريبي',
      phone: null,
      email: null,
      schoolName: '',
      grade: '',
      status: 'active',
      notes: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const enrollment: Enrollment = {
      id: 'enrollment-1',
      studentId: student.id,
      groupId: group.id,
      enrolledAt: '2026-01-02T10:00:00.000Z',
      endedAt: null,
      status: 'paused',
      notes: '',
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
    };
    const pageResult = <T>(items: T[], totalItems = items.length): PageResult<T> => ({
      items,
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems,
        totalPages: totalItems ? Math.ceil(totalItems / 20) : 0,
      },
    });

    const learningMock = {
      listSubjects: vi.fn<LearningService['listSubjects']>(),
      getSubject: vi.fn<LearningService['getSubject']>(),
      createSubject: vi.fn<LearningService['createSubject']>(),
      updateSubject: vi.fn<LearningService['updateSubject']>(),
      listGroups: vi.fn<LearningService['listGroups']>(),
      getGroup: vi.fn<LearningService['getGroup']>(),
      createGroup: vi.fn<LearningService['createGroup']>(),
      updateGroup: vi.fn<LearningService['updateGroup']>(),
      listGroupEnrollments: vi.fn<LearningService['listGroupEnrollments']>(),
      createEnrollment: vi.fn<LearningService['createEnrollment']>(),
      updateEnrollment: vi.fn<LearningService['updateEnrollment']>(),
    };
    const peopleMock = {
      listStudents: vi.fn<PeopleService['listStudents']>(),
      getStudent: vi.fn<PeopleService['getStudent']>(),
    };

    async function configure(
      component: Type<unknown>,
      routeParams: Record<string, string>,
    ): Promise<void> {
      await TestBed.configureTestingModule({
        imports: [component],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { paramMap: of(convertToParamMap(routeParams)) },
          },
          { provide: WorkspaceService, useValue: { getActiveWorkspace: () => of(workspace) } },
          { provide: LearningService, useValue: learningMock },
          { provide: PeopleService, useValue: peopleMock },
        ],
      }).compileComponents();
    }

    beforeEach(async () => {
      TestBed.resetTestingModule();
      learningMock.listSubjects.mockReset().mockReturnValue(of(pageResult([subject])));
      learningMock.getSubject.mockReset().mockReturnValue(of(subject));
      learningMock.createSubject.mockReset().mockReturnValue(of(subject));
      learningMock.updateSubject.mockReset().mockReturnValue(of(subject));
      learningMock.listGroups.mockReset().mockReturnValue(of(pageResult([group])));
      learningMock.getGroup.mockReset().mockReturnValue(of(group));
      learningMock.createGroup.mockReset().mockReturnValue(of(group));
      learningMock.updateGroup.mockReset().mockReturnValue(of(group));
      learningMock.listGroupEnrollments.mockReset().mockReturnValue(of(pageResult([])));
      learningMock.createEnrollment.mockReset().mockReturnValue(of(enrollment));
      learningMock.updateEnrollment.mockReset().mockReturnValue(of(enrollment));
      peopleMock.listStudents.mockReset().mockReturnValue(of(pageResult([student])));
      peopleMock.getStudent.mockReset().mockReturnValue(of(student));
      await Promise.resolve();
    });

    afterEach(() => {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    });

    it('treats /subjects/new as create mode and submits with the active workspace', async () => {
      await configure(SubjectsComponent, { subjectId: 'new' });
      const fixture = TestBed.createComponent(SubjectsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      expect(component.isCreating()).toBe(true);
      expect(learningMock.getSubject).not.toHaveBeenCalled();
      component.subjectForm.setValue({ name: 'الرياضيات', description: '', status: 'active' });
      component.submitSubject();

      expect(learningMock.createSubject).toHaveBeenCalledWith('workspace-learning', {
        name: 'الرياضيات',
        description: '',
      });
      expect(learningMock.updateSubject).not.toHaveBeenCalled();
    });

    it('blocks invalid subject submissions and applies list search and page parameters', async () => {
      await configure(SubjectsComponent, {});
      const fixture = TestBed.createComponent(SubjectsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.submitSubject();
      expect(learningMock.createSubject).not.toHaveBeenCalled();
      component.search.setValue('جبر');
      component.loadSubjects(2);

      expect(learningMock.listSubjects).toHaveBeenLastCalledWith('workspace-learning', {
        page: 2,
        pageSize: 20,
        search: 'جبر',
        status: undefined,
      });
    });

    it('updates existing subjects instead of creating duplicates', async () => {
      await configure(SubjectsComponent, { subjectId: subject.id });
      const fixture = TestBed.createComponent(SubjectsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.beginEdit();
      component.subjectForm.setValue({
        name: 'الجبر',
        description: 'مستوى أول',
        status: 'archived',
      });
      component.submitSubject();

      expect(learningMock.updateSubject).toHaveBeenCalledWith('workspace-learning', subject.id, {
        name: 'الجبر',
        description: 'مستوى أول',
        status: 'archived',
      });
      expect(learningMock.createSubject).not.toHaveBeenCalled();
    });

    it('shows unlimited capacity and the linked subject in group details', async () => {
      await configure(GroupsComponent, { groupId: group.id });
      const fixture = TestBed.createComponent(GroupsComponent);
      fixture.detectChanges();

      expect(learningMock.getGroup).toHaveBeenCalledWith('workspace-learning', group.id);
      expect(learningMock.getSubject).toHaveBeenCalledWith('workspace-learning', subject.id);
      expect(learningMock.listGroupEnrollments).toHaveBeenCalledWith(
        'workspace-learning',
        group.id,
        { page: 1, pageSize: 1, status: 'active' },
      );
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('غير محدودة');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(subject.name);
      expect(fixture.nativeElement.querySelector('a[href="/sessions"]')).toBeTruthy();
    });

    it('creates groups using the selected subject and an unlimited capacity', async () => {
      await configure(GroupsComponent, { groupId: 'new' });
      const fixture = TestBed.createComponent(GroupsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      expect(component.isCreating()).toBe(true);
      expect(learningMock.getGroup).not.toHaveBeenCalled();
      component.selectFormSubject(subject);
      component.groupForm.patchValue({
        name: 'مجموعة جديدة',
        description: '',
        monthlyFee: '40.00',
        capacity: null,
      });
      component.submitGroup();

      expect(learningMock.createGroup).toHaveBeenCalledWith('workspace-learning', {
        subjectId: subject.id,
        name: 'مجموعة جديدة',
        description: '',
        monthlyFee: '40.00',
        capacity: null,
      });
    });

    it('filters group pages and resolves roster students in the same workspace', async () => {
      await configure(GroupsComponent, {});
      const listFixture = TestBed.createComponent(GroupsComponent);
      listFixture.detectChanges();
      const listComponent = listFixture.componentInstance;
      listComponent.search.setValue('المجموعة');
      listComponent.subjectFilterId.setValue(subject.id);
      listComponent.statusFilter.setValue('active');
      listComponent.loadGroups(2);

      expect(learningMock.listGroups).toHaveBeenLastCalledWith('workspace-learning', {
        page: 2,
        pageSize: 20,
        search: 'المجموعة',
        subjectId: subject.id,
        status: 'active',
      });

      TestBed.resetTestingModule();
      learningMock.listGroupEnrollments.mockReturnValue(of(pageResult([enrollment], 1)));
      await configure(GroupsComponent, { groupId: group.id });
      const detailFixture = TestBed.createComponent(GroupsComponent);
      detailFixture.detectChanges();

      expect(peopleMock.getStudent).toHaveBeenCalledWith('workspace-learning', student.id);
      expect((detailFixture.nativeElement as HTMLElement).textContent).toContain(student.name);
    });

    it('updates group details in the active workspace', async () => {
      await configure(GroupsComponent, { groupId: group.id });
      const fixture = TestBed.createComponent(GroupsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.beginEdit();
      component.groupForm.setValue({
        subjectId: subject.id,
        name: 'مجموعة الجبر',
        description: '',
        monthlyFee: '30.00',
        capacity: 25,
        status: 'inactive',
      });
      component.submitGroup();

      expect(learningMock.updateGroup).toHaveBeenCalledWith('workspace-learning', group.id, {
        subjectId: subject.id,
        name: 'مجموعة الجبر',
        description: '',
        monthlyFee: '30.00',
        capacity: 25,
        status: 'inactive',
      });
      expect(learningMock.createGroup).not.toHaveBeenCalled();
    });

    it('creates group enrollments with the active workspace and reports capacity conflicts', async () => {
      await configure(GroupsComponent, { groupId: group.id });
      const fixture = TestBed.createComponent(GroupsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.openEnrollmentForm();
      component.selectStudent(student);
      component.submitEnrollment();
      expect(learningMock.createEnrollment).toHaveBeenCalledWith(
        'workspace-learning',
        group.id,
        { studentId: student.id, status: 'active' },
      );

      learningMock.createEnrollment.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { message: 'Study group is at capacity' },
            }),
        ),
      );
      component.openEnrollmentForm();
      component.selectStudent(student);
      component.submitEnrollment();
      expect(component.error()).toContain('وصلت إلى السعة المحددة');
    });

    it('clears endedAt when reactivating a paused enrollment', async () => {
      await configure(GroupsComponent, { groupId: group.id });
      const fixture = TestBed.createComponent(GroupsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.changeEnrollmentStatus({ enrollment, student }, 'active');

      expect(learningMock.updateEnrollment).toHaveBeenCalledWith(
        'workspace-learning',
        enrollment.id,
        { status: 'active', endedAt: null },
      );
    });
  });

  describe('Sessions workflows', () => {
    const workspace: Workspace = {
      _id: 'workspace-sessions',
      name: 'مساحة الجلسات',
      slug: 'sessions',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const group: StudyGroup = {
      id: 'group-sessions-1',
      subjectId: 'subject-sessions-1',
      name: 'مجموعة الرياضيات',
      description: '',
      monthlyFee: '20.00',
      capacity: null,
      status: 'inactive',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const session: Session = {
      id: 'session-1',
      groupId: group.id,
      title: 'مراجعة',
      startsAt: '2026-01-10T08:00:00.000Z',
      endsAt: '2026-01-10T09:00:00.000Z',
      status: 'scheduled',
      notes: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const pageResult = <T>(
      items: T[],
      totalItems = items.length,
      page = 1,
    ): PageResult<T> => ({
      items,
      pagination: {
        page,
        pageSize: 20,
        totalItems,
        totalPages: totalItems ? Math.ceil(totalItems / 20) : 0,
      },
    });
    const learningMock = {
      listGroups: vi.fn<LearningService['listGroups']>(),
      getGroup: vi.fn<LearningService['getGroup']>(),
      listSessions: vi.fn<LearningService['listSessions']>(),
      getSession: vi.fn<LearningService['getSession']>(),
      createSession: vi.fn<LearningService['createSession']>(),
      updateSession: vi.fn<LearningService['updateSession']>(),
      listSessionAttendance: vi.fn<LearningService['listSessionAttendance']>(),
    };

    async function configure(routeParams: Record<string, string> = {}): Promise<void> {
      await TestBed.configureTestingModule({
        imports: [SessionsComponent],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: { paramMap: of(convertToParamMap(routeParams)) },
          },
          { provide: WorkspaceService, useValue: { getActiveWorkspace: () => of(workspace) } },
          { provide: LearningService, useValue: learningMock },
        ],
      }).compileComponents();
    }

    beforeEach(async () => {
      TestBed.resetTestingModule();
      learningMock.listGroups.mockReset().mockReturnValue(of(pageResult([group])));
      learningMock.getGroup.mockReset().mockReturnValue(of(group));
      learningMock.listSessions.mockReset().mockReturnValue(of(pageResult([session], 41)));
      learningMock.getSession.mockReset().mockReturnValue(of(session));
      learningMock.createSession.mockReset().mockReturnValue(of(session));
      learningMock.updateSession.mockReset().mockReturnValue(of(session));
      learningMock.listSessionAttendance.mockReset().mockReturnValue(of(pageResult([])));
      await Promise.resolve();
    });

    afterEach(() => {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    });

    it('uses the workspace-scoped sessions API contracts and credentials', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();
      const service = TestBed.inject(LearningService);
      const http = TestBed.inject(HttpTestingController);

      service
        .listSessions('workspace-sessions', {
          page: 2,
          pageSize: 20,
          groupId: group.id,
          from: '2026-01-10T00:00:00.000Z',
          to: '2026-01-10T23:59:59.999Z',
          status: 'completed',
        })
        .subscribe();
      const listRequest = http.expectOne(
        (request) => request.url.endsWith('/workspaces/workspace-sessions/sessions'),
      );
      expect(listRequest.request.method).toBe('GET');
      expect(listRequest.request.withCredentials).toBe(true);
      expect(listRequest.request.params.get('groupId')).toBe(group.id);
      expect(listRequest.request.params.get('from')).toBe('2026-01-10T00:00:00.000Z');
      expect(listRequest.request.params.get('to')).toBe('2026-01-10T23:59:59.999Z');
      expect(listRequest.request.params.get('status')).toBe('completed');
      expect(listRequest.request.params.get('page')).toBe('2');
      listRequest.flush({ message: 'Sessions retrieved', data: pageResult([]) });

      service
        .createSession('workspace-sessions', {
          groupId: group.id,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
        })
        .subscribe();
      const createRequest = http.expectOne(
        (request) =>
          request.method === 'POST' &&
          request.url.endsWith('/workspaces/workspace-sessions/sessions'),
      );
      expect(createRequest.request.withCredentials).toBe(true);
      expect(createRequest.request.body).toEqual({
        groupId: group.id,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      });
      createRequest.flush({ message: 'Session created', data: session });

      service.updateSession('workspace-sessions', session.id, { status: 'cancelled' }).subscribe();
      const updateRequest = http.expectOne(
        (request) =>
          request.method === 'PATCH' &&
          request.url.endsWith(`/workspaces/workspace-sessions/sessions/${session.id}`),
      );
      expect(updateRequest.request.withCredentials).toBe(true);
      expect(updateRequest.request.body).toEqual({ status: 'cancelled' });
      updateRequest.flush({ message: 'Session updated', data: { ...session, status: 'cancelled' } });
      http.verify();
    });

    it('treats /sessions/new as create mode and sends local times as UTC to the active workspace', async () => {
      await configure({ sessionId: 'new' });
      const fixture = TestBed.createComponent(SessionsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const start = new Date(2026, 0, 10, 10, 15, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const localStart = utcDateTimeToLocalInput(start.toISOString());
      const localEnd = utcDateTimeToLocalInput(end.toISOString());

      expect(component.isCreating()).toBe(true);
      expect(learningMock.getSession).not.toHaveBeenCalled();
      expect(localStart).not.toBeNull();
      expect(localEnd).not.toBeNull();
      component.selectFormGroup(group);
      component.sessionForm.patchValue({
        title: 'مراجعة الفصل',
        startsAt: localStart ?? '',
        endsAt: localEnd ?? '',
      });
      component.submitSession();

      expect(learningMock.createSession).toHaveBeenCalledWith('workspace-sessions', {
        groupId: group.id,
        title: 'مراجعة الفصل',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
      expect(learningMock.updateSession).not.toHaveBeenCalled();
    });

    it('rejects invalid and reversed local date-times without submitting', async () => {
      await configure({ sessionId: 'new' });
      const fixture = TestBed.createComponent(SessionsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(localDateTimeToIso('2026-02-31T10:00:00.000')).toBeNull();
      component.selectFormGroup(group);
      component.sessionForm.patchValue({
        startsAt: '2026-01-10T11:00:00.000',
        endsAt: '2026-01-10T10:00:00.000',
      });
      component.submitSession();

      expect(learningMock.createSession).not.toHaveBeenCalled();
      expect(component.error()).toContain('وقت النهاية بعد وقت البداية');
    });

    it('filters session pages by workspace, group, inclusive local dates, and status', async () => {
      await configure();
      const fixture = TestBed.createComponent(SessionsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.filters.setValue({
        groupId: group.id,
        from: '2026-01-10',
        to: '2026-01-10',
        status: 'completed',
      });
      component.applyFilters();

      expect(learningMock.listSessions).toHaveBeenLastCalledWith('workspace-sessions', {
        page: 1,
        pageSize: 20,
        groupId: group.id,
        from: localDateBoundaryToIso('2026-01-10'),
        to: localDateBoundaryToIso('2026-01-10', true),
        status: 'completed',
      });
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(group.name);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('مراجعة');

      component.changePage(2);
      expect(learningMock.listSessions).toHaveBeenLastCalledWith(
        'workspace-sessions',
        expect.objectContaining({ page: 2, groupId: group.id }),
      );
    });

    it('shows loading, empty, and list API error states', async () => {
      const response = new RxSubject<PageResult<Session>>();
      learningMock.listSessions.mockReturnValue(response);
      await configure();
      const loadingFixture = TestBed.createComponent(SessionsComponent);
      loadingFixture.detectChanges();
      expect((loadingFixture.nativeElement as HTMLElement).textContent).toContain(
        'جارٍ تحميل الجلسات',
      );

      response.next(pageResult([]));
      response.complete();
      loadingFixture.detectChanges();
      expect((loadingFixture.nativeElement as HTMLElement).textContent).toContain(
        'لا توجد جلسات مسجلة بعد',
      );

      TestBed.resetTestingModule();
      learningMock.listSessions.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
      );
      await configure();
      const failedFixture = TestBed.createComponent(SessionsComponent);
      failedFixture.detectChanges();
      expect((failedFixture.nativeElement as HTMLElement).textContent).toContain(
        'تعذر تحميل قائمة الجلسات',
      );
    });

    it('shows details with the related group and surfaces detail API failures', async () => {
      await configure({ sessionId: session.id });
      const fixture = TestBed.createComponent(SessionsComponent);
      fixture.detectChanges();

      expect(learningMock.getSession).toHaveBeenCalledWith('workspace-sessions', session.id);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(group.name);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('مجدولة');
      expect(learningMock.listSessionAttendance).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector(`a[href="/attendance/sessions/${session.id}"]`)).toBeTruthy();

      TestBed.resetTestingModule();
      learningMock.getSession.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
      );
      await configure({ sessionId: session.id });
      const failedFixture = TestBed.createComponent(SessionsComponent);
      failedFixture.detectChanges();

      expect((failedFixture.nativeElement as HTMLElement).textContent).toContain(
        'تعذر تحميل بيانات الجلسة',
      );
      expect((failedFixture.nativeElement as HTMLElement).textContent).toContain(
        'تعذر العثور على الجلسة',
      );
    });

    it('patches only changed supported fields and does not optimistically change status on error', async () => {
      await configure({ sessionId: session.id });
      const fixture = TestBed.createComponent(SessionsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.beginEdit();
      component.sessionForm.controls.title.setValue('عنوان جديد');
      component.sessionForm.controls.title.markAsDirty();
      component.sessionForm.controls.status.setValue('completed');
      component.sessionForm.controls.status.markAsDirty();
      component.submitSession();

      expect(learningMock.updateSession).toHaveBeenCalledWith(
        'workspace-sessions',
        session.id,
        { title: 'عنوان جديد', status: 'completed' },
      );
      expect(component.session()?.status).toBe('scheduled');
      expect(component.statuses.map((item) => item.value)).toEqual([
        'scheduled',
        'completed',
        'cancelled',
      ]);

      learningMock.updateSession.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { message: 'An attended session cannot be moved into the future' },
            }),
        ),
      );
      component.beginEdit();
      component.sessionForm.controls.startsAt.setValue('2026-01-10T12:00:00.000');
      component.sessionForm.controls.startsAt.markAsDirty();
      component.sessionForm.controls.endsAt.setValue('2026-01-10T13:00:00.000');
      component.sessionForm.controls.endsAt.markAsDirty();
      component.submitSession();
      expect(component.session()?.status).toBe('scheduled');
      expect(component.error()).toContain('لا يمكن نقل بداية جلسة');
    });

    it('keeps date range conversion in browser-local time and preserves DST gaps as invalid', () => {
      const localStart = new Date(2026, 2, 8, 0, 0, 0, 0);
      expect(localDateBoundaryToIso('2026-03-08')).toBe(localStart.toISOString());
      expect(localDateTimeToIso('2026-03-08T02:30:00.000')).toBe(
        (() => {
          const date = new Date(2026, 2, 8, 2, 30, 0, 0);
          const sameLocalTime =
            date.getFullYear() === 2026 &&
            date.getMonth() === 2 &&
            date.getDate() === 8 &&
            date.getHours() === 2 &&
            date.getMinutes() === 30;
          return sameLocalTime ? date.toISOString() : null;
        })(),
      );
    });

    describe('Attendance workflows', () => {
      const workspace: Workspace = {
        _id: 'workspace-attendance',
        name: 'مساحة الحضور',
        slug: 'attendance',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const group: StudyGroup = {
        id: 'group-attendance-1',
        subjectId: 'subject-attendance-1',
        name: 'مجموعة العلوم',
        description: '',
        monthlyFee: '30.00',
        capacity: null,
        status: 'inactive',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      };
      const startsAt = new Date(Date.now() - 3_600_000).toISOString();
      const session: Session = {
        id: 'session-attendance-1',
        groupId: group.id,
        title: 'مراجعة العلوم',
        startsAt,
        endsAt: new Date(Date.now() - 1_800_000).toISOString(),
        status: 'completed',
        notes: '',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      };
      const student: Student = {
        id: 'student-attendance-1',
        name: 'سارة أحمد',
        phone: null,
        email: null,
        schoolName: '',
        grade: '',
        status: 'inactive',
        notes: '',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      };
      const enrollment: Enrollment = {
        id: 'enrollment-attendance-1',
        studentId: student.id,
        groupId: group.id,
        enrolledAt: new Date(Date.parse(startsAt) - 86_400_000).toISOString(),
        endedAt: null,
        status: 'active',
        notes: '',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      };
      const record: AttendanceRecord = {
        id: 'attendance-record-1',
        sessionId: session.id,
        studentId: student.id,
        status: 'present',
        lateMinutes: 0,
        notes: '',
        recordedAt: new Date(Date.parse(startsAt) + 60_000).toISOString(),
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      };
      const pageResult = <T>(items: T[], totalItems = items.length, page = 1): PageResult<T> => ({
        items,
        pagination: {
          page,
          pageSize: 20,
          totalItems,
          totalPages: totalItems ? Math.ceil(totalItems / 20) : 0,
        },
      });
      const learningMock = {
        listSessions: vi.fn<LearningService['listSessions']>(),
        getSession: vi.fn<LearningService['getSession']>(),
        getGroup: vi.fn<LearningService['getGroup']>(),
        listGroupEnrollments: vi.fn<LearningService['listGroupEnrollments']>(),
        listSessionAttendance: vi.fn<LearningService['listSessionAttendance']>(),
        createAttendanceRecord: vi.fn<LearningService['createAttendanceRecord']>(),
        updateAttendanceRecord: vi.fn<LearningService['updateAttendanceRecord']>(),
        listStudentAttendance: vi.fn<LearningService['listStudentAttendance']>(),
      };
      const peopleMock = {
        getStudent: vi.fn<PeopleService['getStudent']>(),
      };

      async function configure(routeParams: Record<string, string> = {}): Promise<void> {
        await TestBed.configureTestingModule({
          imports: [AttendanceComponent],
          providers: [
            provideRouter([]),
            {
              provide: ActivatedRoute,
              useValue: { paramMap: of(convertToParamMap(routeParams)) },
            },
            { provide: WorkspaceService, useValue: { getActiveWorkspace: () => of(workspace) } },
            { provide: LearningService, useValue: learningMock },
            { provide: PeopleService, useValue: peopleMock },
          ],
        }).compileComponents();
      }

      beforeEach(async () => {
        TestBed.resetTestingModule();
        learningMock.listSessions.mockReset().mockReturnValue(of(pageResult([session], 41)));
        learningMock.getSession.mockReset().mockReturnValue(of(session));
        learningMock.getGroup.mockReset().mockReturnValue(of(group));
        learningMock.listGroupEnrollments
          .mockReset()
          .mockReturnValue(of(pageResult([enrollment])));
        learningMock.listSessionAttendance
          .mockReset()
          .mockReturnValue(of(pageResult([record])));
        learningMock.createAttendanceRecord.mockReset().mockReturnValue(of(record));
        learningMock.updateAttendanceRecord.mockReset().mockReturnValue(of(record));
        learningMock.listStudentAttendance.mockReset().mockReturnValue(of(pageResult([record], 41)));
        peopleMock.getStudent.mockReset().mockReturnValue(of(student));
        await Promise.resolve();
      });

      afterEach(() => {
        TestBed.resetTestingModule();
        vi.restoreAllMocks();
      });

      it('uses the workspace-scoped attendance contracts, query parameters, and credentials', async () => {
        TestBed.resetTestingModule();
        await TestBed.configureTestingModule({
          providers: [provideHttpClient(), provideHttpClientTesting()],
        }).compileComponents();
        const service = TestBed.inject(LearningService);
        const http = TestBed.inject(HttpTestingController);

        service
          .listSessionAttendance(workspace._id, session.id, {
            page: 2,
            pageSize: 20,
            status: 'late',
          })
          .subscribe();
        const listRequest = http.expectOne(
          (request) =>
            request.url.endsWith(`/workspaces/${workspace._id}/sessions/${session.id}/attendance`),
        );
        expect(listRequest.request.method).toBe('GET');
        expect(listRequest.request.withCredentials).toBe(true);
        expect(listRequest.request.params.get('page')).toBe('2');
        expect(listRequest.request.params.get('pageSize')).toBe('20');
        expect(listRequest.request.params.get('status')).toBe('late');
        listRequest.flush({ message: 'Session attendance retrieved', data: pageResult([]) });

        service
          .createAttendanceRecord(workspace._id, session.id, {
            studentId: student.id,
            status: 'late',
            lateMinutes: 7.5,
            notes: 'تأخر بسبب المواصلات',
          })
          .subscribe();
        const createRequest = http.expectOne(
          (request) =>
            request.method === 'POST' &&
            request.url.endsWith(`/workspaces/${workspace._id}/sessions/${session.id}/attendance`),
        );
        expect(createRequest.request.withCredentials).toBe(true);
        expect(createRequest.request.body).toEqual({
          studentId: student.id,
          status: 'late',
          lateMinutes: 7.5,
          notes: 'تأخر بسبب المواصلات',
        });
        createRequest.flush({ message: 'Attendance recorded', data: record });

        service
          .updateAttendanceRecord(workspace._id, session.id, record.id, { status: 'excused' })
          .subscribe();
        const updateRequest = http.expectOne(
          (request) =>
            request.method === 'PATCH' &&
            request.url.endsWith(
              `/workspaces/${workspace._id}/sessions/${session.id}/attendance/${record.id}`,
            ),
        );
        expect(updateRequest.request.withCredentials).toBe(true);
        expect(updateRequest.request.body).toEqual({ status: 'excused' });
        updateRequest.flush({ message: 'Attendance updated', data: { ...record, status: 'excused' } });

        service
          .listStudentAttendance(workspace._id, student.id, {
            page: 1,
            pageSize: 20,
            status: 'absent',
            from: '2026-03-10T00:00:00.000Z',
            to: '2026-03-10T23:59:59.999Z',
          })
          .subscribe();
        const historyRequest = http.expectOne(
          (request) =>
            request.url.endsWith(`/workspaces/${workspace._id}/students/${student.id}/attendance`),
        );
        expect(historyRequest.request.withCredentials).toBe(true);
        expect(historyRequest.request.params.get('status')).toBe('absent');
        expect(historyRequest.request.params.get('from')).toBe('2026-03-10T00:00:00.000Z');
        expect(historyRequest.request.params.get('to')).toBe('2026-03-10T23:59:59.999Z');
        historyRequest.flush({ message: 'Student attendance retrieved', data: pageResult([]) });
        http.verify();
      });

      it('loads session records and only active, date-eligible group enrollments for the active workspace', async () => {
        await configure({ sessionId: session.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();

        expect(learningMock.getSession).toHaveBeenCalledWith(workspace._id, session.id);
        expect(learningMock.listSessionAttendance).toHaveBeenCalledWith(workspace._id, session.id, {
          page: 1,
          pageSize: 20,
        });
        expect(learningMock.listGroupEnrollments).toHaveBeenCalledWith(workspace._id, group.id, {
          page: 1,
          pageSize: 20,
          status: 'active',
        });
        expect(peopleMock.getStudent).toHaveBeenCalledWith(workspace._id, student.id);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(student.name);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(group.name);
        expect(fixture.nativeElement.querySelector(`a[href="/attendance/students/${student.id}"]`)).toBeTruthy();
        expect(learningMock.createAttendanceRecord).not.toHaveBeenCalled();
      });

      it('creates only fields supported by the API and omits blank optional values', async () => {
        learningMock.listSessionAttendance
          .mockReturnValueOnce(of(pageResult([])))
          .mockReturnValue(of(pageResult([record])));
        await configure({ sessionId: session.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;

        component.openCreateForm();
        expect(component.availableStudents()[0].student.status).toBe('inactive');
        component.recordForm.patchValue({
          studentId: student.id,
          status: 'present',
          notes: '   ',
          lateMinutes: -3,
        });
        component.submitAttendance();

        expect(learningMock.createAttendanceRecord).toHaveBeenCalledWith(workspace._id, session.id, {
          studentId: student.id,
          status: 'present',
        });
        expect(component.recording()).toBe(false);
        expect(learningMock.listSessionAttendance).toHaveBeenCalledTimes(2);
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(student.name);
      });

      it('prevents selecting a student already present in the loaded attendance page', async () => {
        await configure({ sessionId: session.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;

        component.openCreateForm();

        expect(component.availableStudents()).toEqual([]);
        expect(component.recordForm.controls.studentId.value).toBe('');
        expect(learningMock.createAttendanceRecord).not.toHaveBeenCalled();
      });

      it('shows backend duplicate errors without inventing a successful result', async () => {
        learningMock.listSessionAttendance.mockReturnValue(of(pageResult([])));
        learningMock.createAttendanceRecord.mockReturnValue(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 409,
                error: { message: 'A record with these values already exists' },
              }),
          ),
        );
        await configure({ sessionId: session.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;

        component.openCreateForm();
        component.recordForm.controls.studentId.setValue(student.id);
        component.submitAttendance();

        expect(component.error()).toContain('A record with these values already exists');
        expect(component.success()).toBe('');
        expect(component.attendanceRows()).toEqual([]);
      });

      it('filters and paginates the session overview using supported session API fields', async () => {
        await configure();
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;

        component.filters.setValue({
          from: '2026-03-10',
          to: '2026-03-11',
          status: 'completed',
        });
        component.applySessionFilters();
        expect(learningMock.listSessions).toHaveBeenLastCalledWith(workspace._id, {
          page: 1,
          pageSize: 20,
          from: localDateBoundaryToIso('2026-03-10'),
          to: localDateBoundaryToIso('2026-03-11', true),
          status: 'completed',
        });
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(group.name);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(session.title);
        component.changeSessionPage(2);
        expect(learningMock.listSessions).toHaveBeenLastCalledWith(
          workspace._id,
          expect.objectContaining({ page: 2, status: 'completed' }),
        );
      });

      it('blocks new records for cancelled or future sessions but allows correcting a started cancelled session', async () => {
        learningMock.getSession.mockReturnValue(of({ ...session, status: 'cancelled' }));
        const updateResponse = new RxSubject<AttendanceRecord>();
        learningMock.updateAttendanceRecord.mockReturnValue(updateResponse);
        await configure({ sessionId: session.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        const row = component.attendanceRows()[0];

        expect(component.canRecordNewAttendance()).toBe(false);
        component.openCreateForm();
        expect(learningMock.createAttendanceRecord).not.toHaveBeenCalled();
        component.beginEdit(row);
        expect(component.editingAttendanceId()).toBe(record.id);
        component.editForm.controls.status.setValue('excused');
        component.editForm.controls.status.markAsDirty();
        component.saveEdit(row);
        expect(learningMock.updateAttendanceRecord).toHaveBeenCalledWith(
          workspace._id,
          session.id,
          record.id,
          { status: 'excused' },
        );
        expect(component.attendanceRows()[0].record.status).toBe('present');
        updateResponse.next({ ...record, status: 'excused' });
        updateResponse.complete();
        expect(component.attendanceRows()[0].record.status).toBe('excused');

        TestBed.resetTestingModule();
        learningMock.getSession.mockReturnValue(
          of({
            ...session,
            startsAt: new Date(Date.now() + 3_600_000).toISOString(),
            status: 'scheduled',
          }),
        );
        await configure({ sessionId: session.id });
        const futureFixture = TestBed.createComponent(AttendanceComponent);
        futureFixture.detectChanges();
        const futureComponent = futureFixture.componentInstance;
        expect(futureComponent.canRecordNewAttendance()).toBe(false);
        futureComponent.submitAttendance();
        expect(learningMock.createAttendanceRecord).not.toHaveBeenCalled();
      });

      it('filters paginated student history by recordedAt and loads linked session and group details', async () => {
        await configure({ studentId: student.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;

        component.historyFilters.setValue({
          from: '2026-03-10',
          to: '2026-03-11',
          status: 'late',
        });
        component.applyHistoryFilters();
        expect(learningMock.listStudentAttendance).toHaveBeenLastCalledWith(
          workspace._id,
          student.id,
          {
            page: 1,
            pageSize: 20,
            from: localDateBoundaryToIso('2026-03-10'),
            to: localDateBoundaryToIso('2026-03-11', true),
            status: 'late',
          },
        );
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('وقت التسجيل');
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(session.title);
        component.changeHistoryPage(2);
        expect(learningMock.listStudentAttendance).toHaveBeenLastCalledWith(
          workspace._id,
          student.id,
          expect.objectContaining({ page: 2, status: 'late' }),
        );
      });

      it('shows loading, empty, and API error states for session attendance', async () => {
        const response = new RxSubject<PageResult<AttendanceRecord>>();
        learningMock.listSessionAttendance.mockReturnValue(response);
        await configure({ sessionId: session.id });
        const fixture = TestBed.createComponent(AttendanceComponent);
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(
          'جارٍ تحميل سجلات الحضور',
        );

        response.next(pageResult([]));
        response.complete();
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(
          'لا توجد سجلات حضور مطابقة',
        );

        TestBed.resetTestingModule();
        learningMock.listSessionAttendance.mockReturnValue(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 500,
                error: { message: 'Attendance service unavailable' },
              }),
          ),
        );
        await configure({ sessionId: session.id });
        const failedFixture = TestBed.createComponent(AttendanceComponent);
        failedFixture.detectChanges();
        expect((failedFixture.nativeElement as HTMLElement).textContent).toContain(
          'تعذر تحميل سجلات الجلسة',
        );
        expect((failedFixture.nativeElement as HTMLElement).textContent).toContain(
          'Attendance service unavailable',
        );
      });
    });
  });

  describe('Finance workflows', () => {
    const workspace: Workspace = {
      _id: 'workspace-finance',
      name: 'مساحة المالية',
      slug: 'finance',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const student: Student = {
      id: 'student-finance',
      name: 'مريم علي',
      phone: '+201000000000',
      email: null,
      schoolName: '',
      grade: '',
      status: 'active',
      notes: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const group: StudyGroup = {
      id: 'group-finance',
      subjectId: 'subject-finance',
      name: 'مجموعة الرياضيات',
      description: '',
      monthlyFee: '125.50',
      capacity: null,
      status: 'active',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const enrollment: Enrollment = {
      id: 'enrollment-finance',
      studentId: student.id,
      groupId: group.id,
      enrolledAt: '2026-01-01T10:00:00.000Z',
      endedAt: null,
      status: 'active',
      notes: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    const invoice: Invoice = {
      id: 'invoice-finance',
      invoiceNumber: 'INV-00001',
      studentId: student.id,
      enrollmentId: enrollment.id,
      groupId: group.id,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      totalAmount: '125.50',
      dueDate: null,
      issuedAt: null,
      status: 'draft',
      paymentStatus: null,
      allocatedAmount: '0',
      outstandingAmount: '0',
      description: '',
      notes: '',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    };
    const payment: Payment = {
      id: 'payment-finance',
      studentId: student.id,
      amount: '100.00',
      method: 'cash',
      status: 'completed',
      receivedAt: '2026-03-10T10:00:00.000Z',
      reference: null,
      notes: '',
      allocatedAmount: '50.00',
      unallocatedAmount: '50.00',
      allocations: [],
      createdAt: '2026-03-10T10:00:00.000Z',
      updatedAt: '2026-03-10T10:00:00.000Z',
    };
    const pageResult = <T>(items: T[], totalItems = items.length, page = 1): PageResult<T> => ({
      items,
      pagination: {
        page,
        pageSize: 20,
        totalItems,
        totalPages: totalItems ? Math.ceil(totalItems / 20) : 0,
      },
    });

    const financeMock = {
      listInvoices: vi.fn<FinanceService['listInvoices']>(),
      getInvoice: vi.fn<FinanceService['getInvoice']>(),
      createInvoice: vi.fn<FinanceService['createInvoice']>(),
      updateInvoice: vi.fn<FinanceService['updateInvoice']>(),
      issueInvoice: vi.fn<FinanceService['issueInvoice']>(),
      voidInvoice: vi.fn<FinanceService['voidInvoice']>(),
      listInvoiceAllocations: vi.fn<FinanceService['listInvoiceAllocations']>(),
      listPayments: vi.fn<FinanceService['listPayments']>(),
      getPayment: vi.fn<FinanceService['getPayment']>(),
      createPayment: vi.fn<FinanceService['createPayment']>(),
      listPaymentAllocations: vi.fn<FinanceService['listPaymentAllocations']>(),
      createPaymentAllocation: vi.fn<FinanceService['createPaymentAllocation']>(),
    };
    const peopleMock = {
      listStudents: vi.fn<PeopleService['listStudents']>(),
      getStudent: vi.fn<PeopleService['getStudent']>(),
    };
    const learningMock = {
      listEnrollments: vi.fn<LearningService['listEnrollments']>(),
      getEnrollment: vi.fn<LearningService['getEnrollment']>(),
      getGroup: vi.fn<LearningService['getGroup']>(),
    };

    async function configure(
      routePath: string,
      params: Record<string, string> = {},
      query: Record<string, string> = {},
      paramMap$: Observable<ParamMap> = of(convertToParamMap(params)),
    ): Promise<void> {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [InvoicesComponent, PaymentsComponent],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                routeConfig: { path: routePath },
                paramMap: convertToParamMap(params),
                queryParamMap: convertToParamMap(query),
              },
              paramMap: paramMap$,
              queryParamMap: of(convertToParamMap(query)),
            },
          },
          { provide: WorkspaceService, useValue: { getActiveWorkspace: () => of(workspace) } },
          { provide: FinanceService, useValue: financeMock },
          { provide: PeopleService, useValue: peopleMock },
          { provide: LearningService, useValue: learningMock },
        ],
      }).compileComponents();
    }

    beforeEach(async () => {
      TestBed.resetTestingModule();
      financeMock.listInvoices.mockReset().mockReturnValue(of(pageResult([invoice])));
      financeMock.getInvoice.mockReset().mockReturnValue(of(invoice));
      financeMock.createInvoice.mockReset().mockReturnValue(of(invoice));
      financeMock.updateInvoice.mockReset().mockReturnValue(of(invoice));
      financeMock.issueInvoice.mockReset().mockReturnValue(of({ ...invoice, status: 'issued', paymentStatus: 'unpaid', issuedAt: '2026-03-01T10:00:00.000Z' }));
      financeMock.voidInvoice.mockReset().mockReturnValue(of({ ...invoice, status: 'void' }));
      financeMock.listInvoiceAllocations.mockReset().mockReturnValue(of([]));
      financeMock.listPayments.mockReset().mockReturnValue(of(pageResult([payment])));
      financeMock.getPayment.mockReset().mockReturnValue(of(payment));
      financeMock.createPayment.mockReset().mockReturnValue(of(payment));
      financeMock.listPaymentAllocations.mockReset().mockReturnValue(of([]));
      financeMock.createPaymentAllocation.mockReset().mockReturnValue(of({
        id: 'allocation-finance',
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: '50.00',
        createdAt: '2026-03-10T11:00:00.000Z',
        updatedAt: '2026-03-10T11:00:00.000Z',
      } satisfies PaymentAllocation));
      peopleMock.listStudents.mockReset().mockReturnValue(of(pageResult([student])));
      peopleMock.getStudent.mockReset().mockReturnValue(of(student));
      learningMock.listEnrollments.mockReset().mockReturnValue(of(pageResult([enrollment])));
      learningMock.getEnrollment.mockReset().mockReturnValue(of(enrollment));
      learningMock.getGroup.mockReset().mockReturnValue(of(group));
      await Promise.resolve();
    });

    afterEach(() => TestBed.resetTestingModule());

    it('sends workspace-scoped finance contracts and preserves decimal strings exactly', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const service = TestBed.inject(FinanceService);
      const http = TestBed.inject(HttpTestingController);
      const exactAmount = '12345678901234567890123456789012.34';

      service.listInvoices('workspace-finance', {
        page: 2,
        pageSize: 20,
        studentId: student.id,
        status: 'issued',
        from: '2026-03-01',
        to: '2026-03-31',
      }).subscribe();
      const invoiceList = http.expectOne((request) =>
        request.url.endsWith('/workspaces/workspace-finance/invoices'),
      );
      expect(invoiceList.request.method).toBe('GET');
      expect(invoiceList.request.withCredentials).toBe(true);
      expect(invoiceList.request.params.get('page')).toBe('2');
      expect(invoiceList.request.params.get('pageSize')).toBe('20');
      expect(invoiceList.request.params.get('studentId')).toBe(student.id);
      expect(invoiceList.request.params.get('status')).toBe('issued');
      expect(invoiceList.request.params.get('from')).toBe('2026-03-01');
      invoiceList.flush({ message: 'Invoices listed', data: pageResult([]) });

      service.createPayment('workspace-finance', {
        studentId: student.id,
        amount: exactAmount,
        method: 'bank_transfer',
      }).subscribe();
      const paymentRequest = http.expectOne((request) =>
        request.url.endsWith('/workspaces/workspace-finance/payments'),
      );
      expect(paymentRequest.request.method).toBe('POST');
      expect(paymentRequest.request.withCredentials).toBe(true);
      expect(paymentRequest.request.body).toEqual({
        studentId: student.id,
        amount: exactAmount,
        method: 'bank_transfer',
      });
      paymentRequest.flush({ message: 'Payment created', data: payment });

      service.createPaymentAllocation('workspace-finance', payment.id, {
        invoiceId: invoice.id,
        amount: '25.50',
      }).subscribe();
      const allocationRequest = http.expectOne(
        `/api/workspaces/workspace-finance/payments/${payment.id}/allocations`,
      );
      expect(allocationRequest.request.method).toBe('POST');
      expect(allocationRequest.request.body).toEqual({ invoiceId: invoice.id, amount: '25.50' });
      allocationRequest.flush({ message: 'Allocation created', data: {
        id: 'allocation-finance',
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: '25.50',
        createdAt: payment.receivedAt,
        updatedAt: payment.receivedAt,
      } });
      http.verify();
    });

    it('does not coerce long monetary decimal strings to binary floating point', () => {
      const exactAmount = '12345678901234567890123456789012.34';
      expect(formatMoneyExact(exactAmount)).toBe(exactAmount);
      expect(formatMoneyExact(null)).toBe('0');
    });

    it('creates a draft only after selecting the current workspace student and active enrollment', async () => {
      await configure('invoices/new');
      const fixture = TestBed.createComponent(InvoicesComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      component.submitInvoice();
      expect(component.invoiceForm.controls.studentId.touched).toBe(true);
      expect(financeMock.createInvoice).not.toHaveBeenCalled();

      component.selectStudent(student);
      expect(learningMock.listEnrollments).toHaveBeenCalledWith(workspace._id, {
        page: 1,
        pageSize: 20,
        studentId: student.id,
        status: 'active',
      });
      component.selectEnrollment({ enrollment, group });
      component.invoiceForm.patchValue({
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
      });
      component.submitInvoice();

      expect(financeMock.createInvoice).toHaveBeenCalledWith(workspace._id, {
        studentId: student.id,
        enrollmentId: enrollment.id,
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
      });
      expect(financeMock.getInvoice).not.toHaveBeenCalledWith(workspace._id, 'new');
      expect(navigate).toHaveBeenCalledWith(`/invoices/${invoice.id}`);
    });

    it('uses only supported invoice filters and exposes issue and void only after server responses', async () => {
      const issuedInvoice: Invoice = {
        ...invoice,
        status: 'issued',
        paymentStatus: 'unpaid',
        issuedAt: '2026-03-01T10:00:00.000Z',
      };
      financeMock.listInvoices.mockReturnValue(of(pageResult([issuedInvoice])));
      await configure('invoices', {}, { status: 'issued' });
      const listFixture = TestBed.createComponent(InvoicesComponent);
      listFixture.detectChanges();
      expect(financeMock.listInvoices).toHaveBeenCalledWith(workspace._id, {
        page: 1,
        pageSize: 20,
        status: 'issued',
      });
      expect((listFixture.nativeElement as HTMLElement).textContent).toContain(student.name);

      TestBed.resetTestingModule();
      financeMock.getInvoice.mockReturnValue(of(invoice));
      await configure('invoices/:invoiceId', { invoiceId: invoice.id });
      const fixture = TestBed.createComponent(InvoicesComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.issue();
      expect(confirmation).toHaveBeenCalled();
      expect(financeMock.issueInvoice).toHaveBeenCalledWith(workspace._id, invoice.id);
      expect(component.invoice()?.status).toBe('issued');
      component.cancelInvoice();
      expect(financeMock.voidInvoice).toHaveBeenCalledWith(workspace._id, invoice.id);
      expect(component.invoice()?.status).toBe('void');
    });

    it('loads the invoice identified by the route and updates it when the reused route ID changes', async () => {
      const invoiceA = { ...invoice, id: 'invoice-a', invoiceNumber: 'INV-A' };
      const invoiceB = { ...invoice, id: 'invoice-b', invoiceNumber: 'INV-B' };
      const responseA = new RxSubject<Invoice>();
      const responseB = new RxSubject<Invoice>();
      const routeParams = new RxSubject<ParamMap>();
      financeMock.getInvoice.mockReturnValueOnce(responseA).mockReturnValueOnce(responseB);
      await configure('invoices/:invoiceId', { invoiceId: invoiceA.id }, {}, routeParams);
      const fixture = TestBed.createComponent(InvoicesComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(financeMock.getInvoice).toHaveBeenNthCalledWith(1, workspace._id, invoiceA.id);
      expect(component.detailsLoading()).toBe(true);

      routeParams.next(convertToParamMap({ invoiceId: invoiceB.id }));
      fixture.detectChanges();
      expect(financeMock.getInvoice).toHaveBeenNthCalledWith(2, workspace._id, invoiceB.id);
      expect(component.invoice()).toBeNull();
      expect(component.detailsLoading()).toBe(true);

      responseB.next(invoiceB);
      fixture.detectChanges();
      expect(component.invoice()?.id).toBe(invoiceB.id);
      responseA.next(invoiceA);
      fixture.detectChanges();
      expect(component.invoice()?.id).toBe(invoiceB.id);
    });

    it('clears invoice loading state and reports an error for the latest route request', async () => {
      const routeParams = new RxSubject<ParamMap>();
      financeMock.getInvoice
        .mockReturnValueOnce(of(invoice))
        .mockReturnValueOnce(
          throwError(() => new HttpErrorResponse({
            status: 404,
            error: { message: 'Invoice not found' },
          })),
        );
      await configure('invoices/:invoiceId', { invoiceId: invoice.id }, {}, routeParams);
      const fixture = TestBed.createComponent(InvoicesComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.invoice()?.id).toBe(invoice.id);

      routeParams.next(convertToParamMap({ invoiceId: 'missing-invoice' }));
      fixture.detectChanges();
      expect(component.invoice()).toBeNull();
      expect(component.detailsLoading()).toBe(false);
      expect(component.detailError()).toContain('Invoice not found');
    });

    it('updates draft invoices only with fields allowed by the API', async () => {
      await configure('invoices/:invoiceId', { invoiceId: invoice.id });
      const fixture = TestBed.createComponent(InvoicesComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.beginEdit();
      component.invoiceForm.controls.periodEnd.setValue('2026-04-01');
      component.submitInvoice();

      expect(financeMock.updateInvoice).toHaveBeenCalledWith(workspace._id, invoice.id, {
        periodEnd: '2026-04-01',
      });
    });

    it('rejects invalid payment precision and submits the exact decimal string without a client status', async () => {
      await configure('payments/new');
      const fixture = TestBed.createComponent(PaymentsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      component.selectStudent(student);
      component.paymentForm.patchValue({ amount: '12.345', method: 'cash' });
      component.submitPayment();
      expect(financeMock.createPayment).not.toHaveBeenCalled();

      const exactAmount = '12345678901234567890123456789012.34';
      expect(isPositiveDecimalString(exactAmount)).toBe(true);
      component.paymentForm.patchValue({ amount: exactAmount, method: 'bank_transfer' });
      component.submitPayment();
      expect(financeMock.createPayment).toHaveBeenCalledWith(workspace._id, {
        studentId: student.id,
        amount: exactAmount,
        method: 'bank_transfer',
      });
      expect(Object.keys(financeMock.createPayment.mock.calls[0][1])).not.toContain('status');
      expect(navigate).toHaveBeenCalledWith(`/payments/${payment.id}`);
    });

    it('keeps allocation errors explicit and does not change the displayed balance optimistically', async () => {
      const issuedInvoice: Invoice = {
        ...invoice,
        status: 'issued',
        paymentStatus: 'partially_paid',
        totalAmount: '100.00',
        allocatedAmount: '60.00',
        outstandingAmount: '40.00',
      };
      financeMock.listInvoices.mockReturnValue(of(pageResult([issuedInvoice])));
      financeMock.createPaymentAllocation.mockReturnValue(
        throwError(() => new HttpErrorResponse({
          status: 409,
          error: { message: 'Allocation exceeds the available payment balance' },
        })),
      );
      await configure('payments/:paymentId', { paymentId: payment.id });
      const fixture = TestBed.createComponent(PaymentsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(component.canAllocate()).toBe(true);
      component.openAllocation();
      expect(financeMock.listInvoices).toHaveBeenCalledWith(workspace._id, {
        page: 1,
        pageSize: 20,
        studentId: student.id,
        status: 'issued',
      });
      component.selectInvoice(issuedInvoice);
      component.allocationForm.patchValue({ amount: '60.00' });
      component.submitAllocation();

      expect(financeMock.createPaymentAllocation).toHaveBeenCalledWith(
        workspace._id,
        payment.id,
        { invoiceId: issuedInvoice.id, amount: '60.00' },
      );
      expect(component.error()).toContain('Allocation exceeds the available payment balance');
      expect(component.success()).toBe('');
      expect(component.payment()?.unallocatedAmount).toBe('50.00');
    });

    it('loads the payment identified by the route and updates it when the reused route ID changes', async () => {
      const paymentA = { ...payment, id: 'payment-a' };
      const paymentB = { ...payment, id: 'payment-b' };
      const responseA = new RxSubject<Payment>();
      const responseB = new RxSubject<Payment>();
      const routeParams = new RxSubject<ParamMap>();
      financeMock.getPayment.mockReturnValueOnce(responseA).mockReturnValueOnce(responseB);
      await configure('payments/:paymentId', { paymentId: paymentA.id }, {}, routeParams);
      const fixture = TestBed.createComponent(PaymentsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      expect(financeMock.getPayment).toHaveBeenNthCalledWith(1, workspace._id, paymentA.id);
      expect(component.detailsLoading()).toBe(true);

      routeParams.next(convertToParamMap({ paymentId: paymentB.id }));
      fixture.detectChanges();
      expect(financeMock.getPayment).toHaveBeenNthCalledWith(2, workspace._id, paymentB.id);
      expect(component.payment()).toBeNull();
      expect(component.detailsLoading()).toBe(true);

      responseB.next(paymentB);
      fixture.detectChanges();
      expect(component.payment()?.id).toBe(paymentB.id);
      responseA.next(paymentA);
      fixture.detectChanges();
      expect(component.payment()?.id).toBe(paymentB.id);
    });

    it('clears payment loading state and reports an error for the latest route request', async () => {
      const routeParams = new RxSubject<ParamMap>();
      financeMock.getPayment
        .mockReturnValueOnce(of(payment))
        .mockReturnValueOnce(
          throwError(() => new HttpErrorResponse({
            status: 404,
            error: { message: 'Payment not found' },
          })),
        );
      await configure('payments/:paymentId', { paymentId: payment.id }, {}, routeParams);
      const fixture = TestBed.createComponent(PaymentsComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.payment()?.id).toBe(payment.id);

      routeParams.next(convertToParamMap({ paymentId: 'missing-payment' }));
      fixture.detectChanges();
      expect(component.payment()).toBeNull();
      expect(component.detailsLoading()).toBe(false);
      expect(component.detailError()).toContain('Payment not found');
    });

    it('shows loading and empty states separately from failed list requests', async () => {
      const pendingInvoices = new RxSubject<PageResult<Invoice>>();
      financeMock.listInvoices.mockReturnValue(pendingInvoices);
      await configure('invoices');
      const invoiceFixture = TestBed.createComponent(InvoicesComponent);
      invoiceFixture.detectChanges();
      expect((invoiceFixture.nativeElement as HTMLElement).textContent).toContain(
        'جارٍ تحميل الفواتير',
      );
      pendingInvoices.next(pageResult([]));
      pendingInvoices.complete();
      invoiceFixture.detectChanges();
      expect((invoiceFixture.nativeElement as HTMLElement).textContent).toContain(
        'لا توجد فواتير حتى الآن',
      );

      TestBed.resetTestingModule();
      financeMock.listPayments.mockReturnValue(
        throwError(() => new HttpErrorResponse({
          status: 500,
          error: { message: 'Payment list unavailable' },
        })),
      );
      await configure('payments');
      const paymentFixture = TestBed.createComponent(PaymentsComponent);
      paymentFixture.detectChanges();
      expect((paymentFixture.nativeElement as HTMLElement).textContent).toContain(
        'Payment list unavailable',
      );
      expect((paymentFixture.nativeElement as HTMLElement).textContent).not.toContain(
        'لا توجد مدفوعات مسجلة بعد',
      );
    });
  });

  describe('Workspace onboarding', () => {
    const activeWorkspace: Workspace = {
      _id: 'workspace-1',
      name: 'مساحة تجريبية',
      slug: 'workspace',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const suspendedWorkspace: Workspace = {
      ...activeWorkspace,
      _id: 'workspace-suspended',
      status: 'suspended',
      ownerId: 'owner-1',
      suspensionType: 'owner',
    };
    const emptyState: WorkspaceAccessState = {
      workspaces: [],
      activeWorkspace: null,
      suspendedWorkspaces: [],
    };
    const stateWith = (workspaces: Workspace[]): WorkspaceAccessState => ({
      workspaces,
      activeWorkspace: workspaces.find((workspace) => workspace.status === 'active') ?? null,
      suspendedWorkspaces: workspaces.filter((workspace) => workspace.status === 'suspended'),
    });
    const workspaceServiceMock = {
      getWorkspaceAccessState: vi.fn<WorkspaceService['getWorkspaceAccessState']>(),
      createWorkspace: vi.fn<WorkspaceService['createWorkspace']>(),
      getWorkspace: vi.fn<WorkspaceService['getWorkspace']>(),
      activateWorkspaceAndRefresh: vi.fn<WorkspaceService['activateWorkspaceAndRefresh']>(),
    };
    const currentUser = signal<AuthUser | null>({
      id: 'teacher-1',
      name: 'Teacher',
      email: 'teacher@example.com',
      status: 'active',
      lastLoginAt: null,
    });
    const routerMock = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    beforeEach(async () => {
      TestBed.resetTestingModule();
      workspaceServiceMock.getWorkspaceAccessState.mockReset().mockReturnValue(of(emptyState));
      workspaceServiceMock.createWorkspace.mockReset();
      workspaceServiceMock.getWorkspace.mockReset();
      workspaceServiceMock.activateWorkspaceAndRefresh.mockReset();
      currentUser.set({
        id: 'teacher-1',
        name: 'Teacher',
        email: 'teacher@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      routerMock.navigateByUrl.mockReset().mockResolvedValue(true);
      await TestBed.configureTestingModule({
        imports: [WorkspaceOnboardingComponent],
        providers: [
          { provide: AuthService, useValue: { currentUser } },
          { provide: WorkspaceService, useValue: workspaceServiceMock },
          { provide: Router, useValue: routerMock },
        ],
      }).compileComponents();
    });

    it('sends an authenticated user with an active workspace to the dashboard', () => {
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(of(stateWith([activeWorkspace])));
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();

      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/dashboard');
      expect(fixture.nativeElement.textContent).toContain('توجد مساحة عمل نشطة');
    });

    it('shows the create form when the workspace list is empty', () => {
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('أنشئ مساحة العمل الأولى');
      expect(routerMock.navigateByUrl).not.toHaveBeenCalled();
    });

    it('validates a trimmed required name and does not send invalid data', () => {
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: '   ', description: 'وصف' });

      component.submit();

      expect(component.showNameError()).toContain('مطلوب');
      expect(workspaceServiceMock.createWorkspace).not.toHaveBeenCalled();
    });

    it('creates a workspace, refreshes the list, checks access, then navigates', () => {
      const createdWorkspace = { ...activeWorkspace, _id: 'workspace-created' };
      workspaceServiceMock.getWorkspaceAccessState
        .mockReturnValueOnce(of(emptyState))
        .mockReturnValueOnce(of(stateWith([createdWorkspace])));
      workspaceServiceMock.createWorkspace.mockReturnValue(of(createdWorkspace));
      workspaceServiceMock.getWorkspace.mockReturnValue(of(createdWorkspace));
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: '  أكاديمية النور  ', description: '  وصف  ' });

      component.submit();

      expect(workspaceServiceMock.createWorkspace).toHaveBeenCalledWith({
        name: 'أكاديمية النور',
        description: 'وصف',
      });
      expect(workspaceServiceMock.getWorkspaceAccessState).toHaveBeenCalledTimes(2);
      expect(workspaceServiceMock.getWorkspace).toHaveBeenCalledWith('workspace-created');
      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('keeps form values and displays server validation errors', () => {
      workspaceServiceMock.createWorkspace.mockReturnValue(
        throwError(() => new HttpErrorResponse({
          status: 422,
          error: { message: 'Workspace name is invalid' },
        })),
      );
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: 'أكاديمية النور', description: 'وصف محفوظ' });

      component.submit();

      expect(component.creationError()).toContain('Workspace name is invalid');
      expect(component.form.getRawValue()).toEqual({
        name: 'أكاديمية النور',
        description: 'وصف محفوظ',
      });
      expect(component.creationAccepted()).toBe(false);
    });

    it('keeps form values and displays a network error when workspace creation fails', () => {
      workspaceServiceMock.createWorkspace.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: 'أكاديمية النور', description: 'وصف محفوظ' });

      component.submit();

      expect(component.creationError()).toContain('تعذر الاتصال بالخادم');
      expect(component.form.getRawValue()).toEqual({
        name: 'أكاديمية النور',
        description: 'وصف محفوظ',
      });
    });

    it('keeps values and exposes a retry after a network failure loading workspaces', () => {
      workspaceServiceMock.getWorkspaceAccessState
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
        .mockReturnValueOnce(of(emptyState));
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: 'أكاديمية النور', description: 'وصف محفوظ' });

      expect(component.loadError()).toContain('تعذر الاتصال بالخادم');
      component.loadWorkspaces();

      expect(component.accessState()).toEqual(emptyState);
      expect(component.form.getRawValue()).toEqual({
        name: 'أكاديمية النور',
        description: 'وصف محفوظ',
      });
    });

    it('does not offer creation when only suspended workspaces are available', () => {
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(
        of(stateWith([suspendedWorkspace])),
      );
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('مساحة العمل معلّقة');
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
      expect(workspaceServiceMock.createWorkspace).not.toHaveBeenCalled();
    });

    it('offers activation only to the owner of an owner-suspended workspace', () => {
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(
        of(stateWith([suspendedWorkspace])),
      );
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('إعادة تفعيل المساحة');

      currentUser.set({
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      fixture.componentInstance.loadWorkspaces();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('إعادة تفعيل المساحة');

      const administrativelySuspended = {
        ...suspendedWorkspace,
        suspensionType: 'admin' as const,
      };
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(
        of(stateWith([administrativelySuspended])),
      );
      fixture.componentInstance.loadWorkspaces();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('إعادة تفعيل المساحة');
    });

    it('activates an owner-suspended workspace, refreshes membership, then opens the dashboard', () => {
      const activated = { ...suspendedWorkspace, status: 'active' as const, suspensionType: null };
      const refreshedState = stateWith([activated]);
      currentUser.set({
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(
        of(stateWith([suspendedWorkspace])),
      );
      workspaceServiceMock.activateWorkspaceAndRefresh.mockReturnValue(of(refreshedState));
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();

      fixture.componentInstance.activateWorkspace(suspendedWorkspace);

      expect(workspaceServiceMock.activateWorkspaceAndRefresh).toHaveBeenCalledWith(
        suspendedWorkspace._id,
      );
      expect(fixture.componentInstance.accessState()).toEqual(refreshedState);
      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('prevents duplicate owner activation requests while one is pending', () => {
      const pendingActivation = new RxSubject<WorkspaceAccessState>();
      currentUser.set({
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(
        of(stateWith([suspendedWorkspace])),
      );
      workspaceServiceMock.activateWorkspaceAndRefresh.mockReturnValue(pendingActivation);
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();

      fixture.componentInstance.activateWorkspace(suspendedWorkspace);
      fixture.componentInstance.activateWorkspace(suspendedWorkspace);

      expect(fixture.componentInstance.activationBusyId()).toBe(suspendedWorkspace._id);
      expect(workspaceServiceMock.activateWorkspaceAndRefresh).toHaveBeenCalledTimes(1);
      pendingActivation.complete();
    });

    it('does not activate for a non-owner and displays activation errors safely', () => {
      currentUser.set({
        id: 'teacher-1',
        name: 'Teacher',
        email: 'teacher@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(
        of(stateWith([suspendedWorkspace])),
      );
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      fixture.componentInstance.activateWorkspace(suspendedWorkspace);
      expect(workspaceServiceMock.activateWorkspaceAndRefresh).not.toHaveBeenCalled();

      currentUser.set({
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      workspaceServiceMock.activateWorkspaceAndRefresh.mockReturnValue(
        throwError(() => new HttpErrorResponse({
          status: 403,
          error: { message: 'Only the workspace owner can perform this action' },
        })),
      );
      fixture.componentInstance.activateWorkspace(suspendedWorkspace);

      expect(fixture.componentInstance.activationError()).toContain(
        'Only the workspace owner can perform this action',
      );
      expect(fixture.componentInstance.activationBusyId()).toBe('');
    });

    it('does not navigate or resubmit if the created workspace is missing from refreshed /mine', () => {
      const createdWorkspace = { ...activeWorkspace, _id: 'workspace-created' };
      workspaceServiceMock.getWorkspaceAccessState
        .mockReturnValueOnce(of(emptyState))
        .mockReturnValueOnce(of(emptyState));
      workspaceServiceMock.createWorkspace.mockReturnValue(of(createdWorkspace));
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: 'أكاديمية النور' });

      component.submit();
      component.submit();

      expect(component.verificationError()).toContain('لم تظهر كمساحة نشطة');
      expect(workspaceServiceMock.getWorkspace).not.toHaveBeenCalled();
      expect(workspaceServiceMock.createWorkspace).toHaveBeenCalledTimes(1);
      expect(routerMock.navigateByUrl).not.toHaveBeenCalled();
    });

    it('prevents duplicate create requests while the first request is pending', () => {
      const pendingRequest = new RxSubject<Workspace>();
      workspaceServiceMock.createWorkspace.mockReturnValue(pendingRequest);
      const fixture = TestBed.createComponent(WorkspaceOnboardingComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.form.patchValue({ name: 'أكاديمية النور' });

      component.submit();
      component.submit();

      expect(component.submitting()).toBe(true);
      expect(workspaceServiceMock.createWorkspace).toHaveBeenCalledTimes(1);
      pendingRequest.complete();
    });
  });

  describe('Workspace route guards', () => {
    const activeWorkspace: Workspace = {
      _id: 'workspace-guard',
      name: 'مساحة العمل',
      slug: 'workspace-guard',
      status: 'active',
      currency: 'EGP',
      description: '',
    };
    const authServiceMock = {
      getStatus: vi.fn(() => of({ user: { id: 'user-1' } })),
      clearCurrentUser: vi.fn(),
    };
    const workspaceServiceMock = {
      getWorkspaceAccessState: vi.fn<WorkspaceService['getWorkspaceAccessState']>(),
    };

    beforeEach(async () => {
      TestBed.resetTestingModule();
      authServiceMock.getStatus.mockReset().mockReturnValue(of({ user: { id: 'user-1' } }));
      workspaceServiceMock.getWorkspaceAccessState.mockReset().mockReturnValue(of({
        workspaces: [activeWorkspace],
        activeWorkspace,
        suspendedWorkspaces: [],
      }));
      await TestBed.configureTestingModule({
        imports: [DashboardRouteProbe, WorkspaceOnboardingRouteProbe],
        providers: [
          provideRouter([
            {
              path: 'dashboard',
              canActivate: [authGuard, workspaceGuard],
              component: DashboardRouteProbe,
            },
            {
              path: 'workspace/onboarding',
              canActivate: [authGuard],
              component: WorkspaceOnboardingRouteProbe,
            },
          ]),
          { provide: AuthService, useValue: authServiceMock },
          { provide: WorkspaceService, useValue: workspaceServiceMock },
        ],
      }).compileComponents();
    });

    it('keeps authenticated users with an active workspace on the dashboard', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/dashboard', DashboardRouteProbe);

      expect(authServiceMock.getStatus).toHaveBeenCalled();
      expect(workspaceServiceMock.getWorkspaceAccessState).toHaveBeenCalled();
    });

    it('redirects authenticated users without a workspace to onboarding', async () => {
      workspaceServiceMock.getWorkspaceAccessState.mockReturnValue(of({
        workspaces: [],
        activeWorkspace: null,
        suspendedWorkspaces: [],
      }));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/dashboard', WorkspaceOnboardingRouteProbe);

      expect(authServiceMock.getStatus).toHaveBeenCalled();
      expect(harness.routeNativeElement?.textContent).toContain('Workspace onboarding destination');
    });
  });

  describe('WorkspaceService API contracts', () => {
    const workspaceSelectionKey = 'darsly.active-workspace.teacher-1';

    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [WorkspaceSelectorComponent],
        providers: [provideHttpClient(), provideHttpClientTesting(), WorkspaceService],
      }).compileComponents();
      TestBed.inject(AuthService).currentUser.set({
        id: 'teacher-1',
        name: 'Teacher',
        email: 'teacher@example.com',
        status: 'active',
        lastLoginAt: null,
      });
      localStorage.removeItem(workspaceSelectionKey);
    });

    afterEach(() => {
      localStorage.removeItem(workspaceSelectionKey);
    });

    it('uses the existing mine, create, and details endpoints with credentials', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      let workspaces: Workspace[] = [];
      let created: Workspace | undefined;
      let details: Workspace | undefined;
      const apiWorkspace: Workspace = {
        _id: 'workspace-api',
        name: 'مساحة API',
        slug: 'workspace-api',
        status: 'active',
        currency: 'EGP',
        description: '',
      };

      service.getMyWorkspaces().subscribe((result) => (workspaces = result));
      const mineRequest = httpTesting.expectOne('/api/workspaces/mine');
      expect(mineRequest.request.method).toBe('GET');
      expect(mineRequest.request.withCredentials).toBe(true);
      mineRequest.flush({ message: 'ok', data: [apiWorkspace] });

      service.createWorkspace({ name: 'مساحة API' }).subscribe((result) => (created = result));
      const createRequest = httpTesting.expectOne('/api/workspaces');
      expect(createRequest.request.method).toBe('POST');
      expect(createRequest.request.body).toEqual({ name: 'مساحة API' });
      expect(createRequest.request.withCredentials).toBe(true);
      createRequest.flush({ message: 'created', data: apiWorkspace });

      service.getWorkspace(apiWorkspace._id).subscribe((result) => (details = result));
      const detailsRequest = httpTesting.expectOne(`/api/workspaces/${apiWorkspace._id}`);
      expect(detailsRequest.request.method).toBe('GET');
      expect(detailsRequest.request.withCredentials).toBe(true);
      detailsRequest.flush({ message: 'ok', data: apiWorkspace });

      expect(workspaces).toEqual([apiWorkspace]);
      expect(created).toEqual(apiWorkspace);
      expect(details).toEqual(apiWorkspace);
      httpTesting.verify();
    });

    it('loads recent dashboard activity using the Workspace-scoped endpoint and bounded limit', () => {
      const reportService = TestBed.inject(ReportService);
      const httpTesting = TestBed.inject(HttpTestingController);
      let activity: DashboardActivityItem[] = [];

      reportService.getDashboardActivity('workspace-activity', 5).subscribe((result) => {
        activity = result;
      });
      const request = httpTesting.expectOne(
        '/api/workspaces/workspace-activity/dashboard/activity?limit=5',
      );
      expect(request.request.method).toBe('GET');
      expect(request.request.withCredentials).toBe(true);
      request.flush({
        message: 'Dashboard activity retrieved successfully',
        data: [
          {
            id: 'attendance-1',
            type: 'attendance',
            occurredAt: '2026-11-27T07:00:00.000Z',
            status: 'present',
          },
        ],
      });

      expect(activity).toEqual([
        {
          id: 'attendance-1',
          type: 'attendance',
          occurredAt: '2026-11-27T07:00:00.000Z',
          status: 'present',
        },
      ]);
      httpTesting.verify();
    });

    it('selects only active workspaces and represents suspended and empty membership states', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const suspendedWorkspace: Workspace = {
        _id: 'workspace-suspended',
        name: 'مساحة معلّقة',
        slug: 'workspace-suspended',
        status: 'suspended',
        currency: 'EGP',
        description: '',
      };
      const activeWorkspace: Workspace = {
        _id: 'workspace-active',
        name: 'مساحة نشطة',
        slug: 'workspace-active',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const states: WorkspaceAvailability[] = [];

      service.getWorkspaceAvailability(true).subscribe((state) => states.push(state));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [suspendedWorkspace, activeWorkspace],
      });

      service.getWorkspaceAvailability(true).subscribe((state) => states.push(state));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [suspendedWorkspace],
      });

      service.getWorkspaceAvailability(true).subscribe((state) => states.push(state));
      httpTesting.expectOne('/api/workspaces/mine').flush({ message: 'ok', data: [] });

      expect(states).toEqual([
        { kind: 'active', workspace: activeWorkspace },
        { kind: 'suspended', workspaces: [suspendedWorkspace] },
        { kind: 'unavailable' },
      ]);
      httpTesting.verify();
    });

    it('shows a simple current Workspace label when there is only one active membership', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const onlyWorkspace: Workspace = {
        _id: 'workspace-only',
        name: 'مساحة واحدة',
        slug: 'workspace-only',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      service.getWorkspaceAccessState().subscribe();
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [onlyWorkspace],
      });

      const fixture = TestBed.createComponent(WorkspaceSelectorComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(onlyWorkspace.name);
      expect(fixture.nativeElement.querySelector('select')).toBeNull();
    });

    it('restores a stored Workspace when it is still an active membership', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const defaultWorkspace: Workspace = {
        _id: 'workspace-default',
        name: 'الافتراضية',
        slug: 'workspace-default',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const storedWorkspace: Workspace = {
        ...defaultWorkspace,
        _id: 'workspace-stored',
        name: 'المحفوظة',
        slug: 'workspace-stored',
      };
      localStorage.setItem(workspaceSelectionKey, storedWorkspace._id);
      let state: WorkspaceAccessState | undefined;

      service.getWorkspaceAccessState().subscribe((result) => (state = result));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [defaultWorkspace, storedWorkspace],
      });

      expect(state?.activeWorkspace).toEqual(storedWorkspace);
      expect(service.selectedWorkspaceId()).toBe(storedWorkspace._id);
      expect(localStorage.getItem(workspaceSelectionKey)).toBe(storedWorkspace._id);
      httpTesting.verify();
    });

    it('uses the default active Workspace and removes an inaccessible stored ID', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const defaultWorkspace: Workspace = {
        _id: 'workspace-default',
        name: 'الافتراضية',
        slug: 'workspace-default',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      localStorage.setItem(workspaceSelectionKey, 'workspace-not-accessible');
      let state: WorkspaceAccessState | undefined;

      service.getWorkspaceAccessState().subscribe((result) => (state = result));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [defaultWorkspace],
      });

      expect(state?.activeWorkspace).toEqual(defaultWorkspace);
      expect(service.selectedWorkspaceId()).toBe(defaultWorkspace._id);
      expect(localStorage.getItem(workspaceSelectionKey)).toBeNull();
      httpTesting.verify();
    });

    it('uses the default active Workspace and removes a stored suspended Workspace', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const defaultWorkspace: Workspace = {
        _id: 'workspace-default',
        name: 'الافتراضية',
        slug: 'workspace-default',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const suspendedWorkspace: Workspace = {
        ...defaultWorkspace,
        _id: 'workspace-suspended',
        name: 'المعلّقة',
        slug: 'workspace-suspended',
        status: 'suspended',
      };
      localStorage.setItem(workspaceSelectionKey, suspendedWorkspace._id);
      let state: WorkspaceAccessState | undefined;

      service.getWorkspaceAccessState().subscribe((result) => (state = result));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [suspendedWorkspace, defaultWorkspace],
      });

      expect(state?.activeWorkspace).toEqual(defaultWorkspace);
      expect(service.selectedWorkspaceId()).toBe(defaultWorkspace._id);
      expect(localStorage.getItem(workspaceSelectionKey)).toBeNull();
      httpTesting.verify();
    });

    it('uses the default active Workspace when no saved selection exists', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const defaultWorkspace: Workspace = {
        _id: 'workspace-default',
        name: 'الافتراضية',
        slug: 'workspace-default',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const otherWorkspace: Workspace = {
        ...defaultWorkspace,
        _id: 'workspace-other',
        name: 'الأخرى',
        slug: 'workspace-other',
      };
      let state: WorkspaceAccessState | undefined;

      service.getWorkspaceAccessState().subscribe((result) => (state = result));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [defaultWorkspace, otherWorkspace],
      });

      expect(state?.activeWorkspace).toEqual(defaultWorkspace);
      expect(service.selectedWorkspaceId()).toBe(defaultWorkspace._id);
      expect(localStorage.getItem(workspaceSelectionKey)).toBeNull();
      httpTesting.verify();
    });

    it('defaults to the first active membership, permits switching to another active one, and disables suspended options', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const newestWorkspace: Workspace = {
        _id: 'workspace-newest',
        name: 'الأحدث',
        slug: 'workspace-newest',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const otherWorkspace: Workspace = {
        ...newestWorkspace,
        _id: 'workspace-other',
        name: 'مساحة أخرى',
        slug: 'workspace-other',
      };
      const suspendedWorkspace: Workspace = {
        ...newestWorkspace,
        _id: 'workspace-suspended',
        name: 'مساحة معلّقة',
        slug: 'workspace-suspended',
        status: 'suspended',
      };
      const selected: Array<Workspace | null> = [];

      service.watchActiveWorkspace().subscribe((workspace) => selected.push(workspace));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [newestWorkspace, suspendedWorkspace, otherWorkspace],
      });
      expect(service.workspaceAccessState()?.activeWorkspace).toEqual(newestWorkspace);
      expect(service.selectWorkspace(suspendedWorkspace._id)).toBe(false);

      const fixture = TestBed.createComponent(WorkspaceSelectorComponent);
      fixture.detectChanges();
      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
      const suspendedOption = select.querySelector(
        `option[value="${suspendedWorkspace._id}"]`,
      ) as HTMLOptionElement;

      expect(suspendedOption.disabled).toBe(true);
      select.value = otherWorkspace._id;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(service.workspaceAccessState()?.activeWorkspace).toEqual(otherWorkspace);
      expect(service.selectedWorkspaceId()).toBe(otherWorkspace._id);
      expect(localStorage.getItem(workspaceSelectionKey)).toBe(otherWorkspace._id);
      expect(selected.map((workspace) => workspace?._id)).toEqual([
        newestWorkspace._id,
        otherWorkspace._id,
      ]);

      select.value = suspendedWorkspace._id;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(service.selectedWorkspaceId()).toBe(otherWorkspace._id);
      httpTesting.verify();
    });

    it('keeps selection empty for an empty list and does not invent an active Workspace', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      let accessState: WorkspaceAccessState | undefined;
      let availability: WorkspaceAvailability | undefined;

      service.getWorkspaceAccessState().subscribe((state) => (accessState = state));
      httpTesting.expectOne('/api/workspaces/mine').flush({ message: 'ok', data: [] });
      service.getWorkspaceAvailability().subscribe((state) => (availability = state));

      expect(accessState?.activeWorkspace).toBeNull();
      expect(service.selectedWorkspaceId()).toBeNull();
      expect(availability).toEqual({ kind: 'unavailable' });
      expect(service.selectWorkspace('missing-workspace')).toBe(false);
      httpTesting.verify();
    });

    it('does not silently fall back when an explicitly selected Workspace is no longer active', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const initialWorkspace: Workspace = {
        _id: 'workspace-initial',
        name: 'المساحة الافتراضية',
        slug: 'workspace-initial',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      const selectedWorkspace: Workspace = {
        ...initialWorkspace,
        _id: 'workspace-selected',
        name: 'المساحة المختارة',
        slug: 'workspace-selected',
      };
      let state: WorkspaceAccessState | undefined;
      let availability: WorkspaceAvailability | undefined;

      service.getWorkspaceAccessState().subscribe();
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [initialWorkspace, selectedWorkspace],
      });
      expect(service.selectWorkspace(selectedWorkspace._id)).toBe(true);

      service.getWorkspaceAccessState().subscribe((result) => (state = result));
      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'ok',
        data: [initialWorkspace],
      });
      service.getWorkspaceAvailability().subscribe((result) => (availability = result));

      expect(service.selectedWorkspaceId()).toBe(selectedWorkspace._id);
      expect(state?.activeWorkspace).toBeNull();
      expect(availability).toEqual({
        kind: 'selection-required',
        activeWorkspaces: [initialWorkspace],
        selectedWorkspace: null,
      });
      httpTesting.verify();
    });

    it('activates through the owner endpoint and confirms active membership from refreshed /mine', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const activatedWorkspace: Workspace = {
        _id: 'workspace-owner-suspended',
        name: 'مساحة المالك',
        slug: 'workspace-owner-suspended',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      let refreshedState: WorkspaceAccessState | undefined;

      service.activateWorkspaceAndRefresh(activatedWorkspace._id).subscribe((state) => {
        refreshedState = state;
      });
      const activationRequest = httpTesting.expectOne(
        `/api/workspaces/${activatedWorkspace._id}/activate`,
      );
      expect(activationRequest.request.method).toBe('PATCH');
      expect(activationRequest.request.body).toBeNull();
      expect(activationRequest.request.withCredentials).toBe(true);
      activationRequest.flush({ message: 'activated', data: activatedWorkspace });

      httpTesting.expectOne('/api/workspaces/mine').flush({
        message: 'refreshed',
        data: [activatedWorkspace],
      });

      expect(refreshedState?.activeWorkspace).toEqual(activatedWorkspace);
      expect(refreshedState?.workspaces).toEqual([activatedWorkspace]);
      httpTesting.verify();
    });

    it('does not confirm activation when the refreshed membership list omits the workspace', () => {
      const service = TestBed.inject(WorkspaceService);
      const httpTesting = TestBed.inject(HttpTestingController);
      const activatedWorkspace: Workspace = {
        _id: 'workspace-not-listed',
        name: 'مساحة غير ظاهرة',
        slug: 'workspace-not-listed',
        status: 'active',
        currency: 'EGP',
        description: '',
      };
      let activationError: unknown;

      service.activateWorkspaceAndRefresh(activatedWorkspace._id).subscribe({
        error: (error: unknown) => (activationError = error),
      });
      httpTesting.expectOne(`/api/workspaces/${activatedWorkspace._id}/activate`).flush({
        message: 'activated',
        data: activatedWorkspace,
      });
      httpTesting.expectOne('/api/workspaces/mine').flush({ message: 'refreshed', data: [] });

      expect(activationError).toBeInstanceOf(WorkspaceActivationVerificationError);
      httpTesting.verify();
    });
  });
});
