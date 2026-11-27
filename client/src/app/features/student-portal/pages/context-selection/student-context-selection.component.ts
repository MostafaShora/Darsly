import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { StudentContextService } from '../../../../core/services/student-context.service';

@Component({
  selector: 'app-student-context-selection',
  standalone: true,
  imports: [LucideDynamicIcon, RouterLink],
  templateUrl: './student-context-selection.component.html',
})
export class StudentContextSelectionComponent implements OnInit {
  readonly contextService = inject(StudentContextService);
  readonly router = inject(Router);
  readonly loadError = signal('');

  ngOnInit(): void {
    this.loadContexts();
  }

  loadContexts(): void {
    this.loadError.set('');
    this.contextService.getActiveContexts().subscribe({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          void this.router.navigate(['/sign-in'], { queryParams: { reason: 'session' } });
          return;
        }
        this.loadError.set('تعذّر تحميل ملفات الطالب. تحقّق من الاتصال ثم أعد المحاولة.');
      },
    });
  }

  selectContext(studentAccountLinkId: string): void {
    this.contextService.selectContext(studentAccountLinkId).subscribe({
      next: () => void this.router.navigateByUrl('/student/overview'),
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          void this.router.navigate(['/sign-in'], { queryParams: { reason: 'session' } });
        } else if (error instanceof HttpErrorResponse && error.status === 404) {
          this.loadContexts();
        }
      },
    });
  }
}
