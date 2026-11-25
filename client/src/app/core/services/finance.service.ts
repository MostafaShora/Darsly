import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope, PageResult } from '../models/learning.models';
import {
  Invoice,
  InvoiceQuery,
  InvoiceUpdate,
  InvoiceWrite,
  Payment,
  PaymentAllocation,
  PaymentAllocationWrite,
  PaymentQuery,
  PaymentWrite,
} from '../models/finance.models';

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;

  listInvoices(workspaceId: string, query: InvoiceQuery): Observable<PageResult<Invoice>> {
    let params = this.pageParams(query.page, query.pageSize);
    if (query.studentId) params = params.set('studentId', query.studentId);
    if (query.status) params = params.set('status', query.status);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);

    return this.http
      .get<ApiEnvelope<PageResult<Invoice>>>(`${this.workspaceUrl(workspaceId)}/invoices`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  getInvoice(workspaceId: string, invoiceId: string): Observable<Invoice> {
    return this.http
      .get<ApiEnvelope<Invoice>>(
        `${this.workspaceUrl(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createInvoice(workspaceId: string, input: InvoiceWrite): Observable<Invoice> {
    return this.http
      .post<ApiEnvelope<Invoice>>(`${this.workspaceUrl(workspaceId)}/invoices`, input, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  updateInvoice(workspaceId: string, invoiceId: string, input: InvoiceUpdate): Observable<Invoice> {
    return this.http
      .patch<ApiEnvelope<Invoice>>(
        `${this.workspaceUrl(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  issueInvoice(workspaceId: string, invoiceId: string): Observable<Invoice> {
    return this.http
      .post<ApiEnvelope<Invoice>>(
        `${this.workspaceUrl(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}/issue`,
        {},
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  voidInvoice(workspaceId: string, invoiceId: string): Observable<Invoice> {
    return this.http
      .post<ApiEnvelope<Invoice>>(
        `${this.workspaceUrl(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}/void`,
        {},
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listInvoiceAllocations(workspaceId: string, invoiceId: string): Observable<PaymentAllocation[]> {
    return this.http
      .get<ApiEnvelope<PaymentAllocation[]>>(
        `${this.workspaceUrl(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}/allocations`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listPayments(workspaceId: string, query: PaymentQuery): Observable<PageResult<Payment>> {
    let params = this.pageParams(query.page, query.pageSize);
    if (query.studentId) params = params.set('studentId', query.studentId);
    if (query.status) params = params.set('status', query.status);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);

    return this.http
      .get<ApiEnvelope<PageResult<Payment>>>(`${this.workspaceUrl(workspaceId)}/payments`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  getPayment(workspaceId: string, paymentId: string): Observable<Payment> {
    return this.http
      .get<ApiEnvelope<Payment>>(
        `${this.workspaceUrl(workspaceId)}/payments/${encodeURIComponent(paymentId)}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createPayment(workspaceId: string, input: PaymentWrite): Observable<Payment> {
    return this.http
      .post<ApiEnvelope<Payment>>(`${this.workspaceUrl(workspaceId)}/payments`, input, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  listPaymentAllocations(workspaceId: string, paymentId: string): Observable<PaymentAllocation[]> {
    return this.http
      .get<ApiEnvelope<PaymentAllocation[]>>(
        `${this.workspaceUrl(workspaceId)}/payments/${encodeURIComponent(paymentId)}/allocations`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createPaymentAllocation(
    workspaceId: string,
    paymentId: string,
    input: PaymentAllocationWrite,
  ): Observable<PaymentAllocation> {
    return this.http
      .post<ApiEnvelope<PaymentAllocation>>(
        `${this.workspaceUrl(workspaceId)}/payments/${encodeURIComponent(paymentId)}/allocations`,
        input,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  private workspaceUrl(workspaceId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(workspaceId)}`;
  }

  private pageParams(page: number, pageSize: number): HttpParams {
    return new HttpParams().set('page', page).set('pageSize', pageSize);
  }
}
