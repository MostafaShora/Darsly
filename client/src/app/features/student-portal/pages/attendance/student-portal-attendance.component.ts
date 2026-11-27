import { Component } from '@angular/core';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

@Component({
  selector: 'app-student-portal-attendance',
  standalone: true,
  imports: [StudentPortalPendingStateComponent],
  templateUrl: './student-portal-attendance.component.html',
})
export class StudentPortalAttendanceComponent {}
