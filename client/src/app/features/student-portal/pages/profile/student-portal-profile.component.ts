import { Component, OnInit, inject, signal } from '@angular/core';
import { StudentProfile } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';

@Component({
  selector: 'app-student-portal-profile',
  standalone: true,
  templateUrl: './student-portal-profile.component.html',
})
export class StudentPortalProfileComponent implements OnInit {
  private readonly api = inject(StudentPortalApiService);

  readonly profile = signal<StudentProfile | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.getProfile().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.isLoading.set(false);
      },
      error: () => {
        this.profile.set(null);
        this.isLoading.set(false);
        this.errorMessage.set('تعذّر تحميل ملفك الشخصي. حاول مرة أخرى.');
      },
    });
  }

  displayValue(value: string | null): string {
    return value?.trim() || 'غير مسجل';
  }
}
