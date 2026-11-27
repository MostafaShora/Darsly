import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './sign-in.component.html',
})
export class SignInComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly apiError = signal('');
  readonly successMessage = signal('');
  readonly redirectMessage = signal(
    this.route.snapshot.queryParamMap.get('reason') === 'session'
      ? 'انتهت جلستك. سجّل الدخول للمتابعة.'
      : this.route.snapshot.queryParamMap.get('reason') === 'unavailable'
        ? 'تعذر التحقق من جلستك. تحقق من اتصالك وحاول تسجيل الدخول مرة أخرى.'
        : '',
  );

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.apiError.set('');
    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        const capabilities = this.authService.currentUser()?.capabilities;
        const studentOnly = capabilities?.student === true && capabilities.teacher !== true;
        const destination = studentOnly ? '/student/overview' : '/dashboard';
        this.successMessage.set(
          studentOnly
            ? 'تم تسجيل الدخول بنجاح. جارٍ نقلك إلى بوابة الطالب.'
            : 'تم تسجيل الدخول بنجاح. جارٍ نقلك إلى لوحة التحكم.',
        );
        window.setTimeout(() => void this.router.navigateByUrl(destination), 900);
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

    return 'تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.';
  }
}
