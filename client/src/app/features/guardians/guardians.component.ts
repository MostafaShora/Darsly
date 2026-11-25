import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { RELATIONSHIP_OPTIONS } from '../../core/models/people.constants';
import { Guardian, GuardianWrite, RelationshipType } from '../../core/models/people.models';
import { PeopleService } from '../../core/services/people.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { WorkspaceSelectorComponent } from '../workspace/workspace-selector.component';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { trimmedMinLength, trimmedRequired } from '../../core/utils/form-validators';

@Component({
  selector: 'app-guardians',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, WorkspaceSelectorComponent],
  templateUrl: './guardians.component.html',
})
export class GuardiansComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly peopleService = inject(PeopleService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly relationships = RELATIONSHIP_OPTIONS;
  readonly search = new FormControl('', { nonNullable: true });
  readonly guardianForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, trimmedMinLength(2), Validators.maxLength(120)]],
    phone: ['', [Validators.required, trimmedRequired, Validators.maxLength(25)]],
    alternatePhone: ['', Validators.maxLength(25)],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    relationship: ['other' as RelationshipType, Validators.required],
    notes: ['', Validators.maxLength(2000)],
  });

  readonly guardianId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly isEditing = signal(false);
  readonly isDetailView = computed(() => this.isCreating() || !!this.guardianId());
  readonly guardian = signal<Guardian | null>(null);
  readonly guardians = signal<Guardian[]>([]);
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly submitting = signal(false);
  readonly workspaceLoading = signal(true);
  readonly hasWorkspace = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('guardianId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((routeId) => {
        this.isCreating.set(routeId === 'new');
        this.guardianId.set(routeId && routeId !== 'new' ? routeId : null);
        this.isEditing.set(routeId === 'new');
        this.success.set('');
        if (this.workspaceId) this.loadCurrentRoute();
      });

    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagination.update((value) => ({ ...value, page: 1 }));
        this.loadGuardians();
      });

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
      this.guardian.set(null);
      this.guardianForm.reset(this.emptyGuardian());
      this.detailsLoading.set(false);
      return;
    }

    const id = this.guardianId();
    if (id) {
      this.loadGuardianDetails(id);
      return;
    }

    this.guardian.set(null);
    this.loadGuardians();
  }

  loadGuardians(page = this.pagination().page): void {
    if (!this.workspaceId || this.isDetailView()) return;

    const requestId = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    this.peopleService
      .listGuardians(this.workspaceId, {
        page,
        pageSize: this.pagination().pageSize,
        search: this.search.value.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.listRequest) return;
          this.guardians.set(result.items);
          this.pagination.set(result.pagination);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل قائمة أولياء الأمور.'));
        },
      });
  }

  changePage(page: number): void {
    const pagination = this.pagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadGuardians(page);
  }

  beginEdit(): void {
    const guardian = this.guardian();
    if (!guardian) return;
    this.guardianForm.reset({
      name: guardian.name,
      phone: guardian.phone,
      alternatePhone: guardian.alternatePhone ?? '',
      email: guardian.email ?? '',
      relationship: guardian.relationship,
      notes: guardian.notes,
    });
    this.isEditing.set(true);
    this.success.set('');
  }

  cancelEdit(): void {
    if (this.isCreating()) {
      void this.router.navigateByUrl('/guardians');
      return;
    }
    this.isEditing.set(false);
    this.error.set('');
  }

  submitGuardian(): void {
    this.guardianForm.markAllAsTouched();
    if (this.guardianForm.invalid || this.submitting()) return;

    const value = this.guardianForm.getRawValue();
    const input: GuardianWrite = {
      name: value.name.trim(),
      phone: value.phone.trim(),
      alternatePhone: value.alternatePhone.trim() || null,
      email: value.email.trim().toLowerCase() || null,
      relationship: value.relationship,
      notes: value.notes.trim(),
    };

    this.submitting.set(true);
    this.error.set('');
    this.success.set('');
    const guardianId = this.guardianId();
    const request = this.isCreating()
      ? this.peopleService.createGuardian(this.workspaceId, input)
      : guardianId
        ? this.peopleService.updateGuardian(this.workspaceId, guardianId, input)
        : null;

    if (!request) {
      this.submitting.set(false);
      this.error.set('تعذر تحديد ولي الأمر المطلوب.');
      return;
    }

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (savedGuardian) => {
        this.submitting.set(false);
        this.guardian.set(savedGuardian);
        this.isEditing.set(false);
        this.isCreating.set(false);
        this.success.set('تم حفظ بيانات ولي الأمر بنجاح.');
        if (!guardianId) {
          void this.router.navigateByUrl(`/guardians/${encodeURIComponent(savedGuardian.id)}`);
        }
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(getApiErrorMessage(error, 'تعذر حفظ بيانات ولي الأمر.'));
      },
    });
  }

  relationshipLabel(relationship: RelationshipType): string {
    return RELATIONSHIP_OPTIONS.find((item) => item.value === relationship)?.label ?? relationship;
  }

  private loadGuardianDetails(guardianId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.guardian.set(null);
    this.peopleService
      .getGuardian(this.workspaceId, guardianId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (guardian) => {
          if (requestId !== this.detailRequest) return;
          this.guardian.set(guardian);
          this.detailsLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequest) return;
          this.detailsLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات ولي الأمر.'));
        },
      });
  }

  private resetWorkspaceData(): void {
    this.listRequest += 1;
    this.detailRequest += 1;
    this.guardian.set(null);
    this.guardians.set([]);
    this.pagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.guardianForm.reset(this.emptyGuardian());
    this.loading.set(false);
    this.detailsLoading.set(false);
    this.error.set('');
    this.success.set('');
  }

  private emptyGuardian(): {
    name: string;
    phone: string;
    alternatePhone: string;
    email: string;
    relationship: RelationshipType;
    notes: string;
  } {
    return {
      name: '',
      phone: '',
      alternatePhone: '',
      email: '',
      relationship: 'other',
      notes: '',
    };
  }
}
