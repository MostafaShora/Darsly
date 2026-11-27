import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  LucideBookOpen,
  LucideCalendarDays,
  LucideClipboardCheck,
  LucideUsersRound,
  provideLucideIcons,
} from '@lucide/angular';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { StudentOverview } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalOverviewComponent } from './student-portal-overview.component';

describe('StudentPortalOverviewComponent', () => {
  let fixture: ComponentFixture<StudentPortalOverviewComponent>;
  const api = {
    getOverview: vi.fn(),
  };

  const emptyOverview: StudentOverview = {
    studentName: 'Student A',
    activeGroupCount: 0,
    upcomingSessionCount: 0,
    upcomingSessions: [],
    attendanceSummary: { total: 0, present: 0, absent: 0, late: 0, excused: 0 },
    recentAttendance: [],
  };

  beforeEach(async () => {
    api.getOverview.mockReset();
    await TestBed.configureTestingModule({
      imports: [StudentPortalOverviewComponent],
      providers: [
        provideLucideIcons(
          LucideBookOpen,
          LucideCalendarDays,
          LucideClipboardCheck,
          LucideUsersRound,
        ),
        { provide: StudentPortalApiService, useValue: api },
      ],
    }).compileComponents();
  });

  function createFixture(): void {
    fixture = TestBed.createComponent(StudentPortalOverviewComponent);
    fixture.detectChanges();
  }

  it('shows loading and empty states, then renders the API data', () => {
    const response = new Subject<StudentOverview>();
    api.getOverview.mockReturnValue(response);
    createFixture();

    expect(fixture.nativeElement.textContent).toContain(
      'جارٍ تحميل بيانات نظرة عامة الطالب',
    );
    response.next(emptyOverview);
    response.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('مرحبًا بك، Student A');
    expect(fixture.nativeElement.textContent).toContain('لا توجد حصص قادمة');
    expect(fixture.nativeElement.textContent).toContain('لا توجد سجلات حضور بعد');
    expect(fixture.nativeElement.textContent).toContain('المجموعات النشطة');
  });

  it('shows an API error and retries successfully', () => {
    api.getOverview
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(emptyOverview));
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('تعذّر تحميل البيانات');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('مرحبًا بك، Student A');
    expect(api.getOverview).toHaveBeenCalledTimes(2);
  });
});
