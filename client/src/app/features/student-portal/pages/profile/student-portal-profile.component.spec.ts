import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { StudentProfile } from '../../../../core/models/student-portal.models';
import { StudentPortalApiService } from '../../../../core/services/student-portal-api.service';
import { StudentPortalProfileComponent } from './student-portal-profile.component';

describe('StudentPortalProfileComponent', () => {
  let fixture: ComponentFixture<StudentPortalProfileComponent>;
  const api = {
    getProfile: vi.fn(),
  };

  beforeEach(async () => {
    api.getProfile.mockReset();
    await TestBed.configureTestingModule({
      imports: [StudentPortalProfileComponent],
      providers: [{ provide: StudentPortalApiService, useValue: api }],
    }).compileComponents();
  });

  function createFixture(): void {
    fixture = TestBed.createComponent(StudentPortalProfileComponent);
    fixture.detectChanges();
  }

  it('shows loading and unavailable field values without inventing profile data', () => {
    const response = new Subject<StudentProfile>();
    api.getProfile.mockReturnValue(response);
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('جارٍ تحميل ملفك الشخصي');
    response.next({
      name: 'Student A',
      email: null,
      phone: null,
      schoolName: null,
      grade: null,
    });
    response.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Student A');
    expect(fixture.nativeElement.textContent).toContain('غير مسجل');
    expect(fixture.nativeElement.textContent).not.toContain('Teacher-only note');
  });

  it('shows an API error and retries successfully', () => {
    const profile: StudentProfile = {
      name: 'Student A',
      email: 'student@example.test',
      phone: null,
      schoolName: null,
      grade: 'Grade 8',
    };
    api.getProfile
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(profile));
    createFixture();

    expect(fixture.nativeElement.textContent).toContain('تعذّر تحميل الملف');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('student@example.test');
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
});
