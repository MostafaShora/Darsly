import mongoose, { ClientSession, Types } from "mongoose";
import EnrollmentModel from "../models/enrollment.model";
import InvoiceNumberCounterModel from "../models/invoice-number-counter.model";
import InvoiceModel, { InvoiceDocument } from "../models/invoice.model";
import PaymentAllocationModel from "../models/payment-allocation.model";
import StudentModel from "../models/student.model";
import StudyGroupModel from "../models/study-group.model";
import {
    BadRequestException,
    ConflictException,
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import {
    calculateProratedInvoiceAmount,
    compareDecimalStrings,
} from "../utils/money";
import {
    CreateInvoiceInput,
    InvoiceListQuery,
    UpdateInvoiceInput,
} from "../validators/invoice.validation";

const isCounterInitializationConflict = (error: unknown): boolean => {
    if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 11000 ||
        !("keyPattern" in error) ||
        typeof error.keyPattern !== "object" ||
        error.keyPattern === null
    ) {
        return false;
    }

    const keyPattern = error.keyPattern as Record<string, unknown>;
    return (
        Object.keys(keyPattern).length === 1 &&
        keyPattern.workspaceId === 1
    );
};

const dateOnlyToDate = (value: string): Date =>
    new Date(`${value}T00:00:00.000Z`);

const getDateOnly = (value: Date): string =>
    value.toISOString().slice(0, 10);

const calculateInvoiceTotal = (
    monthlyFee: string,
    periodStart: string,
    periodEnd: string
): Types.Decimal128 => {
    let amount: string;

    try {
        amount = calculateProratedInvoiceAmount(
            monthlyFee,
            periodStart,
            periodEnd
        );
    } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) {
            throw new BadRequestException(error.message);
        }

        throw error;
    }

    if (!/^(?=.*[1-9])\d+(?:\.\d{2})$/.test(amount)) {
        throw new BadRequestException(
            "Calculated invoice amount must be greater than zero"
        );
    }

    return Types.Decimal128.fromString(amount);
};

const getInvoiceReferences = async (
    workspaceId: Types.ObjectId,
    studentId: string | Types.ObjectId,
    enrollmentId: string | Types.ObjectId,
    session?: ClientSession,
    requireActiveEnrollment = true
) => {
    const studentQuery = StudentModel.exists({
        _id: studentId,
        workspaceId,
    });
    const enrollmentQuery = EnrollmentModel.findOne({
        _id: enrollmentId,
        workspaceId,
    });
    const [student, enrollment] = await Promise.all([
        session ? studentQuery.session(session) : studentQuery,
        session ? enrollmentQuery.session(session) : enrollmentQuery,
    ]);

    if (!student || !enrollment || !enrollment.studentId.equals(studentId)) {
        throw new NotFoundException("Student or enrollment not found");
    }

    if (requireActiveEnrollment && enrollment.status !== "active") {
        throw new ConflictException(
            "An active enrollment is required for a new invoice"
        );
    }

    const groupQuery = StudyGroupModel.findOne({
        _id: enrollment.groupId,
        workspaceId,
    });
    const group = session
        ? await groupQuery.session(session)
        : await groupQuery;

    if (!group) {
        throw new NotFoundException("Student or enrollment not found");
    }

    return { enrollment, group };
};

const assertInvoiceReferences = async (
    workspaceId: Types.ObjectId,
    invoices: InvoiceDocument[],
    session?: ClientSession
): Promise<void> => {
    if (invoices.length === 0) {
        return;
    }

    const studentQuery = StudentModel.find({
            workspaceId,
            _id: { $in: invoices.map((invoice) => invoice.studentId) },
        });
    const enrollmentQuery = EnrollmentModel.find({
            workspaceId,
            _id: { $in: invoices.map((invoice) => invoice.enrollmentId) },
        });
    const groupQuery = StudyGroupModel.find({
            workspaceId,
            _id: { $in: invoices.map((invoice) => invoice.groupId) },
        });
    const [students, enrollments, groups] = await Promise.all([
        session ? studentQuery.session(session) : studentQuery,
        session ? enrollmentQuery.session(session) : enrollmentQuery,
        session ? groupQuery.session(session) : groupQuery,
    ]);
    const studentIds = new Set(students.map((student) => student._id.toString()));
    const enrollmentById = new Map(
        enrollments.map((enrollment) => [
            enrollment._id.toString(),
            enrollment,
        ])
    );
    const groupIds = new Set(groups.map((group) => group._id.toString()));

    if (
        invoices.some((invoice) => {
            const enrollment = enrollmentById.get(
                invoice.enrollmentId.toString()
            );
            return (
                !studentIds.has(invoice.studentId.toString()) ||
                !groupIds.has(invoice.groupId.toString()) ||
                !enrollment ||
                !enrollment.studentId.equals(invoice.studentId) ||
                !enrollment.groupId.equals(invoice.groupId) ||
                !invoice.groupId.equals(enrollment.groupId)
            );
        })
    ) {
        throw new NotFoundException("Invoice not found");
    }
};

const nextInvoiceNumber = async (
    workspaceId: Types.ObjectId,
    session: ClientSession
): Promise<string> => {
    const counter = await InvoiceNumberCounterModel.findOneAndUpdate(
        { workspaceId },
        { $inc: { sequence: 1 }, $setOnInsert: { workspaceId } },
        {
            upsert: true,
            returnDocument: "after",
            session,
            timestamps: false,
        }
    );

    if (!counter || !Number.isSafeInteger(counter.sequence)) {
        throw new ConflictException("Invoice number sequence is exhausted");
    }

    return `INV-${counter.sequence.toString().padStart(6, "0")}`;
};

const createInvoiceTransaction = async (
    workspaceId: Types.ObjectId,
    input: CreateInvoiceInput
): Promise<InvoiceDocument> => {
    const session = await mongoose.startSession();

    try {
        const invoice = await session.withTransaction(async () => {
            const { enrollment, group } = await getInvoiceReferences(
                workspaceId,
                input.studentId,
                input.enrollmentId,
                session
            );
            const totalAmount = calculateInvoiceTotal(
                group.monthlyFee.toString(),
                input.periodStart,
                input.periodEnd
            );
            const invoiceNumber = await nextInvoiceNumber(
                workspaceId,
                session
            );
            const [created] = await InvoiceModel.create(
                [
                    {
                        workspaceId,
                        invoiceNumber,
                        studentId: enrollment.studentId,
                        enrollmentId: enrollment._id,
                        groupId: enrollment.groupId,
                        periodStart: dateOnlyToDate(input.periodStart),
                        periodEnd: dateOnlyToDate(input.periodEnd),
                        totalAmount,
                        dueDate: input.dueDate ?? null,
                        description: input.description ?? "",
                        notes: input.notes ?? "",
                        status: "draft",
                    },
                ],
                { session }
            );

            if (!created) {
                throw new InternalServerException();
            }

            return created;
        });

        if (!invoice) {
            throw new InternalServerException();
        }

        return invoice;
    } finally {
        await session.endSession();
    }
};

export const createInvoiceService = async (
    workspaceId: Types.ObjectId,
    input: CreateInvoiceInput
): Promise<InvoiceDocument> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            return await createInvoiceTransaction(workspaceId, input);
        } catch (error) {
            if (attempt === 0 && isCounterInitializationConflict(error)) {
                continue;
            }

            throw error;
        }
    }

    throw new InternalServerException();
};

export const listInvoicesService = async (
    workspaceId: Types.ObjectId,
    query: InvoiceListQuery
) => {
    if (query.studentId) {
        const student = await StudentModel.exists({
            _id: query.studentId,
            workspaceId,
        });

        if (!student) {
            throw new NotFoundException("Student not found");
        }
    }

    const filter: {
        workspaceId: Types.ObjectId;
        studentId?: string;
        status?: InvoiceDocument["status"];
        periodStart?: { $gte?: Date; $lte?: Date };
    } = { workspaceId };

    if (query.studentId) {
        filter.studentId = query.studentId;
    }

    if (query.status) {
        filter.status = query.status;
    }

    if (query.from || query.to) {
        filter.periodStart = {
            ...(query.from ? { $gte: dateOnlyToDate(query.from) } : {}),
            ...(query.to ? { $lte: dateOnlyToDate(query.to) } : {}),
        };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        InvoiceModel.find(filter)
            .sort({ periodStart: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        InvoiceModel.countDocuments(filter),
    ]);

    await assertInvoiceReferences(workspaceId, items);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const getInvoiceByIdService = async (
    workspaceId: Types.ObjectId,
    invoiceId: string
): Promise<InvoiceDocument> => {
    const invoice = await InvoiceModel.findOne({
        _id: invoiceId,
        workspaceId,
    });

    if (!invoice) {
        throw new NotFoundException("Invoice not found");
    }

    await assertInvoiceReferences(workspaceId, [invoice]);
    return invoice;
};

export const updateInvoiceService = async (
    workspaceId: Types.ObjectId,
    invoiceId: string,
    input: UpdateInvoiceInput
): Promise<InvoiceDocument> => {
    const session = await mongoose.startSession();

    try {
        const invoice = await session.withTransaction(async () => {
            const currentInvoice = await InvoiceModel.findOne({
                _id: invoiceId,
                workspaceId,
            }).session(session);

            if (!currentInvoice) {
                throw new NotFoundException("Invoice not found");
            }

            if (currentInvoice.status !== "draft") {
                throw new ConflictException(
                    "Only draft invoices can be edited"
                );
            }

            const studentId = input.studentId ?? currentInvoice.studentId;
            const enrollmentId =
                input.enrollmentId ?? currentInvoice.enrollmentId;
            const currentReferences = await getInvoiceReferences(
                workspaceId,
                currentInvoice.studentId,
                currentInvoice.enrollmentId,
                session,
                false
            );
            if (!currentInvoice.groupId.equals(currentReferences.enrollment.groupId)) {
                throw new NotFoundException("Invoice relationship is inconsistent");
            }
            const periodStart =
                input.periodStart ?? getDateOnly(currentInvoice.periodStart);
            const periodEnd =
                input.periodEnd ?? getDateOnly(currentInvoice.periodEnd);
            const { enrollment, group } = await getInvoiceReferences(
                workspaceId,
                studentId,
                enrollmentId,
                session,
                false
            );
            const totalAmount = calculateInvoiceTotal(
                group.monthlyFee.toString(),
                periodStart,
                periodEnd
            );

            const updated = await InvoiceModel.findOneAndUpdate(
                {
                    _id: invoiceId,
                    workspaceId,
                    status: "draft",
                    updatedAt: currentInvoice.updatedAt,
                },
                {
                    $set: {
                        studentId: enrollment.studentId,
                        enrollmentId: enrollment._id,
                        groupId: enrollment.groupId,
                        periodStart: dateOnlyToDate(periodStart),
                        periodEnd: dateOnlyToDate(periodEnd),
                        totalAmount,
                    },
                },
                {
                    returnDocument: "after",
                    runValidators: true,
                    session,
                }
            );

            if (!updated) {
                throw new ConflictException(
                    "Invoice changed while it was being edited"
                );
            }

            return updated;
        });

        if (!invoice) {
            throw new InternalServerException();
        }

        return invoice;
    } finally {
        await session.endSession();
    }
};

const changeInvoiceStatus = async (
    workspaceId: Types.ObjectId,
    invoiceId: string,
    status: "issued" | "void"
): Promise<InvoiceDocument> => {
    const session = await mongoose.startSession();

    try {
        const invoice = await session.withTransaction(async () => {
            const currentInvoice = await InvoiceModel.findOne({
                _id: invoiceId,
                workspaceId,
            }).session(session);

            if (!currentInvoice) {
                throw new NotFoundException("Invoice not found");
            }
            await assertInvoiceReferences(workspaceId, [currentInvoice], session);

            if (status === "issued") {
                if (currentInvoice.status !== "draft") {
                    throw new ConflictException(
                        "Only draft invoices can be issued"
                    );
                }

                if (
                    compareDecimalStrings(
                        currentInvoice.totalAmount.toString(),
                        "0"
                    ) <= 0
                ) {
                    throw new BadRequestException(
                        "Invoice amount must be greater than zero"
                    );
                }

                await getInvoiceReferences(
                    workspaceId,
                    currentInvoice.studentId,
                    currentInvoice.enrollmentId,
                    session
                );
            } else {
                if (currentInvoice.status === "void") {
                    throw new ConflictException(
                        "Void invoices cannot be changed"
                    );
                }

                const allocations = await PaymentAllocationModel.exists({
                    workspaceId,
                    invoiceId: currentInvoice._id,
                }).session(session);

                if (allocations) {
                    throw new ConflictException(
                        "An invoice with payment allocations cannot be voided"
                    );
                }
            }

            const updated = await InvoiceModel.findOneAndUpdate(
                {
                    _id: invoiceId,
                    workspaceId,
                    status: currentInvoice.status,
                    updatedAt: currentInvoice.updatedAt,
                },
                {
                    $set: {
                        status,
                        ...(status === "issued" ? { issuedAt: new Date() } : {}),
                        ...(status === "void" ? { voidAt: new Date() } : {}),
                        updatedAt: new Date(
                            Math.max(
                                Date.now(),
                                currentInvoice.updatedAt.getTime() + 1
                            )
                        ),
                    },
                },
                {
                    returnDocument: "after",
                    runValidators: true,
                    session,
                    timestamps: false,
                }
            );

            if (!updated) {
                throw new ConflictException(
                    "Invoice changed while its status was being updated"
                );
            }

            return updated;
        });

        if (!invoice) {
            throw new InternalServerException();
        }

        return invoice;
    } finally {
        await session.endSession();
    }
};

export const issueInvoiceService = (
    workspaceId: Types.ObjectId,
    invoiceId: string
): Promise<InvoiceDocument> =>
    changeInvoiceStatus(workspaceId, invoiceId, "issued");

export const voidInvoiceService = (
    workspaceId: Types.ObjectId,
    invoiceId: string
): Promise<InvoiceDocument> =>
    changeInvoiceStatus(workspaceId, invoiceId, "void");
