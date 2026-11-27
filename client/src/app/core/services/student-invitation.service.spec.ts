import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { StudentInvitationService } from './student-invitation.service';

describe('StudentInvitationService', () => {
  let service: StudentInvitationService;
  let httpTesting: HttpTestingController;
  const baseUrl = `${environment.apiBaseUrl}/student-invitation-redemptions`;
  const redemptionId = 'redemption-id';
  const claimToken = 'a'.repeat(64);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StudentInvitationService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the existing invitation, OTP, registration, account-link, and status contracts', () => {
    service.start('b'.repeat(64)).subscribe();
    const start = httpTesting.expectOne(baseUrl);
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ invitationSecret: 'b'.repeat(64) });
    expect(start.request.withCredentials).toBe(true);
    start.flush({
      message: 'Student invitation redemption started',
      data: { redemptionId, claimToken },
    });

    service.requestOtp(redemptionId, claimToken).subscribe();
    const otp = httpTesting.expectOne(`${baseUrl}/${redemptionId}/otp`);
    expect(otp.request.body).toEqual({ claimToken });
    expect(otp.request.withCredentials).toBe(true);
    otp.flush({ message: 'If eligible, a verification code has been sent' });

    service.verifyOtp(redemptionId, claimToken, '123456').subscribe();
    const verify = httpTesting.expectOne(`${baseUrl}/${redemptionId}/verify`);
    expect(verify.request.body).toEqual({ claimToken, otp: '123456' });
    verify.flush({ message: 'Verification completed; teacher approval is required' });

    service.completeRegistration(redemptionId, claimToken, 'valid-password').subscribe();
    const register = httpTesting.expectOne(`${baseUrl}/${redemptionId}/register`);
    expect(register.request.body).toEqual({ claimToken, password: 'valid-password' });
    register.flush({ message: 'Student account created; teacher approval is required' });

    service.claimExistingAccount(redemptionId, claimToken).subscribe();
    const claim = httpTesting.expectOne(`${baseUrl}/${redemptionId}/claim-existing-account`);
    expect(claim.request.body).toEqual({ claimToken });
    expect(claim.request.withCredentials).toBe(true);
    claim.flush({ message: 'Account verified; teacher approval is required' });

    service.getStatus(redemptionId, claimToken).subscribe((status) => {
      expect(status.state).toBe('otp_verified');
      expect(status.otpStatus).toBe('verified');
    });
    const status = httpTesting.expectOne(`${baseUrl}/${redemptionId}/status`);
    expect(status.request.body).toEqual({ claimToken });
    status.flush({
      message: 'Student invitation redemption status retrieved',
      data: {
        state: 'otp_verified',
        otpStatus: 'verified',
        otpVerifiedAt: '2026-11-27T18:00:00.000Z',
      },
    });
  });
});
