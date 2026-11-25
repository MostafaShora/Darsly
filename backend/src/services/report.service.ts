import { Types } from "mongoose";
import AttendanceRecordModel from "../models/attendance-record.model";
import EnrollmentModel from "../models/enrollment.model";
import InvoiceModel, { InvoiceDocument } from "../models/invoice.model";
import PaymentAllocationModel, {
    PaymentAllocationDocument,
} from "../models/payment-allocation.model";
import PaymentModel, { PaymentDocument } from "../models/payment.model";
import SessionModel, { SessionDocument } from "../models/session.model";
import StudentModel, { StudentDocument } from "../models/student.model";
import StudyGroupModel, { StudyGroupDocument } from "../models/study-group.model";
import { createPaginationMetadata } from "../utils/pagination";
import {
    compareDecimalStrings,
    subtractDecimalStrings,
    sumDecimalStrings,
} from "../utils/money";
import { NotFoundException } from "../utils/app-error";
import {
    AttendanceReportQuery,
    FinanceReportQuery,
    ReportRangeQuery,
} from "../validators/report.validation";

interface ReportRange {
    from: Date;
    to: Date;
}

export interface AttendanceSummary {
    present: number;
    absent: number;
    late: number;
    excused: number;
    attended: number;
    denominator: number;
    attendanceRate: number | null;
}

export interface DashboardSummary {
    period: { from: string; to: string };
    students: {
        total: number;
        active: number;
        inactive: number;
        archived: number;
    };
    groups: {
        total: number;
        activeEnrollments: number;
        pausedEnrollments: number;
        cancelledEnrollments: number;
        occupancy: Array<{
            groupId: string;
            name: string;
            capacity: number | null;
            activeEnrollments: number;
            availablePlaces: number | null;
            occupancyRate: number | null;
        }>;
    };
    sessions: {
        scheduled: number;
        completed: number;
        cancelled: number;
    };
    attendance: AttendanceSummary;
    finance: {
        issuedInvoiceCount: number;
        issuedInvoiceTotal: string;
        currentOutstanding: string;
        collectedInPeriod: string;
        unallocatedPayments: string;
    };
}

const getRange = (query: ReportRangeQuery): ReportRange => {
    if (query.from && query.to) {
        return { from: query.from, to: query.to };
    }

    const now = new Date();
    return {
        from: query.from ?? new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            1,
            0,
            0,
            0,
            0
        )),
        to: query.to ?? now,
    };
};

const validateStudentFilter = async (
    workspaceId: Types.ObjectId,
    studentId?: string
): Promise<void> => {
    if (!studentId) return;
    const student = await StudentModel.exists({ _id: studentId, workspaceId });
    if (!student) throw new NotFoundException("Student not found");
};

const validateGroupFilter = async (
    workspaceId: Types.ObjectId,
    groupId?: string
): Promise<void> => {
    if (!groupId) return;
    const group = await StudyGroupModel.exists({ _id: groupId, workspaceId });
    if (!group) throw new NotFoundException("Study group not found");
};

const getValidAllocations = async (
    workspaceId: Types.ObjectId,
    allocationFilter: Record<string, unknown> = {}
): Promise<PaymentAllocationDocument[]> => {
    const allocations = await PaymentAllocationModel.find({
        workspaceId,
        ...allocationFilter,
    });
    if (allocations.length === 0) return [];

    const [payments, invoices] = await Promise.all([
        PaymentModel.find({
            workspaceId,
            _id: { $in: allocations.map((item) => item.paymentId) },
            status: "completed",
        }),
        InvoiceModel.find({
            workspaceId,
            _id: { $in: allocations.map((item) => item.invoiceId) },
            status: "issued",
        }),
    ]);
    const paymentById = new Map(
        payments.map((payment) => [payment._id.toString(), payment])
    );
    const invoiceById = new Map(
        invoices.map((invoice) => [invoice._id.toString(), invoice])
    );

    return allocations.filter((allocation) => {
        const payment = paymentById.get(allocation.paymentId.toString());
        const invoice = invoiceById.get(allocation.invoiceId.toString());
        return Boolean(
            payment &&
            invoice &&
            payment.studentId.equals(invoice.studentId) &&
            compareDecimalStrings(allocation.amount.toString(), "0") > 0
        );
    });
};

const attendanceFromRecords = (
    records: Array<{ status: "present" | "absent" | "late" | "excused" }>
): AttendanceSummary => {
    const counts = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
    };
    for (const record of records) counts[record.status] += 1;
    const attended = counts.present + counts.late;
    const denominator = attended + counts.absent;
    return {
        ...counts,
        attended,
        denominator,
        attendanceRate: denominator === 0
            ? null
            : (attended / denominator) * 100,
    };
};

export const getDashboardSummaryService = async (
    workspaceId: Types.ObjectId,
    query: ReportRangeQuery
): Promise<DashboardSummary> => {
    const range = getRange(query);
    const [
        totalStudents,
        activeStudents,
        inactiveStudents,
        archivedStudents,
        groups,
        activeEnrollments,
        pausedEnrollments,
        cancelledEnrollments,
        scheduledSessions,
        completedSessions,
        cancelledSessions,
        issuedInvoices,
        payments,
        allAllocations,
    ] = await Promise.all([
        StudentModel.countDocuments({ workspaceId }),
        StudentModel.countDocuments({ workspaceId, status: "active" }),
        StudentModel.countDocuments({ workspaceId, status: "inactive" }),
        StudentModel.countDocuments({ workspaceId, status: "archived" }),
        StudyGroupModel.find({ workspaceId }),
        EnrollmentModel.countDocuments({ workspaceId, status: "active" }),
        EnrollmentModel.countDocuments({ workspaceId, status: "paused" }),
        EnrollmentModel.countDocuments({ workspaceId, status: "cancelled" }),
        SessionModel.countDocuments({
            workspaceId,
            status: "scheduled",
            startsAt: { $gte: range.from, $lte: range.to },
        }),
        SessionModel.countDocuments({
            workspaceId,
            status: "completed",
            startsAt: { $gte: range.from, $lte: range.to },
        }),
        SessionModel.countDocuments({
            workspaceId,
            status: "cancelled",
            startsAt: { $gte: range.from, $lte: range.to },
        }),
        InvoiceModel.find({ workspaceId, status: "issued" }),
        PaymentModel.find({ workspaceId, status: "completed" }),
        getValidAllocations(workspaceId),
    ]);

    const enrollmentCounts = await EnrollmentModel.aggregate([
        { $match: {
            workspaceId,
            status: "active",
        } },
        { $group: {
            _id: "$groupId",
            activeEnrollments: { $sum: 1 },
        } },
    ]);
    const activeByGroup = new Map(
        enrollmentCounts.map((item) => [
            item._id.toString(),
            item.activeEnrollments as number,
        ])
    );
    const occupancy = groups.map((group) => {
        const activeCount = activeByGroup.get(group._id.toString()) ?? 0;
        const capacity = group.capacity;
        return {
            groupId: group._id.toString(),
            name: group.name,
            capacity,
            activeEnrollments: activeCount,
            availablePlaces: capacity === null ? null : Math.max(capacity - activeCount, 0),
            occupancyRate: capacity === null
                ? null
                : capacity === 0
                  ? null
                  : (activeCount / capacity) * 100,
        };
    });

    const eligibleSessions = await SessionModel.find({
        workspaceId,
        status: { $ne: "cancelled" },
        startsAt: { $gte: range.from, $lte: range.to },
    });
    const startedEligibleSessions = eligibleSessions.filter(
        (session) => session.startsAt <= new Date()
    );
    const attendanceRecords = startedEligibleSessions.length === 0
        ? []
        : await AttendanceRecordModel.find({
            workspaceId,
            sessionId: { $in: startedEligibleSessions.map((session) => session._id) },
        });
    const attendance = attendanceFromRecords(attendanceRecords);

    const issuedInvoiceTotal = sumDecimalStrings(
        issuedInvoices.map((invoice) => invoice.totalAmount.toString())
    );
    const allocatedTotal = sumDecimalStrings(
        allAllocations
            .filter((allocation) => {
                const invoice = issuedInvoices.find(
                    (item) => item._id.equals(allocation.invoiceId)
                );
                return Boolean(invoice);
            })
            .map((allocation) => allocation.amount.toString())
    );
    const currentOutstanding = subtractDecimalStrings(
        issuedInvoiceTotal,
        allocatedTotal
    );
    const collectedInPeriod = sumDecimalStrings(
        payments
            .filter((payment) =>
                payment.receivedAt >= range.from &&
                payment.receivedAt <= range.to
            )
            .map((payment) => payment.amount.toString())
    );
    const paymentTotal = sumDecimalStrings(
        payments.map((payment) => payment.amount.toString())
    );
    const allocatedAllPayments = sumDecimalStrings(
        allAllocations.map((allocation) => allocation.amount.toString())
    );
    const unallocatedPayments = subtractDecimalStrings(
        paymentTotal,
        allocatedAllPayments
    );

    return {
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
        students: {
            total: totalStudents,
            active: activeStudents,
            inactive: inactiveStudents,
            archived: archivedStudents,
        },
        groups: {
            total: groups.length,
            activeEnrollments,
            pausedEnrollments,
            cancelledEnrollments,
            occupancy,
        },
        sessions: {
            scheduled: scheduledSessions,
            completed: completedSessions,
            cancelled: cancelledSessions,
        },
        attendance,
        finance: {
            issuedInvoiceCount: issuedInvoices.length,
            issuedInvoiceTotal,
            currentOutstanding:
                compareDecimalStrings(currentOutstanding, "0") < 0
                    ? "0"
                    : currentOutstanding,
            collectedInPeriod,
            unallocatedPayments:
                compareDecimalStrings(unallocatedPayments, "0") < 0
                    ? "0"
                    : unallocatedPayments,
        },
    };
};

export const getAttendanceReportService = async (
    workspaceId: Types.ObjectId,
    query: AttendanceReportQuery
) => {
    await validateStudentFilter(workspaceId, query.studentId);
    await validateGroupFilter(workspaceId, query.groupId);
    const range = getRange(query);

    const sessionFilter: Record<string, unknown> = {
        workspaceId,
        status: { $ne: "cancelled" },
        startsAt: {
            $gte: range.from,
            $lte: range.to,
        },
    };
    if (query.groupId) sessionFilter.groupId = query.groupId;

    const sessions = (await SessionModel.find(sessionFilter)).filter(
        (session) => session.startsAt <= new Date()
    );
    if (sessions.length === 0) {
        return {
            period: { from: range.from.toISOString(), to: range.to.toISOString() },
            summary: attendanceFromRecords([]),
            items: [],
            pagination: createPaginationMetadata(
                query.page,
                query.pageSize,
                0
            ),
        };
    }

    const recordFilter: Record<string, unknown> = {
        workspaceId,
        sessionId: { $in: sessions.map((session) => session._id) },
    };
    if (query.studentId) recordFilter.studentId = query.studentId;
    if (query.status) recordFilter.status = query.status;

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        AttendanceRecordModel.find(recordFilter)
            .sort({ recordedAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        AttendanceRecordModel.countDocuments(recordFilter),
    ]);

    const allRecords = await AttendanceRecordModel.find({
        workspaceId,
        sessionId: { $in: sessions.map((session) => session._id) },
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.status ? { status: query.status } : {}),
    });

    const [students, groups] = await Promise.all([
        StudentModel.find({
            workspaceId,
            _id: { $in: allRecords.map((record) => record.studentId) },
        }),
        StudyGroupModel.find({
            workspaceId,
            _id: { $in: sessions.map((session) => session.groupId) },
        }),
    ]);
    const studentById = new Map(
        students.map((student) => [student._id.toString(), student])
    );
    const sessionById = new Map(
        sessions.map((session) => [session._id.toString(), session])
    );
    const groupById = new Map(
        groups.map((group) => [group._id.toString(), group])
    );

    const detailItems = items.map((record) => {
        const session = sessionById.get(record.sessionId.toString());
        const student = studentById.get(record.studentId.toString());
        return {
            id: record._id.toString(),
            sessionId: record.sessionId.toString(),
            sessionTitle: session?.title ?? "",
            groupId: session?.groupId.toString() ?? "",
            groupName: session
                ? groupById.get(session.groupId.toString())?.name ?? ""
                : "",
            studentId: record.studentId.toString(),
            studentName: student?.name ?? "",
            status: record.status,
            lateMinutes: record.lateMinutes,
            recordedAt: record.recordedAt.toISOString(),
            sessionStartsAt: session?.startsAt.toISOString() ?? "",
        };
    });

    return {
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
        summary: attendanceFromRecords(allRecords),
        items: detailItems,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const getFinanceReportService = async (
    workspaceId: Types.ObjectId,
    query: FinanceReportQuery
) => {
    await validateStudentFilter(workspaceId, query.studentId);
    const range = getRange(query);
    const invoiceFilter: Record<string, unknown> = {
        workspaceId,
        status: "issued",
    };
    if (query.studentId) invoiceFilter.studentId = query.studentId;

    const paymentFilter: Record<string, unknown> = {
        workspaceId,
        status: "completed",
    };
    if (query.studentId) paymentFilter.studentId = query.studentId;

    const [issuedInvoices, currentPayments, allocations] = await Promise.all([
        InvoiceModel.find(invoiceFilter),
        PaymentModel.find(paymentFilter),
        getValidAllocations(workspaceId),
    ]);
    const scopedAllocations = query.studentId
        ? allocations.filter((allocation) =>
            issuedInvoices.some((invoice) =>
                invoice._id.equals(allocation.invoiceId)
            ) ||
            currentPayments.some((payment) =>
                payment._id.equals(allocation.paymentId)
            )
          )
        : allocations;

    const filteredIssuedInvoices = query.studentId
        ? issuedInvoices
        : issuedInvoices;
    const periodPayments = currentPayments.filter((payment) =>
        payment.receivedAt >= range.from && payment.receivedAt <= range.to
    );

    const issuedInPeriod = filteredIssuedInvoices.filter((invoice) => {
        const issuedAt = (invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt;
        return issuedAt &&
            issuedAt >= range.from &&
            issuedAt <= range.to;
    });

    const issuedInvoiceTotal = sumDecimalStrings(
        filteredIssuedInvoices.map((invoice) => invoice.totalAmount.toString())
    );
    const totalAllocatedToIssued = sumDecimalStrings(
        scopedAllocations
            .filter((allocation) =>
                filteredIssuedInvoices.some((invoice) =>
                    invoice._id.equals(allocation.invoiceId)
                )
            )
            .map((allocation) => allocation.amount.toString())
    );
    const currentOutstanding = subtractDecimalStrings(
        issuedInvoiceTotal,
        totalAllocatedToIssued
    );

    const paymentTotal = sumDecimalStrings(
        currentPayments.map((payment) => payment.amount.toString())
    );
    const allocatedAcrossAll = sumDecimalStrings(
        scopedAllocations.map((allocation) => allocation.amount.toString())
    );
    const unallocatedPayments = subtractDecimalStrings(
        paymentTotal,
        allocatedAcrossAll
    );

    const historicalInvoices = filteredIssuedInvoices.filter((invoice) => {
        const issuedAt = (invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt;
        return issuedAt && issuedAt <= range.to;
    });
    const historicalPayments = currentPayments.filter(
        (payment) => payment.receivedAt <= range.to
    );
    const historicalAllocations = scopedAllocations.filter(
        (allocation) => allocation.createdAt <= range.to
    );
    const historicalInvoiceTotal = sumDecimalStrings(
        historicalInvoices.map((invoice) => invoice.totalAmount.toString())
    );
    const historicalAllocated = sumDecimalStrings(
        historicalAllocations
            .filter((allocation) =>
                historicalInvoices.some((invoice) =>
                    invoice._id.equals(allocation.invoiceId)
                )
            )
            .map((allocation) => allocation.amount.toString())
    );
    const historicalOutstanding = subtractDecimalStrings(
        historicalInvoiceTotal,
        historicalAllocated
    );
    const historicalPaymentTotal = sumDecimalStrings(
        historicalPayments.map((payment) => payment.amount.toString())
    );
    const historicalAllocatedPayments = sumDecimalStrings(
        historicalAllocations.map((allocation) => allocation.amount.toString())
    );
    const historicalUnallocated = subtractDecimalStrings(
        historicalPaymentTotal,
        historicalAllocatedPayments
    );
    const legacyIssuedCount = filteredIssuedInvoices.filter((invoice) =>
        !(invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt
    ).length;

    const collectedInPeriod = sumDecimalStrings(
        periodPayments.map((payment) => payment.amount.toString())
    );
    const periodAllocations = scopedAllocations.filter(
        (allocation) =>
            allocation.createdAt >= range.from &&
            allocation.createdAt <= range.to
    );
    const allocatedInPeriod = sumDecimalStrings(
        periodAllocations.map((allocation) => allocation.amount.toString())
    );

    const paymentMethods = new Map<string, string>();
    for (const payment of periodPayments) {
        const method = payment.method;
        const existing = paymentMethods.get(method) ?? "0";
        paymentMethods.set(
            method,
            sumDecimalStrings([existing, payment.amount.toString()])
        );
    }

    const skip = (query.page - 1) * query.pageSize;
    const invoiceItems = issuedInPeriod
        .sort((left, right) =>
            (left as InvoiceDocument & { issuedAt?: Date }).issuedAt!.getTime()
            - (right as InvoiceDocument & { issuedAt?: Date }).issuedAt!.getTime()
        )
        .map((invoice) => ({
            id: invoice._id.toString(),
            invoiceNumber: invoice.invoiceNumber,
            studentId: invoice.studentId.toString(),
            issuedAt: (invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt?.toISOString() ?? null,
            totalAmount: invoice.totalAmount.toString(),
            status: invoice.status,
        }));
    const paymentItems = periodPayments
        .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
        .map((payment) => ({
            id: payment._id.toString(),
            studentId: payment.studentId.toString(),
            amount: payment.amount.toString(),
            method: payment.method,
            receivedAt: payment.receivedAt.toISOString(),
        }));
    const allocationItems = periodAllocations
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((allocation) => ({
            id: allocation._id.toString(),
            paymentId: allocation.paymentId.toString(),
            invoiceId: allocation.invoiceId.toString(),
            amount: allocation.amount.toString(),
            createdAt: allocation.createdAt.toISOString(),
        }));

    const pagedInvoices = invoiceItems.slice(skip, skip + query.pageSize);
    const pagedPayments = paymentItems.slice(skip, skip + query.pageSize);
    const pagedAllocations = allocationItems.slice(skip, skip + query.pageSize);

    const normalize = (value: string) =>
        compareDecimalStrings(value, "0") < 0 ? "0" : value;

    return {
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
        summary: {
            issuedInvoiceCount: issuedInPeriod.length,
            issuedInvoiceTotal: sumDecimalStrings(
                issuedInPeriod.map((invoice) => invoice.totalAmount.toString())
            ),
            collectedInPeriod,
            allocatedInPeriod,
            currentOutstanding: normalize(currentOutstanding),
            unallocatedPayments: normalize(unallocatedPayments),
            historicalOutstanding: normalize(historicalOutstanding),
            historicalUnallocatedPayments: normalize(historicalUnallocated),
        },
        paymentMethods: Array.from(paymentMethods.entries()).map(
            ([method, amount]) => ({ method, amount })
        ),
        historicalData: {
            asOf: range.to.toISOString(),
            available: legacyIssuedCount === 0,
            legacyIssuedInvoiceCount: legacyIssuedCount,
            limitation: legacyIssuedCount > 0
                ? "Historical invoice outstanding excludes issued invoices without an issuedAt timestamp."
                : null,
        },
        invoices: {
            items: pagedInvoices,
            pagination: createPaginationMetadata(
                query.page,
                query.pageSize,
                invoiceItems.length
            ),
        },
        payments: {
            items: pagedPayments,
            pagination: createPaginationMetadata(
                query.page,
                query.pageSize,
                paymentItems.length
            ),
        },
        allocations: {
            items: pagedAllocations,
            pagination: createPaginationMetadata(
                query.page,
                query.pageSize,
                allocationItems.length
            ),
        },
    };
};
