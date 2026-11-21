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

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  return !confirmPassword || password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './sign-up.component.html',
})
export class SignUpComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly apiError = signal('');
  readonly successMessage = signal('');

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.apiError.set('');
    const { name, email, password } = this.form.getRawValue();
    this.authService.register({ name, email, password }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.successMessage.set('تم إنشاء حسابك بنجاح. جارٍ نقلك إلى لوحة التحكم.');
        window.setTimeout(() => void this.router.navigateByUrl('/dashboard'), 900);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.apiError.set(this.getApiErrorMessage(error));
      },
    });
  }

  private getApiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.';
    }

    return 'تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.';
  }
}
