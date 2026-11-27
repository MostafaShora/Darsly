import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';
import {
  Session,
  SessionQuery,
  SessionStatus,
  SessionUpdate,
  SessionWrite,
  StudyGroup,
  StudyGroupQuery,
} from '../../core/models/learning.models';
import { LearningService } from '../../core/services/learning.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { WorkspaceSelectorComponent } from '../workspace/workspace-selector.component';
import {
  localDateBoundaryToIso,
  localDateTimeToIso,
  utcDateTimeToLocalInput,
} from '../../core/utils/local-date-time';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/components/custom-select/custom-select.component';

export {
  localDateBoundaryToIso,
  localDateTimeToIso,
  utcDateTimeToLocalInput,
} from '../../core/utils/local-date-time';

interface SessionListRow {
  session: Session;
  group: StudyGroup;
}

const SESSION_STATUSES: ReadonlyArray<{ value: SessionStatus; label: string }> = [
  { value: 'scheduled', label: 'مجدولة' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
];
const SESSION_DATE_FORMATTER = new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const MAX_CACHED_GROUPS = 40;

const sessionDateRangeValidator: ValidatorFn = (control) => {
  const start = control.get('startsAt')?.value;
  const end = control.get('endsAt')?.value;
  if (!start || !end) return null;
  if (typeof start !== 'string' || typeof end !== 'string') return { invalidSessionDate: true };

  const startsAt = localDateTimeToIso(start);
  const endsAt = localDateTimeToIso(end);
  if (!startsAt || !endsAt) return { invalidSessionDate: true };
  return Date.parse(endsAt) > Date.parse(startsAt) ? null : { endsAtNotAfterStartsAt: true };
};

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [CustomSelectComponent, ReactiveFormsModule, RouterLink, WorkspaceSelectorComponent],
  templateUrl: './sessions.component.html',
})
export class SessionsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = SESSION_STATUSES;
  readonly groupFilterSelectOptions = computed<CustomSelectOption[]>(() =>
    this.groupFilterOptions().map((item) => ({
      value: item.id,
      label: `${item.name} (${item.status === 'active' ? 'نشطة' : item.status === 'inactive' ? 'غير نشطة' : 'مؤرشفة'})`,
    })),
  );
  readonly groupSearch = new FormControl('', { nonNullable: true });
  readonly filters = this.formBuilder.nonNullable.group({
    groupId: [''],
    from: [''],
    to: [''],
    status: ['' as SessionStatus | ''],
  });
  readonly sessionForm = this.formBuilder.nonNullable.group(
    {
      groupId: ['', Validators.required],
      title: ['', Validators.maxLength(150)],
      startsAt: ['', Validators.required],
      endsAt: ['', Validators.required],
      status: ['scheduled' as SessionStatus, Validators.required],
      notes: ['', Validators.maxLength(2000)],
    },
    { validators: sessionDateRangeValidator },
  );

  readonly sessionId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly isEditing = signal(false);
  readonly isDetailView = computed(() => this.isCreating() || !!this.sessionId());
  readonly session = signal<Session | null>(null);
  readonly group = signal<StudyGroup | null>(null);
  readonly rows = signal<SessionListRow[]>([]);
  readonly groups = signal<StudyGroup[]>([]);
  readonly selectedFilterGroup = signal<StudyGroup | null>(null);
  readonly selectedFormGroup = signal<StudyGroup | null>(null);
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly groupPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly groupsLoading = signal(false);
  readonly workspaceLoading = signal(true);
  readonly hasWorkspace = signal(false);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly groupOptionsError = signal('');
  readonly success = signal('');

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;
  private groupOptionsRequest = 0;
  private readonly groupCache = new Map<string, StudyGroup>();

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('sessionId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((routeId) => {
        this.isCreating.set(routeId === 'new');
        this.sessionId.set(routeId && routeId !== 'new' ? routeId : null);
        this.isEditing.set(routeId === 'new');
        this.success.set('');
        if (this.workspaceId) this.loadCurrentRoute();
      });

    this.groupSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadGroupOptions(1));

    this.filters.controls.groupId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((groupId) => {
        this.selectedFilterGroup.set(
          this.groups().find((item) => item.id === groupId) ??
            (this.selectedFilterGroup()?.id === groupId ? this.selectedFilterGroup() : null),
        );
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
          this.loadGroupOptions(1);
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
      this.session.set(null);
      this.group.set(null);
      this.selectedFormGroup.set(null);
      this.sessionForm.reset(this.emptySessionForm());
      this.detailsLoading.set(false);
      return;
    }

    const id = this.sessionId();
    if (id) {
      this.loadSessionDetails(id);
      return;
    }

    this.session.set(null);
    this.loadSessions();
  }

  loadSessions(page = this.pagination().page): void {
    if (!this.workspaceId || this.isDetailView()) return;

    const fromValue = this.filters.controls.from.value;
    const toValue = this.filters.controls.to.value;
    const from = fromValue ? localDateBoundaryToIso(fromValue) : null;
    const to = toValue ? localDateBoundaryToIso(toValue, true) : null;
    if ((fromValue && !from) || (toValue && !to)) {
      this.error.set('تعذر تفسير أحد التاريخين بالتوقيت المحلي للمتصفح.');
      return;
    }
    if (from && to && fromValue > toValue) {
      this.error.set('يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.');
      return;
    }

    const requestId = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    const query: SessionQuery = {
      page,
      pageSize: this.pagination().pageSize,
      groupId: this.filters.controls.groupId.value || undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      status: this.filters.controls.status.value || undefined,
    };

    this.learningService
      .listSessions(this.workspaceId, query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.listRequest) return;
          this.pagination.set(result.pagination);
          if (result.items.length === 0) {
            this.rows.set([]);
            this.loading.set(false);
            return;
          }

          const groupIds = [...new Set(result.items.map((item) => item.groupId))];
          forkJoin(groupIds.map((groupId) => this.getGroup(groupId)))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (groups) => {
                if (requestId !== this.listRequest) return;
                const groupsById = new Map(groups.map((item) => [item.id, item]));
                const rows: SessionListRow[] = [];
                for (const session of result.items) {
                  const group = groupsById.get(session.groupId);
                  if (!group) {
                    this.loading.set(false);
                    this.error.set('تعذر مطابقة إحدى المجموعات المرتبطة بالجلسات.');
                    return;
                  }
                  rows.push({ session, group });
                }
                this.rows.set(rows);
                this.loading.set(false);
              },
              error: (error: unknown) => {
                if (requestId !== this.listRequest) return;
                this.loading.set(false);
                this.error.set(getApiErrorMessage(error, 'تعذر تحميل أسماء مجموعات الجلسات.'));
              },
            });
        },
        error: (error: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل قائمة الجلسات.'));
        },
      });
  }

  applyFilters(): void {
    this.pagination.update((value) => ({ ...value, page: 1 }));
    this.loadSessions(1);
  }

  changePage(page: number): void {
    const pagination = this.pagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadSessions(page);
  }

  loadGroupOptions(page: number): void {
    if (!this.workspaceId) return;
    const requestId = ++this.groupOptionsRequest;
    this.groupsLoading.set(true);
    this.groupOptionsError.set('');
    const query: StudyGroupQuery = {
      page,
      pageSize: this.groupPagination().pageSize,
      search: this.groupSearch.value.trim() || undefined,
    };
    this.learningService
      .listGroups(this.workspaceId, query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.groupOptionsRequest) return;
          this.groups.set(result.items);
          this.groupPagination.set(result.pagination);
          for (const group of result.items) this.rememberGroup(group);
          const selectedFilterId = this.filters.controls.groupId.value;
          if (selectedFilterId) {
            const selected = result.items.find((item) => item.id === selectedFilterId);
            if (selected) this.selectedFilterGroup.set(selected);
          }
          this.groupsLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.groupOptionsRequest) return;
          this.groupsLoading.set(false);
          this.groupOptionsError.set(getApiErrorMessage(error, 'تعذر تحميل المجموعات للاختيار.'));
        },
      });
  }

  groupFilterOptions(): StudyGroup[] {
    const selected = this.selectedFilterGroup();
    return selected && !this.groups().some((item) => item.id === selected.id)
      ? [selected, ...this.groups()]
      : this.groups();
  }

  groupFormOptions(): StudyGroup[] {
    const selected = this.selectedFormGroup();
    return selected && !this.groups().some((item) => item.id === selected.id)
      ? [selected, ...this.groups()]
      : this.groups();
  }

  changeGroupOptionsPage(page: number): void {
    const pagination = this.groupPagination();
    if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
    this.loadGroupOptions(page);
  }

  selectFormGroup(group: StudyGroup): void {
    this.selectedFormGroup.set(group);
    this.sessionForm.controls.groupId.setValue(group.id);
    this.sessionForm.controls.groupId.markAsTouched();
  }

  beginEdit(): void {
    const session = this.session();
    const group = this.group();
    if (!session || !group) return;
    const startsAt = utcDateTimeToLocalInput(session.startsAt);
    const endsAt = utcDateTimeToLocalInput(session.endsAt);
    if (!startsAt || !endsAt) {
      this.error.set('تعذر عرض أوقات الجلسة المحفوظة بالتوقيت المحلي.');
      return;
    }
    this.selectedFormGroup.set(group);
    this.sessionForm.reset({
      groupId: session.groupId,
      title: session.title,
      startsAt,
      endsAt,
      status: session.status,
      notes: session.notes,
    });
    this.isEditing.set(true);
    this.success.set('');
    this.error.set('');
  }

  cancelEdit(): void {
    if (this.isCreating()) {
      void this.router.navigateByUrl('/sessions');
      return;
    }
    this.isEditing.set(false);
    this.error.set('');
  }

  submitSession(): void {
    this.error.set('');
    this.sessionForm.markAllAsTouched();
    if (this.sessionForm.invalid || this.submitting()) {
      if (this.sessionForm.hasError('invalidSessionDate')) {
        this.error.set('أدخل تاريخي بداية ونهاية صحيحين بالتوقيت المحلي.');
      } else if (this.sessionForm.hasError('endsAtNotAfterStartsAt')) {
        this.error.set('يجب أن يكون وقت النهاية بعد وقت البداية.');
      }
      return;
    }

    const value = this.sessionForm.getRawValue();
    const startsAt = localDateTimeToIso(value.startsAt);
    const endsAt = localDateTimeToIso(value.endsAt);
    if (!startsAt || !endsAt) {
      this.error.set('أدخل تاريخي بداية ونهاية صحيحين بالتوقيت المحلي.');
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.success.set('');
    const sessionId = this.sessionId();
    const request = this.isCreating()
      ? this.learningService.createSession(this.workspaceId, {
          groupId: value.groupId,
          startsAt,
          endsAt,
          ...(value.title.trim() ? { title: value.title.trim() } : {}),
          ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
        } satisfies SessionWrite)
      : sessionId
        ? this.createSessionUpdateRequest(sessionId, value)
        : null;

    if (!request) {
      this.submitting.set(false);
      if (!this.error()) this.error.set('تعذر تحديد الجلسة المطلوبة.');
      return;
    }

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (savedSession) => {
        this.submitting.set(false);
        this.session.set(savedSession);
        this.isCreating.set(false);
        this.isEditing.set(false);
        this.success.set('تم حفظ بيانات الجلسة بنجاح.');
        this.getGroup(savedSession.groupId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (group) => {
              this.group.set(group);
              this.selectedFormGroup.set(group);
              if (!sessionId) {
                void this.router.navigateByUrl(`/sessions/${encodeURIComponent(savedSession.id)}`);
              }
            },
            error: (error: unknown) => {
              this.error.set(
                getApiErrorMessage(error, 'تم حفظ الجلسة لكن تعذر تحميل بيانات مجموعتها.'),
              );
            },
          });
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(this.sessionWriteError(error, 'تعذر حفظ بيانات الجلسة.'));
      },
    });
  }

  statusLabel(status: SessionStatus): string {
    return SESSION_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  formatSessionDateTime(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'تاريخ غير صالح';
    return SESSION_DATE_FORMATTER.format(date);
  }

  groupStatusLabel(group: StudyGroup): string {
    if (group.status === 'active') return 'نشطة';
    return group.status === 'inactive' ? 'غير نشطة' : 'مؤرشفة';
  }

  private createSessionUpdateRequest(
    sessionId: string,
    value: ReturnType<typeof this.sessionForm.getRawValue>,
  ): Observable<Session> | null {
    const update: SessionUpdate = {};
    if (this.sessionForm.controls.title.dirty) update.title = value.title.trim();
    if (this.sessionForm.controls.startsAt.dirty) {
      const startsAt = localDateTimeToIso(value.startsAt);
      if (!startsAt) {
        this.error.set('أدخل وقت بداية صحيحًا بالتوقيت المحلي.');
        return null;
      }
      update.startsAt = startsAt;
    }
    if (this.sessionForm.controls.endsAt.dirty) {
      const endsAt = localDateTimeToIso(value.endsAt);
      if (!endsAt) {
        this.error.set('أدخل وقت نهاية صحيحًا بالتوقيت المحلي.');
        return null;
      }
      update.endsAt = endsAt;
    }
    if (this.sessionForm.controls.status.dirty) update.status = value.status;
    if (this.sessionForm.controls.notes.dirty) update.notes = value.notes.trim();
    if (Object.keys(update).length === 0) {
      this.error.set('لم يتم تغيير أي بيانات لحفظها.');
      return null;
    }
    return this.learningService.updateSession(this.workspaceId, sessionId, update);
  }

  private loadSessionDetails(sessionId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.session.set(null);
    this.group.set(null);
    this.learningService
      .getSession(this.workspaceId, sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          if (requestId !== this.detailRequest) return;
          this.getGroup(session.groupId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (group) => {
                if (requestId !== this.detailRequest) return;
                this.session.set(session);
                this.group.set(group);
                this.selectedFormGroup.set(group);
                this.detailsLoading.set(false);
              },
              error: (error: unknown) => {
                if (requestId !== this.detailRequest) return;
                this.detailsLoading.set(false);
                this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات مجموعة الجلسة.'));
              },
            });
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequest) return;
          this.detailsLoading.set(false);
          this.error.set(getApiErrorMessage(error, 'تعذر تحميل بيانات الجلسة.'));
        },
      });
  }

  private getGroup(groupId: string): Observable<StudyGroup> {
    const cached = this.groupCache.get(groupId);
    if (cached) return of(cached);
    return this.learningService.getGroup(this.workspaceId, groupId).pipe(
      tap((group) => this.rememberGroup(group)),
    );
  }

  private rememberGroup(group: StudyGroup): void {
    if (!this.groupCache.has(group.id) && this.groupCache.size >= MAX_CACHED_GROUPS) {
      const oldest = this.groupCache.keys().next();
      if (!oldest.done) this.groupCache.delete(oldest.value);
    }
    this.groupCache.set(group.id, group);
  }

  private sessionWriteError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (
        body &&
        typeof body === 'object' &&
        'message' in body &&
        body.message === 'An attended session cannot be moved into the future'
      ) {
        return 'لا يمكن نقل بداية جلسة مسجل بها حضور إلى وقت مستقبلي.';
      }
    }
    return getApiErrorMessage(error, fallback);
  }

  private resetWorkspaceData(): void {
    this.listRequest += 1;
    this.detailRequest += 1;
    this.groupOptionsRequest += 1;
    this.groupCache.clear();
    this.session.set(null);
    this.group.set(null);
    this.rows.set([]);
    this.groups.set([]);
    this.selectedFilterGroup.set(null);
    this.selectedFormGroup.set(null);
    this.filters.controls.groupId.setValue('', { emitEvent: false });
    this.pagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.groupPagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.sessionForm.reset(this.emptySessionForm());
    this.loading.set(false);
    this.detailsLoading.set(false);
    this.groupsLoading.set(false);
    this.error.set('');
    this.groupOptionsError.set('');
    this.success.set('');
  }

  private emptySessionForm(): {
    groupId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: SessionStatus;
    notes: string;
  } {
    return {
      groupId: '',
      title: '',
      startsAt: '',
      endsAt: '',
      status: 'scheduled',
      notes: '',
    };
  }
}
