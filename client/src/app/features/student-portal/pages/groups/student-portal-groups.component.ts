import { Component } from '@angular/core';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

@Component({
  selector: 'app-student-portal-groups',
  standalone: true,
  imports: [StudentPortalPendingStateComponent],
  templateUrl: './student-portal-groups.component.html',
})
export class StudentPortalGroupsComponent {}
