import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiEnvelope,
  Guardian,
  GuardianWrite,
  PageQuery,
  PageResult,
  Student,
  StudentGuardianLink,
  StudentGuardianUpdate,
  StudentGuardianWrite,
  StudentStatus,
  StudentWrite,
} from '../models/people.models';

interface StudentPageQuery extends PageQuery {
  status?: StudentStatus;
}

interface UnlinkResult {
  studentId: string;
  guardianId: string;
}

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;

  listStudents(
    workspaceId: string,
    query: StudentPageQuery,
  ): Observable<PageResult<Student>> {
    return this.http
      .get<ApiEnvelope<PageResult<Student>>>(
        `${this.workspaceUrl(workspaceId)}/students`,
        {
          withCredentials: true,
          params: this.pageParams(query, query.status),
        },
      )
      .pipe(map((response) => response.data));
  }

  getStudent(workspaceId: string, studentId: string): Observable<Student> {
    return this.http
      .get<ApiEnvelope<Student>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createStudent(workspaceId: string, input: StudentWrite): Observable<Student> {
    return this.http
      .post<ApiEnvelope<Student>>(
        `${this.workspaceUrl(workspaceId)}/students`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  updateStudent(
    workspaceId: string,
    studentId: string,
    input: StudentWrite,
  ): Observable<Student> {
    return this.http
      .patch<ApiEnvelope<Student>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listGuardians(workspaceId: string, query: PageQuery): Observable<PageResult<Guardian>> {
    return this.http
      .get<ApiEnvelope<PageResult<Guardian>>>(
        `${this.workspaceUrl(workspaceId)}/guardians`,
        { withCredentials: true, params: this.pageParams(query) },
      )
      .pipe(map((response) => response.data));
  }

  getGuardian(workspaceId: string, guardianId: string): Observable<Guardian> {
    return this.http
      .get<ApiEnvelope<Guardian>>(
        `${this.workspaceUrl(workspaceId)}/guardians/${encodeURIComponent(guardianId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createGuardian(workspaceId: string, input: GuardianWrite): Observable<Guardian> {
    return this.http
      .post<ApiEnvelope<Guardian>>(
        `${this.workspaceUrl(workspaceId)}/guardians`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  updateGuardian(
    workspaceId: string,
    guardianId: string,
    input: GuardianWrite,
  ): Observable<Guardian> {
    return this.http
      .patch<ApiEnvelope<Guardian>>(
        `${this.workspaceUrl(workspaceId)}/guardians/${encodeURIComponent(guardianId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listStudentGuardians(
    workspaceId: string,
    studentId: string,
  ): Observable<StudentGuardianLink[]> {
    return this.http
      .get<ApiEnvelope<StudentGuardianLink[]>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}/guardians`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  linkGuardian(
    workspaceId: string,
    studentId: string,
    input: StudentGuardianWrite,
  ): Observable<StudentGuardianLink> {
    return this.http
      .post<ApiEnvelope<StudentGuardianLink>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}/guardians`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  updateStudentGuardian(
    workspaceId: string,
    studentId: string,
    guardianId: string,
    input: StudentGuardianUpdate,
  ): Observable<StudentGuardianLink> {
    return this.http
      .patch<ApiEnvelope<StudentGuardianLink>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}/guardians/${encodeURIComponent(guardianId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  unlinkGuardian(
    workspaceId: string,
    studentId: string,
    guardianId: string,
  ): Observable<UnlinkResult> {
    return this.http
      .delete<ApiEnvelope<UnlinkResult>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}/guardians/${encodeURIComponent(guardianId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  private workspaceUrl(workspaceId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(workspaceId)}`;
  }

  private pageParams(query: PageQuery, status?: StudentStatus): HttpParams {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize);
    const search = query.search?.trim();

    if (search) {
      params = params.set('search', search);
    }

    if (status) {
      params = params.set('status', status);
    }

    return params;
  }
}
