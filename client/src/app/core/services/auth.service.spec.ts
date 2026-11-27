import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService account status', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads the authenticated capability summary without activating the global session-check overlay', () => {
    let response: unknown;
    service.getAccountStatus().subscribe((result) => (response = result));

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/auth/status`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(service.isCheckingSession()).toBe(false);
    request.flush({
      message: 'Authenticated user',
      user: {
        id: 'user-1',
        name: 'Student Teacher',
        email: 'account@example.test',
        status: 'active',
        lastLoginAt: null,
        capabilities: { teacher: true, student: true, owner: false },
      },
    });

    expect(response).toEqual(expect.objectContaining({
      user: expect.objectContaining({
        capabilities: { teacher: true, student: true, owner: false },
      }),
    }));
    expect(service.currentUser()?.capabilities).toEqual({
      teacher: true,
      student: true,
      owner: false,
    });
  });
});
