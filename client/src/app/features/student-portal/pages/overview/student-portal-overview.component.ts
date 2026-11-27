import { Component } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

interface StudentPortalMetric {
  label: string;
  icon: string;
}

@Component({
  selector: 'app-student-portal-overview',
  standalone: true,
  imports: [LucideDynamicIcon, StudentPortalPendingStateComponent],
  templateUrl: './student-portal-overview.component.html',
})
export class StudentPortalOverviewComponent {
  readonly metrics: readonly StudentPortalMetric[] = [
    { label: 'مجموعاتي', icon: 'book-open' },
    { label: 'الحصص القادمة', icon: 'calendar-days' },
    { label: 'الحضور', icon: 'clipboard-check' },
    { label: 'ملفي الشخصي', icon: 'users-round' },
  ];
}
