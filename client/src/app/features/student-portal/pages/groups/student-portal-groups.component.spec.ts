import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LucideBookOpen, provideLucideIcons } from '@lucide/angular';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { StudentPortalGroup } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalGroupsComponent } from './student-portal-groups.component';

describe('StudentPortalGroupsComponent', () => {
  let fixture: ComponentFixture<StudentPortalGroupsComponent>;
  const api = {
    getGroups: vi.fn(),
  };

  const groups: StudentPortalGroup[] = [
    {
      name: 'Algebra Group',
      subjectName: 'Mathematics',
      enrolledAt: '2026-10-01T00:00:00.000Z',
      status: 'active',
    },
  ];

  beforeEach(async () => {
    api.getGroups.mockReset();
    await TestBed.configureTestingModule({
      imports: [StudentPortalGroupsComponent],
      providers: [
        provideLucideIcons(LucideBookOpen),
        { provide: StudentPortalApiService, useValue: api },
      ],
    }).compileComponents();
  });

  function createFixture(): void {
    fixture = TestBed.createComponent(StudentPortalGroupsComponent);
    fixture.detectChanges();
  }

  it('shows loading and renders returned group data without rendering private fields', () => {
    const response = new Subject<StudentPortalGroup[]>();
    api.getGroups.mockReturnValue(response);
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل مجموعاتك');
    response.next(groups);
    response.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Algebra Group');
    expect(fixture.nativeElement.textContent).toContain('Mathematics');
    expect(fixture.nativeElement.textContent).toContain('نشطة');
    expect(fixture.nativeElement.textContent).toContain('تاريخ التسجيل');
    expect(fixture.nativeElement.textContent).not.toContain('Private');
    expect(fixture.nativeElement.textContent).not.toContain('workspaceId');
  });

  it('shows a distinct empty state when the API confirms there are no groups', () => {
    api.getGroups.mockReturnValue(of([]));
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('لا توجد مجموعات نشطة');
    expect(fixture.nativeElement.textContent).not.toContain('تعذّر تحميل المجموعات');
  });

  it('shows an API error and retries successfully', () => {
    api.getGroups
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(groups));
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('تعذّر تحميل المجموعات');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Algebra Group');
    expect(api.getGroups).toHaveBeenCalledTimes(2);
  });
});
