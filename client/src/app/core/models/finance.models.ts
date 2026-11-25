import type { ApiEnvelope, PageResult } from './learning.models';

export type InvoiceStatus = 'draft' | 'issued' | 'void';
export type InvoicePaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | null;
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'wallet' | 'other';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  enrollmentId: string;
  groupId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  dueDate: string | null;
  issuedAt: string | null;
  status: InvoiceStatus;
  paymentStatus: InvoicePaymentStatus;
  allocatedAmount: string;
  outstandingAmount: string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  studentId: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  receivedAt: string;
  reference: string | null;
  notes: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  allocations?: PaymentAllocation[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceQuery {
  page: number;
  pageSize: number;
  studentId?: string;
  status?: InvoiceStatus;
  from?: string;
  to?: string;
}

export interface PaymentQuery {
  page: number;
  pageSize: number;
  studentId?: string;
  status?: PaymentStatus;
  from?: string;
  to?: string;
}

export interface InvoiceWrite {
  studentId: string;
  enrollmentId: string;
  periodStart: string;
  periodEnd: string;
  dueDate?: string | null;
  description?: string;
  notes?: string;
  status?: 'draft';
}

export interface InvoiceUpdate {
  studentId?: string;
  enrollmentId?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface PaymentWrite {
  studentId: string;
  amount: string;
  method: PaymentMethod;
  receivedAt?: string;
  reference?: string | null;
  notes?: string;
}

export interface PaymentAllocationWrite {
  invoiceId: string;
  amount: string;
}

export type FinancePageResult<T> = PageResult<T>;
export type FinanceResponse<T> = ApiEnvelope<T>;
