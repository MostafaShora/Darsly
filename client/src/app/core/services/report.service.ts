import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface DashboardSummary {
  period: ReportPeriod;
  students: {
    total: number;
    active: number;
    inactive: number;
    archived: number;
  };
  groups: {
    total: number;
    activeEnrollments: number;
    pausedEnrollments: number;
    cancelledEnrollments: number;
    occupancy: Array<{
      groupId: string;
      name: string;
      capacity: number | null;
      activeEnrollments: number;
      availablePlaces: number | null;
      occupancyRate: number | null;
    }>;
  };
  sessions: {
    scheduled: number;
    completed: number;
    cancelled: number;
  };
  attendance: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    attended: number;
    denominator: number;
    attendanceRate: number | null;
  };
  finance: {
    issuedInvoiceCount: number;
    issuedInvoiceTotal: string;
    currentOutstanding: string;
    collectedInPeriod: string;
    unallocatedPayments: string;
  };
}

export type DashboardActivityItem =
  | {
      id: string;
      type: 'attendance';
      occurredAt: string;
      status: 'present' | 'absent' | 'late' | 'excused';
    }
  | {
      id: string;
      type: 'payment';
      occurredAt: string;
      amount: string;
      method: 'cash' | 'bank_transfer' | 'card' | 'wallet' | 'other';
      status: 'pending' | 'completed' | 'failed' | 'refunded';
    };

export interface AttendanceReport {
  period: ReportPeriod;
  summary: DashboardSummary['attendance'];
  items: Array<{
    id: string;
    sessionId: string;
    sessionTitle: string;
    groupId: string;
    groupName: string;
    studentId: string;
    studentName: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    lateMinutes: number;
    recordedAt: string;
    sessionStartsAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface FinanceReport {
  period: ReportPeriod;
  paymentMethods: Array<{ method: string; amount: string }>;
  historicalData: {
    asOf: string;
    available: boolean;
    legacyIssuedInvoiceCount: number;
    ambiguousVoidedInvoiceCount: number;
    limitation: string | null;
  };
  summary: {
    issuedInvoiceCount: number;
    issuedInvoiceTotal: string;
    collectedInPeriod: string;
    allocatedInPeriod: string;
    currentOutstanding: string;
    unallocatedPayments: string;
    historicalOutstanding: string | null;
    historicalUnallocatedPayments: string | null;
  };
  invoices: ReportCollection<{ id: string; invoiceNumber: string; studentId: string; issuedAt: string | null; totalAmount: string; status: string }>;
  payments: ReportCollection<{ id: string; studentId: string; amount: string; method: string; receivedAt: string }>;
  allocations: ReportCollection<{ id: string; paymentId: string; invoiceId: string; amount: string; createdAt: string }>;
}

export interface ReportCollection<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface ApiResponse<T> {
  message: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;

  getDashboard(workspaceId: string, timezone: string): Observable<DashboardSummary> {
    const params = new HttpParams().set('timezone', timezone);
    return this.http
      .get<ApiResponse<DashboardSummary>>(
        `${this.baseUrl}/${workspaceId}/dashboard/summary`,
        { withCredentials: true, params },
      )
      .pipe(mapResponse());
  }

  getDashboardActivity(workspaceId: string, limit = 5): Observable<DashboardActivityItem[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http
      .get<ApiResponse<DashboardActivityItem[]>>(
        `${this.baseUrl}/${encodeURIComponent(workspaceId)}/dashboard/activity`,
        { withCredentials: true, params },
      )
      .pipe(mapResponse());
  }

  getAttendance(
    workspaceId: string,
    query: {
      from?: string;
      to?: string;
      studentId?: string;
      groupId?: string;
      timezone: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ): Observable<AttendanceReport> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return this.http
      .get<ApiResponse<AttendanceReport>>(
        `${this.baseUrl}/${workspaceId}/reports/attendance`,
        { withCredentials: true, params },
      )
      .pipe(mapResponse());
  }

  getFinance(
    workspaceId: string,
    query: { from?: string; to?: string; studentId?: string; timezone: string; page?: number; pageSize?: number },
  ): Observable<FinanceReport> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return this.http
      .get<ApiResponse<FinanceReport>>(
        `${this.baseUrl}/${workspaceId}/reports/finance`,
        { withCredentials: true, params },
      )
      .pipe(mapResponse());
  }
}

function mapResponse<T>() {
  return map((response: ApiResponse<T>) => response.data);
}
