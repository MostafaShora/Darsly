import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, defer, finalize, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthenticatedResponse,
  AuthMessageResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authApiUrl = `${environment.apiBaseUrl}/auth`;

  readonly currentUser = signal<AuthUser | null>(null);
  readonly isCheckingSession = signal(false);

  register(request: RegisterRequest): Observable<AuthenticatedResponse> {
    return this.http
      .post<AuthenticatedResponse>(`${this.authApiUrl}/register`, request, {
        withCredentials: true,
      })
      .pipe(tap(({ user }) => this.currentUser.set(user)));
  }

  login(request: LoginRequest): Observable<AuthenticatedResponse> {
    return this.http
      .post<AuthenticatedResponse>(`${this.authApiUrl}/login`, request, { withCredentials: true })
      .pipe(tap(({ user }) => this.currentUser.set(user)));
  }

  logout(): Observable<AuthMessageResponse> {
    return this.http
      .post<AuthMessageResponse>(`${this.authApiUrl}/logout`, null, { withCredentials: true })
      .pipe(tap(() => this.currentUser.set(null)));
  }

  getStatus(): Observable<AuthenticatedResponse> {
    return defer(() => {
      this.isCheckingSession.set(true);
      return this.http.get<AuthenticatedResponse>(`${this.authApiUrl}/status`, {
        withCredentials: true,
      });
    }).pipe(
      tap(({ user }) => this.currentUser.set(user)),
      finalize(() => this.isCheckingSession.set(false)),
    );
  }

  clearCurrentUser(): void {
    this.currentUser.set(null);
  }
}
