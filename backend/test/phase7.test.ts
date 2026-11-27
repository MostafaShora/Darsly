import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import mongoose, { Types, type ClientSession } from "mongoose";
import { getReportExportController } from "../src/controllers/report.controller";
import AttendanceRecordModel from "../src/models/attendance-record.model";
import InvoiceModel from "../src/models/invoice.model";
import PaymentModel from "../src/models/payment.model";
import PaymentAllocationModel from "../src/models/payment-allocation.model";
import SessionModel from "../src/models/session.model";
import StudentModel from "../src/models/student.model";
import StudyGroupModel from "../src/models/study-group.model";
import { getDashboardActivityService } from "../src/services/dashboard-activity.service";
import {
    getReportExportService,
    MAX_REPORT_EXPORT_RECORDS,
} from "../src/services/report.service";
import { BadRequestException, ServiceUnavailableException } from "../src/utils/app-error";
import {
    dashboardActivityQuerySchema,
    reportExportRequestSchema,
} from "../src/validators/report.validation";

const makeQuery = (value: unknown, onSort: (sort: Record<string, number>) => void, onLimit: (limit: number) => void) => ({
    sort(sort: Record<string, number>) {
        onSort(sort);
        return this;
    },
    limit(limit: number) {
        onLimit(limit);
        return this;
    },
    then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(value).then(resolve, reject);
    },
});

test("dashboard activity returns a bounded, newest-first mix of workspace records", async (t) => {
    const workspaceId = new Types.ObjectId();
    const attendanceId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const attendanceFilters: Array<Record<string, unknown>> = [];
    const paymentFilters: Array<Record<string, unknown>> = [];
    const attendanceSorts: Array<Record<string, number>> = [];
    const paymentSorts: Array<Record<string, number>> = [];
    const limits: number[] = [];

    t.mock.method(AttendanceRecordModel, "find", ((filter: Record<string, unknown>) => {
        attendanceFilters.push(filter);
        return makeQuery(
            [{
                _id: attendanceId,
                createdAt: new Date("2026-11-27T08:00:00.000Z"),
                status: "present",
            }],
            (sort) => attendanceSorts.push(sort),
            (limit) => limits.push(limit),
        ) as never;
    }) as never);
    t.mock.method(PaymentModel, "find", ((filter: Record<string, unknown>) => {
        paymentFilters.push(filter);
        return makeQuery(
            [{
                _id: paymentId,
                createdAt: new Date("2026-11-27T08:05:00.000Z"),
                amount: Types.Decimal128.fromString("125.50"),
                method: "cash",
                status: "completed",
            }],
            (sort) => paymentSorts.push(sort),
            (limit) => limits.push(limit),
        ) as never;
    }) as never);

    const activity = await getDashboardActivityService(workspaceId, 5);

    assert.deepEqual(attendanceFilters, [{ workspaceId }]);
    assert.deepEqual(paymentFilters, [{ workspaceId }]);
    assert.deepEqual(attendanceSorts, [{ createdAt: -1, _id: -1 }]);
    assert.deepEqual(paymentSorts, [{ createdAt: -1, _id: -1 }]);
    assert.deepEqual(limits, [5, 5]);
    assert.deepEqual(activity, [
        {
            id: paymentId.toString(),
            type: "payment",
            occurredAt: "2026-11-27T08:05:00.000Z",
            amount: "125.50",
            method: "cash",
            status: "completed",
        },
        {
            id: attendanceId.toString(),
            type: "attendance",
            occurredAt: "2026-11-27T08:00:00.000Z",
            status: "present",
        },
    ]);
});

test("dashboard activity query defaults to five and limits requests to ten", () => {
    assert.deepEqual(dashboardActivityQuerySchema.parse({}), { limit: 5 });
    assert.deepEqual(dashboardActivityQuerySchema.parse({ limit: "10" }), { limit: 10 });
    assert.equal(dashboardActivityQuerySchema.safeParse({ limit: 11 }).success, false);
    assert.equal(dashboardActivityQuerySchema.safeParse({ limit: 0 }).success, false);
});

type SnapshotTransactionOptions = {
    readConcern?: { level?: string };
    writeConcern?: { w?: string };
    readPreference?: string;
};

const createSnapshotHarness = (
    t: TestContext,
    failAfterCallback = false
) => {
    let active = false;
    let startCount = 0;
    let endCount = 0;
    let options: SnapshotTransactionOptions | undefined;
    const session = {
        async withTransaction(
            operation: () => Promise<unknown>,
            transactionOptions: SnapshotTransactionOptions
        ) {
            options = transactionOptions;
            active = true;
            try {
                const result = await operation();
                if (failAfterCallback) {
                    throw new Error("snapshot commit failed");
                }
                return result;
            } finally {
                active = false;
            }
        },
        async endSession() {
            endCount += 1;
        },
    };
    t.mock.method(mongoose, "startSession", (() => {
        startCount += 1;
        return session as never;
    }) as never);

    return {
        session,
        isActive: () => active,
        startCount: () => startCount,
        endCount: () => endCount,
        options: () => options,
    };
};

const makeSnapshotQuery = <T>(
    value: T,
    sessions: unknown[],
    isTransactionActive: () => boolean
) => ({
    sort() {
        return this;
    },
    skip() {
        return this;
    },
    limit() {
        return this;
    },
    session(session: unknown) {
        assert.equal(isTransactionActive(), true);
        sessions.push(session);
        return this;
    },
    then(
        resolve: (result: T) => unknown,
        reject: (error: unknown) => unknown
    ) {
        assert.equal(isTransactionActive(), true);
        return Promise.resolve(value).then(resolve, reject);
    },
});

test("attendance export uses one snapshot session and preserves scoped filters and DTO fields", async (t) => {
    const workspaceId = new Types.ObjectId();
    const studentId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    const recordId = new Types.ObjectId();
    const student = { _id: studentId, workspaceId, name: "Student One" };
    const group = { _id: groupId, workspaceId, name: "Grade 8" };
    const classSession = {
        _id: sessionId,
        workspaceId,
        groupId,
        title: "Lesson 1",
        startsAt: new Date("2026-01-10T10:00:00.000Z"),
        status: "completed",
    };
    const record = {
        _id: recordId,
        workspaceId,
        sessionId,
        studentId,
        status: "late",
        lateMinutes: 7,
        recordedAt: new Date("2026-01-10T10:08:00.000Z"),
    };
    const harness = createSnapshotHarness(t);
    const sessions: unknown[] = [];
    const sessionFilters: Array<Record<string, unknown>> = [];
    const attendanceFilters: Array<Record<string, unknown>> = [];
    const studentFilters: Array<Record<string, unknown>> = [];
    const groupFilters: Array<Record<string, unknown>> = [];

    t.mock.method(StudentModel, "exists", ((filter: Record<string, unknown>) => {
        assert.equal(filter.workspaceId, workspaceId);
        return makeSnapshotQuery(student, sessions, harness.isActive);
    }) as never);
    t.mock.method(StudyGroupModel, "exists", ((filter: Record<string, unknown>) => {
        assert.equal(filter.workspaceId, workspaceId);
        return makeSnapshotQuery(group, sessions, harness.isActive);
    }) as never);
    t.mock.method(SessionModel, "find", ((filter: Record<string, unknown>) => {
        sessionFilters.push(filter);
        return makeSnapshotQuery([classSession], sessions, harness.isActive);
    }) as never);
    t.mock.method(AttendanceRecordModel, "find", ((filter: Record<string, unknown>) => {
        attendanceFilters.push(filter);
        return makeSnapshotQuery([record], sessions, harness.isActive);
    }) as never);
    t.mock.method(AttendanceRecordModel, "countDocuments", ((filter: Record<string, unknown>) => {
        attendanceFilters.push(filter);
        return makeSnapshotQuery(1, sessions, harness.isActive);
    }) as never);
    t.mock.method(StudentModel, "find", ((filter: Record<string, unknown>) => {
        studentFilters.push(filter);
        return makeSnapshotQuery([student], sessions, harness.isActive);
    }) as never);
    t.mock.method(StudyGroupModel, "find", ((filter: Record<string, unknown>) => {
        groupFilters.push(filter);
        return makeSnapshotQuery([group], sessions, harness.isActive);
    }) as never);

    const request = reportExportRequestSchema.parse({
        type: "attendance",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.999Z",
        studentId: studentId.toString(),
        groupId: groupId.toString(),
        status: "late",
        timezone: "UTC",
    });
    const report = await getReportExportService(workspaceId, request);
    if (!("items" in report)) throw new Error("Expected attendance report");

    assert.deepEqual(harness.options(), {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
    });
    assert.equal(harness.startCount(), 1);
    assert.equal(harness.endCount(), 1);
    assert.ok(sessions.length > 0);
    assert.ok(sessions.every((session) => session === harness.session));
    assert.ok(sessionFilters.every((filter) => filter.workspaceId === workspaceId));
    assert.deepEqual(sessionFilters[0].groupId, groupId.toString());
    assert.ok(attendanceFilters.every((filter) => filter.workspaceId === workspaceId));
    assert.equal(attendanceFilters[0].studentId, studentId.toString());
    assert.equal(attendanceFilters[0].status, "late");
    assert.ok(studentFilters.every((filter) => filter.workspaceId === workspaceId));
    assert.ok(groupFilters.every((filter) => filter.workspaceId === workspaceId));
    assert.deepEqual(report.items, [{
        id: recordId.toString(),
        sessionId: sessionId.toString(),
        sessionTitle: "Lesson 1",
        groupId: groupId.toString(),
        groupName: "Grade 8",
        studentId: studentId.toString(),
        studentName: "Student One",
        status: "late",
        lateMinutes: 7,
        recordedAt: "2026-01-10T10:08:00.000Z",
        sessionStartsAt: "2026-01-10T10:00:00.000Z",
    }]);
    assert.equal(report.pagination.totalItems, 1);
});

test("finance export includes all three collections and uses the same workspace snapshot session", async (t) => {
    const workspaceId = new Types.ObjectId();
    const studentId = new Types.ObjectId();
    const invoiceId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const allocationId = new Types.ObjectId();
    const student = { _id: studentId, workspaceId, name: "Student One" };
    const invoice = {
        _id: invoiceId,
        workspaceId,
        studentId,
        invoiceNumber: "INV-001",
        status: "issued",
        issuedAt: new Date("2026-01-31T23:59:59.999Z"),
        voidAt: null,
        totalAmount: Types.Decimal128.fromString("50.00"),
    };
    const payment = {
        _id: paymentId,
        workspaceId,
        studentId,
        status: "completed",
        method: "cash",
        amount: Types.Decimal128.fromString("35.00"),
        receivedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const allocation = {
        _id: allocationId,
        workspaceId,
        paymentId,
        invoiceId,
        amount: Types.Decimal128.fromString("15.00"),
        createdAt: new Date("2026-01-15T12:00:00.000Z"),
    };
    const harness = createSnapshotHarness(t);
    const sessions: unknown[] = [];
    const queryFilters: Array<Record<string, unknown>> = [];

    t.mock.method(StudentModel, "exists", ((filter: Record<string, unknown>) => {
        queryFilters.push(filter);
        return makeSnapshotQuery(student, sessions, harness.isActive);
    }) as never);
    t.mock.method(InvoiceModel, "find", ((filter: Record<string, unknown>) => {
        queryFilters.push(filter);
        return makeSnapshotQuery([invoice], sessions, harness.isActive);
    }) as never);
    t.mock.method(PaymentModel, "find", ((filter: Record<string, unknown>) => {
        queryFilters.push(filter);
        return makeSnapshotQuery([payment], sessions, harness.isActive);
    }) as never);
    t.mock.method(PaymentAllocationModel, "find", ((filter: Record<string, unknown>) => {
        queryFilters.push(filter);
        return makeSnapshotQuery([allocation], sessions, harness.isActive);
    }) as never);

    const request = reportExportRequestSchema.parse({
        type: "finance",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.999Z",
        studentId: studentId.toString(),
        timezone: "UTC",
    });
    const report = await getReportExportService(workspaceId, request);
    if (!("invoices" in report)) throw new Error("Expected finance report");

    assert.deepEqual(harness.options()?.readConcern, { level: "snapshot" });
    assert.equal(harness.endCount(), 1);
    assert.ok(sessions.every((session) => session === harness.session));
    assert.ok(queryFilters.length >= 5);
    assert.ok(queryFilters.every((filter) => filter.workspaceId === workspaceId));
    assert.deepEqual(report.invoices.items, [{
        id: invoiceId.toString(),
        invoiceNumber: "INV-001",
        studentId: studentId.toString(),
        issuedAt: "2026-01-31T23:59:59.999Z",
        totalAmount: "50.00",
        status: "issued",
    }]);
    assert.deepEqual(report.payments.items, [{
        id: paymentId.toString(),
        studentId: studentId.toString(),
        amount: "35.00",
        method: "cash",
        receivedAt: "2026-01-01T00:00:00.000Z",
    }]);
    assert.deepEqual(report.allocations.items, [{
        id: allocationId.toString(),
        paymentId: paymentId.toString(),
        invoiceId: invoiceId.toString(),
        amount: "15.00",
        createdAt: "2026-01-15T12:00:00.000Z",
    }]);
    assert.deepEqual(
        [
            report.invoices.pagination.totalItems,
            report.payments.pagination.totalItems,
            report.allocations.pagination.totalItems,
        ],
        [1, 1, 1]
    );
});

test("report export enforces the 10,000-record collection limit", async (t) => {
    const workspaceId = new Types.ObjectId();
    const harness = createSnapshotHarness(t);
    const sessions: unknown[] = [];
    const classSession = {
        _id: new Types.ObjectId(),
        workspaceId,
        groupId: new Types.ObjectId(),
        title: "Lesson",
        startsAt: new Date("2026-01-10T10:00:00.000Z"),
        status: "completed",
    };
    const tooManyRecords = Array.from(
        { length: MAX_REPORT_EXPORT_RECORDS + 1 },
        () => ({}) as never
    );

    t.mock.method(SessionModel, "find", () =>
        makeSnapshotQuery([classSession], sessions, harness.isActive) as never
    );
    t.mock.method(AttendanceRecordModel, "find", () =>
        makeSnapshotQuery(tooManyRecords, sessions, harness.isActive) as never
    );
    t.mock.method(AttendanceRecordModel, "countDocuments", () =>
        makeSnapshotQuery(
            MAX_REPORT_EXPORT_RECORDS + 1,
            sessions,
            harness.isActive
        ) as never
    );

    await assert.rejects(
        getReportExportService(workspaceId, {
            type: "attendance",
            timezone: "UTC",
            from: new Date("2026-01-01T00:00:00.000Z"),
            to: new Date("2026-01-31T23:59:59.999Z"),
        }),
        (error: unknown) => error instanceof BadRequestException
    );
    assert.equal(harness.endCount(), 1);
});

test("finance export rejects a collection above 10,000 records", async (t) => {
    const workspaceId = new Types.ObjectId();
    const harness = createSnapshotHarness(t);
    const sessions: unknown[] = [];
    const issuedAt = new Date("2026-01-15T12:00:00.000Z");
    const invoices = Array.from(
        { length: MAX_REPORT_EXPORT_RECORDS + 1 },
        (_, index) => ({
            _id: new Types.ObjectId(),
            workspaceId,
            studentId: new Types.ObjectId(),
            invoiceNumber: `INV-${index}`,
            status: "issued",
            issuedAt,
            voidAt: null,
            totalAmount: Types.Decimal128.fromString("1.00"),
        })
    );

    t.mock.method(InvoiceModel, "find", () =>
        makeSnapshotQuery(invoices, sessions, harness.isActive) as never
    );
    t.mock.method(PaymentModel, "find", () =>
        makeSnapshotQuery([], sessions, harness.isActive) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeSnapshotQuery([], sessions, harness.isActive) as never
    );

    await assert.rejects(
        getReportExportService(workspaceId, {
            type: "finance",
            timezone: "UTC",
            from: new Date("2026-01-01T00:00:00.000Z"),
            to: new Date("2026-01-31T23:59:59.999Z"),
        }),
        (error: unknown) => error instanceof BadRequestException
    );
    assert.ok(sessions.every((session) => session === harness.session));
    assert.equal(harness.endCount(), 1);
});

test("snapshot transaction failures return no report and never fall back to non-snapshot reads", async (t) => {
    const workspaceId = new Types.ObjectId();
    const harness = createSnapshotHarness(t, true);
    const sessions: unknown[] = [];
    let sessionReads = 0;

    t.mock.method(SessionModel, "find", () => {
        sessionReads += 1;
        return makeSnapshotQuery([], sessions, harness.isActive) as never;
    });

    await assert.rejects(
        getReportExportService(workspaceId, {
            type: "attendance",
            timezone: "UTC",
        }),
        (error: unknown) => error instanceof ServiceUnavailableException
    );
    assert.equal(sessionReads, 1);
    assert.ok(sessions.every((session) => session === harness.session));
    assert.equal(harness.endCount(), 1);
});

test("report export request validates filters and ignores a client workspace ID", () => {
    const workspaceId = new Types.ObjectId().toString();
    const request = reportExportRequestSchema.parse({
        type: "attendance",
        timezone: "UTC",
        workspaceId,
    });

    assert.equal(request.type, "attendance");
    assert.equal("workspaceId" in request, false);
    assert.equal(reportExportRequestSchema.safeParse({
        type: "unknown",
        timezone: "UTC",
    }).success, false);
    assert.equal(reportExportRequestSchema.safeParse({
        type: "finance",
        timezone: "UTC",
        studentId: "invalid-id",
    }).success, false);
    assert.equal(reportExportRequestSchema.safeParse({
        type: "attendance",
        timezone: "UTC",
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
    }).success, false);
});

test("report export controller uses the middleware-authorized Workspace context", async (t) => {
    const authorizedWorkspaceId = new Types.ObjectId();
    const bodyWorkspaceId = new Types.ObjectId().toString();
    const harness = createSnapshotHarness(t);
    const sessions: unknown[] = [];
    let sessionFilter: Record<string, unknown> | undefined;
    let responseStatus = 0;
    let responseBody: unknown;

    t.mock.method(SessionModel, "find", ((filter: Record<string, unknown>) => {
        sessionFilter = filter;
        return makeSnapshotQuery([], sessions, harness.isActive);
    }) as never);

    const request = {
        workspaceContext: {
            workspace: { _id: authorizedWorkspaceId },
        },
        validated: {
            body: reportExportRequestSchema.parse({
                type: "attendance",
                timezone: "UTC",
                workspaceId: bodyWorkspaceId,
            }),
        },
    };
    const response = {
        status(status: number) {
            responseStatus = status;
            return this;
        },
        json(body: unknown) {
            responseBody = body;
            return this;
        },
    };
    const controller = getReportExportController as unknown as (
        req: never,
        res: never,
        next: (error?: unknown) => void
    ) => Promise<void>;

    await controller(request as never, response as never, (error) => {
        if (error) throw error;
    });

    assert.equal(sessionFilter?.workspaceId, authorizedWorkspaceId);
    assert.ok(sessions.every((session) => session === harness.session));
    assert.equal(responseStatus, 200);
    assert.equal((responseBody as { message?: string }).message, "Report export generated successfully");
    assert.equal(harness.endCount(), 1);
});
