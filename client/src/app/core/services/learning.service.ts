import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiEnvelope,
  AttendanceRecord,
  AttendanceRecordUpdate,
  AttendanceRecordWrite,
  AttendanceStatus,
  Enrollment,
  EnrollmentQuery,
  EnrollmentUpdate,
  EnrollmentWrite,
  GroupEnrollmentQuery,
  PageQuery,
  PageResult,
  StudyGroup,
  StudyGroupQuery,
  StudyGroupUpdate,
  StudyGroupWrite,
  Session,
  SessionAttendanceQuery,
  SessionQuery,
  SessionUpdate,
  SessionWrite,
  StudentAttendanceQuery,
  Subject,
  SubjectQuery,
  SubjectUpdate,
  SubjectWrite,
} from '../models/learning.models';

@Injectable({ providedIn: 'root' })
export class LearningService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;

  listSubjects(workspaceId: string, query: SubjectQuery): Observable<PageResult<Subject>> {
    let params = this.pageParams(query);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiEnvelope<PageResult<Subject>>>(`${this.workspaceUrl(workspaceId)}/subjects`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  getSubject(workspaceId: string, subjectId: string): Observable<Subject> {
    return this.http
      .get<ApiEnvelope<Subject>>(
        `${this.workspaceUrl(workspaceId)}/subjects/${encodeURIComponent(subjectId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createSubject(workspaceId: string, input: SubjectWrite): Observable<Subject> {
    return this.http
      .post<ApiEnvelope<Subject>>(`${this.workspaceUrl(workspaceId)}/subjects`, input, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  updateSubject(
    workspaceId: string,
    subjectId: string,
    input: SubjectUpdate,
  ): Observable<Subject> {
    return this.http
      .patch<ApiEnvelope<Subject>>(
        `${this.workspaceUrl(workspaceId)}/subjects/${encodeURIComponent(subjectId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listGroups(workspaceId: string, query: StudyGroupQuery): Observable<PageResult<StudyGroup>> {
    let params = this.pageParams(query);
    if (query.subjectId) params = params.set('subjectId', query.subjectId);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiEnvelope<PageResult<StudyGroup>>>(`${this.workspaceUrl(workspaceId)}/groups`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  getGroup(workspaceId: string, groupId: string): Observable<StudyGroup> {
    return this.http
      .get<ApiEnvelope<StudyGroup>>(
        `${this.workspaceUrl(workspaceId)}/groups/${encodeURIComponent(groupId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createGroup(workspaceId: string, input: StudyGroupWrite): Observable<StudyGroup> {
    return this.http
      .post<ApiEnvelope<StudyGroup>>(`${this.workspaceUrl(workspaceId)}/groups`, input, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  updateGroup(
    workspaceId: string,
    groupId: string,
    input: StudyGroupUpdate,
  ): Observable<StudyGroup> {
    return this.http
      .patch<ApiEnvelope<StudyGroup>>(
        `${this.workspaceUrl(workspaceId)}/groups/${encodeURIComponent(groupId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listGroupEnrollments(
    workspaceId: string,
    groupId: string,
    query: GroupEnrollmentQuery,
  ): Observable<PageResult<Enrollment>> {
    let params = this.pageParams(query);
    if (query.studentId) params = params.set('studentId', query.studentId);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiEnvelope<PageResult<Enrollment>>>(
        `${this.workspaceUrl(workspaceId)}/groups/${encodeURIComponent(groupId)}/enrollments`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data));
  }

  listEnrollments(workspaceId: string, query: EnrollmentQuery): Observable<PageResult<Enrollment>> {
    let params = this.pageParams(query);
    if (query.studentId) params = params.set('studentId', query.studentId);
    if (query.groupId) params = params.set('groupId', query.groupId);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiEnvelope<PageResult<Enrollment>>>(`${this.workspaceUrl(workspaceId)}/enrollments`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  getEnrollment(workspaceId: string, enrollmentId: string): Observable<Enrollment> {
    return this.http
      .get<ApiEnvelope<Enrollment>>(
        `${this.workspaceUrl(workspaceId)}/enrollments/${encodeURIComponent(enrollmentId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createEnrollment(
    workspaceId: string,
    groupId: string,
    input: EnrollmentWrite,
  ): Observable<Enrollment> {
    return this.http
      .post<ApiEnvelope<Enrollment>>(
        `${this.workspaceUrl(workspaceId)}/groups/${encodeURIComponent(groupId)}/enrollments`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  updateEnrollment(
    workspaceId: string,
    enrollmentId: string,
    input: EnrollmentUpdate,
  ): Observable<Enrollment> {
    return this.http
      .patch<ApiEnvelope<Enrollment>>(
        `${this.workspaceUrl(workspaceId)}/enrollments/${encodeURIComponent(enrollmentId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listSessions(workspaceId: string, query: SessionQuery): Observable<PageResult<Session>> {
    let params = this.pageParams(query);
    if (query.groupId) params = params.set('groupId', query.groupId);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiEnvelope<PageResult<Session>>>(`${this.workspaceUrl(workspaceId)}/sessions`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  getSession(workspaceId: string, sessionId: string): Observable<Session> {
    return this.http
      .get<ApiEnvelope<Session>>(
        `${this.workspaceUrl(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createSession(workspaceId: string, input: SessionWrite): Observable<Session> {
    return this.http
      .post<ApiEnvelope<Session>>(`${this.workspaceUrl(workspaceId)}/sessions`, input, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  updateSession(
    workspaceId: string,
    sessionId: string,
    input: SessionUpdate,
  ): Observable<Session> {
    return this.http
      .patch<ApiEnvelope<Session>>(
        `${this.workspaceUrl(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listSessionAttendance(
    workspaceId: string,
    sessionId: string,
    query: SessionAttendanceQuery,
  ): Observable<PageResult<AttendanceRecord>> {
    let params = this.pageParams(query);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<ApiEnvelope<PageResult<AttendanceRecord>>>(
        `${this.workspaceUrl(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/attendance`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data));
  }

  createAttendanceRecord(
    workspaceId: string,
    sessionId: string,
    input: AttendanceRecordWrite,
  ): Observable<AttendanceRecord> {
    return this.http
      .post<ApiEnvelope<AttendanceRecord>>(
        `${this.workspaceUrl(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/attendance`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  updateAttendanceRecord(
    workspaceId: string,
    sessionId: string,
    attendanceId: string,
    input: AttendanceRecordUpdate,
  ): Observable<AttendanceRecord> {
    return this.http
      .patch<ApiEnvelope<AttendanceRecord>>(
        `${this.workspaceUrl(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/attendance/${encodeURIComponent(attendanceId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listStudentAttendance(
    workspaceId: string,
    studentId: string,
    query: StudentAttendanceQuery,
  ): Observable<PageResult<AttendanceRecord>> {
    let params = this.pageParams(query);
    if (query.status) params = params.set('status', query.status);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);

    return this.http
      .get<ApiEnvelope<PageResult<AttendanceRecord>>>(
        `${this.workspaceUrl(workspaceId)}/students/${encodeURIComponent(studentId)}/attendance`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data));
  }

  private workspaceUrl(workspaceId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(workspaceId)}`;
  }

  private pageParams(query: PageQuery): HttpParams {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    return params;
  }
}
