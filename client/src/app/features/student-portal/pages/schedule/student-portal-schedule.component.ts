import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import {
  StudentPortalSchedule,
  StudentPortalScheduleSession,
} from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

@Component({
  selector: 'app-student-portal-schedule',
  standalone: true,
  imports: [LucideDynamicIcon, StudentPortalPendingStateComponent],
  templateUrl: './student-portal-schedule.component.html',
})
export class StudentPortalScheduleComponent implements OnInit {
  private readonly api = inject(StudentPortalApiService);

  readonly schedule = signal<StudentPortalSchedule | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadSchedule();
  }

  loadSchedule(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.getSchedule().subscribe({
      next: (schedule) => {
        this.schedule.set(schedule);
        this.isLoading.set(false);
      },
      error: () => {
        this.schedule.set(null);
        this.isLoading.set(false);
        this.errorMessage.set('تعذّر تحميل جدولك. حاول مرة أخرى.');
      },
    });
  }

  formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  sessionStatusLabel(status: StudentPortalScheduleSession['status']): string {
    return status === 'scheduled' ? 'مجدولة' : 'مكتملة';
  }
}
