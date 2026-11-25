import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { RELATIONSHIP_OPTIONS, STUDENT_STATUS_OPTIONS } from '../../core/models/people.constants';
import {
  Guardian,
  RelationshipType,
  Student,
  StudentGuardianLink,
  StudentStatus,
  StudentWrite,
} from '../../core/models/people.models';
import { trimmedMinLength } from '../../core/utils/form-validators';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { PeopleService } from '../../core/services/people.service';
import { WorkspaceService } from '../../core/services/workspace.service';

@Component({
  selector: 'app-students',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './students.component.html',
})
export class StudentsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly peopleService = inject(PeopleService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = STUDENT_STATUS_OPTIONS;
  readonly relationships = RELATIONSHIP_OPTIONS;
  readonly search = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<StudentStatus | ''>('', { nonNullable: true });
  readonly guardianSearch = new FormControl('', { nonNullable: true });
  readonly studentForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, trimmedMinLength(2), Validators.maxLength(120)]],
    phone: ['', Validators.maxLength(25)],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    schoolName: ['', Validators.maxLength(150)],
    grade: ['', Validators.maxLength(80)],
    status: ['active' as StudentStatus, Validators.required],
    notes: ['', Validators.maxLength(2000)],
  });
  readonly linkForm = this.formBuilder.nonNullable.group({
    guardianId: ['', Validators.required],
    relationship: ['other' as RelationshipType, Validators.required],
    isPrimary: [false],
    receivesNotifications: [true],
  });
  readonly linkEditForm = this.formBuilder.nonNullable.group({
    relationship: ['other' as RelationshipType, Validators.required],
    isPrimary: [false],
    receivesNotifications: [true],
  });

  readonly studentId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly isEditing = signal(false);
  readonly isDetailView = computed(() => this.isCreating() || !!this.studentId());
  readonly student = signal<Student | null>(null);
  readonly students = signal<Student[]>([]);
  readonly guardians = signal<StudentGuardianLink[]>([]);
  readonly guardianOptions = signal<Guardian[]>([]);
  readonly selectedLink = signal<StudentGuardianLink | null>(null);
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly guardianPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly guardiansLoading = signal(false);
  readonly guardianLinksLoading = signal(false);
  readonly workspaceLoading = signal(true);
  readonly hasWorkspace = signal(false);
  readonly submitting = signal(false);
  readonly linking = signal(false);
  readonly savingLink = signal(false);
  readonly removingGuardianId = signal<string | null>(null);
  readonly linkFormOpen = signal(false);
  readonly linkEditOpen = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;
  private guardianRequest = 0;
  private guardianOptionsRequest = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('studentId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((routeId) => {
        this.isCreating.set(routeId === 'new');
        this.studentId.set(routeId && routeId !== 'new' ? routeId : null);
        this.isEditing.set(routeId === 'new');
        this.linkFormOpen.set(false);
        this.linkEditOpen.set(false);
        this.success.set('');
        if (this.workspaceId) this.loadCurrentRoute();
      });

    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadStudents();
      });

    this.statusFilter.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadStudents();
      });

    this.guardianSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadGuardianOptions(1));

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
      this.student.set(null);
      this.guardians.set([]);
      this.studentForm.reset(this.emptyStudent());
      this.detailsLoading.set(false);
      return;
    }

    const id = this.studentId();
    if (id) {
      this.loadStudentDetails(id);
      return;
    }

    this.student.set(null);
    this.loadStudents();
  }

  loadStudents(page = this.pagination().page): void {
    if (!this.workspaceId || this.isDetailView()) return;

    const requestId = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    this.peopleService
      .listStudents(this.workspaceId, {
        page,
        pageSize: this.pagination().pageSize,
        search: this.search.value.trim() || undefined,
        status: this.statusFilter.value || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.listRequest) return;
          this.students.set(result.items);
          this.pagination.set(result.pagination);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل قائمة الطلاب.'));
        },
      });
  }

  changePage(page: number): void {
    const pagination = this.pagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadStudents(page);
  }

  beginEdit(): void {
    const student = this.student();
    if (!student) return;
    this.studentForm.reset({
      name: student.name,
      phone: student.phone ?? '',
      email: student.email ?? '',
      schoolName: student.schoolName,
      grade: student.grade,
      status: student.status,
      notes: student.notes,
    });
    this.isEditing.set(true);
    this.success.set('');
  }

  cancelEdit(): void {
    if (this.isCreating()) {
      void this.router.navigateByUrl('/students');
      return;
    }
    this.isEditing.set(false);
    this.error.set('');
  }

  submitStudent(): void {
    this.studentForm.markAllAsTouched();
    if (this.studentForm.invalid || this.submitting()) return;

    const value = this.studentForm.getRawValue();
    const input: StudentWrite = {
      name: value.name.trim(),
      phone: value.phone.trim() || null,
      email: value.email.trim().toLowerCase() || null,
      schoolName: value.schoolName.trim(),
      grade: value.grade.trim(),
      status: value.status,
      notes: value.notes.trim(),
    };

    this.submitting.set(true);
    this.error.set('');
    this.success.set('');
    const studentId = this.studentId();
    const request = this.isCreating()
      ? this.peopleService.createStudent(this.workspaceId, input)
      : studentId
        ? this.peopleService.updateStudent(this.workspaceId, studentId, input)
        : null;

    if (!request) {
      this.submitting.set(false);
      this.error.set('تعذر تحديد الطالب المطلوب.');
      return;
    }

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (savedStudent) => {
        this.submitting.set(false);
        this.student.set(savedStudent);
        this.isEditing.set(false);
        this.isCreating.set(false);
        this.success.set('تم حفظ بيانات الطالب بنجاح.');
        if (studentId) {
          this.loadStudentGuardians(studentId);
        } else {
          void this.router.navigateByUrl(`/students/${encodeURIComponent(savedStudent.id)}`);
        }
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(getApiErrorMessage(error, 'تعذر حفظ بيانات الطالب.'));
      },
    });
  }

  openLinkForm(): void {
    this.error.set('');
    this.success.set('');
    this.selectedLink.set(null);
    this.linkForm.reset({
      guardianId: '',
      relationship: 'other',
      isPrimary: false,
      receivesNotifications: true,
    });
    this.linkEditOpen.set(false);
    this.linkFormOpen.set(true);
    this.loadGuardianOptions(1);
  }

  selectGuardian(guardian: Guardian): void {
    if (this.isGuardianLinked(guardian.id)) {
      this.linkForm.controls.guardianId.setValue('');
      this.linkForm.controls.guardianId.markAsTouched();
      this.error.set('ولي الأمر مرتبط بالفعل بهذا الطالب.');
      return;
    }

    this.linkForm.controls.guardianId.setValue(guardian.id);
    this.linkForm.controls.guardianId.markAsTouched();
  }

  isGuardianLinked(guardianId: string): boolean {
    return this.guardians().some((link) => link.guardian.id === guardianId);
  }

  selectedGuardianName(): string {
    const selectedId = this.linkForm.controls.guardianId.value;
    return this.guardianOptions().find((guardian) => guardian.id === selectedId)?.name ?? '';
  }

  loadGuardianOptions(page: number): void {
    if (!this.workspaceId || !this.linkFormOpen()) return;
    const requestId = ++this.guardianOptionsRequest;
    this.guardiansLoading.set(true);
    this.peopleService
      .listGuardians(this.workspaceId, {
        page,
        pageSize: this.guardianPagination().pageSize,
        search: this.guardianSearch.value.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.guardianOptionsRequest) return;
          this.guardianOptions.set(result.items);
          this.guardianPagination.set(result.pagination);
          this.guardiansLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.guardianOptionsRequest) return;
          this.guardiansLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل قائمة أولياء الأمور.'));
        },
      });
  }

  changeGuardianPage(page: number): void {
    const pagination = this.guardianPagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.loadGuardianOptions(page);
  }

  linkSelectedGuardian(): void {
    this.linkForm.markAllAsTouched();
    if (this.linkForm.invalid || this.linking()) return;
    const studentId = this.studentId();
    if (!studentId) return;
    const guardianId = this.linkForm.controls.guardianId.value;
    if (this.isGuardianLinked(guardianId)) {
      this.error.set('ولي الأمر مرتبط بالفعل بهذا الطالب.');
      return;
    }

    this.linking.set(true);
    this.error.set('');
    this.success.set('');
    this.peopleService
      .linkGuardian(this.workspaceId, studentId, this.linkForm.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (link) => {
          this.linking.set(false);
          this.guardians.update((current) =>
            current.some((existing) => existing.guardian.id === link.guardian.id)
              ? current
              : [...current, link],
          );
          this.linkFormOpen.set(false);
          this.success.set('تم ربط ولي الأمر بالطالب.');
          this.loadStudentGuardians(studentId);
        },
        error: (error: unknown) => {
          this.linking.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر ربط ولي الأمر.'));
        },
      });
  }

  editRelationship(link: StudentGuardianLink): void {
    this.selectedLink.set(link);
    this.linkEditForm.reset({
      relationship: link.relationship,
      isPrimary: link.isPrimary,
      receivesNotifications: link.receivesNotifications,
    });
    this.linkFormOpen.set(false);
    this.linkEditOpen.set(true);
    this.error.set('');
  }

  saveRelationship(): void {
    this.linkEditForm.markAllAsTouched();
    if (this.linkEditForm.invalid || this.savingLink()) return;
    const studentId = this.studentId();
    const link = this.selectedLink();
    if (!studentId || !link) return;

    this.savingLink.set(true);
    this.error.set('');
    this.peopleService
      .updateStudentGuardian(
        this.workspaceId,
        studentId,
        link.guardian.id,
        this.linkEditForm.getRawValue(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savingLink.set(false);
          this.linkEditOpen.set(false);
          this.selectedLink.set(null);
          this.success.set('تم تحديث علاقة ولي الأمر.');
          this.loadStudentGuardians(studentId);
        },
        error: (error: unknown) => {
          this.savingLink.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحديث العلاقة.'));
        },
      });
  }

  removeRelationship(link: StudentGuardianLink): void {
    const confirmed = window.confirm(
      `هل تريد إزالة ${link.guardian.name} من قائمة أولياء هذا الطالب؟`,
    );
    const studentId = this.studentId();
    if (!confirmed || !studentId || this.removingGuardianId()) return;

    this.removingGuardianId.set(link.guardian.id);
    this.error.set('');
    this.success.set('');
    this.peopleService
      .unlinkGuardian(this.workspaceId, studentId, link.guardian.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingGuardianId.set(null);
          this.success.set('تمت إزالة العلاقة. لم يتم حذف ملف ولي الأمر.');
          this.loadStudentGuardians(studentId);
        },
        error: (error: unknown) => {
          this.removingGuardianId.set(null);
          this.error.set(getApiErrorMessage(error, 'تعذر إزالة العلاقة.'));
        },
      });
  }

  closeRelationshipForms(): void {
    this.linkFormOpen.set(false);
    this.linkEditOpen.set(false);
    this.selectedLink.set(null);
  }

  statusLabel(status: StudentStatus): string {
    return STUDENT_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
  }

  relationshipLabel(relationship: RelationshipType): string {
    return RELATIONSHIP_OPTIONS.find((item) => item.value === relationship)?.label ?? relationship;
  }

  private loadStudentDetails(studentId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.student.set(null);
    this.peopleService
      .getStudent(this.workspaceId, studentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (student) => {
          if (requestId !== this.detailRequest) return;
          this.student.set(student);
          this.detailsLoading.set(false);
          this.loadStudentGuardians(studentId);
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequest) return;
          this.detailsLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات الطالب.'));
        },
      });
  }

  private loadStudentGuardians(studentId: string): void {
    const requestId = ++this.guardianRequest;
    this.guardianLinksLoading.set(true);
    this.peopleService
      .listStudentGuardians(this.workspaceId, studentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (guardians) => {
          if (requestId === this.guardianRequest) {
            this.guardians.set(guardians);
            this.guardianLinksLoading.set(false);
          }
        },
        error: (error: unknown) => {
          if (requestId === this.guardianRequest) {
            this.guardianLinksLoading.set(false);
            this.error.set(getApiErrorMessage(error, 'تعذر تحميل روابط أولياء الأمور.'));
          }
        },
      });
  }

  private emptyStudent(): {
    name: string;
    phone: string;
    email: string;
    schoolName: string;
    grade: string;
    status: StudentStatus;
    notes: string;
  } {
    return {
      name: '',
      phone: '',
      email: '',
      schoolName: '',
      grade: '',
      status: 'active',
      notes: '',
    };
  }
}
