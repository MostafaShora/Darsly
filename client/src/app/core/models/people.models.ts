export type StudentStatus = 'active' | 'inactive' | 'archived';

export type RelationshipType =
  | 'father'
  | 'mother'
  | 'brother'
  | 'sister'
  | 'relative'
  | 'other';

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

export interface Student {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  schoolName: string;
  grade: string;
  status: StudentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentWrite {
  name: string;
  phone: string | null;
  email: string | null;
  schoolName: string;
  grade: string;
  status: StudentStatus;
  notes: string;
}

export interface Guardian {
  id: string;
  name: string;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  relationship: RelationshipType;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianWrite {
  name: string;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  relationship: RelationshipType;
  notes: string;
}

export interface StudentGuardianLink {
  guardian: Omit<Guardian, 'relationship'>;
  relationship: RelationshipType;
  isPrimary: boolean;
  receivesNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentGuardianWrite {
  guardianId: string;
  relationship: RelationshipType;
  isPrimary: boolean;
  receivesNotifications: boolean;
}

export interface StudentGuardianUpdate {
  relationship?: RelationshipType;
  isPrimary?: boolean;
  receivesNotifications?: boolean;
}
