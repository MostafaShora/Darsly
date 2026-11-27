import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../models/auth.models';
import { ActiveStudentContext } from '../models/student-context.models';
import { AuthService } from './auth.service';
import { StudentContextService } from './student-context.service';

describe('StudentContextService', () => {
  const user: AuthUser = {
    id: 'user-17',
    name: 'Student User',
    email: 'student@example.test',
    status: 'active',
    lastLoginAt: null,
    capabilities: { teacher: false, student: true, owner: false },
  };
  const context: ActiveStudentContext = {
    studentAccountLinkId: 'active-link-from-server',
    studentName: 'Student One',
    workspaceName: 'Workspace One',
  };

  let service: StudentContextService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { currentUser: signal<AuthUser | null>(user) },
        },
      ],
    });
    service = TestBed.inject(StudentContextService);
    httpTesting = TestBed.inject(HttpTestingController);
    localStorage.removeItem('darsly.active-student-context.user-17');
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.removeItem('darsly.active-student-context.user-17');
    localStorage.removeItem('darsly.active-workspace.user-17');
  });

  it('clears an invalid saved context hint after fetching the backend-validated list', () => {
    localStorage.setItem('darsly.active-student-context.user-17', 'revoked-link');
    let contexts: ActiveStudentContext[] | undefined;

    service.getActiveContexts().subscribe((result) => (contexts = result));
    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/student-contexts`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ message: 'ok', data: [context] });

    expect(contexts).toEqual([context]);
    expect(service.selectionWasStale()).toBe(true);
    expect(localStorage.getItem('darsly.active-student-context.user-17')).toBeNull();
  });

  it('sends only the link selection hint and exposes it for future protected request headers', () => {
    let selected: ActiveStudentContext | undefined;
    localStorage.setItem('darsly.active-workspace.user-17', 'teacher-workspace');

    service.selectContext(context.studentAccountLinkId).subscribe((result) => {
      selected = result;
    });
    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/student-contexts/selection`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      studentAccountLinkId: context.studentAccountLinkId,
    });
    expect('studentId' in request.request.body).toBe(false);
    expect('workspaceId' in request.request.body).toBe(false);
    request.flush({ message: 'ok', data: context });

    expect(selected).toEqual(context);
    expect(service.selectedContextHeaders().get('X-Student-Account-Link')).toBe(
      context.studentAccountLinkId,
    );
    expect(localStorage.getItem('darsly.active-student-context.user-17')).toBe(
      context.studentAccountLinkId,
    );
    expect(localStorage.getItem('darsly.active-workspace.user-17')).toBe(
      'teacher-workspace',
    );
  });
});
