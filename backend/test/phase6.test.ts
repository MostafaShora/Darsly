import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import AttendanceRecordModel from "../src/models/attendance-record.model";
import EnrollmentModel from "../src/models/enrollment.model";
import InvoiceModel from "../src/models/invoice.model";
import PaymentAllocationModel from "../src/models/payment-allocation.model";
import PaymentModel from "../src/models/payment.model";
import SessionModel from "../src/models/session.model";
import StudentModel from "../src/models/student.model";
import StudyGroupModel from "../src/models/study-group.model";
import {
    getAttendanceReportService,
    getDashboardSummaryService,
    getFinanceReportService,
} from "../src/services/report.service";

const workspaceId = new Types.ObjectId();

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
    then(
        resolve: (result: unknown) => unknown,
        reject: (error: unknown) => unknown
    ) {
        return Promise.resolve(value).then(resolve, reject);
    },
});

test("dashboard uses active enrollment capacity and keeps unlimited groups unranked", async (t) => {
    const limitedGroup = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Grade 8",
        capacity: 20,
    };
    const unlimitedGroup = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Private",
        capacity: null,
    };

    t.mock.method(StudentModel, "countDocuments", ((filter: Record<string, unknown>) =>
        makeQuery(
            filter.status === "active" ? 8 :
            filter.status === "inactive" ? 2 :
            filter.status === "archived" ? 1 : 11
        )) as never);
    t.mock.method(StudyGroupModel, "find", () =>
        makeQuery([limitedGroup, unlimitedGroup]) as never
    );
    t.mock.method(EnrollmentModel, "countDocuments", ((filter: Record<string, unknown>) =>
        makeQuery(filter.status === "active" ? 10 : filter.status === "paused" ? 3 : 2)) as never);
    t.mock.method(EnrollmentModel, "aggregate", () =>
        makeQuery([{ _id: limitedGroup._id, activeEnrollments: 10 }]) as never
    );
    t.mock.method(SessionModel, "countDocuments", ((filter: Record<string, unknown>) =>
        makeQuery(filter.status === "scheduled" ? 3 : filter.status === "completed" ? 4 : 1)) as never);
    t.mock.method(SessionModel, "find", () =>
        makeQuery([]) as never
    );
    t.mock.method(InvoiceModel, "find", () =>
        makeQuery([]) as never
    );
    t.mock.method(PaymentModel, "find", () =>
        makeQuery([]) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeQuery([]) as never
    );
    t.mock.method(AttendanceRecordModel, "find", () =>
        makeQuery([]) as never
    );

    const summary = await getDashboardSummaryService(workspaceId, {});
    assert.equal(summary.students.total, 11);
    assert.equal(summary.groups.activeEnrollments, 10);
    assert.equal(summary.groups.pausedEnrollments, 3);
    assert.equal(summary.groups.cancelledEnrollments, 2);
    assert.equal(summary.groups.occupancy[0].occupancyRate, 50);
    assert.equal(summary.groups.occupancy[0].availablePlaces, 10);
    assert.equal(summary.groups.occupancy[1].occupancyRate, null);
    assert.equal(summary.groups.occupancy[1].availablePlaces, null);
});

test("attendance report applies formula, excludes excused, and handles zero denominator", async (t) => {
    const student = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Student One",
    };
    const group = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Grade 8",
    };
    const session = {
        _id: new Types.ObjectId(),
        workspaceId,
        groupId: group._id,
        title: "Lesson",
        startsAt: new Date("2026-01-10T10:00:00.000Z"),
        status: "completed",
    };
    const records = [
        { _id: new Types.ObjectId(), workspaceId, sessionId: session._id, studentId: student._id, status: "present", lateMinutes: 0, recordedAt: new Date("2026-01-10T10:05:00.000Z") },
        { _id: new Types.ObjectId(), workspaceId, sessionId: session._id, studentId: student._id, status: "late", lateMinutes: 10, recordedAt: new Date("2026-01-10T10:10:00.000Z") },
        { _id: new Types.ObjectId(), workspaceId, sessionId: session._id, studentId: student._id, status: "absent", lateMinutes: 0, recordedAt: new Date("2026-01-10T10:10:00.000Z") },
        { _id: new Types.ObjectId(), workspaceId, sessionId: session._id, studentId: student._id, status: "excused", lateMinutes: 0, recordedAt: new Date("2026-01-10T10:10:00.000Z") },
    ];

    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );
    t.mock.method(SessionModel, "find", () =>
        makeQuery([session]) as never
    );
    t.mock.method(AttendanceRecordModel, "find", () =>
        makeQuery(records) as never
    );
    t.mock.method(AttendanceRecordModel, "countDocuments", () =>
        makeQuery(records.length) as never
    );
    t.mock.method(StudentModel, "find", () =>
        makeQuery([student]) as never
    );
    t.mock.method(StudyGroupModel, "find", () =>
        makeQuery([group]) as never
    );

    const report = await getAttendanceReportService(workspaceId, {
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-01-31T23:59:59.000Z"),
        studentId: student._id.toString(),
        groupId: group._id.toString(),
        page: 1,
        pageSize: 20,
    });
    assert.equal(report.summary.present, 1);
    assert.equal(report.summary.late, 1);
    assert.equal(report.summary.absent, 1);
    assert.equal(report.summary.excused, 1);
    assert.equal(report.summary.attendanceRate, 66.66666666666666);
});

test("attendance report returns null for zero denominator", async (t) => {
    t.mock.method(StudentModel, "exists", () => makeQuery(null) as never);
    t.mock.method(StudyGroupModel, "exists", () => makeQuery(null) as never);
    t.mock.method(SessionModel, "find", () => makeQuery([]) as never);

    const report = await getAttendanceReportService(workspaceId, {
        page: 1,
        pageSize: 20,
    });
    assert.equal(report.summary.attendanceRate, null);
});

test("finance report separates collected, allocated, outstanding, and unallocated amounts", async (t) => {
    const student = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Student One",
    };
    const group = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Grade 8",
    };
    const invoice = {
        _id: new Types.ObjectId(),
        workspaceId,
        invoiceNumber: "INV-000001",
        studentId: student._id,
        enrollmentId: new Types.ObjectId(),
        groupId: group._id,
        status: "issued",
        issuedAt: new Date("2026-11-02T10:00:00.000Z"),
        totalAmount: Types.Decimal128.fromString("1000.00"),
    };
    const payment = {
        _id: new Types.ObjectId(),
        workspaceId,
        studentId: student._id,
        amount: Types.Decimal128.fromString("500.00"),
        method: "cash",
        status: "completed",
        receivedAt: new Date("2026-11-03T10:00:00.000Z"),
    };
    const allocation = {
        _id: new Types.ObjectId(),
        workspaceId,
        paymentId: payment._id,
        invoiceId: invoice._id,
        amount: Types.Decimal128.fromString("300.00"),
        createdAt: new Date("2026-11-05T10:00:00.000Z"),
    };

    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(InvoiceModel, "find", () =>
        makeQuery([invoice]) as never
    );
    t.mock.method(PaymentModel, "find", () =>
        makeQuery([payment]) as never
    );
    t.mock.method(PaymentAllocationModel, "find", () =>
        makeQuery([allocation]) as never
    );
    t.mock.method(InvoiceModel, "find", () =>
        makeQuery([invoice]) as never
    );
    t.mock.method(PaymentModel, "find", () =>
        makeQuery([payment]) as never
    );

    const report = await getFinanceReportService(workspaceId, {
        from: new Date("2026-11-01T00:00:00.000Z"),
        to: new Date("2026-11-30T23:59:59.000Z"),
        studentId: student._id.toString(),
        page: 1,
        pageSize: 20,
    });

    assert.equal(report.summary.issuedInvoiceCount, 1);
    assert.equal(report.summary.issuedInvoiceTotal, "1000");
    assert.equal(report.summary.currentOutstanding, "700");
    assert.equal(report.summary.collectedInPeriod, "500");
    assert.equal(report.summary.allocatedInPeriod, "300");
    assert.equal(report.summary.unallocatedPayments, "200");
});

test("historical finance marks legacy issued invoices without issuedAt as unavailable", async (t) => {
    const student = {
        _id: new Types.ObjectId(),
        workspaceId,
        name: "Student One",
    };
    const legacyInvoice = {
        _id: new Types.ObjectId(),
        workspaceId,
        invoiceNumber: "INV-OLD",
        studentId: student._id,
        enrollmentId: new Types.ObjectId(),
        groupId: new Types.ObjectId(),
        status: "issued",
        issuedAt: undefined,
        totalAmount: Types.Decimal128.fromString("1000.00"),
    };

    t.mock.method(StudentModel, "exists", () => makeQuery({ _id: student._id }) as never);
    t.mock.method(InvoiceModel, "find", () => makeQuery([legacyInvoice]) as never);
    t.mock.method(PaymentModel, "find", () => makeQuery([]) as never);
    t.mock.method(PaymentAllocationModel, "find", () => makeQuery([]) as never);

    const report = await getFinanceReportService(workspaceId, {
        from: new Date("2026-11-01T00:00:00.000Z"),
        to: new Date("2026-11-30T23:59:59.000Z"),
        page: 1,
        pageSize: 20,
    });
    assert.equal(report.historicalData.available, false);
    assert.equal(report.historicalData.legacyIssuedInvoiceCount, 1);
});
