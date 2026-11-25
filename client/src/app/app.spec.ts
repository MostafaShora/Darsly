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
import { Enrollment, Session, StudyGroup, Subject } from './core/models/learning.models';
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

    for (const path of ['/students', '/guardians', '/subjects', '/groups', '/sessions']) {
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
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات"] a[href="/students"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات"] a[href="/guardians"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات"] a[href="/subjects"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات"] a[href="/groups"]')).toBeTruthy();
    expect(dashboard.querySelector('nav[aria-label="إدارة الطلاب والمواد والمجموعات والجلسات"] a[href="/sessions"]')).toBeTruthy();

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
  });
});
