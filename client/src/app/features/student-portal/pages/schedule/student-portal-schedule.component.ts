import { Component } from '@angular/core';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

@Component({
  selector: 'app-student-portal-schedule',
  standalone: true,
  imports: [StudentPortalPendingStateComponent],
  templateUrl: './student-portal-schedule.component.html',
})
export class StudentPortalScheduleComponent {}
