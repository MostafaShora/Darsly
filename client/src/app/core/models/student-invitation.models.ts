export interface StartedStudentInvitationRedemption {
  redemptionId: string;
  claimToken: string;
}

export type StudentInvitationRedemptionState =
  'claimed' | 'otp_pending' | 'otp_verified' | 'approved' | 'rejected' | 'consumed';

export type StudentInvitationOtpStatus =
  'none' | 'sending' | 'sent' | 'failed' | 'locked' | 'verified';

export interface StudentInvitationRedemptionStatus {
  state: StudentInvitationRedemptionState;
  otpStatus: StudentInvitationOtpStatus;
  otpVerifiedAt: string | null;
}

export interface StudentInvitationMessageResponse {
  message: string;
}
