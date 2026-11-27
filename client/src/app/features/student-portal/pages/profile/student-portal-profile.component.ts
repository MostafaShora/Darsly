import { Component } from '@angular/core';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

@Component({
  selector: 'app-student-portal-profile',
  standalone: true,
  imports: [StudentPortalPendingStateComponent],
  templateUrl: './student-portal-profile.component.html',
})
export class StudentPortalProfileComponent {}
