import { Component, OnInit, inject, signal } from '@angular/core';
import { StudentPortalGroup } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalPendingStateComponent } from '../../components/student-portal-pending-state.component';

@Component({
  selector: 'app-student-portal-groups',
  standalone: true,
  imports: [StudentPortalPendingStateComponent],
  templateUrl: './student-portal-groups.component.html',
})
export class StudentPortalGroupsComponent implements OnInit {
  private readonly api = inject(StudentPortalApiService);

  readonly groups = signal<StudentPortalGroup[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadGroups();
  }

  loadGroups(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.getGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.isLoading.set(false);
      },
      error: () => {
        this.groups.set([]);
        this.isLoading.set(false);
        this.errorMessage.set('تعذّر تحميل مجموعاتك. حاول مرة أخرى.');
      },
    });
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
    }).format(new Date(value));
  }
}
