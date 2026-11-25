import assert from "node:assert/strict";
import { once } from "node:events";
import { Server } from "node:http";
import { after, before, test, TestContext } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";

import EnrollmentModel from "../src/models/enrollment.model";
import InvoiceNumberCounterModel from "../src/models/invoice-number-counter.model";
import InvoiceModel from "../src/models/invoice.model";
import PaymentAllocationModel from "../src/models/payment-allocation.model";
import PaymentModel from "../src/models/payment.model";
import StudentModel from "../src/models/student.model";
import StudyGroupModel from "../src/models/study-group.model";
import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";
import { calculateProratedInvoiceAmount } from "../src/utils/money";
import { positiveDecimalStringSchema } from "../src/validators/money.validation";

const TEST_JWT_SECRET = "phase-four-test-secret-with-at-least-32-bytes";
const principalId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();

let baseUrl = "";
let apiServer: Server;

const makeQuery = (value: unknown) => ({
    sort() {
        return this;
    },
    skip() {
        return this;
    },
    limit() {
        return this;
    },
    session() {
        return this;
    },
    then(
        resolve: (result: unknown) => unknown,
        reject: (error: unknown) => unknown
    ) {
        return Promise.resolve(value).then(resolve, reject);
    },
});

const makeTransactionSession = () => ({
    async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
        return callback();
    },
    async endSession() {},
});

const mockTransactions = (t: TestContext) => {
    t.mock.method(mongoose, "startSession", () =>
        makeTransactionSession() as never
    );
};

const makeWorkspace = () => ({
    _id: workspaceId,
    name: "Test Workspace",
    slug: "test-workspace",
    ownerId: principalId,
    status: "active" as const,
    description: "",
    currency: "EGP" as const,
    suspensionType: null,
    suspendedAt: null,
    suspendedBy: null,
    suspensionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const mockWorkspaceAccess = (t: TestContext) => {
    const membership = {
        _id: new Types.ObjectId(),
        workspaceId,
        userId: principalId,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
    };

    t.mock.method(UserModel, "findById", () =>
        ({
            _id: principalId,
            name: "Test Teacher",
            email: "teacher@example.test",
            passwordHash: "",
            status: "active",
            lastLoginAt: null,
        }) as never
    );
    t.mock.method(WorkspaceMemberModel, "findOne", () =>
        membership as never
    );
    t.mock.method(WorkspaceModel, "findById", () =>
        makeWorkspace() as never
    );
};

const authCookie = () =>
    `accessToken=${jwt.sign({ userId: principalId.toString() }, TEST_JWT_SECRET, {
        audience: ["user"],
        expiresIn: "5m",
    })}`;

const request = (
    path: string,
    method = "GET",
    body?: Record<string, unknown>
) =>
    fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            cookie: authCookie(),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

const makeStudent = (id = new Types.ObjectId()) => ({
    _id: id,
    workspaceId,
    name: "Student One",
    status: "active" as const,
});

const makeGroup = (
    studentId = new Types.ObjectId(),
    monthlyFee = "1200.00"
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    subjectId: new Types.ObjectId(),
    name: "Grade 8",
    monthlyFee: Types.Decimal128.fromString(monthlyFee),
    capacity: null,
    status: "active" as const,
    studentId,
});

const makeEnrollment = (
    studentId: Types.ObjectId,
    groupId: Types.ObjectId,
    status: "active" | "paused" | "completed" | "cancelled" = "active"
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    studentId,
    groupId,
    enrolledAt: new Date("2026-01-01T00:00:00.000Z"),
    endedAt: status === "active" || status === "paused" ? null : new Date(),
    status,
    notes: "",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
});

const makeInvoice = (
    studentId = new Types.ObjectId(),
    enrollmentId = new Types.ObjectId(),
    groupId = new Types.ObjectId(),
    options: {
        status?: "draft" | "issued" | "void";
        totalAmount?: string;
        invoiceNumber?: string;
        periodStart?: string;
        periodEnd?: string;
    } = {}
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    invoiceNumber: options.invoiceNumber ?? "INV-000001",
    studentId,
    enrollmentId,
    groupId,
    periodStart: new Date(
        `${options.periodStart ?? "2026-01-01"}T00:00:00.000Z`
    ),
    periodEnd: new Date(`${options.periodEnd ?? "2026-01-31"}T00:00:00.000Z`),
    totalAmount: Types.Decimal128.fromString(
        options.totalAmount ?? "1200.00"
    ),
    dueDate: null,
    status: options.status ?? "draft",
    description: "",
    notes: "",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
});

const makePayment = (
    studentId = new Types.ObjectId(),
    amount = "100.00",
    status: "pending" | "completed" | "failed" | "refunded" = "completed"
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    studentId,
    amount: Types.Decimal128.fromString(amount),
    method: "cash" as const,
    status,
    receivedAt: new Date("2026-01-15T12:00:00.000Z"),
    reference: null,
    notes: "",
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
});

const makeAllocation = (
    paymentId: Types.ObjectId,
    invoiceId: Types.ObjectId,
    amount = "25.00"
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    paymentId,
    invoiceId,
    amount: Types.Decimal128.fromString(amount),
    createdAt: new Date("2026-01-20T12:00:00.000Z"),
    updatedAt: new Date("2026-01-20T12:00:00.000Z"),
});

const mockInvoiceReferenceLists = (
    t: TestContext,
    student: ReturnType<typeof makeStudent>,
    enrollment: ReturnType<typeof makeEnrollment>,
    group: ReturnType<typeof makeGroup>
) => {
    t.mock.method(StudentModel, "find", () =>
        makeQuery([student]) as never
    );
    t.mock.method(EnrollmentModel, "find", () =>
        makeQuery([enrollment]) as never
    );
    t.mock.method(StudyGroupModel, "find", () =>
        makeQuery([group]) as never
    );
};

const mockAllocationTransaction = (
    t: TestContext,
    payment: ReturnType<typeof makePayment>,
    invoice: ReturnType<typeof makeInvoice>,
    paymentAllocations: ReturnType<typeof makeAllocation>[] = [],
    invoiceAllocations: ReturnType<typeof makeAllocation>[] = []
) => {
    const filters: {
        paymentLookup?: Record<string, unknown>;
        invoiceLookup?: Record<string, unknown>;
        paymentLock?: Record<string, unknown>;
        invoiceLock?: Record<string, unknown>;
        allocationReads: Record<string, unknown>[];
        invoiceReads: Record<string, unknown>[];
        paymentReads: Record<string, unknown>[];
    } = {
        allocationReads: [],
        invoiceReads: [],
        paymentReads: [],
    };

    mockTransactions(t);
    t.mock.method(PaymentModel, "findOne", ((filter: Record<string, unknown>) => {
        filters.paymentLookup = filter;
        return makeQuery(payment);
    }) as never);
    t.mock.method(InvoiceModel, "findOne", ((filter: Record<string, unknown>) => {
        filters.invoiceLookup = filter;
        return makeQuery(invoice);
    }) as never);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: payment.studentId }) as never
    );
    t.mock.method(EnrollmentModel, "exists", () =>
        makeQuery({ _id: invoice.enrollmentId }) as never
    );
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: invoice.groupId }) as never
    );
    t.mock.method(
        PaymentModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>) => {
            filters.paymentLock = filter;
            return makeQuery(payment);
        }) as never
    );
    t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>) => {
            filters.invoiceLock = filter;
            return makeQuery(invoice);
        }) as never
    );
    t.mock.method(
        PaymentAllocationModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.allocationReads.push(filter);
            return makeQuery(
                filter.paymentId ? paymentAllocations : invoiceAllocations
            );
        }) as never
    );
    t.mock.method(InvoiceModel, "find", ((filter: Record<string, unknown>) => {
        filters.invoiceReads.push(filter);
        return makeQuery(paymentAllocations.length ? [invoice] : []);
    }) as never);
    t.mock.method(PaymentModel, "find", ((filter: Record<string, unknown>) => {
        filters.paymentReads.push(filter);
        return makeQuery(invoiceAllocations.length ? [payment] : []);
    }) as never);

    return filters;
};

const startServer = async (app: express.Express) => {
    const server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    return {
        server,
        url: `http://127.0.0.1:${address.port}`,
    };
};

const closeServer = async (server: Server) => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
};

before(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.MONGO_URI = "unused-in-tests";
    process.env.PORT = "0";
    process.env.FRONTEND_ORIGIN = "http://localhost:4200";

    const { createApp } = await import("../src/app");
    const started = await startServer(createApp());
    apiServer = started.server;
    baseUrl = started.url;
});

after(async () => {
    await closeServer(apiServer);
});

test("calendar-day invoice proration uses exact arithmetic and half-up rounding", () => {
    assert.equal(
        calculateProratedInvoiceAmount(
            "1200.00",
            "2026-01-01",
            "2026-01-31"
        ),
        "1200.00"
    );
    assert.equal(
        calculateProratedInvoiceAmount(
            "1200.00",
            "2026-01-16",
            "2026-01-31"
        ),
        "619.35"
    );
    assert.equal(
        calculateProratedInvoiceAmount(
            "1200.00",
            "2026-02-01",
            "2026-02-14"
        ),
        "600.00"
    );
    assert.equal(
        calculateProratedInvoiceAmount(
            "1200.00",
            "2026-01-15",
            "2026-02-14"
        ),
        "1258.06"
    );
    assert.equal(
        calculateProratedInvoiceAmount(
            "1200.00",
            "2024-02-01",
            "2024-02-29"
        ),
        "1200.00"
    );
    assert.equal(
        calculateProratedInvoiceAmount(
            "0.01",
            "2026-04-16",
            "2026-04-30"
        ),
        "0.01"
    );
    assert.throws(
        () =>
            calculateProratedInvoiceAmount(
                "1200",
                "2026-02-30",
                "2026-03-01"
            ),
        /Invalid calendar date/
    );
});

test("financial indexes retain invoice-number uniqueness and permit incremental allocations", () => {
    const invoiceNumberIndex = InvoiceModel.schema.indexes().find(
        ([fields]) =>
            fields.workspaceId === 1 && fields.invoiceNumber === 1
    );
    const counterIndex = InvoiceNumberCounterModel.schema.indexes().find(
        ([fields]) => fields.workspaceId === 1
    );
    const allocationPairIndex = PaymentAllocationModel.schema
        .indexes()
        .find(
            ([fields]) =>
                fields.workspaceId === 1 &&
                fields.paymentId === 1 &&
                fields.invoiceId === 1
        );

    assert.equal(invoiceNumberIndex?.[1].unique, true);
    assert.equal(counterIndex?.[1].unique, true);
    assert.ok(allocationPairIndex);
    assert.notEqual(allocationPairIndex[1].unique, true);
});

test("invoice and allocation models reject zero and negative Decimal128 amounts", async () => {
    const InvoiceModelImport = InvoiceModel;
    const allocationCases = ["0", "-0.01"];

    for (const amount of allocationCases) {
        const allocation = new PaymentAllocationModel({
            workspaceId,
            paymentId: new Types.ObjectId(),
            invoiceId: new Types.ObjectId(),
            amount: Types.Decimal128.fromString(amount),
        });
        await assert.rejects(
            allocation.validate(),
            (error: unknown) =>
                error instanceof mongoose.Error.ValidationError &&
                Boolean(error.errors.amount)
        );
    }

    const positiveAllocation = new PaymentAllocationModel({
        workspaceId,
        paymentId: new Types.ObjectId(),
        invoiceId: new Types.ObjectId(),
        amount: Types.Decimal128.fromString("0.01"),
    });
    await positiveAllocation.validate();

    for (const amount of allocationCases) {
        const invoice = new InvoiceModelImport({
            workspaceId,
            invoiceNumber: "INV-000001",
            studentId: new Types.ObjectId(),
            enrollmentId: new Types.ObjectId(),
            groupId: new Types.ObjectId(),
            periodStart: new Date("2026-01-01T00:00:00.000Z"),
            periodEnd: new Date("2026-01-31T00:00:00.000Z"),
            totalAmount: Types.Decimal128.fromString(amount),
        });
        await assert.rejects(
            invoice.validate(),
            (error: unknown) =>
                error instanceof mongoose.Error.ValidationError &&
                Boolean(error.errors.totalAmount)
        );
    }

    const draft = new InvoiceModelImport({
        workspaceId,
        invoiceNumber: "INV-000001",
        studentId: new Types.ObjectId(),
        enrollmentId: new Types.ObjectId(),
        groupId: new Types.ObjectId(),
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-01-31T00:00:00.000Z"),
        totalAmount: Types.Decimal128.fromString("1.00"),
    });
    await draft.validate();
    assert.equal(draft.status, "draft");
});

test("money validation rejects excessive fractional scale without rounding", () => {
    assert.equal(positiveDecimalStringSchema.safeParse("1.23").success, true);
    assert.equal(positiveDecimalStringSchema.safeParse("1.230").success, false);
    assert.equal(positiveDecimalStringSchema.safeParse("1.234").success, false);
    assert.equal(positiveDecimalStringSchema.safeParse("0.01").success, true);
    assert.equal(positiveDecimalStringSchema.safeParse("0").success, false);
});

test("invoice creation calculates the total, assigns a workspace sequence, and scopes its references", async (t) => {
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    let studentFilter: Record<string, unknown> | undefined;
    let enrollmentFilter: Record<string, unknown> | undefined;
    let groupFilter: Record<string, unknown> | undefined;
    let counterFilter: Record<string, unknown> | undefined;
    let counterUpdate: Record<string, unknown> | undefined;
    let invoicePayload: Record<string, unknown> | undefined;
    t.mock.method(StudentModel, "exists", ((filter: Record<string, unknown>) => {
        studentFilter = filter;
        return makeQuery({ _id: student._id });
    }) as never);
    t.mock.method(
        EnrollmentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            enrollmentFilter = filter;
            return makeQuery(enrollment);
        }) as never
    );
    t.mock.method(
        StudyGroupModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            groupFilter = filter;
            return makeQuery(group);
        }) as never
    );
    t.mock.method(
        InvoiceNumberCounterModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>, update: Record<string, unknown>) => {
            counterFilter = filter;
            counterUpdate = update;
            return makeQuery({ workspaceId, sequence: 1 });
        }) as never
    );
    const invoice = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        {
            status: "draft",
            totalAmount: "619.35",
            periodStart: "2026-01-16",
            periodEnd: "2026-01-31",
        }
    );
    const createInvoice = t.mock.method(
        InvoiceModel,
        "create",
        ((documents: Record<string, unknown>[]) => {
            invoicePayload = documents[0];
            return [invoice];
        }) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () => makeQuery([]) as never);

    const response = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: student._id.toString(),
            enrollmentId: enrollment._id.toString(),
            periodStart: "2026-01-16",
            periodEnd: "2026-01-31",
        }
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.invoiceNumber, "INV-000001");
    assert.equal(body.data.status, "draft");
    assert.equal(body.data.totalAmount, "619.35");
    assert.equal(body.data.paymentStatus, null);
    assert.equal(studentFilter?.workspaceId, workspaceId);
    assert.equal(enrollmentFilter?.workspaceId, workspaceId);
    assert.equal(groupFilter?.workspaceId, workspaceId);
    assert.deepEqual(counterFilter, { workspaceId });
    assert.deepEqual(counterUpdate, {
        $inc: { sequence: 1 },
        $setOnInsert: { workspaceId },
    });
    assert.equal(invoicePayload?.workspaceId, workspaceId);
    assert.equal(invoicePayload?.invoiceNumber, "INV-000001");
    assert.equal(
        (invoicePayload?.totalAmount as Types.Decimal128).toString(),
        "619.35"
    );
    assert.equal(invoicePayload?.status, "draft");
    assert.equal(createInvoice.mock.callCount(), 1);
});

test("invoice requests reject caller-owned financial fields, invalid dates, and zero fees", async (t) => {
    mockWorkspaceAccess(t);
    const invalidNumber = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            invoiceNumber: "CUSTOM-1",
            studentId: new Types.ObjectId().toString(),
            enrollmentId: new Types.ObjectId().toString(),
            periodStart: "2026-01-01",
            periodEnd: "2026-01-31",
            totalAmount: "1.00",
        }
    );
    assert.equal(invalidNumber.status, 400);

    const invalidDate = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: new Types.ObjectId().toString(),
            enrollmentId: new Types.ObjectId().toString(),
            periodStart: "2026-02-30",
            periodEnd: "2026-03-01",
        }
    );
    assert.equal(invalidDate.status, 400);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(student._id, "0.00");
    const enrollment = makeEnrollment(student._id, group._id);
    mockTransactions(t);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(enrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(group) as never
    );
    const counterIncrement = t.mock.method(
        InvoiceNumberCounterModel,
        "findOneAndUpdate",
        (() => makeQuery({ workspaceId, sequence: 1 })) as never
    );
    const response = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: student._id.toString(),
            enrollmentId: enrollment._id.toString(),
            periodStart: "2026-01-01",
            periodEnd: "2026-01-31",
        }
    );

    assert.equal(response.status, 400);
    assert.equal(counterIncrement.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const tinyFeeGroup = makeGroup(student._id, "0.01");
    const tinyFeeEnrollment = makeEnrollment(
        student._id,
        tinyFeeGroup._id
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(tinyFeeEnrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(tinyFeeGroup) as never
    );
    const tinyAmountCounter = t.mock.method(
        InvoiceNumberCounterModel,
        "findOneAndUpdate",
        (() => makeQuery({ workspaceId, sequence: 2 })) as never
    );
    const roundedToZero = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: student._id.toString(),
            enrollmentId: tinyFeeEnrollment._id.toString(),
            periodStart: "2026-04-16",
            periodEnd: "2026-04-16",
        }
    );
    assert.equal(roundedToZero.status, 400);
    assert.equal(tinyAmountCounter.mock.callCount(), 0);
});

test("invoice creation rejects inactive enrollments and cross-workspace students", async (t) => {
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const inactiveEnrollment = makeEnrollment(
        student._id,
        group._id,
        "paused"
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(inactiveEnrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(group) as never
    );
    const counterIncrement = t.mock.method(
        InvoiceNumberCounterModel,
        "findOneAndUpdate",
        (() => makeQuery({ workspaceId, sequence: 1 })) as never
    );
    const inactive = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: student._id.toString(),
            enrollmentId: inactiveEnrollment._id.toString(),
            periodStart: "2026-01-01",
            periodEnd: "2026-01-31",
        }
    );
    assert.equal(inactive.status, 409);
    assert.equal(counterIncrement.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    t.mock.method(StudentModel, "exists", () => makeQuery(null) as never);
    t.mock.method(EnrollmentModel, "findOne", () => makeQuery(null) as never);
    const foreignStudent = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: student._id.toString(),
            enrollmentId: inactiveEnrollment._id.toString(),
            periodStart: "2026-01-01",
            periodEnd: "2026-01-31",
        }
    );
    assert.equal(foreignStudent.status, 404);
});

test("invoice-number duplicate-key errors use the existing 409 response", async (t) => {
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(enrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(group) as never
    );
    t.mock.method(InvoiceNumberCounterModel, "findOneAndUpdate", () =>
        makeQuery({ workspaceId, sequence: 1 }) as never
    );
    t.mock.method(InvoiceModel, "create", (() => {
        throw Object.assign(new Error("duplicate invoice number"), {
            code: 11000,
        });
    }) as never);

    const response = await request(
        `/api/workspaces/${workspaceId}/invoices`,
        "POST",
        {
            studentId: student._id.toString(),
            enrollmentId: enrollment._id.toString(),
            periodStart: "2026-01-01",
            periodEnd: "2026-01-31",
        }
    );

    assert.equal(response.status, 409);
    assert.equal((await response.json()).errorCode, "ERR_CONFLICT");
});

test("invoice lists filter and paginate within the workspace and derive payment status", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const invoice = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued", totalAmount: "100.00" }
    );
    const paidInvoice = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued", totalAmount: "100.00" }
    );
    const secondPayment = makePayment(student._id);
    const payment = makePayment(student._id);
    const fullPayment = makePayment(student._id);
    const allocation = makeAllocation(
        payment._id,
        invoice._id,
        "20.00"
    );
    const secondAllocation = makeAllocation(
        secondPayment._id,
        invoice._id,
        "20.00"
    );
    const paidAllocation = makeAllocation(
        fullPayment._id,
        paidInvoice._id,
        "100.00"
    );
    let invoiceFilter: Record<string, unknown> | undefined;
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(
        InvoiceModel,
        "find",
        ((filter: Record<string, unknown>) => {
            invoiceFilter = filter;
            return makeQuery([invoice, paidInvoice]);
        }) as never
    );
    t.mock.method(InvoiceModel, "countDocuments", () =>
        makeQuery(2) as never
    );
    mockInvoiceReferenceLists(t, student, enrollment, group);
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeQuery([allocation, secondAllocation, paidAllocation]) as never
    );
    t.mock.method(PaymentModel, "find", () =>
        makeQuery([payment, secondPayment, fullPayment]) as never
    );

    const response = await request(
        `/api/workspaces/${workspaceId}/invoices?studentId=${student._id}&status=issued&from=2026-01-01&to=2026-01-31&page=2&pageSize=5`
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.items[0].paymentStatus, "partially_paid");
    assert.equal(body.data.items[0].allocatedAmount, "40");
    assert.equal(body.data.items[0].outstandingAmount, "60");
    assert.equal(body.data.items[1].paymentStatus, "paid");
    assert.equal(body.data.items[1].allocatedAmount, "100");
    assert.equal(body.data.items[1].outstandingAmount, "0");
    assert.deepEqual(body.data.pagination, {
        page: 2,
        pageSize: 5,
        totalItems: 2,
        totalPages: 1,
    });
    assert.equal(invoiceFilter?.workspaceId, workspaceId);
    assert.equal(invoiceFilter?.studentId, student._id.toString());
    assert.equal(invoiceFilter?.status, "issued");
    assert.deepEqual(invoiceFilter?.periodStart, {
        $gte: new Date("2026-01-01T00:00:00.000Z"),
        $lte: new Date("2026-01-31T00:00:00.000Z"),
    });

    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(invoice) as never
    );
    const detail = await request(
        `/api/workspaces/${workspaceId}/invoices/${invoice._id}`
    );
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.data.paymentStatus, "partially_paid");
    assert.equal("workspaceId" in detailBody.data, false);

    const invoiceAllocations = await request(
        `/api/workspaces/${workspaceId}/invoices/${invoice._id}/allocations`
    );
    assert.equal(invoiceAllocations.status, 200);
    assert.equal((await invoiceAllocations.json()).data.length, 2);
});

test("draft invoice patches recalculate totals and cannot edit issued invoices", async (t) => {
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const draft = makeInvoice(student._id, enrollment._id, group._id);
    const updated = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        {
            totalAmount: "600.00",
            periodStart: "2026-02-01",
            periodEnd: "2026-02-14",
        }
    );
    let updateFilter: Record<string, unknown> | undefined;
    let updatePayload: Record<string, unknown> | undefined;
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(draft) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(enrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(group) as never
    );
    mockInvoiceReferenceLists(t, student, enrollment, group);
    t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>, update: Record<string, unknown>) => {
            updateFilter = filter;
            updatePayload = update;
            return makeQuery(updated);
        }) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeQuery([]) as never
    );

    const response = await request(
        `/api/workspaces/${workspaceId}/invoices/${draft._id}`,
        "PATCH",
        {
            periodStart: "2026-02-01",
            periodEnd: "2026-02-14",
        }
    );

    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).data.totalAmount, "600.00");
    assert.equal(updateFilter?._id, draft._id.toString());
    assert.equal(updateFilter?.workspaceId, workspaceId);
    assert.equal(updateFilter?.status, "draft");
    assert.equal(
        (updatePayload?.$set as Record<string, unknown>).totalAmount?.toString(),
        "600.00"
    );

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const issued = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued" }
    );
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(issued) as never
    );
    const issuedUpdate = t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        (() => makeQuery(issued)) as never
    );
    const rejected = await request(
        `/api/workspaces/${workspaceId}/invoices/${issued._id}`,
        "PATCH",
        { periodStart: "2026-02-01" }
    );
    assert.equal(rejected.status, 409);
    assert.equal(issuedUpdate.mock.callCount(), 0);
});

test("issuing a draft is explicit, workspace-scoped, and requires an active enrollment", async (t) => {
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const draft = makeInvoice(student._id, enrollment._id, group._id);
    const issued = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued" }
    );
    let updateFilter: Record<string, unknown> | undefined;
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(draft) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(enrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(group) as never
    );
    mockInvoiceReferenceLists(t, student, enrollment, group);
    t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>) => {
            updateFilter = filter;
            return makeQuery(issued);
        }) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeQuery([]) as never
    );

    const response = await request(
        `/api/workspaces/${workspaceId}/invoices/${draft._id}/issue`,
        "POST"
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.status, "issued");
    assert.equal(body.data.paymentStatus, "unpaid");
    assert.equal(updateFilter?.workspaceId, workspaceId);
    assert.equal(updateFilter?.status, "draft");
    assert.ok(updateFilter?.updatedAt instanceof Date);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const inactiveEnrollment = makeEnrollment(
        student._id,
        group._id,
        "paused"
    );
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(draft) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(inactiveEnrollment) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () =>
        makeQuery(group) as never
    );
    mockInvoiceReferenceLists(t, student, enrollment, group);
    const blockedUpdate = t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        (() => makeQuery(issued)) as never
    );
    const blocked = await request(
        `/api/workspaces/${workspaceId}/invoices/${draft._id}/issue`,
        "POST"
    );
    assert.equal(blocked.status, 409);
    assert.equal(blockedUpdate.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const mismatchGroup = makeGroup(student._id);
    const mismatchInvoice = makeInvoice(
        student._id,
        enrollment._id,
        mismatchGroup._id,
        { status: "draft" }
    );
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(mismatchInvoice) as never
    );
    t.mock.method(StudentModel, "find", () =>
        makeQuery([student]) as never
    );
    t.mock.method(EnrollmentModel, "find", () =>
        makeQuery([enrollment]) as never
    );
    t.mock.method(StudyGroupModel, "find", () =>
        makeQuery([group]) as never
    );
    const mismatchUpdate = t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        (() => makeQuery(mismatchInvoice)) as never
    );
    const mismatch = await request(
        `/api/workspaces/${workspaceId}/invoices/${mismatchInvoice._id}/issue`,
        "POST"
    );
    assert.equal(mismatch.status, 404);
    assert.equal(mismatchUpdate.mock.callCount(), 0);
});

test("issued invoices with allocations cannot be voided; void is terminal", async (t) => {
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const issued = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued" }
    );
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(issued) as never
    );
    t.mock.method(PaymentAllocationModel, "exists", () =>
        makeQuery({ _id: new Types.ObjectId() }) as never
    );
    mockInvoiceReferenceLists(t, student, enrollment, group);
    const voidUpdate = t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        (() => makeQuery(makeInvoice(
            student._id,
            enrollment._id,
            group._id,
            { status: "void" }
        ))) as never
    );

    const blocked = await request(
        `/api/workspaces/${workspaceId}/invoices/${issued._id}/void`,
        "POST"
    );
    assert.equal(blocked.status, 409);
    assert.equal(voidUpdate.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const voided = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "void" }
    );
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(voided) as never
    );
    mockInvoiceReferenceLists(t, student, enrollment, group);
    const terminalUpdate = t.mock.method(
        InvoiceModel,
        "findOneAndUpdate",
        (() => makeQuery(voided)) as never
    );
    const terminal = await request(
        `/api/workspaces/${workspaceId}/invoices/${voided._id}/void`,
        "POST"
    );
    assert.equal(terminal.status, 409);
    assert.equal(terminalUpdate.mock.callCount(), 0);
});

test("payments are recorded as completed with exact positive amounts and workspace ownership", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const payment = makePayment(student._id, "25.50");
    let studentFilter: Record<string, unknown> | undefined;
    let createPayload: Record<string, unknown> | undefined;
    t.mock.method(StudentModel, "exists", ((filter: Record<string, unknown>) => {
        studentFilter = filter;
        return makeQuery({ _id: student._id });
    }) as never);
    t.mock.method(PaymentModel, "create", ((payload: Record<string, unknown>) => {
        createPayload = payload;
        return payment;
    }) as never);
    t.mock.method(PaymentAllocationModel, "find", () => makeQuery([]) as never);

    const response = await request(
        `/api/workspaces/${workspaceId}/payments`,
        "POST",
        {
            studentId: student._id.toString(),
            amount: "25.50",
            method: "cash",
        }
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.amount, "25.50");
    assert.equal(body.data.status, "completed");
    assert.equal(body.data.unallocatedAmount, "25.5");
    assert.equal(studentFilter?.workspaceId, workspaceId);
    assert.equal(createPayload?.workspaceId, workspaceId);
    assert.equal(createPayload?.studentId, student._id.toString());
    assert.equal(createPayload?.status, "completed");
    assert.equal(
        (createPayload?.amount as Types.Decimal128).toString(),
        "25.5"
    );
});

test("payment requests reject non-positive amounts and client-supplied statuses", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const createPayment = t.mock.method(
        PaymentModel,
        "create",
        (() => makePayment(student._id)) as never
    );

    const zero = await request(
        `/api/workspaces/${workspaceId}/payments`,
        "POST",
        {
            studentId: student._id.toString(),
            amount: "0",
            method: "cash",
        }
    );
    assert.equal(zero.status, 400);

    const negative = await request(
        `/api/workspaces/${workspaceId}/payments`,
        "POST",
        {
            studentId: student._id.toString(),
            amount: "-1",
            method: "cash",
        }
    );
    assert.equal(negative.status, 400);

    const clientStatus = await request(
        `/api/workspaces/${workspaceId}/payments`,
        "POST",
        {
            studentId: student._id.toString(),
            amount: "1.00",
            method: "cash",
            status: "refunded",
        }
    );
    assert.equal(clientStatus.status, 400);
    assert.equal(createPayment.mock.callCount(), 0);
});

test("Payment model validation rejects zero and negative Decimal128 amounts", async () => {
    for (const amount of ["0", "-0.01"]) {
        const payment = new PaymentModel({
            workspaceId,
            studentId: new Types.ObjectId(),
            amount: Types.Decimal128.fromString(amount),
            method: "cash",
        });

        await assert.rejects(
            payment.validate(),
            (error: unknown) =>
                error instanceof mongoose.Error.ValidationError &&
                Boolean(error.errors.amount)
        );
    }

    const validPayment = new PaymentModel({
        workspaceId,
        studentId: new Types.ObjectId(),
        amount: Types.Decimal128.fromString("0.01"),
        method: "cash",
    });
    await validPayment.validate();
});

test("payment lists and details return only same-workspace allocations and accurate unallocated balances", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const payment = makePayment(student._id, "100.00");
    const invoice = makeInvoice(
        student._id,
        new Types.ObjectId(),
        new Types.ObjectId(),
        { status: "issued", totalAmount: "100.00" }
    );
    const secondInvoice = makeInvoice(
        student._id,
        new Types.ObjectId(),
        new Types.ObjectId(),
        { status: "issued", totalAmount: "100.00" }
    );
    const allocation = makeAllocation(payment._id, invoice._id, "25.00");
    const secondAllocation = makeAllocation(
        payment._id,
        secondInvoice._id,
        "15.00"
    );
    let paymentFilter: Record<string, unknown> | undefined;
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudentModel, "find", () =>
        makeQuery([student]) as never
    );
    t.mock.method(
        PaymentModel,
        "find",
        ((filter: Record<string, unknown>) => {
            paymentFilter = filter;
            return makeQuery([payment]);
        }) as never
    );
    t.mock.method(PaymentModel, "countDocuments", () =>
        makeQuery(1) as never
    );
    t.mock.method(PaymentModel, "findOne", () =>
        makeQuery(payment) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeQuery([allocation, secondAllocation]) as never
    );
    t.mock.method(InvoiceModel, "find", () =>
        makeQuery([invoice, secondInvoice]) as never
    );

    const list = await request(
        `/api/workspaces/${workspaceId}/payments?studentId=${student._id}&status=completed&from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z&page=2&pageSize=5`
    );
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.data.items[0].allocatedAmount, "40");
    assert.equal(listBody.data.items[0].unallocatedAmount, "60");
    assert.equal(paymentFilter?.workspaceId, workspaceId);
    assert.equal(paymentFilter?.studentId, student._id.toString());
    assert.equal(paymentFilter?.status, "completed");
    assert.deepEqual(paymentFilter?.receivedAt, {
        $gte: new Date("2026-01-01T00:00:00.000Z"),
        $lte: new Date("2026-02-01T00:00:00.000Z"),
    });

    const detail = await request(
        `/api/workspaces/${workspaceId}/payments/${payment._id}`
    );
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.data.allocations.length, 2);
    assert.equal(detailBody.data.allocations[0].id, allocation._id.toString());
    assert.equal(detailBody.data.unallocatedAmount, "60");

    const allocations = await request(
        `/api/workspaces/${workspaceId}/payments/${payment._id}/allocations`
    );
    assert.equal(allocations.status, 200);
    assert.equal((await allocations.json()).data.length, 2);
});

test("allocations are explicit, exact, repeatable for the same pair, and transaction-scoped", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const payment = makePayment(student._id, "100.00");
    const invoice = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued", totalAmount: "100.00" }
    );
    const firstAllocation = makeAllocation(
        payment._id,
        invoice._id,
        "30.00"
    );
    const filters = mockAllocationTransaction(
        t,
        payment,
        invoice,
        [firstAllocation],
        [firstAllocation]
    );
    let createPayload: Record<string, unknown> | undefined;
    let createOptions: Record<string, unknown> | undefined;
    const secondAllocation = makeAllocation(
        payment._id,
        invoice._id,
        "20.00"
    );
    const createAllocation = t.mock.method(
        PaymentAllocationModel,
        "create",
        ((documents: Record<string, unknown>[], options: Record<string, unknown>) => {
            createPayload = documents[0];
            createOptions = options;
            return [secondAllocation];
        }) as never
    );

    const response = await request(
        `/api/workspaces/${workspaceId}/payments/${payment._id}/allocations`,
        "POST",
        {
            invoiceId: invoice._id.toString(),
            amount: "20.00",
        }
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.amount, "20.00");
    assert.equal(filters.paymentLookup?.workspaceId, workspaceId);
    assert.equal(filters.invoiceLookup?.workspaceId, workspaceId);
    assert.equal(filters.paymentLock?.workspaceId, workspaceId);
    assert.equal(filters.invoiceLock?.workspaceId, workspaceId);
    assert.equal(filters.invoiceLock?.status, "issued");
    assert.ok(filters.paymentLock?.updatedAt instanceof Date);
    assert.ok(filters.invoiceLock?.updatedAt instanceof Date);
    assert.ok(filters.allocationReads.every((filter) => filter.workspaceId === workspaceId));
    assert.ok(filters.invoiceReads.every((filter) => filter.workspaceId === workspaceId));
    assert.ok(filters.paymentReads.every((filter) => filter.workspaceId === workspaceId));
    assert.equal(createPayload?.workspaceId, workspaceId);
    assert.equal(createPayload?.paymentId, payment._id);
    assert.equal(createPayload?.invoiceId, invoice._id);
    assert.equal(
        (createPayload?.amount as Types.Decimal128).toString(),
        "20"
    );
    assert.ok(createOptions?.session);
    assert.equal(createAllocation.mock.callCount(), 1);
});

test("allocations reject amounts beyond either available balance without creating records", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const payment = makePayment(student._id, "100.00");
    const invoice = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued", totalAmount: "100.00" }
    );
    const existing = makeAllocation(payment._id, invoice._id, "90.00");
    mockAllocationTransaction(t, payment, invoice, [existing], [existing]);
    const createAllocation = t.mock.method(
        PaymentAllocationModel,
        "create",
        (() => [makeAllocation(payment._id, invoice._id, "20.00")]) as never
    );

    const zero = await request(
        `/api/workspaces/${workspaceId}/payments/${payment._id}/allocations`,
        "POST",
        {
            invoiceId: invoice._id.toString(),
            amount: "0",
        }
    );
    assert.equal(zero.status, 400);

    const response = await request(
        `/api/workspaces/${workspaceId}/payments/${payment._id}/allocations`,
        "POST",
        {
            invoiceId: invoice._id.toString(),
            amount: "20.00",
        }
    );

    assert.equal(response.status, 409);
    assert.equal(createAllocation.mock.callCount(), 0);
});

test("allocations reject ineligible states, cross-workspace references, and student mismatches", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(student._id);
    const enrollment = makeEnrollment(student._id, group._id);
    const completedPayment = makePayment(student._id, "100.00");
    const pendingPayment = {
        ...completedPayment,
        status: "pending" as const,
    };
    const issuedInvoice = makeInvoice(
        student._id,
        enrollment._id,
        group._id,
        { status: "issued" }
    );
    mockAllocationTransaction(
        t,
        pendingPayment,
        issuedInvoice
    );
    const createAllocation = t.mock.method(
        PaymentAllocationModel,
        "create",
        (() => [makeAllocation(completedPayment._id, issuedInvoice._id)]) as never
    );
    const pending = await request(
        `/api/workspaces/${workspaceId}/payments/${completedPayment._id}/allocations`,
        "POST",
        {
            invoiceId: issuedInvoice._id.toString(),
            amount: "10.00",
        }
    );
    assert.equal(pending.status, 409);
    assert.equal(createAllocation.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    t.mock.method(PaymentModel, "findOne", () => makeQuery(null) as never);
    t.mock.method(InvoiceModel, "findOne", () => makeQuery(null) as never);
    const foreignPayment = await request(
        `/api/workspaces/${workspaceId}/payments/${completedPayment._id}/allocations`,
        "POST",
        {
            invoiceId: issuedInvoice._id.toString(),
            amount: "10.00",
        }
    );
    assert.equal(foreignPayment.status, 404);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockTransactions(t);
    const existingPayment = makePayment(student._id);
    t.mock.method(PaymentModel, "findOne", () =>
        makeQuery(existingPayment) as never
    );
    t.mock.method(InvoiceModel, "findOne", () =>
        makeQuery(null) as never
    );
    const foreignInvoice = await request(
        `/api/workspaces/${workspaceId}/payments/${existingPayment._id}/allocations`,
        "POST",
        {
            invoiceId: issuedInvoice._id.toString(),
            amount: "10.00",
        }
    );
    assert.equal(foreignInvoice.status, 404);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const otherStudent = makeStudent();
    const mismatchPayment = makePayment(student._id, "100.00");
    const mismatchInvoice = makeInvoice(
        otherStudent._id,
        enrollment._id,
        group._id,
        { status: "issued" }
    );
    mockAllocationTransaction(t, mismatchPayment, mismatchInvoice);
    const mismatchCreate = t.mock.method(
        PaymentAllocationModel,
        "create",
        (() => [makeAllocation(mismatchPayment._id, mismatchInvoice._id)]) as never
    );
    const mismatch = await request(
        `/api/workspaces/${workspaceId}/payments/${mismatchPayment._id}/allocations`,
        "POST",
        {
            invoiceId: mismatchInvoice._id.toString(),
            amount: "10.00",
        }
    );
    assert.equal(mismatch.status, 404);
    assert.equal(mismatchCreate.mock.callCount(), 0);
});
