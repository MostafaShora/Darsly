import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { StudentOverview } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

interface StudentPortalMetric {
  label: string;
  icon: string;
  value: number;
}

@Component({
  selector: 'app-student-portal-overview',
  standalone: true,
  imports: [LucideDynamicIcon, StudentPortalPendingStateComponent],
  templateUrl: './student-portal-overview.component.html',
})
export class StudentPortalOverviewComponent implements OnInit {
  private readonly api = inject(StudentPortalApiService);

  readonly overview = signal<StudentOverview | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadOverview();
  }

  loadOverview(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.getOverview().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.isLoading.set(false);
      },
      error: () => {
        this.overview.set(null);
        this.isLoading.set(false);
        this.errorMessage.set('تعذّر تحميل نظرة عامة الطالب. حاول مرة أخرى.');
      },
    });
  }

  metrics(overview: StudentOverview): StudentPortalMetric[] {
    return [
      {
        label: 'المجموعات النشطة',
        icon: 'book-open',
        value: overview.activeGroupCount,
      },
      {
        label: 'الحصص القادمة',
        icon: 'calendar-days',
        value: overview.upcomingSessionCount,
      },
      {
        label: 'سجلات الحضور',
        icon: 'clipboard-check',
        value: overview.attendanceSummary.total,
      },
    ];
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  attendanceLabel(status: StudentOverview['recentAttendance'][number]['status']): string {
    const labels = {
      present: 'حاضر',
      absent: 'غائب',
      late: 'متأخر',
      excused: 'بعذر',
    };
    return labels[status];
  }
}
