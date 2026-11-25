import mongoose, { ClientSession, Types } from "mongoose";
import EnrollmentModel from "../models/enrollment.model";
import InvoiceModel, { InvoiceDocument } from "../models/invoice.model";
import PaymentAllocationModel, {
    PaymentAllocationDocument,
} from "../models/payment-allocation.model";
import PaymentModel, { PaymentDocument } from "../models/payment.model";
import StudentModel from "../models/student.model";
import StudyGroupModel from "../models/study-group.model";
import { getInvoiceByIdService } from "./invoice.service";
import { getPaymentByIdService } from "./payment.service";
import {
    ConflictException,
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import {
    compareDecimalStrings,
    subtractDecimalStrings,
    sumDecimalStrings,
    toDecimal128String,
} from "../utils/money";
import {
    getInvoiceAllocationSummaries,
    getPaymentAllocationSummaries,
} from "./financial-summary.service";
import { CreatePaymentAllocationInput } from "../validators/payment.validation";

const nextUpdatedAt = (value: Date): Date =>
    new Date(Math.max(Date.now(), value.getTime() + 1));

const lockPayment = async (
    workspaceId: Types.ObjectId,
    payment: PaymentDocument,
    session: ClientSession
): Promise<void> => {
    const updated = await PaymentModel.findOneAndUpdate(
        {
            _id: payment._id,
            workspaceId,
            updatedAt: payment.updatedAt,
        },
        { $set: { updatedAt: nextUpdatedAt(payment.updatedAt) } },
        {
            returnDocument: "after",
            session,
            timestamps: false,
        }
    );

    if (!updated) {
        throw new ConflictException(
            "Payment changed while its allocation was being processed"
        );
    }
};

const lockInvoice = async (
    workspaceId: Types.ObjectId,
    invoice: InvoiceDocument,
    session: ClientSession
): Promise<void> => {
    const updated = await InvoiceModel.findOneAndUpdate(
        {
            _id: invoice._id,
            workspaceId,
            status: "issued",
            updatedAt: invoice.updatedAt,
        },
        { $set: { updatedAt: nextUpdatedAt(invoice.updatedAt) } },
        {
            returnDocument: "after",
            session,
            timestamps: false,
        }
    );

    if (!updated) {
        throw new ConflictException(
            "Invoice changed while its allocation was being processed"
        );
    }
};

const validateAllocationReferences = async (
    workspaceId: Types.ObjectId,
    payment: PaymentDocument,
    invoice: InvoiceDocument,
    session: ClientSession
): Promise<void> => {
    const [paymentStudent, invoiceStudent, enrollment, group] =
        await Promise.all([
            StudentModel.exists({
                _id: payment.studentId,
                workspaceId,
            }).session(session),
            StudentModel.exists({
                _id: invoice.studentId,
                workspaceId,
            }).session(session),
            EnrollmentModel.exists({
                _id: invoice.enrollmentId,
                workspaceId,
                studentId: invoice.studentId,
                groupId: invoice.groupId,
            }).session(session),
            StudyGroupModel.exists({
                _id: invoice.groupId,
                workspaceId,
            }).session(session),
        ]);

    if (!paymentStudent || !invoiceStudent || !enrollment || !group) {
        throw new NotFoundException("Payment or invoice not found");
    }

    if (!payment.studentId.equals(invoice.studentId)) {
        throw new NotFoundException("Payment or invoice not found");
    }
};

const loadExistingAllocations = async (
    workspaceId: Types.ObjectId,
    payment: PaymentDocument,
    invoice: InvoiceDocument,
    session: ClientSession
): Promise<{
    paymentAllocations: PaymentAllocationDocument[];
    invoiceAllocations: PaymentAllocationDocument[];
}> => {
    const [paymentAllocations, invoiceAllocations] = await Promise.all([
        PaymentAllocationModel.find({
            workspaceId,
            paymentId: payment._id,
        }).session(session),
        PaymentAllocationModel.find({
            workspaceId,
            invoiceId: invoice._id,
        }).session(session),
    ]);

    const [allocatedInvoices, allocatedPayments] = await Promise.all([
        paymentAllocations.length
            ? InvoiceModel.find({
                  workspaceId,
                  _id: {
                      $in: paymentAllocations.map(
                          (allocation) => allocation.invoiceId
                      ),
                  },
              }).session(session)
            : [],
        invoiceAllocations.length
            ? PaymentModel.find({
                  workspaceId,
                  _id: {
                      $in: invoiceAllocations.map(
                          (allocation) => allocation.paymentId
                      ),
                  },
              }).session(session)
            : [],
    ]);
    const invoiceById = new Map(
        allocatedInvoices.map((item) => [item._id.toString(), item])
    );
    const paymentById = new Map(
        allocatedPayments.map((item) => [item._id.toString(), item])
    );

    const invalidPaymentAllocation = paymentAllocations.some((allocation) => {
        const allocatedInvoice = invoiceById.get(
            allocation.invoiceId.toString()
        );
        return (
            !allocatedInvoice ||
            allocatedInvoice.status !== "issued" ||
            !allocatedInvoice.studentId.equals(payment.studentId) ||
            compareDecimalStrings(allocation.amount.toString(), "0") <= 0
        );
    });
    const invalidInvoiceAllocation = invoiceAllocations.some((allocation) => {
        const allocatedPayment = paymentById.get(
            allocation.paymentId.toString()
        );
        return (
            !allocatedPayment ||
            allocatedPayment.status !== "completed" ||
            !allocatedPayment.studentId.equals(invoice.studentId) ||
            compareDecimalStrings(allocation.amount.toString(), "0") <= 0
        );
    });

    if (invalidPaymentAllocation || invalidInvoiceAllocation) {
        throw new InternalServerException(
            "Existing financial allocations contain invalid references"
        );
    }

    return { paymentAllocations, invoiceAllocations };
};

export const createPaymentAllocationService = async (
    workspaceId: Types.ObjectId,
    paymentId: string,
    input: CreatePaymentAllocationInput
): Promise<PaymentAllocationDocument> => {
    const session = await mongoose.startSession();

    try {
        const allocation = await session.withTransaction(async () => {
            const payment = await PaymentModel.findOne({
                _id: paymentId,
                workspaceId,
            }).session(session);
            const invoice = await InvoiceModel.findOne({
                _id: input.invoiceId,
                workspaceId,
            }).session(session);

            if (!payment || !invoice) {
                throw new NotFoundException("Payment or invoice not found");
            }

            if (payment.status !== "completed") {
                throw new ConflictException(
                    "Only completed payments can be allocated"
                );
            }

            if (invoice.status !== "issued") {
                throw new ConflictException(
                    "Only issued invoices can receive allocations"
                );
            }

            await validateAllocationReferences(
                workspaceId,
                payment,
                invoice,
                session
            );
            await lockPayment(workspaceId, payment, session);
            await lockInvoice(workspaceId, invoice, session);

            const requestedAmount =
                Types.Decimal128.fromString(
                    toDecimal128String(input.amount)
                ).toString();
            if (compareDecimalStrings(requestedAmount, "0") <= 0) {
                throw new ConflictException(
                    "Allocation amount must be greater than zero"
                );
            }

            const { paymentAllocations, invoiceAllocations } =
                await loadExistingAllocations(
                    workspaceId,
                    payment,
                    invoice,
                    session
                );
            const paymentAllocated = sumDecimalStrings(
                paymentAllocations.map((item) => item.amount.toString())
            );
            const invoiceAllocated = sumDecimalStrings(
                invoiceAllocations.map((item) => item.amount.toString())
            );
            const paymentUnallocated = subtractDecimalStrings(
                payment.amount.toString(),
                paymentAllocated
            );
            const invoiceOutstanding = subtractDecimalStrings(
                invoice.totalAmount.toString(),
                invoiceAllocated
            );

            if (
                compareDecimalStrings(paymentUnallocated, "0") < 0 ||
                compareDecimalStrings(invoiceOutstanding, "0") < 0
            ) {
                throw new InternalServerException(
                    "Existing financial allocations exceed their source balance"
                );
            }

            if (
                compareDecimalStrings(requestedAmount, paymentUnallocated) > 0
            ) {
                throw new ConflictException(
                    "Allocation exceeds the payment's unallocated amount"
                );
            }

            if (
                compareDecimalStrings(requestedAmount, invoiceOutstanding) > 0
            ) {
                throw new ConflictException(
                    "Allocation exceeds the invoice's outstanding balance"
                );
            }

            const [created] = await PaymentAllocationModel.create(
                [
                    {
                        workspaceId,
                        paymentId: payment._id,
                        invoiceId: invoice._id,
                        amount: Types.Decimal128.fromString(requestedAmount),
                    },
                ],
                { session }
            );

            if (!created) {
                throw new InternalServerException();
            }

            return created;
        });

        if (!allocation) {
            throw new InternalServerException();
        }

        return allocation;
    } finally {
        await session.endSession();
    }
};

export const listPaymentAllocationsService = async (
    workspaceId: Types.ObjectId,
    paymentId: string
): Promise<PaymentAllocationDocument[]> => {
    const payment = await getPaymentByIdService(workspaceId, paymentId);
    const summaries = await getPaymentAllocationSummaries(
        workspaceId,
        [payment]
    );

    return summaries.get(payment._id.toString())?.allocations ?? [];
};

export const listInvoiceAllocationsService = async (
    workspaceId: Types.ObjectId,
    invoiceId: string
): Promise<PaymentAllocationDocument[]> => {
    const invoice = await getInvoiceByIdService(workspaceId, invoiceId);
    const summaries = await getInvoiceAllocationSummaries(
        workspaceId,
        [invoice]
    );

    return summaries.get(invoice._id.toString())?.allocations ?? [];
};
