import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { map, switchMap, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { Workspace } from '../../core/models/workspace.models';
import {
  WorkspaceAccessState,
  WorkspaceActivationVerificationError,
  WorkspaceService,
} from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { trimmedMinLength, trimmedRequired } from '../../core/utils/form-validators';

class WorkspaceVerificationError extends Error {}

@Component({
  selector: 'app-workspace-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './workspace-onboarding.component.html',
})
export class WorkspaceOnboardingComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, trimmedRequired, trimmedMinLength(2), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
  });
  readonly accessState = signal<WorkspaceAccessState | null>(null);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly verifying = signal(false);
  readonly loadError = signal('');
  readonly creationError = signal('');
  readonly activationError = signal('');
  readonly activationBusyId = signal('');
  readonly verificationError = signal('');
  readonly successMessage = signal('');
  readonly createdWorkspace = signal<Workspace | null>(null);
  readonly creationAccepted = signal(false);

  constructor() {
    this.loadWorkspaces();
  }

  loadWorkspaces(): void {
    if (this.loading() || this.submitting() || this.verifying()) return;

    this.loading.set(true);
    this.loadError.set('');
    this.workspaceService
      .getWorkspaceAccessState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.accessState.set(state);
          this.loading.set(false);
          if (state.activeWorkspace && !this.creationAccepted()) {
            void this.router.navigateByUrl('/dashboard');
          }
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadError.set(getApiErrorMessage(error, 'تعذر تحميل مساحات العمل.'));
        },
      });
  }

  submit(): void {
    this.form.markAllAsTouched();
    const state = this.accessState();
    if (
      this.form.invalid ||
      this.submitting() ||
      this.verifying() ||
      this.creationAccepted() ||
      !state ||
      state.activeWorkspace ||
      state.suspendedWorkspaces.length > 0
    ) {
      return;
    }

    this.submitting.set(true);
    this.creationError.set('');
    this.verificationError.set('');
    this.successMessage.set('');
    const value = this.form.getRawValue();
    const description = value.description.trim();

    this.workspaceService
      .createWorkspace({
        name: value.name.trim(),
        ...(description ? { description } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (workspace) => {
          this.submitting.set(false);
          this.creationAccepted.set(true);
          this.createdWorkspace.set(workspace);
          if (!workspace?._id) {
            this.verificationError.set(
              'أُرسل طلب الإنشاء بنجاح، لكن لم يصل معرف المساحة في الرد. لن نعيد إرسال الطلب لتجنب إنشاء مساحة مكررة. أعد تحميل قائمة المساحات أو تواصل مع الدعم.',
            );
            return;
          }
          this.successMessage.set('تم إنشاء المساحة. جارٍ التحقق من صلاحية الوصول...');
          this.verifyCreatedWorkspace(workspace);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.creationError.set(getApiErrorMessage(error, 'تعذر إنشاء مساحة العمل.'));
        },
      });
  }

  retryVerification(): void {
    const workspace = this.createdWorkspace();
    if (workspace?._id) this.verifyCreatedWorkspace(workspace);
  }

  canActivateWorkspace(workspace: Workspace): boolean {
    const userId = this.authService.currentUser()?.id;
    return (
      workspace.status === 'suspended' &&
      workspace.suspensionType === 'owner' &&
      !!userId &&
      workspace.ownerId === userId
    );
  }

  activateWorkspace(workspace: Workspace): void {
    if (!this.canActivateWorkspace(workspace) || this.activationBusyId()) return;

    this.activationBusyId.set(workspace._id);
    this.activationError.set('');
    this.workspaceService
      .activateWorkspaceAndRefresh(workspace._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.accessState.set(state);
          this.activationBusyId.set('');
          this.successMessage.set('تم تفعيل المساحة والتحقق من صلاحية الوصول. جارٍ فتح لوحة التحكم...');
          void this.router.navigateByUrl('/dashboard');
        },
        error: (error: unknown) => {
          this.activationBusyId.set('');
          this.activationError.set(
            error instanceof WorkspaceActivationVerificationError
              ? 'لم يؤكد الخادم تفعيل المساحة وإمكانية الوصول إليها. أعد تحميل قائمة المساحات قبل المتابعة.'
              : getApiErrorMessage(error, 'تعذر تفعيل مساحة العمل. تحقق من صلاحيتك وحاول مرة أخرى.'),
          );
        },
      });
  }

  private verifyCreatedWorkspace(created: Workspace): void {
    if (this.verifying()) return;

    this.verifying.set(true);
    this.verificationError.set('');
    this.workspaceService
      .getWorkspaceAccessState()
      .pipe(
        switchMap((state) => {
          const listedWorkspace = state.workspaces.find((workspace) => workspace._id === created._id);
          if (!listedWorkspace || listedWorkspace.status !== 'active') {
            return throwError(() => new WorkspaceVerificationError());
          }

          return this.workspaceService.getWorkspace(created._id).pipe(
            map((workspace) => {
              if (workspace._id !== created._id || workspace.status !== 'active') {
                throw new WorkspaceVerificationError();
              }
              return workspace;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.verifying.set(false);
          this.successMessage.set('تم التحقق من المساحة. جارٍ فتح لوحة التحكم...');
          void this.router.navigateByUrl('/dashboard');
        },
        error: (error: unknown) => {
          this.verifying.set(false);
          this.verificationError.set(
            error instanceof WorkspaceVerificationError
              ? 'تم استلام رد الإنشاء، لكن المساحة لم تظهر كمساحة نشطة قابلة للوصول. أعد التحقق قبل المتابعة.'
              : getApiErrorMessage(error, 'تعذر التحقق من الوصول إلى مساحة العمل.'),
          );
        },
      });
  }

  showNameError(): string {
    const control = this.form.controls.name;
    if (!control.touched) return '';
    if (control.hasError('required') || control.hasError('trimmedRequired')) {
      return 'اسم مساحة العمل مطلوب.';
    }
    if (control.hasError('minlength')) return 'يجب ألا يقل الاسم عن حرفين.';
    if (control.hasError('maxlength')) return 'يجب ألا يتجاوز الاسم 120 حرفًا.';
    return '';
  }

  showDescriptionError(): string {
    const control = this.form.controls.description;
    return control.touched && control.hasError('maxlength')
      ? 'يجب ألا يتجاوز الوصف 1000 حرف.'
      : '';
  }

}
