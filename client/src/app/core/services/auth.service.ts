import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthenticatedResponse,
  AuthMessageResponse,
  LoginRequest,
  RegisterRequest
} from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authApiUrl = `${environment.apiBaseUrl}/auth`;

  register(request: RegisterRequest): Observable<AuthenticatedResponse> {
    return this.http.post<AuthenticatedResponse>(
      `${this.authApiUrl}/register`,
      request,
      { withCredentials: true }
    );
  }

  login(request: LoginRequest): Observable<AuthenticatedResponse> {
    return this.http.post<AuthenticatedResponse>(
      `${this.authApiUrl}/login`,
      request,
      { withCredentials: true }
    );
  }

  logout(): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(
      `${this.authApiUrl}/logout`,
      null,
      { withCredentials: true }
    );
  }

  getStatus(): Observable<AuthenticatedResponse> {
    return this.http.get<AuthenticatedResponse>(
      `${this.authApiUrl}/status`,
      { withCredentials: true }
    );
  }
}
