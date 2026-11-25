import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Type } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject as RxSubject, throwError } from 'rxjs';
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
import { AttendanceReport, FinanceReport, ReportService } from './core/services/report.service';
import { WorkspaceService } from './core/services/workspace.service';
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
import { formatMoneyExact, isPositiveDecimalString } from './core/utils/finance';

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

    await navigation;
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
});
