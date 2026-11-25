import type { InvoiceDocument } from "../models/invoice.model";
import { serializeDate, serializeDecimal128 } from "../utils/serialization";

export type InvoicePaymentStatus =
    | "unpaid"
    | "partially_paid"
    | "paid"
    | null;

export interface InvoicePaymentSummary {
    paymentStatus: InvoicePaymentStatus;
    allocatedAmount: string;
    outstandingAmount: string;
}

export interface InvoiceDto {
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
    status: InvoiceDocument["status"];
    paymentStatus: InvoicePaymentStatus;
    allocatedAmount: string;
    outstandingAmount: string;
    description: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export const toInvoiceDto = (
    invoice: InvoiceDocument,
    summary: InvoicePaymentSummary
): InvoiceDto => ({
    id: invoice._id.toString(),
    invoiceNumber: invoice.invoiceNumber,
    studentId: invoice.studentId.toString(),
    enrollmentId: invoice.enrollmentId.toString(),
    groupId: invoice.groupId.toString(),
    periodStart: serializeDate(invoice.periodStart).slice(0, 10),
    periodEnd: serializeDate(invoice.periodEnd).slice(0, 10),
    totalAmount: serializeDecimal128(invoice.totalAmount),
    dueDate: invoice.dueDate ? serializeDate(invoice.dueDate) : null,
    issuedAt: invoice.issuedAt ? serializeDate(invoice.issuedAt) : null,
    status: invoice.status,
    paymentStatus: summary.paymentStatus,
    allocatedAmount: summary.allocatedAmount,
    outstandingAmount: summary.outstandingAmount,
    description: invoice.description,
    notes: invoice.notes,
    createdAt: serializeDate(invoice.createdAt),
    updatedAt: serializeDate(invoice.updatedAt),
});
