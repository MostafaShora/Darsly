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

  it('uses the selected StudentAccountLink header for Groups requests', () => {
    let groups: unknown;
    service.getGroups().subscribe((result) => {
      groups = result;
    });
    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/student-portal/groups`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-Student-Account-Link')).toBe(linkId);
    expect(request.request.body).toBeNull();
    request.flush({
      message: 'Student groups retrieved successfully',
      data: [
        {
          name: 'Algebra Group',
          subjectName: 'Mathematics',
          enrolledAt: '2026-10-01T00:00:00.000Z',
          status: 'active',
        },
      ],
    });
    expect(groups).toEqual([
      {
        name: 'Algebra Group',
        subjectName: 'Mathematics',
        enrolledAt: '2026-10-01T00:00:00.000Z',
        status: 'active',
      },
    ]);
    expect(selectedContextHeaders).toHaveBeenCalledTimes(1);
  });

  it('uses the selected StudentAccountLink header for Overview, Profile, and Schedule requests', () => {
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

    let schedule: unknown;
    service.getSchedule().subscribe((result) => {
      schedule = result;
    });
    const scheduleRequest = httpTesting.expectOne(
      `${environment.apiBaseUrl}/student-portal/schedule`,
    );
    expect(scheduleRequest.request.method).toBe('GET');
    expect(scheduleRequest.request.withCredentials).toBe(true);
    expect(scheduleRequest.request.headers.get('X-Student-Account-Link')).toBe(linkId);
    expect(scheduleRequest.request.body).toBeNull();
    scheduleRequest.flush({
      message: 'Student schedule retrieved successfully',
      data: { upcoming: [], past: [] },
    });
    expect(schedule).toEqual({ upcoming: [], past: [] });
    expect(selectedContextHeaders).toHaveBeenCalledTimes(3);
  });
});
