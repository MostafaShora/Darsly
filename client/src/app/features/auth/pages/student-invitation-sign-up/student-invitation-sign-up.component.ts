import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { StudentInvitationService } from '../../../../core/services/student-invitation.service';
import { getApiErrorMessage } from '../../../../core/utils/api-error';
import { StartedStudentInvitationRedemption } from '../../../../core/models/student-invitation.models';

type StudentSignupStep = 'invitation' | 'otp' | 'account' | 'waiting' | 'active' | 'rejected';

const passwordsMatchValidator = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  return !confirmPassword || password === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-student-invitation-sign-up',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './student-invitation-sign-up.component.html',
})
export class StudentInvitationSignUpComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly invitationService = inject(StudentInvitationService);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  readonly invitationForm = this.formBuilder.nonNullable.group({
    invitationSecret: ['', [Validators.required, Validators.pattern(/^[a-f0-9]{64}$/i)]],
  });
  readonly otpForm = this.formBuilder.nonNullable.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  readonly accountForm = this.formBuilder.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );
  readonly existingAccountForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly step = signal<StudentSignupStep>('invitation');
  readonly isSubmitting = signal(false);
  readonly isSendingOtp = signal(false);
  readonly isCheckingStatus = signal(false);
  readonly useExistingAccount = signal(false);
  readonly errorMessage = signal('');
  readonly statusMessage = signal('');

  private redemption: StartedStudentInvitationRedemption | null = null;

  startRedemption(): void {
    this.invitationForm.markAllAsTouched();
    if (this.invitationForm.invalid || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.invitationService
      .start(this.invitationForm.controls.invitationSecret.value.trim())
      .subscribe({
        next: (redemption) => {
          this.redemption = redemption;
          this.step.set('otp');
          this.isSubmitting.set(false);
          this.requestOtp();
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(
            getApiErrorMessage(
              error,
              'تعذّر التحقق من الدعوة. تأكد من الرمز واطلب من مدرّسك دعوة صالحة.',
            ),
          );
        },
      });
  }

  requestOtp(): void {
    const redemption = this.redemption;
    if (!redemption || this.isSendingOtp()) return;

    this.isSendingOtp.set(true);
    this.errorMessage.set('');
    this.invitationService.requestOtp(redemption.redemptionId, redemption.claimToken).subscribe({
      next: () => {
        this.isSendingOtp.set(false);
        this.statusMessage.set(
          'إذا كانت الدعوة صالحة، فسيصل رمز التحقق إلى البريد المسجل لدى مدرّسك.',
        );
      },
      error: (error: unknown) => {
        this.isSendingOtp.set(false);
        this.errorMessage.set(
          getApiErrorMessage(error, 'تعذّر إرسال رمز التحقق. حاول مرة أخرى أو تواصل مع مدرّسك.'),
        );
      },
    });
  }

  verifyOtp(): void {
    this.otpForm.markAllAsTouched();
    const redemption = this.redemption;
    if (!redemption || this.otpForm.invalid || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.invitationService
      .verifyOtp(redemption.redemptionId, redemption.claimToken, this.otpForm.controls.otp.value)
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.step.set('account');
          this.statusMessage.set('تم التحقق من الرمز. أنشئ حسابًا جديدًا أو اربط حسابك الحالي.');
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(
            getApiErrorMessage(error, 'تعذّر التحقق من الرمز. تأكد منه وحاول مرة أخرى.'),
          );
        },
      });
  }

  completeRegistration(): void {
    this.accountForm.markAllAsTouched();
    const redemption = this.redemption;
    if (!redemption || this.accountForm.invalid || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.invitationService
      .completeRegistration(
        redemption.redemptionId,
        redemption.claimToken,
        this.accountForm.controls.password.value,
      )
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.step.set('waiting');
          this.statusMessage.set('تم إنشاء الحساب. جارٍ التحقق من موافقة المدرّس...');
          this.refreshApprovalStatus();
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(
            error instanceof HttpErrorResponse && error.status === 409
              ? 'تعذّر إنشاء حساب جديد. إذا كان لديك حساب بالبريد المسجل لدى مدرّسك، اختر «لدي حساب بالفعل» لربطه.'
              : getApiErrorMessage(
                  error,
                  'تعذّر إنشاء الحساب. تحقق من كلمة المرور وحاول مرة أخرى.',
                ),
          );
        },
      });
  }

  claimExistingAccount(): void {
    this.existingAccountForm.markAllAsTouched();
    const redemption = this.redemption;
    if (!redemption || this.existingAccountForm.invalid || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.authService.login(this.existingAccountForm.getRawValue()).subscribe({
      next: () => {
        this.invitationService
          .claimExistingAccount(redemption.redemptionId, redemption.claimToken)
          .subscribe({
            next: () => {
              this.isSubmitting.set(false);
              this.step.set('waiting');
              this.statusMessage.set('تم ربط الحساب. جارٍ التحقق من موافقة المدرّس...');
              this.refreshApprovalStatus();
            },
            error: (error: unknown) => {
              this.isSubmitting.set(false);
              this.errorMessage.set(
                getApiErrorMessage(
                  error,
                  'تعذّر ربط الحساب. يجب أن يطابق بريده البريد المسجل لدى مدرّسك.',
                ),
              );
            },
          });
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(
          getApiErrorMessage(error, 'تعذّر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.'),
        );
      },
    });
  }

  refreshApprovalStatus(): void {
    const redemption = this.redemption;
    if (!redemption || this.isCheckingStatus()) return;

    this.isCheckingStatus.set(true);
    this.errorMessage.set('');
    this.invitationService.getStatus(redemption.redemptionId, redemption.claimToken).subscribe({
      next: (status) => {
        this.isCheckingStatus.set(false);
        if (status.state === 'consumed') {
          this.step.set('active');
          this.statusMessage.set('تم تفعيل وصول الطالب. يمكنك تسجيل الدخول للمتابعة.');
        } else if (status.state === 'rejected') {
          this.step.set('rejected');
          this.statusMessage.set(
            'لم تتم الموافقة على الطلب. تواصل مع مدرّسك لمعرفة الخطوة التالية.',
          );
        } else {
          this.step.set('waiting');
          this.statusMessage.set('طلبك بانتظار موافقة المدرّس. يمكنك التحقق مرة أخرى لاحقًا.');
        }
      },
      error: (error: unknown) => {
        this.isCheckingStatus.set(false);
        this.errorMessage.set(
          getApiErrorMessage(error, 'تعذّر التحقق من حالة الطلب. حاول مرة أخرى.'),
        );
      },
    });
  }

  openStudentPortal(): void {
    if (this.authService.currentUser()) {
      void this.router.navigateByUrl('/student/overview');
      return;
    }

    void this.router.navigateByUrl('/sign-in');
  }
}
