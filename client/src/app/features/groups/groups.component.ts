import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import {
  Enrollment,
  EnrollmentStatus,
  EnrollmentUpdate,
  GroupEnrollmentQuery,
  NewEnrollmentStatus,
  StudyGroup,
  StudyGroupQuery,
  StudyGroupStatus,
  StudyGroupUpdate,
  StudyGroupWrite,
  Subject,
} from '../../core/models/learning.models';
import { Student } from '../../core/models/people.models';
import { LearningService } from '../../core/services/learning.service';
import { PeopleService } from '../../core/services/people.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { trimmedMinLength } from '../../core/utils/form-validators';

interface GroupListRow {
  group: StudyGroup;
  subject: Subject;
}

interface GroupEnrollmentRow {
  enrollment: Enrollment;
  student: Student;
}

const GROUP_STATUSES: ReadonlyArray<{ value: StudyGroupStatus; label: string }> = [
  { value: 'active', label: 'نشطة' },
  { value: 'inactive', label: 'غير نشطة' },
  { value: 'archived', label: 'مؤرشفة' },
];

const ENROLLMENT_STATUSES: ReadonlyArray<{ value: EnrollmentStatus; label: string }> = [
  { value: 'active', label: 'نشط' },
  { value: 'paused', label: 'موقوف مؤقتًا' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
];

const integerCapacity: ValidatorFn = (control): ValidationErrors | null => {
  const value = control.value;
  return value === null || value === '' || Number.isInteger(value)
    ? null
    : { integer: true };
};

const decimalPrecision: ValidatorFn = (control): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const significantDigits = value.replace('.', '').replace(/^0+/, '').length;
  return significantDigits <= 34 ? null : { decimalPrecision: true };
};

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './groups.component.html',
})
export class GroupsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly peopleService = inject(PeopleService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = GROUP_STATUSES;
  readonly enrollmentStatuses = ENROLLMENT_STATUSES;
  readonly search = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<StudyGroupStatus | ''>('', { nonNullable: true });
  readonly subjectSearch = new FormControl('', { nonNullable: true });
  readonly subjectFilterId = new FormControl('', { nonNullable: true });
  readonly studentSearch = new FormControl('', { nonNullable: true });
  readonly enrollmentStatusFilter = new FormControl<EnrollmentStatus | ''>('', {
    nonNullable: true,
  });
  readonly groupForm = this.formBuilder.group({
    subjectId: this.formBuilder.nonNullable.control('', Validators.required),
    name: this.formBuilder.nonNullable.control('', [
      Validators.required,
      trimmedMinLength(2),
      Validators.maxLength(120),
    ]),
    description: this.formBuilder.nonNullable.control('', Validators.maxLength(1000)),
    monthlyFee: this.formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(128),
      Validators.pattern(/^\d+(?:\.\d+)?$/),
      decimalPrecision,
    ]),
    capacity: new FormControl<number | null>(null, [
      Validators.min(1),
      Validators.max(1000),
      integerCapacity,
    ]),
    status: this.formBuilder.nonNullable.control<StudyGroupStatus>('active', Validators.required),
  });
  readonly enrollmentForm = this.formBuilder.nonNullable.group({
    studentId: ['', Validators.required],
    enrolledAt: [''],
    notes: ['', Validators.maxLength(1000)],
    status: ['active' as NewEnrollmentStatus, Validators.required],
  });

  readonly groupId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly isEditing = signal(false);
  readonly isDetailView = computed(() => this.isCreating() || !!this.groupId());
  readonly group = signal<StudyGroup | null>(null);
  readonly subject = signal<Subject | null>(null);
  readonly groupRows = signal<GroupListRow[]>([]);
  readonly subjects = signal<Subject[]>([]);
  readonly selectedFilterSubject = signal<Subject | null>(null);
  readonly selectedFormSubject = signal<Subject | null>(null);
  readonly selectedStudent = signal<Student | null>(null);
  readonly studentOptions = signal<Student[]>([]);
  readonly enrollments = signal<GroupEnrollmentRow[]>([]);
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly subjectPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly studentPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly enrollmentPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly subjectsLoading = signal(false);
  readonly studentsLoading = signal(false);
  readonly workspaceLoading = signal(true);
  readonly hasWorkspace = signal(false);
  readonly submitting = signal(false);
  readonly enrolling = signal(false);
  readonly updatingEnrollmentId = signal<string | null>(null);
  readonly rosterLoading = signal(false);
  readonly activeCountLoading = signal(false);
  readonly activeEnrollmentCount = signal<number | null>(null);
  readonly enrollmentFormOpen = signal(false);
  readonly error = signal('');
  readonly subjectOptionsError = signal('');
  readonly studentOptionsError = signal('');
  readonly rosterError = signal('');
  readonly activeCountError = signal('');
  readonly success = signal('');

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;
  private subjectOptionsRequest = 0;
  private studentOptionsRequest = 0;
  private rosterRequest = 0;
  private activeCountRequest = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('groupId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((routeId) => {
        this.isCreating.set(routeId === 'new');
        this.groupId.set(routeId && routeId !== 'new' ? routeId : null);
        this.isEditing.set(routeId === 'new');
        this.success.set('');
        this.enrollmentFormOpen.set(false);
        if (this.workspaceId) this.loadCurrentRoute();
      });

    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadGroups();
      });

    this.statusFilter.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadGroups();
      });

    this.subjectSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadSubjectOptions(1));

    this.subjectFilterId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((subjectId) => {
        this.selectedFilterSubject.set(
          this.subjects().find((item) => item.id === subjectId) ??
            (this.selectedFilterSubject()?.id === subjectId ? this.selectedFilterSubject() : null),
        );
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadGroups();
      });

    this.studentSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadStudentOptions(1));

    this.enrollmentStatusFilter.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.enrollmentPagination.update((value) => ({ ...value, page: 1 }));
        this.loadEnrollments();
      });

    this.workspaceService
      .getActiveWorkspace()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (workspace) => {
          this.workspaceLoading.set(false);
          if (!workspace?._id) {
            this.error.set('لا توجد مساحة عمل نشطة متاحة.');
            return;
          }
          this.hasWorkspace.set(true);
          this.workspaceId = workspace._id;
          this.loadSubjectOptions(1);
          this.loadCurrentRoute();
        },
        error: (error: unknown) => {
          this.workspaceLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل مساحة العمل.'));
        },
      });
  }

  loadCurrentRoute(): void {
    this.error.set('');
    if (this.isCreating()) {
      this.group.set(null);
      this.subject.set(null);
      this.selectedFormSubject.set(null);
      this.groupForm.reset(this.emptyGroup());
      this.detailsLoading.set(false);
      return;
    }

    const id = this.groupId();
    if (id) {
      this.loadGroupDetails(id);
      return;
    }

    this.group.set(null);
    this.loadGroups();
  }

  loadGroups(page = this.pagination().page): void {
    if (!this.workspaceId || this.isDetailView()) return;

    const requestId = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    const query: StudyGroupQuery = {
      page,
      pageSize: this.pagination().pageSize,
      search: this.search.value.trim() || undefined,
      subjectId: this.subjectFilterId.value || undefined,
      status: this.statusFilter.value || undefined,
    };

    this.learningService
      .listGroups(this.workspaceId, query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.listRequest) return;
          this.pagination.set(result.pagination);
          const subjectIds = [...new Set(result.items.map((item) => item.subjectId))];
          if (subjectIds.length === 0) {
            this.groupRows.set([]);
            this.loading.set(false);
            return;
          }

          forkJoin(subjectIds.map((subjectId) => this.learningService.getSubject(this.workspaceId, subjectId)))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (subjects) => {
                if (requestId !== this.listRequest) return;
                const subjectById = new Map(subjects.map((item) => [item.id, item]));
                const rows: GroupListRow[] = [];
                for (const group of result.items) {
                  const subject = subjectById.get(group.subjectId);
                  if (!subject) {
                    this.loading.set(false);
                    this.error.set('تعذر مطابقة إحدى المواد المرتبطة بالمجموعات.');
                    return;
                  }
                  rows.push({ group, subject });
                }
                this.groupRows.set(rows);
                this.loading.set(false);
              },
              error: (error: unknown) => {
                if (requestId !== this.listRequest) return;
                this.loading.set(false);
                this.error.set(getApiErrorMessage(error, 'تعذر تحميل المواد المرتبطة بالمجموعات.'));
              },
            });
        },
        error: (error: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل قائمة المجموعات.'));
        },
      });
  }

  changePage(page: number): void {
    const pagination = this.pagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadGroups(page);
  }

  loadSubjectOptions(page: number): void {
    if (!this.workspaceId) return;
    const requestId = ++this.subjectOptionsRequest;
    this.subjectsLoading.set(true);
    this.subjectOptionsError.set('');
    this.learningService
      .listSubjects(this.workspaceId, {
        page,
        pageSize: this.subjectPagination().pageSize,
        search: this.subjectSearch.value.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.subjectOptionsRequest) return;
          this.subjects.set(result.items);
          this.subjectPagination.set(result.pagination);
          this.subjectsLoading.set(false);
          const selectedFilterId = this.subjectFilterId.value;
          if (selectedFilterId) {
            const selected = result.items.find((item) => item.id === selectedFilterId);
            if (selected) this.selectedFilterSubject.set(selected);
          }
        },
        error: (error: unknown) => {
          if (requestId !== this.subjectOptionsRequest) return;
          this.subjectsLoading.set(false);
          this.subjectOptionsError.set(getApiErrorMessage(error, 'تعذر تحميل المواد للاختيار.'));
        },
      });
  }

  subjectFilterOptions(): Subject[] {
    const selected = this.selectedFilterSubject();
    const options = this.subjects();
    return selected && !options.some((item) => item.id === selected.id)
      ? [selected, ...options]
      : options;
  }

  changeSubjectPage(page: number): void {
    const pagination = this.subjectPagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.loadSubjectOptions(page);
  }

  selectFormSubject(subject: Subject): void {
    this.selectedFormSubject.set(subject);
    this.groupForm.controls.subjectId.setValue(subject.id);
    this.groupForm.controls.subjectId.markAsTouched();
  }

  beginEdit(): void {
    const group = this.group();
    const subject = this.subject();
    if (!group || !subject) return;
    this.selectedFormSubject.set(subject);
    this.groupForm.reset({
      subjectId: group.subjectId,
      name: group.name,
      description: group.description,
      monthlyFee: group.monthlyFee,
      capacity: group.capacity,
      status: group.status,
    });
    this.isEditing.set(true);
    this.success.set('');
  }

  cancelEdit(): void {
    if (this.isCreating()) {
      void this.router.navigateByUrl('/groups');
      return;
    }
    this.isEditing.set(false);
    this.error.set('');
  }

  submitGroup(): void {
    this.groupForm.markAllAsTouched();
    if (this.groupForm.invalid || this.submitting()) return;

    const value = this.groupForm.getRawValue();
    const input: StudyGroupWrite = {
      subjectId: value.subjectId,
      name: value.name.trim(),
      description: value.description.trim(),
      monthlyFee: value.monthlyFee.trim(),
      capacity: value.capacity,
    };

    this.submitting.set(true);
    this.error.set('');
    this.success.set('');
    const groupId = this.groupId();
    const request = this.isCreating()
      ? this.learningService.createGroup(this.workspaceId, input)
      : groupId
        ? this.learningService.updateGroup(this.workspaceId, groupId, {
            ...input,
            status: value.status,
          } satisfies StudyGroupUpdate)
        : null;

    if (!request) {
      this.submitting.set(false);
      this.error.set('تعذر تحديد المجموعة المطلوبة.');
      return;
    }

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (savedGroup) => {
        this.submitting.set(false);
        this.group.set(savedGroup);
        this.isEditing.set(false);
        this.isCreating.set(false);
        this.success.set('تم حفظ بيانات المجموعة بنجاح.');
        if (!groupId) {
          void this.router.navigateByUrl(`/groups/${encodeURIComponent(savedGroup.id)}`);
        } else {
          this.loadGroupDetails(groupId);
        }
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(this.writeError(error, 'تعذر حفظ بيانات المجموعة.'));
      },
    });
  }

  openEnrollmentForm(): void {
    this.error.set('');
    this.success.set('');
    this.selectedStudent.set(null);
    this.enrollmentForm.reset({
      studentId: '',
      enrolledAt: '',
      notes: '',
      status: 'active',
    });
    this.enrollmentFormOpen.set(true);
    this.loadStudentOptions(1);
  }

  closeEnrollmentForm(): void {
    if (this.enrolling()) return;
    this.enrollmentFormOpen.set(false);
    this.selectedStudent.set(null);
  }

  loadStudentOptions(page: number): void {
    const groupId = this.groupId();
    if (!this.workspaceId || !groupId || !this.enrollmentFormOpen()) return;
    const requestId = ++this.studentOptionsRequest;
    this.studentsLoading.set(true);
    this.studentOptionsError.set('');
    this.peopleService
      .listStudents(this.workspaceId, {
        page,
        pageSize: this.studentPagination().pageSize,
        search: this.studentSearch.value.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.studentOptionsRequest) return;
          this.studentOptions.set(result.items);
          this.studentPagination.set(result.pagination);
          this.studentsLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.studentOptionsRequest) return;
          this.studentsLoading.set(false);
          this.studentOptionsError.set(getApiErrorMessage(error, 'تعذر تحميل الطلاب للاختيار.'));
        },
      });
  }

  changeStudentPage(page: number): void {
    const pagination = this.studentPagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.loadStudentOptions(page);
  }

  selectStudent(student: Student): void {
    this.selectedStudent.set(student);
    this.enrollmentForm.controls.studentId.setValue(student.id);
    this.enrollmentForm.controls.studentId.markAsTouched();
  }

  submitEnrollment(): void {
    this.enrollmentForm.markAllAsTouched();
    if (this.enrollmentForm.invalid || this.enrolling()) return;
    const groupId = this.groupId();
    if (!groupId) return;

    const value = this.enrollmentForm.getRawValue();
    let enrolledAt: string | undefined;
    if (value.enrolledAt) {
      const date = new Date(value.enrolledAt);
      if (!Number.isFinite(date.getTime())) {
        this.error.set('أدخل تاريخ تسجيل صحيحًا.');
        return;
      }
      enrolledAt = date.toISOString();
    }
    const input = {
      studentId: value.studentId,
      status: value.status,
      ...(enrolledAt ? { enrolledAt } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };

    this.enrolling.set(true);
    this.error.set('');
    this.success.set('');
    this.learningService
      .createEnrollment(this.workspaceId, groupId, input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enrolling.set(false);
          this.enrollmentFormOpen.set(false);
          this.success.set('تم تسجيل الطالب في المجموعة.');
          this.loadEnrollments();
          this.loadActiveEnrollmentCount(groupId);
        },
        error: (error: unknown) => {
          this.enrolling.set(false);
          this.error.set(this.writeError(error, 'تعذر تسجيل الطالب في المجموعة.'));
        },
      });
  }

  enrollmentStatusLabel(status: EnrollmentStatus): string {
    return ENROLLMENT_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  statusLabel(status: StudyGroupStatus): string {
    return GROUP_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  enrollmentActions(status: EnrollmentStatus): ReadonlyArray<{ value: EnrollmentStatus; label: string }> {
    if (status === 'active') {
      return [
        { value: 'paused', label: 'إيقاف مؤقت' },
        { value: 'completed', label: 'إنهاء التسجيل' },
        { value: 'cancelled', label: 'إلغاء التسجيل' },
      ];
    }
    if (status === 'paused') {
      return [
        { value: 'active', label: 'إعادة التفعيل' },
        { value: 'completed', label: 'إنهاء التسجيل' },
        { value: 'cancelled', label: 'إلغاء التسجيل' },
      ];
    }
    return [{ value: 'active', label: 'إعادة التفعيل' }];
  }

  changeEnrollmentStatus(row: GroupEnrollmentRow, status: EnrollmentStatus): void {
    if (this.updatingEnrollmentId()) return;
    const update: EnrollmentUpdate = { status };

    if (status === 'active') {
      update.endedAt = null;
    } else if (status === 'completed' || status === 'cancelled') {
      const enrolledAt = Date.parse(row.enrollment.enrolledAt);
      if (!Number.isFinite(enrolledAt) || enrolledAt > Date.now()) {
        this.error.set('لا يمكن إنهاء التسجيل قبل تاريخ بدايته.');
        return;
      }
      update.endedAt = new Date().toISOString();
    }

    this.updatingEnrollmentId.set(row.enrollment.id);
    this.error.set('');
    this.success.set('');
    this.learningService
      .updateEnrollment(this.workspaceId, row.enrollment.id, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.updatingEnrollmentId.set(null);
          this.success.set('تم تحديث حالة التسجيل.');
          this.loadEnrollments();
          const groupId = this.groupId();
          if (groupId) this.loadActiveEnrollmentCount(groupId);
        },
        error: (error: unknown) => {
          this.updatingEnrollmentId.set(null);
          this.error.set(this.writeError(error, 'تعذر تحديث حالة التسجيل.'));
        },
      });
  }

  changeEnrollmentPage(page: number): void {
    const pagination = this.enrollmentPagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.enrollmentPagination.update((value) => ({ ...value, page }));
    this.loadEnrollments(page);
  }

  private loadGroupDetails(groupId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.group.set(null);
    this.subject.set(null);
    this.activeEnrollmentCount.set(null);
    this.activeCountError.set('');
    this.learningService
      .getGroup(this.workspaceId, groupId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (group) => {
          if (requestId !== this.detailRequest) return;
          this.learningService
            .getSubject(this.workspaceId, group.subjectId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (subject) => {
                if (requestId !== this.detailRequest) return;
                this.group.set(group);
                this.subject.set(subject);
                this.selectedFormSubject.set(subject);
                this.detailsLoading.set(false);
                this.loadEnrollments();
                this.loadActiveEnrollmentCount(groupId);
              },
              error: (error: unknown) => {
                if (requestId !== this.detailRequest) return;
                this.detailsLoading.set(false);
                this.error.set(getApiErrorMessage(error, 'تعذر تحميل المادة المرتبطة بالمجموعة.'));
              },
            });
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequest) return;
          this.detailsLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات المجموعة.'));
        },
      });
  }

  private loadEnrollments(page = this.enrollmentPagination().page): void {
    const groupId = this.groupId();
    if (!this.workspaceId || !groupId) return;
    const requestId = ++this.rosterRequest;
    this.rosterLoading.set(true);
    this.rosterError.set('');
    const query: GroupEnrollmentQuery = {
      page,
      pageSize: this.enrollmentPagination().pageSize,
      status: this.enrollmentStatusFilter.value || undefined,
    };

    this.learningService
      .listGroupEnrollments(this.workspaceId, groupId, query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.rosterRequest) return;
          this.enrollmentPagination.set(result.pagination);
          if (result.items.length === 0) {
            this.enrollments.set([]);
            this.rosterLoading.set(false);
            return;
          }

          forkJoin(
            result.items.map((enrollment) =>
              this.peopleService
                .getStudent(this.workspaceId, enrollment.studentId)
                .pipe(map((student) => ({ enrollment, student }))),
            ),
          )
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (rows) => {
                if (requestId !== this.rosterRequest) return;
                this.enrollments.set(rows);
                this.rosterLoading.set(false);
              },
              error: (error: unknown) => {
                if (requestId !== this.rosterRequest) return;
                this.rosterLoading.set(false);
                this.rosterError.set(
                  getApiErrorMessage(error, 'تعذر تحميل بيانات الطلاب في سجل المجموعة.'),
                );
              },
            });
        },
        error: (error: unknown) => {
          if (requestId !== this.rosterRequest) return;
          this.rosterLoading.set(false);
          this.rosterError.set(getApiErrorMessage(error, 'تعذر تحميل سجل المجموعة.'));
        },
      });
  }

  private loadActiveEnrollmentCount(groupId: string): void {
    const requestId = ++this.activeCountRequest;
    this.activeCountLoading.set(true);
    this.activeCountError.set('');
    this.learningService
      .listGroupEnrollments(this.workspaceId, groupId, {
        page: 1,
        pageSize: 1,
        status: 'active',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.activeCountRequest) return;
          this.activeEnrollmentCount.set(result.pagination.totalItems);
          this.activeCountLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.activeCountRequest) return;
          this.activeCountLoading.set(false);
          this.activeCountError.set(
            getApiErrorMessage(error, 'تعذر تحميل عدد التسجيلات النشطة.'),
          );
        },
      });
  }

  private writeError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      const message = (error.error as { message?: unknown } | null)?.message;
      if (message === 'Study group is at capacity') {
        return 'لم تتم العملية لأن المجموعة وصلت إلى السعة المحددة.';
      }
      if (message === 'Capacity cannot be lower than the active enrollment count') {
        return 'لا يمكن خفض السعة عن عدد التسجيلات النشطة الحالي.';
      }
    }
    return getApiErrorMessage(error, fallback);
  }

  private emptyGroup(): {
    subjectId: string;
    name: string;
    description: string;
    monthlyFee: string;
    capacity: number | null;
    status: StudyGroupStatus;
  } {
    return {
      subjectId: '',
      name: '',
      description: '',
      monthlyFee: '',
      capacity: null,
      status: 'active',
    };
  }
}
