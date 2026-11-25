import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import {
  Subject,
  SubjectStatus,
  SubjectUpdate,
  SubjectWrite,
} from '../../core/models/learning.models';
import { LearningService } from '../../core/services/learning.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { trimmedMinLength } from '../../core/utils/form-validators';

const SUBJECT_STATUSES: ReadonlyArray<{ value: SubjectStatus; label: string }> = [
  { value: 'active', label: 'نشطة' },
  { value: 'archived', label: 'مؤرشفة' },
];

@Component({
  selector: 'app-subjects',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './subjects.component.html',
})
export class SubjectsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = SUBJECT_STATUSES;
  readonly search = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<SubjectStatus | ''>('', { nonNullable: true });
  readonly subjectForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, trimmedMinLength(2), Validators.maxLength(100)]],
    description: ['', Validators.maxLength(1000)],
    status: ['active' as SubjectStatus, Validators.required],
  });

  readonly subjectId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly isEditing = signal(false);
  readonly isDetailView = computed(() => this.isCreating() || !!this.subjectId());
  readonly subject = signal<Subject | null>(null);
  readonly subjects = signal<Subject[]>([]);
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly workspaceLoading = signal(true);
  readonly hasWorkspace = signal(false);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('subjectId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((routeId) => {
        this.isCreating.set(routeId === 'new');
        this.subjectId.set(routeId && routeId !== 'new' ? routeId : null);
        this.isEditing.set(routeId === 'new');
        this.success.set('');
        if (this.workspaceId) this.loadCurrentRoute();
      });

    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadSubjects();
      });

    this.statusFilter.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadSubjects();
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
      this.subject.set(null);
      this.subjectForm.reset(this.emptySubject());
      this.detailsLoading.set(false);
      return;
    }

    const id = this.subjectId();
    if (id) {
      this.loadSubjectDetails(id);
      return;
    }

    this.subject.set(null);
    this.loadSubjects();
  }

  loadSubjects(page = this.pagination().page): void {
    if (!this.workspaceId || this.isDetailView()) return;

    const requestId = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    this.learningService
      .listSubjects(this.workspaceId, {
        page,
        pageSize: this.pagination().pageSize,
        search: this.search.value.trim() || undefined,
        status: this.statusFilter.value || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.listRequest) return;
          this.subjects.set(result.items);
          this.pagination.set(result.pagination);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل قائمة المواد.'));
        },
      });
  }

  changePage(page: number): void {
    const pagination = this.pagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadSubjects(page);
  }

  beginEdit(): void {
    const subject = this.subject();
    if (!subject) return;
    this.subjectForm.reset({
      name: subject.name,
      description: subject.description,
      status: subject.status,
    });
    this.isEditing.set(true);
    this.success.set('');
  }

  cancelEdit(): void {
    if (this.isCreating()) {
      void this.router.navigateByUrl('/subjects');
      return;
    }
    this.isEditing.set(false);
    this.error.set('');
  }

  submitSubject(): void {
    this.subjectForm.markAllAsTouched();
    if (this.subjectForm.invalid || this.submitting()) return;

    const value = this.subjectForm.getRawValue();
    const input: SubjectWrite = {
      name: value.name.trim(),
      description: value.description.trim(),
    };

    this.submitting.set(true);
    this.error.set('');
    this.success.set('');
    const subjectId = this.subjectId();
    const request = this.isCreating()
      ? this.learningService.createSubject(this.workspaceId, input)
      : subjectId
        ? this.learningService.updateSubject(this.workspaceId, subjectId, {
            ...input,
            status: value.status,
          } satisfies SubjectUpdate)
        : null;

    if (!request) {
      this.submitting.set(false);
      this.error.set('تعذر تحديد المادة المطلوبة.');
      return;
    }

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (savedSubject) => {
        this.submitting.set(false);
        this.subject.set(savedSubject);
        this.isEditing.set(false);
        this.isCreating.set(false);
        this.success.set('تم حفظ بيانات المادة بنجاح.');
        if (!subjectId) {
          void this.router.navigateByUrl(`/subjects/${encodeURIComponent(savedSubject.id)}`);
        }
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(getApiErrorMessage(error, 'تعذر حفظ بيانات المادة.'));
      },
    });
  }

  statusLabel(status: SubjectStatus): string {
    return SUBJECT_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  private loadSubjectDetails(subjectId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.subject.set(null);
    this.learningService
      .getSubject(this.workspaceId, subjectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subject) => {
          if (requestId !== this.detailRequest) return;
          this.subject.set(subject);
          this.detailsLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequest) return;
          this.detailsLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات المادة.'));
        },
      });
  }

  private emptySubject(): { name: string; description: string; status: SubjectStatus } {
    return { name: '', description: '', status: 'active' };
  }
}
