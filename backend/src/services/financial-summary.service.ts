import { Types } from "mongoose";
import {
    InvoicePaymentSummary,
} from "../dtos/invoice.dto";
import { PaymentAllocationDocument } from "../models/payment-allocation.model";
import InvoiceModel, { InvoiceDocument } from "../models/invoice.model";
import PaymentModel, { PaymentDocument } from "../models/payment.model";
import PaymentAllocationModel from "../models/payment-allocation.model";
import {
    compareDecimalStrings,
    subtractDecimalStrings,
    sumDecimalStrings,
} from "../utils/money";
import { InternalServerException } from "../utils/app-error";

export interface InvoiceAllocationSummary {
    summary: InvoicePaymentSummary;
    allocations: PaymentAllocationDocument[];
}

export interface PaymentAllocationSummary {
    allocatedAmount: string;
    unallocatedAmount: string;
    allocations: PaymentAllocationDocument[];
}

const isPositiveAllocation = (
    allocation: PaymentAllocationDocument
): boolean => compareDecimalStrings(allocation.amount.toString(), "0") > 0;

export const getInvoiceAllocationSummaries = async (
    workspaceId: Types.ObjectId,
    invoices: InvoiceDocument[]
): Promise<Map<string, InvoiceAllocationSummary>> => {
    const result = new Map<string, InvoiceAllocationSummary>();

    if (invoices.length === 0) {
        return result;
    }

    const invoiceById = new Map(
        invoices.map((invoice) => [invoice._id.toString(), invoice])
    );
    const allocations = await PaymentAllocationModel.find({
        workspaceId,
        invoiceId: { $in: invoices.map((invoice) => invoice._id) },
    });
    const payments = allocations.length
        ? await PaymentModel.find({
              workspaceId,
              _id: {
                  $in: allocations.map((allocation) => allocation.paymentId),
              },
              status: "completed",
          })
        : [];
    const paymentById = new Map(
        payments.map((payment) => [payment._id.toString(), payment])
    );
    const validByInvoice = new Map<string, PaymentAllocationDocument[]>();

    for (const allocation of allocations) {
        const invoice = invoiceById.get(allocation.invoiceId.toString());
        const payment = paymentById.get(allocation.paymentId.toString());

        if (
            !invoice ||
            invoice.status !== "issued" ||
            !payment ||
            !payment.studentId.equals(invoice.studentId) ||
            !isPositiveAllocation(allocation)
        ) {
            continue;
        }

        const invoiceId = invoice._id.toString();
        const list = validByInvoice.get(invoiceId) ?? [];
        list.push(allocation);
        validByInvoice.set(invoiceId, list);
    }

    for (const invoice of invoices) {
        const valid = validByInvoice.get(invoice._id.toString()) ?? [];
        const allocatedAmount = sumDecimalStrings(
            valid.map((allocation) => allocation.amount.toString())
        );
        const outstandingAmount = subtractDecimalStrings(
            invoice.totalAmount.toString(),
            allocatedAmount
        );

        if (compareDecimalStrings(outstandingAmount, "0") < 0) {
            throw new InternalServerException(
                "Invoice allocations exceed the invoice total"
            );
        }

        const paymentStatus: InvoicePaymentSummary["paymentStatus"] =
            invoice.status !== "issued"
                ? null
                : allocatedAmount === "0"
                  ? "unpaid"
                  : outstandingAmount === "0"
                    ? "paid"
                    : "partially_paid";

        result.set(invoice._id.toString(), {
            summary: {
                paymentStatus,
                allocatedAmount,
                outstandingAmount,
            },
            allocations: valid,
        });
    }

    return result;
};

export const getPaymentAllocationSummaries = async (
    workspaceId: Types.ObjectId,
    payments: PaymentDocument[]
): Promise<Map<string, PaymentAllocationSummary>> => {
    const result = new Map<string, PaymentAllocationSummary>();

    if (payments.length === 0) {
        return result;
    }

    const paymentById = new Map(
        payments.map((payment) => [payment._id.toString(), payment])
    );
    const allocations = await PaymentAllocationModel.find({
        workspaceId,
        paymentId: { $in: payments.map((payment) => payment._id) },
    });
    const invoices = allocations.length
        ? await InvoiceModel.find({
              workspaceId,
              _id: {
                  $in: allocations.map((allocation) => allocation.invoiceId),
              },
              status: "issued",
          })
        : [];
    const invoiceById = new Map(
        invoices.map((invoice) => [invoice._id.toString(), invoice])
    );
    const validByPayment = new Map<string, PaymentAllocationDocument[]>();

    for (const allocation of allocations) {
        const payment = paymentById.get(allocation.paymentId.toString());
        const invoice = invoiceById.get(allocation.invoiceId.toString());

        if (
            !payment ||
            payment.status !== "completed" ||
            !invoice ||
            !invoice.studentId.equals(payment.studentId) ||
            !isPositiveAllocation(allocation)
        ) {
            continue;
        }

        const paymentId = payment._id.toString();
        const list = validByPayment.get(paymentId) ?? [];
        list.push(allocation);
        validByPayment.set(paymentId, list);
    }

    for (const payment of payments) {
        const valid =
            payment.status === "completed"
                ? validByPayment.get(payment._id.toString()) ?? []
                : [];
        const allocatedAmount = sumDecimalStrings(
            valid.map((allocation) => allocation.amount.toString())
        );
        const unallocatedAmount = subtractDecimalStrings(
            payment.amount.toString(),
            allocatedAmount
        );

        if (compareDecimalStrings(unallocatedAmount, "0") < 0) {
            throw new InternalServerException(
                "Payment allocations exceed the payment amount"
            );
        }

        result.set(payment._id.toString(), {
            allocatedAmount,
            unallocatedAmount,
            allocations: valid,
        });
    }

    return result;
};
