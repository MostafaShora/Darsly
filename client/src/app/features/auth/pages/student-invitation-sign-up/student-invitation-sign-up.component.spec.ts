import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { StudentInvitationRedemptionStatus } from '../../../../core/models/student-invitation.models';
import { AuthService } from '../../../../core/services/auth.service';
import { StudentInvitationService } from '../../../../core/services/student-invitation.service';
import { StudentInvitationSignUpComponent } from './student-invitation-sign-up.component';

describe('StudentInvitationSignUpComponent', () => {
  let fixture: ComponentFixture<StudentInvitationSignUpComponent>;
  const redemption = {
    redemptionId: 'redemption-1',
    claimToken: 'a'.repeat(64),
  };
  const invitationApi = {
    start: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    completeRegistration: vi.fn(),
    claimExistingAccount: vi.fn(),
    getStatus: vi.fn(),
  };
  const auth = {
    login: vi.fn(),
    currentUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    auth.currentUser.mockReturnValue(null);
    await TestBed.configureTestingModule({
      imports: [StudentInvitationSignUpComponent],
      providers: [
        provideRouter([]),
        { provide: StudentInvitationService, useValue: invitationApi },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
  });

  function createFixture(): void {
    fixture = TestBed.createComponent(StudentInvitationSignUpComponent);
    fixture.detectChanges();
  }

  function advanceToAccount(): void {
    invitationApi.start.mockReturnValue(of(redemption));
    invitationApi.requestOtp.mockReturnValue(of({ message: 'sent' }));
    invitationApi.verifyOtp.mockReturnValue(of({ message: 'verified' }));
    createFixture();

    fixture.componentInstance.invitationForm.controls.invitationSecret.setValue('b'.repeat(64));
    fixture.componentInstance.startRedemption();
    fixture.componentInstance.otpForm.controls.otp.setValue('123456');
    fixture.componentInstance.verifyOtp();
    fixture.detectChanges();
  }

  it('validates the invitation, sends OTP, and requires OTP verification before account setup', () => {
    const pendingStart = new Subject<typeof redemption>();
    invitationApi.start.mockReturnValue(pendingStart);
    invitationApi.requestOtp.mockReturnValue(of({ message: 'sent' }));
    invitationApi.verifyOtp.mockReturnValue(of({ message: 'verified' }));
    createFixture();

    fixture.componentInstance.startRedemption();
    expect(invitationApi.start).not.toHaveBeenCalled();

    fixture.componentInstance.invitationForm.controls.invitationSecret.setValue('b'.repeat(64));
    fixture.componentInstance.startRedemption();
    expect(fixture.componentInstance.isSubmitting()).toBe(true);
    pendingStart.next(redemption);
    pendingStart.complete();
    fixture.detectChanges();

    expect(invitationApi.requestOtp).toHaveBeenCalledWith(
      redemption.redemptionId,
      redemption.claimToken,
    );
    expect(fixture.componentInstance.step()).toBe('otp');
    fixture.componentInstance.otpForm.controls.otp.setValue('123');
    fixture.componentInstance.verifyOtp();
    expect(invitationApi.verifyOtp).not.toHaveBeenCalled();

    fixture.componentInstance.otpForm.controls.otp.setValue('123456');
    fixture.componentInstance.verifyOtp();
    fixture.detectChanges();
    expect(invitationApi.verifyOtp).toHaveBeenCalledWith(
      redemption.redemptionId,
      redemption.claimToken,
      '123456',
    );
    expect(fixture.componentInstance.step()).toBe('account');
  });

  it('creates a student-only account through the invitation path and waits for approval', () => {
    advanceToAccount();
    const component = fixture.componentInstance;
    component.accountForm.controls.password.setValue('student-password');
    component.accountForm.controls.confirmPassword.setValue('student-password');
    const status: StudentInvitationRedemptionStatus = {
      state: 'otp_verified',
      otpStatus: 'verified',
      otpVerifiedAt: '2026-11-27T18:00:00.000Z',
    };
    invitationApi.completeRegistration.mockReturnValue(of({ message: 'created' }));
    invitationApi.getStatus.mockReturnValue(of(status));

    component.completeRegistration();
    fixture.detectChanges();

    expect(invitationApi.completeRegistration).toHaveBeenCalledWith(
      redemption.redemptionId,
      redemption.claimToken,
      'student-password',
    );
    expect(component.step()).toBe('waiting');
    expect(component.statusMessage()).toContain('بانتظار موافقة المدرّس');
  });

  it('logs in and links an existing account through the authenticated invitation endpoint', () => {
    advanceToAccount();
    const component = fixture.componentInstance;
    component.useExistingAccount.set(true);
    component.existingAccountForm.setValue({
      email: 'student@example.test',
      password: 'existing-password',
    });
    auth.login.mockReturnValue(of({ message: 'logged in', user: { id: 'user-1' } }));
    invitationApi.claimExistingAccount.mockReturnValue(of({ message: 'linked' }));
    invitationApi.getStatus.mockReturnValue(
      of({
        state: 'consumed',
        otpStatus: 'verified',
        otpVerifiedAt: '2026-11-27T18:00:00.000Z',
      }),
    );

    component.claimExistingAccount();
    fixture.detectChanges();

    expect(auth.login).toHaveBeenCalledWith({
      email: 'student@example.test',
      password: 'existing-password',
    });
    expect(invitationApi.claimExistingAccount).toHaveBeenCalledWith(
      redemption.redemptionId,
      redemption.claimToken,
    );
    expect(component.step()).toBe('active');
  });

  it('surfaces invitation API errors and permits retry', () => {
    invitationApi.start
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(redemption));
    invitationApi.requestOtp.mockReturnValue(of({ message: 'sent' }));
    createFixture();
    const component = fixture.componentInstance;
    component.invitationForm.controls.invitationSecret.setValue('c'.repeat(64));

    component.startRedemption();
    fixture.detectChanges();
    expect(component.errorMessage()).toContain('تعذّر التحقق من الدعوة');

    component.startRedemption();
    fixture.detectChanges();
    expect(component.step()).toBe('otp');
    expect(invitationApi.start).toHaveBeenCalledTimes(2);
  });
});
