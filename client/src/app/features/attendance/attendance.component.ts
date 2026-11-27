import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, Observable, of, timer } from 'rxjs';
import { distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import {
  AttendanceRecord,
  AttendanceRecordUpdate,
  AttendanceRecordWrite,
  AttendanceStatus,
  Enrollment,
  Pagination,
  Session,
  SessionAttendanceQuery,
  SessionQuery,
  SessionStatus,
  StudentAttendanceQuery,
  StudyGroup,
} from '../../core/models/learning.models';
import { Student } from '../../core/models/people.models';
import { LearningService } from '../../core/services/learning.service';
import { PeopleService } from '../../core/services/people.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { localDateBoundaryToIso } from '../sessions/sessions.component';
import { WorkspaceSelectorComponent } from '../workspace/workspace-selector.component';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/components/custom-select/custom-select.component';

type AttendanceMode = 'overview' | 'session' | 'student';

interface SessionOverviewRow {
  session: Session;
  group: StudyGroup;
}

interface SessionAttendanceRow {
  record: AttendanceRecord;
  student: Student;
}

interface StudentAttendanceRow {
  record: AttendanceRecord;
  session: Session;
  group: StudyGroup;
}

interface EligibleStudent {
  enrollment: Enrollment;
  student: Student;
}

const ATTENDANCE_STATUSES: ReadonlyArray<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'حاضر' },
  { value: 'absent', label: 'غائب' },
  { value: 'late', label: 'متأخر' },
  { value: 'excused', label: 'معذور' },
];

const SESSION_STATUSES: ReadonlyArray<{ value: SessionStatus; label: string }> = [
  { value: 'scheduled', label: 'مجدولة' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
];

const PAGE_SIZE = 20;
const MAX_CACHE_SIZE = 100;
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const todayLocalDate = (): string => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const emptyPagination = (page = 1): Pagination => ({
  page,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
});

const distinct = (values: string[]): string[] => [...new Set(values)];

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CustomSelectComponent, ReactiveFormsModule, RouterLink, WorkspaceSelectorComponent],
  templateUrl: './attendance.component.html',
})
export class AttendanceComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly peopleService = inject(PeopleService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly attendanceStatuses = ATTENDANCE_STATUSES;
  readonly sessionStatuses = SESSION_STATUSES;
  readonly mode = signal<AttendanceMode>('overview');
  readonly sessionId = signal<string | null>(null);
  readonly studentId = signal<string | null>(null);
  readonly session = signal<Session | null>(null);
  readonly group = signal<StudyGroup | null>(null);
  readonly student = signal<Student | null>(null);
  readonly sessionRows = signal<SessionOverviewRow[]>([]);
  readonly attendanceRows = signal<SessionAttendanceRow[]>([]);
  readonly studentAttendanceRows = signal<StudentAttendanceRow[]>([]);
  readonly eligibleStudents = signal<EligibleStudent[]>([]);
  readonly sessionPagination = signal<Pagination>(emptyPagination());
  readonly attendancePagination = signal<Pagination>(emptyPagination());
  readonly historyPagination = signal<Pagination>(emptyPagination());
  readonly rosterPagination = signal<Pagination>(emptyPagination());
  readonly now = signal(Date.now());
  readonly sessionHasStarted = computed(() => {
    const startsAt = this.session()?.startsAt;
    return !!startsAt && Number.isFinite(Date.parse(startsAt)) && Date.parse(startsAt) <= this.now();
  });
  readonly canRecordNewAttendance = computed(
    () => this.sessionHasStarted() && this.session()?.status !== 'cancelled',
  );
  readonly availableStudents = computed(() => {
    const recordedStudentIds = new Set(this.attendanceRows().map((row) => row.record.studentId));
    return this.eligibleStudents().filter((row) => !recordedStudentIds.has(row.student.id));
  });
  readonly availableStudentSelectOptions = computed<CustomSelectOption[]>(() =>
    this.availableStudents().map((row) => ({
      value: row.student.id,
      label: `${row.student.name} · ${this.formatDateTime(row.enrollment.enrolledAt)}`,
    })),
  );
  readonly filters = this.formBuilder.nonNullable.group({
    from: [todayLocalDate()],
    to: [''],
    status: ['' as SessionStatus | ''],
  });
  readonly attendanceFilters = this.formBuilder.nonNullable.group({
    status: ['' as AttendanceStatus | ''],
  });
  readonly historyFilters = this.formBuilder.nonNullable.group({
    from: [''],
    to: [''],
    status: ['' as AttendanceStatus | ''],
  });
  readonly recordForm = this.formBuilder.group({
    studentId: this.formBuilder.nonNullable.control('', Validators.required),
    status: this.formBuilder.nonNullable.control<AttendanceStatus>('present', Validators.required),
    lateMinutes: new FormControl<number | null>(null),
    notes: this.formBuilder.nonNullable.control('', Validators.maxLength(1000)),
  });
  readonly editForm = this.formBuilder.group({
    status: this.formBuilder.nonNullable.control<AttendanceStatus>('present', Validators.required),
    lateMinutes: new FormControl<number | null>(null),
    notes: this.formBuilder.nonNullable.control('', Validators.maxLength(1000)),
  });
  readonly workspaceLoading = signal(true);
  readonly hasWorkspace = signal(false);
  readonly overviewLoading = signal(false);
  readonly detailsLoading = signal(false);
  readonly attendanceLoading = signal(false);
  readonly historyLoading = signal(false);
  readonly rosterLoading = signal(false);
  readonly recording = signal(false);
  readonly updatingAttendanceId = signal<string | null>(null);
  readonly createFormOpen = signal(false);
  readonly editingAttendanceId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly attendanceError = signal('');
  readonly historyError = signal('');
  readonly rosterError = signal('');

  private workspaceId = '';
  private overviewRequest = 0;
  private detailRequest = 0;
  private attendanceRequest = 0;
  private historyRequest = 0;
  private rosterRequest = 0;
  private readonly groupCache = new Map<string, StudyGroup>();
  private readonly studentCache = new Map<string, Student>();
  private readonly sessionCache = new Map<string, Session>();

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => ({
          sessionId: params.get('sessionId'),
          studentId: params.get('studentId'),
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.sessionId === current.sessionId &&
            previous.studentId === current.studentId,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ sessionId, studentId }) => {
        this.sessionId.set(sessionId);
        this.studentId.set(studentId);
        this.mode.set(sessionId ? 'session' : studentId ? 'student' : 'overview');
        this.clearRouteData();
        if (this.workspaceId) this.loadCurrentRoute();
      });

    this.recordForm.controls.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.configureLateMinutes(this.recordForm.controls.lateMinutes, status));
    this.editForm.controls.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.configureLateMinutes(this.editForm.controls.lateMinutes, status));

    timer(0, 30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    const activeWorkspace$ =
      this.workspaceService.watchActiveWorkspace?.() ??
      this.workspaceService.getActiveWorkspace();
    activeWorkspace$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (workspace) => {
          this.workspaceLoading.set(false);
          if (!workspace?._id) {
            if (this.workspaceId) this.resetWorkspaceData();
            this.workspaceId = '';
            this.hasWorkspace.set(false);
            this.error.set('اختر مساحة عمل نشطة من القائمة أعلاه.');
            return;
          }
          if (this.workspaceId && this.workspaceId !== workspace._id) {
            this.resetWorkspaceData();
          }
          this.workspaceId = workspace._id;
          this.hasWorkspace.set(true);
          this.loadCurrentRoute();
        },
        error: (error: unknown) => {
          this.workspaceLoading.set(false);
          this.hasWorkspace.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل مساحة العمل.'));
        },
      });
  }

  applySessionFilters(): void {
    this.sessionPagination.set(emptyPagination());
    this.loadSessionList(1);
  }

  changeSessionPage(page: number): void {
    if (page >= 1 && page <= this.sessionPagination().totalPages) this.loadSessionList(page);
  }

  applyAttendanceFilters(): void {
    this.attendancePagination.set(emptyPagination());
    this.loadSessionAttendance(1);
  }

  changeAttendancePage(page: number): void {
    if (page >= 1 && page <= this.attendancePagination().totalPages) {
      this.loadSessionAttendance(page);
    }
  }

  changeRosterPage(page: number): void {
    if (page >= 1 && page <= this.rosterPagination().totalPages) this.loadRoster(page);
  }

  applyHistoryFilters(): void {
    this.historyPagination.set(emptyPagination());
    this.loadStudentAttendance(1);
  }

  changeHistoryPage(page: number): void {
    if (page >= 1 && page <= this.historyPagination().totalPages) {
      this.loadStudentAttendance(page);
    }
  }

  openCreateForm(): void {
    if (!this.canRecordNewAttendance()) {
      this.error.set(this.sessionRestrictionMessage());
      return;
    }
    this.error.set('');
    this.recordForm.reset({ studentId: '', status: 'present', lateMinutes: null, notes: '' });
    this.configureLateMinutes(this.recordForm.controls.lateMinutes, 'present');
    this.createFormOpen.set(true);
  }

  closeCreateForm(): void {
    this.createFormOpen.set(false);
    this.recordForm.reset({ studentId: '', status: 'present', lateMinutes: null, notes: '' });
    this.configureLateMinutes(this.recordForm.controls.lateMinutes, 'present');
  }

  submitAttendance(): void {
    const sessionId = this.sessionId();
    if (!sessionId || !this.canRecordNewAttendance() || this.recording()) {
      this.error.set(this.sessionRestrictionMessage());
      return;
    }
    this.recordForm.markAllAsTouched();
    if (this.recordForm.invalid) return;

    const value = this.recordForm.getRawValue();
    const input: AttendanceRecordWrite = {
      studentId: value.studentId,
      status: value.status,
    };
    if (value.status === 'late' && value.lateMinutes !== null) {
      input.lateMinutes = value.lateMinutes;
    }
    const notes = value.notes.trim();
    if (notes) input.notes = notes;

    this.recording.set(true);
    this.error.set('');
    this.success.set('');
    this.learningService.createAttendanceRecord(this.workspaceId, sessionId, input).subscribe({
      next: () => {
        this.recording.set(false);
        this.createFormOpen.set(false);
        this.recordForm.reset({ studentId: '', status: 'present', lateMinutes: null, notes: '' });
        this.configureLateMinutes(this.recordForm.controls.lateMinutes, 'present');
        this.success.set('تم تسجيل الحضور بنجاح.');
        this.loadSessionAttendance(1);
      },
      error: (error: unknown) => {
        this.recording.set(false);
        this.error.set(getApiErrorMessage(error, 'تعذر تسجيل الحضور. راجع أهلية الطالب وحالة الجلسة.'));
      },
    });
  }

  beginEdit(row: SessionAttendanceRow): void {
    if (!this.sessionHasStarted()) {
      this.error.set('لا يمكن تعديل الحضور قبل بداية الجلسة وفق قواعد النظام.');
      return;
    }
    this.error.set('');
    this.editingAttendanceId.set(row.record.id);
    this.editForm.reset({
      status: row.record.status,
      lateMinutes: row.record.lateMinutes,
      notes: row.record.notes,
    });
    this.configureLateMinutes(this.editForm.controls.lateMinutes, row.record.status);
  }

  cancelEdit(): void {
    this.editingAttendanceId.set(null);
    this.editForm.reset({ status: 'present', lateMinutes: null, notes: '' });
    this.configureLateMinutes(this.editForm.controls.lateMinutes, 'present');
  }

  saveEdit(row: SessionAttendanceRow): void {
    const sessionId = this.sessionId();
    if (!sessionId || !this.sessionHasStarted() || this.updatingAttendanceId()) return;
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    const value = this.editForm.getRawValue();
    const input: AttendanceRecordUpdate = {};
    if (this.editForm.controls.status.dirty) input.status = value.status;
    if (value.status === 'late' && this.editForm.controls.lateMinutes.dirty) {
      if (value.lateMinutes !== null) input.lateMinutes = value.lateMinutes;
    }
    if (this.editForm.controls.notes.dirty) input.notes = value.notes.trim();
    if (Object.keys(input).length === 0) {
      this.error.set('غيّر حقلًا واحدًا على الأقل قبل الحفظ.');
      return;
    }

    this.updatingAttendanceId.set(row.record.id);
    this.error.set('');
    this.success.set('');
    this.learningService
      .updateAttendanceRecord(this.workspaceId, sessionId, row.record.id, input)
      .subscribe({
        next: (record) => {
          this.attendanceRows.update((rows) =>
            rows.map((item) => (item.record.id === record.id ? { ...item, record } : item)),
          );
          this.updatingAttendanceId.set(null);
          this.editingAttendanceId.set(null);
          this.success.set('تم تحديث سجل الحضور.');
        },
        error: (error: unknown) => {
          this.updatingAttendanceId.set(null);
          this.error.set(getApiErrorMessage(error, 'تعذر تحديث سجل الحضور.'));
        },
      });
  }

  attendanceStatusLabel(status: AttendanceStatus): string {
    return ATTENDANCE_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  sessionStatusLabel(status: SessionStatus): string {
    return SESSION_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? DATE_TIME_FORMATTER.format(date) : 'تاريخ غير صالح';
  }

  private clearRouteData(): void {
    this.overviewRequest += 1;
    this.detailRequest += 1;
    this.attendanceRequest += 1;
    this.historyRequest += 1;
    this.rosterRequest += 1;
    this.error.set('');
    this.success.set('');
    this.attendanceError.set('');
    this.historyError.set('');
    this.rosterError.set('');
    this.session.set(null);
    this.group.set(null);
    this.student.set(null);
    this.sessionRows.set([]);
    this.attendanceRows.set([]);
    this.studentAttendanceRows.set([]);
    this.eligibleStudents.set([]);
    this.createFormOpen.set(false);
    this.editingAttendanceId.set(null);
    this.sessionPagination.set(emptyPagination());
    this.attendancePagination.set(emptyPagination());
    this.historyPagination.set(emptyPagination());
    this.rosterPagination.set(emptyPagination());
  }

  private resetWorkspaceData(): void {
    this.clearRouteData();
    this.groupCache.clear();
    this.studentCache.clear();
    this.sessionCache.clear();
    this.overviewLoading.set(false);
    this.detailsLoading.set(false);
    this.attendanceLoading.set(false);
    this.historyLoading.set(false);
    this.rosterLoading.set(false);
    this.recordForm.reset({
      studentId: '',
      status: 'present',
      lateMinutes: null,
      notes: '',
    });
    this.editForm.reset({
      status: 'present',
      lateMinutes: null,
      notes: '',
    });
  }

  private loadCurrentRoute(): void {
    if (this.mode() === 'session' && this.sessionId()) {
      this.loadSessionDetails();
      return;
    }
    if (this.mode() === 'student' && this.studentId()) {
      this.loadStudentDetails();
      return;
    }
    this.loadSessionList(1);
  }

  private loadSessionList(page: number): void {
    const request = ++this.overviewRequest;
    const filterValues = this.filters.getRawValue();
    if (filterValues.from && filterValues.to && filterValues.from > filterValues.to) {
      this.error.set('يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.');
      this.overviewLoading.set(false);
      return;
    }

    const from = filterValues.from ? localDateBoundaryToIso(filterValues.from) : null;
    const to = filterValues.to ? localDateBoundaryToIso(filterValues.to, true) : null;
    if ((filterValues.from && !from) || (filterValues.to && !to)) {
      this.error.set('أدخل نطاق تاريخ صحيحًا.');
      this.overviewLoading.set(false);
      return;
    }

    const query: SessionQuery = { page, pageSize: PAGE_SIZE };
    if (from) query.from = from;
    if (to) query.to = to;
    if (filterValues.status) query.status = filterValues.status;

    this.overviewLoading.set(true);
    this.error.set('');
    this.sessionRows.set([]);
    this.learningService
      .listSessions(this.workspaceId, query)
      .pipe(
        switchMap((result) => {
          this.sessionPagination.set(result.pagination);
          return this.getGroupsForSessions(result.items).pipe(
            map((groups) => result.items.map((session) => ({
              session,
              group: groups.get(session.groupId)!,
            }))),
          );
        }),
      )
      .subscribe({
        next: (rows) => {
          if (request !== this.overviewRequest) return;
          this.sessionRows.set(rows);
          this.overviewLoading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.overviewRequest) return;
          this.overviewLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل جلسات مساحة العمل.'));
        },
      });
  }

  private getGroupsForSessions(sessions: Session[]): Observable<Map<string, StudyGroup>> {
    const groupIds = distinct(sessions.map((session) => session.groupId));
    if (groupIds.length === 0) return of(new Map<string, StudyGroup>());
    return forkJoin(groupIds.map((id) => this.getGroupCached(id))).pipe(
      map((groups) => new Map(groups.map((group) => [group.id, group]))),
    );
  }

  private loadSessionDetails(): void {
    const sessionId = this.sessionId();
    if (!sessionId) return;
    const request = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.error.set('');
    this.learningService
      .getSession(this.workspaceId, sessionId)
      .pipe(
        tap((session) => this.sessionCache.set(session.id, session)),
        switchMap((session) =>
          this.getGroupCached(session.groupId).pipe(map((group) => ({ session, group }))),
        ),
      )
      .subscribe({
        next: ({ session, group }) => {
          if (request !== this.detailRequest) return;
          this.session.set(session);
          this.group.set(group);
          this.detailsLoading.set(false);
          this.loadSessionAttendance(1);
          this.loadRoster(1);
        },
        error: (error: unknown) => {
          if (request !== this.detailRequest) return;
          this.detailsLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات الجلسة.'));
        },
      });
  }

  private loadSessionAttendance(page: number): void {
    const sessionId = this.sessionId();
    if (!sessionId) return;
    const request = ++this.attendanceRequest;
    const query: SessionAttendanceQuery = {
      page,
      pageSize: PAGE_SIZE,
    };
    const status = this.attendanceFilters.controls.status.value;
    if (status) query.status = status;

    this.attendanceLoading.set(true);
    this.attendanceError.set('');
    this.attendanceRows.set([]);
    this.learningService
      .listSessionAttendance(this.workspaceId, sessionId, query)
      .pipe(
        switchMap((result) => {
          this.attendancePagination.set(result.pagination);
          return this.getStudentsForRecords(result.items).pipe(
            map((students) =>
              result.items.map((record) => ({
                record,
                student: students.get(record.studentId)!,
              })),
            ),
          );
        }),
      )
      .subscribe({
        next: (rows) => {
          if (request !== this.attendanceRequest) return;
          this.attendanceRows.set(rows);
          this.attendanceLoading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.attendanceRequest) return;
          this.attendanceLoading.set(false);
          this.attendanceError.set(getApiErrorMessage(error, 'تعذر تحميل سجلات الجلسة.'));
        },
      });
  }

  private getStudentsForRecords(records: AttendanceRecord[]): Observable<Map<string, Student>> {
    const studentIds = distinct(records.map((record) => record.studentId));
    if (studentIds.length === 0) return of(new Map<string, Student>());
    return forkJoin(studentIds.map((id) => this.getStudentCached(id))).pipe(
      map((students) => new Map(students.map((student) => [student.id, student]))),
    );
  }

  private loadRoster(page: number): void {
    const group = this.group();
    const session = this.session();
    if (!group || !session) return;
    const request = ++this.rosterRequest;
    this.rosterLoading.set(true);
    this.rosterError.set('');
    this.eligibleStudents.set([]);
    this.learningService
      .listGroupEnrollments(this.workspaceId, group.id, {
        page,
        pageSize: PAGE_SIZE,
        status: 'active',
      })
      .pipe(
        switchMap((result) => {
          this.rosterPagination.set(result.pagination);
          const eligible = result.items.filter((enrollment) => {
            const enrolledAt = Date.parse(enrollment.enrolledAt);
            const startsAt = Date.parse(session.startsAt);
            return Number.isFinite(enrolledAt) && enrolledAt <= startsAt;
          });
          if (eligible.length === 0) return of([] as EligibleStudent[]);
          return forkJoin(
            eligible.map((enrollment) =>
              this.getStudentCached(enrollment.studentId).pipe(
                map((student) => ({ enrollment, student })),
              ),
            ),
          );
        }),
      )
      .subscribe({
        next: (rows) => {
          if (request !== this.rosterRequest) return;
          this.eligibleStudents.set(rows);
          this.rosterLoading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.rosterRequest) return;
          this.rosterLoading.set(false);
          this.rosterError.set(getApiErrorMessage(error, 'تعذر تحميل تسجيلات المجموعة النشطة.'));
        },
      });
  }

  private loadStudentDetails(): void {
    const studentId = this.studentId();
    if (!studentId) return;
    const request = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.error.set('');
    this.peopleService.getStudent(this.workspaceId, studentId).subscribe({
      next: (student) => {
        if (request !== this.detailRequest) return;
        this.studentCache.set(student.id, student);
        this.student.set(student);
        this.detailsLoading.set(false);
        this.loadStudentAttendance(1);
      },
      error: (error: unknown) => {
        if (request !== this.detailRequest) return;
        this.detailsLoading.set(false);
        this.error.set(getApiErrorMessage(error, 'تعذر تحميل ملف الطالب.'));
      },
    });
  }

  private loadStudentAttendance(page: number): void {
    const studentId = this.studentId();
    if (!studentId) return;
    const request = ++this.historyRequest;
    const values = this.historyFilters.getRawValue();
    if (values.from && values.to && values.from > values.to) {
      this.historyError.set('يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.');
      this.historyLoading.set(false);
      return;
    }

    const from = values.from ? localDateBoundaryToIso(values.from) : null;
    const to = values.to ? localDateBoundaryToIso(values.to, true) : null;
    if ((values.from && !from) || (values.to && !to)) {
      this.historyError.set('أدخل نطاق تاريخ صحيحًا.');
      this.historyLoading.set(false);
      return;
    }

    const query: StudentAttendanceQuery = { page, pageSize: PAGE_SIZE };
    if (from) query.from = from;
    if (to) query.to = to;
    if (values.status) query.status = values.status;

    this.historyLoading.set(true);
    this.historyError.set('');
    this.studentAttendanceRows.set([]);
    this.learningService
      .listStudentAttendance(this.workspaceId, studentId, query)
      .pipe(
        switchMap((result) => {
          this.historyPagination.set(result.pagination);
          return this.getSessionRowsForAttendance(result.items);
        }),
      )
      .subscribe({
        next: (rows) => {
          if (request !== this.historyRequest) return;
          this.studentAttendanceRows.set(rows);
          this.historyLoading.set(false);
        },
        error: (error: unknown) => {
          if (request !== this.historyRequest) return;
          this.historyLoading.set(false);
          this.historyError.set(getApiErrorMessage(error, 'تعذر تحميل سجل حضور الطالب.'));
        },
      });
  }

  private getSessionRowsForAttendance(
    records: AttendanceRecord[],
  ): Observable<StudentAttendanceRow[]> {
    const sessionIds = distinct(records.map((record) => record.sessionId));
    if (sessionIds.length === 0) return of([]);
    return forkJoin(sessionIds.map((id) => this.getSessionCached(id))).pipe(
      switchMap((sessions) => {
        const sessionById = new Map(sessions.map((session) => [session.id, session]));
        const groupIds = distinct(sessions.map((session) => session.groupId));
        return forkJoin(groupIds.map((id) => this.getGroupCached(id))).pipe(
          map((groups) => {
            const groupById = new Map(groups.map((group) => [group.id, group]));
            return records.map((record) => {
              const session = sessionById.get(record.sessionId);
              const group = session ? groupById.get(session.groupId) : undefined;
              if (!session || !group) throw new Error('Attendance references could not be loaded.');
              return { record, session, group };
            });
          }),
        );
      }),
    );
  }

  private getGroupCached(groupId: string): Observable<StudyGroup> {
    const cached = this.groupCache.get(groupId);
    if (cached) return of(cached);
    return this.learningService.getGroup(this.workspaceId, groupId).pipe(
      tap((group) => this.remember(this.groupCache, group.id, group)),
    );
  }

  private getStudentCached(studentId: string): Observable<Student> {
    const cached = this.studentCache.get(studentId);
    if (cached) return of(cached);
    return this.peopleService.getStudent(this.workspaceId, studentId).pipe(
      tap((student) => this.remember(this.studentCache, student.id, student)),
    );
  }

  private getSessionCached(sessionId: string): Observable<Session> {
    const cached = this.sessionCache.get(sessionId);
    if (cached) return of(cached);
    return this.learningService.getSession(this.workspaceId, sessionId).pipe(
      tap((session) => this.remember(this.sessionCache, session.id, session)),
    );
  }

  private remember<T>(cache: Map<string, T>, key: string, value: T): void {
    cache.set(key, value);
    if (cache.size > MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
  }

  private configureLateMinutes(
    control: FormControl<number | null>,
    status: AttendanceStatus,
  ): void {
    if (status === 'late') control.setValidators(Validators.min(0));
    else control.clearValidators();
    control.updateValueAndValidity({ emitEvent: false });
  }

  private sessionRestrictionMessage(): string {
    const session = this.session();
    if (session?.status === 'cancelled') return 'لا يمكن تسجيل حضور جديد لجلسة ملغاة.';
    if (session && !this.sessionHasStarted()) return 'يمكن تسجيل الحضور بعد بداية الجلسة.';
    return 'تعذر تحديد الجلسة الحالية.';
  }
}
