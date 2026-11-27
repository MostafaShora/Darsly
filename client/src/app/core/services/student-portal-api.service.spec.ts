import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { StudentContextService } from './student-context.service';
import { StudentPortalApiService } from './student-portal-api.service';

describe('StudentPortalApiService', () => {
  const linkId = 'server-validated-student-link';
  let service: StudentPortalApiService;
  let httpTesting: HttpTestingController;
  const selectedContextHeaders = vi.fn(
    () => new HttpHeaders({ 'X-Student-Account-Link': linkId }),
  );

  beforeEach(() => {
    selectedContextHeaders.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: StudentContextService,
          useValue: { selectedContextHeaders },
        },
      ],
    });
    service = TestBed.inject(StudentPortalApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the selected StudentAccountLink header for Overview and Profile requests', () => {
    service.getOverview().subscribe();
    const overviewRequest = httpTesting.expectOne(
      `${environment.apiBaseUrl}/student-portal/overview`,
    );
    expect(overviewRequest.request.method).toBe('GET');
    expect(overviewRequest.request.withCredentials).toBe(true);
    expect(overviewRequest.request.headers.get('X-Student-Account-Link')).toBe(linkId);
    expect(overviewRequest.request.body).toBeNull();
    overviewRequest.flush({
      message: 'ok',
      data: {
        studentName: 'Student A',
        activeGroupCount: 0,
        upcomingSessionCount: 0,
        upcomingSessions: [],
        attendanceSummary: { total: 0, present: 0, absent: 0, late: 0, excused: 0 },
        recentAttendance: [],
      },
    });

    service.getProfile().subscribe();
    const profileRequest = httpTesting.expectOne(
      `${environment.apiBaseUrl}/student-portal/profile`,
    );
    expect(profileRequest.request.method).toBe('GET');
    expect(profileRequest.request.withCredentials).toBe(true);
    expect(profileRequest.request.headers.get('X-Student-Account-Link')).toBe(linkId);
    expect(profileRequest.request.body).toBeNull();
    profileRequest.flush({
      message: 'ok',
      data: {
        name: 'Student A',
        email: null,
        phone: null,
        schoolName: null,
        grade: null,
      },
    });
    expect(selectedContextHeaders).toHaveBeenCalledTimes(2);
  });
});
