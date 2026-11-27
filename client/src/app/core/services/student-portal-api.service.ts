import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  StudentOverview,
  StudentProfile,
  StudentPortalGroup,
} from '../models/student-portal.models';
import { StudentContextService } from './student-context.service';

interface ApiResponse<T> {
  message: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class StudentPortalApiService {
  private readonly http = inject(HttpClient);
  private readonly studentContextService = inject(StudentContextService);
  private readonly baseUrl = `${environment.apiBaseUrl}/student-portal`;

  getGroups(): Observable<StudentPortalGroup[]> {
    return this.http
      .get<ApiResponse<StudentPortalGroup[]>>(`${this.baseUrl}/groups`, {
        headers: this.studentContextService.selectedContextHeaders(),
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  getOverview(): Observable<StudentOverview> {
    return this.http
      .get<ApiResponse<StudentOverview>>(`${this.baseUrl}/overview`, {
        headers: this.studentContextService.selectedContextHeaders(),
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  getProfile(): Observable<StudentProfile> {
    return this.http
      .get<ApiResponse<StudentProfile>>(`${this.baseUrl}/profile`, {
        headers: this.studentContextService.selectedContextHeaders(),
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }
}
