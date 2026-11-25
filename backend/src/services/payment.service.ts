import { Types } from "mongoose";
import StudentModel from "../models/student.model";
import PaymentModel, { PaymentDocument } from "../models/payment.model";
import { NotFoundException } from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import { toDecimal128String } from "../utils/money";
import {
    CreatePaymentInput,
    PaymentListQuery,
} from "../validators/payment.validation";

const ensureStudentExists = async (
    workspaceId: Types.ObjectId,
    studentId: string | Types.ObjectId
): Promise<void> => {
    const student = await StudentModel.exists({
        _id: studentId,
        workspaceId,
    });

    if (!student) {
        throw new NotFoundException("Student not found");
    }
};

const assertPaymentStudentsExist = async (
    workspaceId: Types.ObjectId,
    payments: PaymentDocument[]
): Promise<void> => {
    if (payments.length === 0) {
        return;
    }

    const students = await StudentModel.find({
        workspaceId,
        _id: { $in: payments.map((payment) => payment.studentId) },
    });
    const studentIds = new Set(
        students.map((student) => student._id.toString())
    );

    if (
        payments.some(
            (payment) => !studentIds.has(payment.studentId.toString())
        )
    ) {
        throw new NotFoundException("Payment not found");
    }
};

export const createPaymentService = async (
    workspaceId: Types.ObjectId,
    input: CreatePaymentInput
): Promise<PaymentDocument> => {
    await ensureStudentExists(workspaceId, input.studentId);

    return PaymentModel.create({
        workspaceId,
        studentId: input.studentId,
        amount: Types.Decimal128.fromString(
            toDecimal128String(input.amount)
        ),
        method: input.method,
        status: "completed",
        receivedAt: input.receivedAt ?? new Date(),
        reference: input.reference ?? null,
        notes: input.notes ?? "",
    });
};

export const listPaymentsService = async (
    workspaceId: Types.ObjectId,
    query: PaymentListQuery
) => {
    if (query.studentId) {
        await ensureStudentExists(workspaceId, query.studentId);
    }

    const filter: {
        workspaceId: Types.ObjectId;
        studentId?: string;
        status?: PaymentDocument["status"];
        receivedAt?: { $gte?: Date; $lte?: Date };
    } = { workspaceId };

    if (query.studentId) {
        filter.studentId = query.studentId;
    }

    if (query.status) {
        filter.status = query.status;
    }

    if (query.from || query.to) {
        filter.receivedAt = {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
        };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        PaymentModel.find(filter)
            .sort({ receivedAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        PaymentModel.countDocuments(filter),
    ]);

    await assertPaymentStudentsExist(workspaceId, items);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const getPaymentByIdService = async (
    workspaceId: Types.ObjectId,
    paymentId: string
): Promise<PaymentDocument> => {
    const payment = await PaymentModel.findOne({
        _id: paymentId,
        workspaceId,
    });

    if (!payment) {
        throw new NotFoundException("Payment not found");
    }

    await ensureStudentExists(workspaceId, payment.studentId);
    return payment;
};
