import type { PaymentAllocationDocument } from "../models/payment-allocation.model";
import type { PaymentDocument } from "../models/payment.model";
import { serializeDate, serializeDecimal128 } from "../utils/serialization";

export interface PaymentAllocationDto {
    id: string;
    paymentId: string;
    invoiceId: string;
    amount: string;
    createdAt: string;
    updatedAt: string;
}

export interface PaymentDto {
    id: string;
    studentId: string;
    amount: string;
    method: PaymentDocument["method"];
    status: PaymentDocument["status"];
    receivedAt: string;
    reference: string | null;
    notes: string;
    allocatedAmount: string;
    unallocatedAmount: string;
    allocations?: PaymentAllocationDto[];
    createdAt: string;
    updatedAt: string;
}

export const toPaymentAllocationDto = (
    allocation: PaymentAllocationDocument
): PaymentAllocationDto => ({
    id: allocation._id.toString(),
    paymentId: allocation.paymentId.toString(),
    invoiceId: allocation.invoiceId.toString(),
    amount: serializeDecimal128(allocation.amount),
    createdAt: serializeDate(allocation.createdAt),
    updatedAt: serializeDate(allocation.updatedAt),
});

export const toPaymentDto = (
    payment: PaymentDocument,
    allocatedAmount: string,
    unallocatedAmount: string,
    allocations?: PaymentAllocationDocument[]
): PaymentDto => ({
    id: payment._id.toString(),
    studentId: payment.studentId.toString(),
    amount: serializeDecimal128(payment.amount),
    method: payment.method,
    status: payment.status,
    receivedAt: serializeDate(payment.receivedAt),
    reference: payment.reference,
    notes: payment.notes,
    allocatedAmount,
    unallocatedAmount,
    ...(allocations
        ? { allocations: allocations.map(toPaymentAllocationDto) }
        : {}),
    createdAt: serializeDate(payment.createdAt),
    updatedAt: serializeDate(payment.updatedAt),
});
