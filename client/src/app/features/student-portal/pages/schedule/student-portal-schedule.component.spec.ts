import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LucideCalendarDays, provideLucideIcons } from '@lucide/angular';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { StudentPortalSchedule } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalScheduleComponent } from './student-portal-schedule.component';

describe('StudentPortalScheduleComponent', () => {
  let fixture: ComponentFixture<StudentPortalScheduleComponent>;
  const api = {
    getSchedule: vi.fn(),
  };

  const schedule: StudentPortalSchedule = {
    upcoming: [
      {
        title: 'Algebra lesson',
        startsAt: '2026-11-20T10:00:00.000Z',
        endsAt: '2026-11-20T11:00:00.000Z',
        status: 'scheduled',
        groupName: 'Algebra Group',
        subjectName: 'Mathematics',
      },
    ],
    past: [
      {
        title: null,
        startsAt: '2026-11-18T10:00:00.000Z',
        endsAt: '2026-11-18T11:00:00.000Z',
        status: 'completed',
        groupName: 'Science Group',
        subjectName: null,
      },
    ],
  };

  beforeEach(async () => {
    api.getSchedule.mockReset();
    await TestBed.configureTestingModule({
      imports: [StudentPortalScheduleComponent],
      providers: [
        provideLucideIcons(LucideCalendarDays),
        { provide: StudentPortalApiService, useValue: api },
      ],
    }).compileComponents();
  });

  function createFixture(): void {
    fixture = TestBed.createComponent(StudentPortalScheduleComponent);
    fixture.detectChanges();
  }

  it('shows loading, then renders upcoming and past sessions', () => {
    const response = new Subject<StudentPortalSchedule>();
    api.getSchedule.mockReturnValue(response);
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل جدولك');
    response.next(schedule);
    response.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Algebra lesson');
    expect(fixture.nativeElement.textContent).toContain('Algebra Group');
    expect(fixture.nativeElement.textContent).toContain('Mathematics');
    expect(fixture.nativeElement.textContent).toContain('الحصص القادمة');
    expect(fixture.nativeElement.textContent).toContain('الحصص السابقة');
    expect(fixture.nativeElement.textContent).toContain('Science Group');
    expect(fixture.nativeElement.textContent).toContain('المادة غير متاحة');
    expect(fixture.nativeElement.textContent).toContain('مجدولة');
    expect(fixture.nativeElement.textContent).toContain('مكتملة');
  });

  it('shows the empty state independently for upcoming and past sessions', () => {
    api.getSchedule.mockReturnValue(of({ upcoming: [], past: [] }));
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('لا توجد حصص قادمة');
    expect(fixture.nativeElement.textContent).toContain('لا توجد حصص سابقة');
  });

  it('shows an API error and retries successfully', () => {
    api.getSchedule
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(schedule));
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('تعذّر تحميل الجدول');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Algebra lesson');
    expect(api.getSchedule).toHaveBeenCalledTimes(2);
  });
});
