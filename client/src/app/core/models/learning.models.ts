export type SubjectStatus = 'active' | 'archived';
export type StudyGroupStatus = 'active' | 'inactive' | 'archived';
export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type NewEnrollmentStatus = Extract<EnrollmentStatus, 'active' | 'paused'>;
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';

export interface PageQuery {
  page: number;
  pageSize: number;
  search?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PageResult<T> {
  items: T[];
  pagination: Pagination;
}

export interface ApiEnvelope<T> {
  message: string;
  data: T;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  status: SubjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectQuery extends PageQuery {
  status?: SubjectStatus;
}

export interface SubjectWrite {
  name: string;
  description?: string;
}

export interface SubjectUpdate extends Partial<SubjectWrite> {
  status?: SubjectStatus;
}

export interface StudyGroup {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  monthlyFee: string;
  capacity: number | null;
  status: StudyGroupStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudyGroupQuery extends PageQuery {
  subjectId?: string;
  status?: StudyGroupStatus;
}

export interface StudyGroupWrite {
  subjectId: string;
  name: string;
  description?: string;
  monthlyFee: string;
  capacity: number | null;
}

export interface StudyGroupUpdate extends Partial<StudyGroupWrite> {
  status?: StudyGroupStatus;
}

export interface GroupEnrollmentQuery extends PageQuery {
  studentId?: string;
  status?: EnrollmentStatus;
}

export interface Enrollment {
  id: string;
  studentId: string;
  groupId: string;
  enrolledAt: string;
  endedAt: string | null;
  status: EnrollmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollmentWrite {
  studentId: string;
  enrolledAt?: string;
  notes?: string;
  status?: NewEnrollmentStatus;
}

export interface EnrollmentUpdate {
  status?: EnrollmentStatus;
  endedAt?: string | null;
  notes?: string;
}

export interface Session {
  id: string;
  groupId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionQuery {
  page: number;
  pageSize: number;
  groupId?: string;
  from?: string;
  to?: string;
  status?: SessionStatus;
}

export interface SessionWrite {
  groupId: string;
  startsAt: string;
  endsAt: string;
  title?: string;
  notes?: string;
}

export interface SessionUpdate {
  startsAt?: string;
  endsAt?: string;
  title?: string;
  status?: SessionStatus;
  notes?: string;
}
