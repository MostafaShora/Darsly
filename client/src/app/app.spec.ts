import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
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
import { PeopleService } from './core/services/people.service';
import { AttendanceReport, FinanceReport, ReportService } from './core/services/report.service';
import { WorkspaceService } from './core/services/workspace.service';
import { GuardiansComponent } from './features/guardians/guardians.component';
import {
  formatReportDateForTimezone,
  formatReportTimestampForTimezone,
  ReportsComponent,
} from './features/reports/reports.component';
import { StudentsComponent } from './features/students/students.component';

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

    beforeEach(async () => {
      TestBed.resetTestingModule();
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
          {
            provide: WorkspaceService,
            useValue: { getActiveWorkspace: () => of(workspace) },
          },
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

      component.search.setValue('نور');
      await new Promise((resolve) => setTimeout(resolve, 280));
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 1, search: 'نور' }),
      );

      component.changePage(2);
      expect(peopleMock.listStudents).toHaveBeenLastCalledWith(
        workspace._id,
        expect.objectContaining({ page: 2, search: 'نور' }),
      );
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
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
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
    });

    it('loads student details and updates the supported student status and profile fields', async () => {
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/students/student-1', StudentsComponent);

      expect(component.student()).toEqual(student);
      expect(component.guardians()).toEqual([link]);
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
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/students/student-1', StudentsComponent);

      component.openLinkForm();
      component.selectGuardian(guardian);
      component.linkForm.controls.isPrimary.setValue(true);
      component.linkSelectedGuardian();
      expect(peopleMock.linkGuardian).toHaveBeenCalledWith(workspace._id, student.id, {
        guardianId: guardian.id,
        relationship: 'other',
        isPrimary: true,
        receivesNotifications: true,
      });

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
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      createComponent.submitGuardian();
      expect(peopleMock.createGuardian).toHaveBeenCalledWith(workspace._id, {
        name: 'أحمد محمد',
        phone: '+201000000000',
        alternatePhone: null,
        email: null,
        relationship: 'father',
        notes: '',
      });
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

    for (const path of ['/students', '/guardians']) {
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
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب وأولياء الأمور"] a[href="/students"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب وأولياء الأمور"] a[href="/guardians"]')).toBeTruthy();

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
