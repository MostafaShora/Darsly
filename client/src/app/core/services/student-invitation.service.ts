import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  StartedStudentInvitationRedemption,
  StudentInvitationMessageResponse,
  StudentInvitationRedemptionStatus,
} from '../models/student-invitation.models';

interface ApiResponse<T> {
  message: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class StudentInvitationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/student-invitation-redemptions`;

  start(invitationSecret: string): Observable<StartedStudentInvitationRedemption> {
    return this.http
      .post<ApiResponse<StartedStudentInvitationRedemption>>(
        this.baseUrl,
        { invitationSecret },
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  requestOtp(
    redemptionId: string,
    claimToken: string,
  ): Observable<StudentInvitationMessageResponse> {
    return this.http.post<StudentInvitationMessageResponse>(
      `${this.baseUrl}/${redemptionId}/otp`,
      { claimToken },
      { withCredentials: true },
    );
  }

  verifyOtp(
    redemptionId: string,
    claimToken: string,
    otp: string,
  ): Observable<StudentInvitationMessageResponse> {
    return this.http.post<StudentInvitationMessageResponse>(
      `${this.baseUrl}/${redemptionId}/verify`,
      { claimToken, otp },
      { withCredentials: true },
    );
  }

  completeRegistration(
    redemptionId: string,
    claimToken: string,
    password: string,
  ): Observable<StudentInvitationMessageResponse> {
    return this.http.post<StudentInvitationMessageResponse>(
      `${this.baseUrl}/${redemptionId}/register`,
      { claimToken, password },
      { withCredentials: true },
    );
  }

  claimExistingAccount(
    redemptionId: string,
    claimToken: string,
  ): Observable<StudentInvitationMessageResponse> {
    return this.http.post<StudentInvitationMessageResponse>(
      `${this.baseUrl}/${redemptionId}/claim-existing-account`,
      { claimToken },
      { withCredentials: true },
    );
  }

  getStatus(
    redemptionId: string,
    claimToken: string,
  ): Observable<StudentInvitationRedemptionStatus> {
    return this.http
      .post<ApiResponse<StudentInvitationRedemptionStatus>>(
        `${this.baseUrl}/${redemptionId}/status`,
        { claimToken },
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }
}
