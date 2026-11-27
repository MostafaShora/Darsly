import mongoose, { type ClientSession, Types } from "mongoose";
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
import {
    AppError,
    BadRequestException,
    NotFoundException,
    ServiceUnavailableException,
} from "../utils/app-error";
import {
    AttendanceReportQuery,
    FinanceReportQuery,
    ReportExportRequest,
    ReportRangeQuery,
} from "../validators/report.validation";

interface ReportRange {
    from: Date;
    to: Date;
}

export const MAX_REPORT_EXPORT_RECORDS = 10_000;

interface ReportServiceOptions {
    session?: ClientSession;
    exportAll?: boolean;
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

const getZonedDateParts = (date: Date, timezone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value);
    return { year: value("year"), month: value("month"), day: value("day") };
};

const localMidnightToUtc = (
    year: number,
    month: number,
    day: number,
    timezone: string
): Date => {
    const target = Date.UTC(year, month - 1, day);
    let result = target;
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = formatter.formatToParts(new Date(result));
        const value = (type: Intl.DateTimeFormatPartTypes) =>
            Number(parts.find((part) => part.type === type)?.value);
        const representedLocalTime = Date.UTC(
            value("year"),
            value("month") - 1,
            value("day"),
            value("hour"),
            value("minute"),
            value("second")
        );
        const next = target - (representedLocalTime - result);
        if (next === result) break;
        result = next;
    }

    return new Date(result);
};

export const getReportRange = (
    query: ReportRangeQuery,
    now = new Date()
): ReportRange => {
    const localNow = getZonedDateParts(now, query.timezone);
    const monthStart = localMidnightToUtc(
        localNow.year,
        localNow.month,
        1,
        query.timezone
    );
    const nextDay = new Date(Date.UTC(
        localNow.year,
        localNow.month - 1,
        localNow.day + 1
    ));
    const endOfLocalDay = new Date(
        localMidnightToUtc(
            nextDay.getUTCFullYear(),
            nextDay.getUTCMonth() + 1,
            nextDay.getUTCDate(),
            query.timezone
        ).getTime() - 1
    );
    return {
        from: query.from ?? monthStart,
        to: query.to ?? endOfLocalDay,
    };
};

const validateStudentFilter = async (
    workspaceId: Types.ObjectId,
    studentId?: string,
    session?: ClientSession
): Promise<void> => {
    if (!studentId) return;
    const query = StudentModel.exists({ _id: studentId, workspaceId });
    if (session) query.session(session);
    const student = await query;
    if (!student) throw new NotFoundException("Student not found");
};

const validateGroupFilter = async (
    workspaceId: Types.ObjectId,
    groupId?: string,
    session?: ClientSession
): Promise<void> => {
    if (!groupId) return;
    const query = StudyGroupModel.exists({ _id: groupId, workspaceId });
    if (session) query.session(session);
    const group = await query;
    if (!group) throw new NotFoundException("Study group not found");
};

const getValidAllocations = async (
    workspaceId: Types.ObjectId,
    allocationFilter: Record<string, unknown> = {},
    session?: ClientSession
): Promise<PaymentAllocationDocument[]> => {
    const allocationQuery = PaymentAllocationModel.find({
        workspaceId,
        ...allocationFilter,
    });
    if (session) allocationQuery.session(session);
    const allocations = await allocationQuery;
    if (allocations.length === 0) return [];

    const paymentQuery = PaymentModel.find({
        workspaceId,
        _id: { $in: allocations.map((item) => item.paymentId) },
        status: "completed",
    });
    const invoiceQuery = InvoiceModel.find({
        workspaceId,
        _id: { $in: allocations.map((item) => item.invoiceId) },
        status: "issued",
    });
    let payments: PaymentDocument[];
    let invoices: InvoiceDocument[];
    if (session) {
        paymentQuery.session(session);
        invoiceQuery.session(session);
        payments = await paymentQuery;
        invoices = await invoiceQuery;
    } else {
        [payments, invoices] = await Promise.all([
            paymentQuery,
            invoiceQuery,
        ]);
    }
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
    const range = getReportRange(query);
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
    query: AttendanceReportQuery,
    options: ReportServiceOptions = {}
) => {
    await validateStudentFilter(workspaceId, query.studentId, options.session);
    await validateGroupFilter(workspaceId, query.groupId, options.session);
    const range = getReportRange(query);
    const pageSize = options.exportAll
        ? MAX_REPORT_EXPORT_RECORDS
        : query.pageSize;

    const sessionFilter: Record<string, unknown> = {
        workspaceId,
        status: { $ne: "cancelled" },
        startsAt: {
            $gte: range.from,
            $lte: range.to,
        },
    };
    if (query.groupId) sessionFilter.groupId = query.groupId;

    const sessionsQuery = SessionModel.find(sessionFilter);
    if (options.session) sessionsQuery.session(options.session);
    const sessions = (await sessionsQuery).filter(
        (session) => session.startsAt <= new Date()
    );
    if (sessions.length === 0) {
        return {
            period: { from: range.from.toISOString(), to: range.to.toISOString() },
            summary: attendanceFromRecords([]),
            items: [],
            pagination: createPaginationMetadata(
                query.page,
                pageSize,
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
    const itemQuery = AttendanceRecordModel.find(recordFilter)
        .sort({ recordedAt: -1, _id: -1 });
    if (options.session) itemQuery.session(options.session);
    const pagedItemQuery = itemQuery
        .skip(options.exportAll ? 0 : skip)
        .limit(options.exportAll ? MAX_REPORT_EXPORT_RECORDS + 1 : pageSize);

    const countQuery = AttendanceRecordModel.countDocuments(recordFilter);
    let items: Awaited<typeof pagedItemQuery>;
    let totalItems: number;
    if (options.session) {
        pagedItemQuery.session(options.session);
        countQuery.session(options.session);
        items = await pagedItemQuery;
        totalItems = await countQuery;
    } else {
        [items, totalItems] = await Promise.all([
            pagedItemQuery,
            countQuery,
        ]);
    }
    if (options.exportAll && totalItems > MAX_REPORT_EXPORT_RECORDS) {
        throw new BadRequestException(
            "Each exported report collection is limited to 10,000 records"
        );
    }

    let allRecords = items;
    if (!options.exportAll) {
        const recordsQuery = AttendanceRecordModel.find(recordFilter);
        if (options.session) recordsQuery.session(options.session);
        allRecords = await recordsQuery;
    }

    const studentQuery = StudentModel.find({
        workspaceId,
        _id: { $in: allRecords.map((record) => record.studentId) },
    });
    const groupQuery = StudyGroupModel.find({
        workspaceId,
        _id: { $in: sessions.map((session) => session.groupId) },
    });
    let students: Awaited<typeof studentQuery>;
    let groups: Awaited<typeof groupQuery>;
    if (options.session) {
        studentQuery.session(options.session);
        groupQuery.session(options.session);
        students = await studentQuery;
        groups = await groupQuery;
    } else {
        [students, groups] = await Promise.all([studentQuery, groupQuery]);
    }
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
            pageSize,
            totalItems
        ),
    };
};

export const getFinanceReportService = async (
    workspaceId: Types.ObjectId,
    query: FinanceReportQuery,
    options: ReportServiceOptions = {}
) => {
    await validateStudentFilter(workspaceId, query.studentId, options.session);
    const range = getReportRange(query);
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

    const invoiceQuery = InvoiceModel.find({
        ...invoiceFilter,
        status: { $in: ["issued", "void"] },
    });
    const paymentQuery = PaymentModel.find(paymentFilter);
    let invoiceRecords: Awaited<typeof invoiceQuery>;
    let currentPayments: Awaited<typeof paymentQuery>;
    let allocations: PaymentAllocationDocument[];
    if (options.session) {
        invoiceQuery.session(options.session);
        paymentQuery.session(options.session);
        invoiceRecords = await invoiceQuery;
        currentPayments = await paymentQuery;
        allocations = await getValidAllocations(
            workspaceId,
            {},
            options.session
        );
    } else {
        [invoiceRecords, currentPayments, allocations] = await Promise.all([
            invoiceQuery,
            paymentQuery,
            getValidAllocations(workspaceId),
        ]);
    }
    const issuedInvoices = invoiceRecords.filter(
        (invoice) => invoice.status === "issued"
    );
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

    const periodPayments = currentPayments.filter((payment) =>
        payment.receivedAt >= range.from && payment.receivedAt <= range.to
    );

    const issuedInPeriod = invoiceRecords.filter((invoice) => {
        const issuedAt = (invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt;
        return issuedAt &&
            issuedAt >= range.from &&
            issuedAt <= range.to;
    });

    const issuedInvoiceTotal = sumDecimalStrings(
        issuedInvoices.map((invoice) => invoice.totalAmount.toString())
    );
    const totalAllocatedToIssued = sumDecimalStrings(
        scopedAllocations
            .filter((allocation) =>
                issuedInvoices.some((invoice) =>
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

    const historicalInvoices = invoiceRecords.filter((invoice) => {
        const issuedAt = (invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt;
        if (!issuedAt || issuedAt > range.to) return false;
        if (invoice.status !== "void") return true;
        const voidAt = (invoice as InvoiceDocument & { voidAt?: Date }).voidAt;
        return !voidAt || voidAt > range.to;
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
    const legacyIssuedCount = issuedInvoices.filter((invoice) =>
        !(invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt
    ).length;
    const ambiguousVoidedCount = invoiceRecords.filter((invoice) =>
        invoice.status === "void" &&
        (
            !(invoice as InvoiceDocument & { issuedAt?: Date }).issuedAt ||
            !(invoice as InvoiceDocument & { voidAt?: Date }).voidAt
        )
    ).length;
    const historicalAvailable =
        legacyIssuedCount === 0 && ambiguousVoidedCount === 0;

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
            || left._id.toString().localeCompare(right._id.toString())
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
        .sort((left, right) =>
            right.receivedAt.getTime() - left.receivedAt.getTime()
            || right._id.toString().localeCompare(left._id.toString())
        )
        .map((payment) => ({
            id: payment._id.toString(),
            studentId: payment.studentId.toString(),
            amount: payment.amount.toString(),
            method: payment.method,
            receivedAt: payment.receivedAt.toISOString(),
        }));
    const allocationItems = periodAllocations
        .sort((left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime()
            || right._id.toString().localeCompare(left._id.toString())
        )
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
    if (
        options.exportAll &&
        [invoiceItems, paymentItems, allocationItems].some(
            (items) => items.length > MAX_REPORT_EXPORT_RECORDS
        )
    ) {
        throw new BadRequestException(
            "Each exported report collection is limited to 10,000 records"
        );
    }
    const resultPageSize = options.exportAll
        ? MAX_REPORT_EXPORT_RECORDS
        : query.pageSize;
    const resultInvoices = options.exportAll
        ? invoiceItems
        : pagedInvoices;
    const resultPayments = options.exportAll
        ? paymentItems
        : pagedPayments;
    const resultAllocations = options.exportAll
        ? allocationItems
        : pagedAllocations;

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
            historicalOutstanding: historicalAvailable
                ? normalize(historicalOutstanding)
                : null,
            historicalUnallocatedPayments: historicalAvailable
                ? normalize(historicalUnallocated)
                : null,
        },
        paymentMethods: Array.from(paymentMethods.entries()).map(
            ([method, amount]) => ({ method, amount })
        ),
        historicalData: {
            asOf: range.to.toISOString(),
            available: historicalAvailable,
            legacyIssuedInvoiceCount: legacyIssuedCount,
            ambiguousVoidedInvoiceCount: ambiguousVoidedCount,
            limitation: !historicalAvailable
                ? "Historical balances are unavailable because some invoices lack an issue or void timestamp."
                : null,
        },
        invoices: {
            items: resultInvoices,
            pagination: createPaginationMetadata(
                query.page,
                resultPageSize,
                invoiceItems.length
            ),
        },
        payments: {
            items: resultPayments,
            pagination: createPaginationMetadata(
                query.page,
                resultPageSize,
                paymentItems.length
            ),
        },
        allocations: {
            items: resultAllocations,
            pagination: createPaginationMetadata(
                query.page,
                resultPageSize,
                allocationItems.length
            ),
        },
    };
};

export const getReportExportService = async (
    workspaceId: Types.ObjectId,
    request: ReportExportRequest
) => {
    let session: ClientSession | undefined;
    try {
        session = await mongoose.startSession();
        type AttendanceResult = Awaited<
            ReturnType<typeof getAttendanceReportService>
        >;
        type FinanceResult = Awaited<
            ReturnType<typeof getFinanceReportService>
        >;
        let report: AttendanceResult | FinanceResult | undefined;

        await session.withTransaction(
            async () => {
                if (request.type === "attendance") {
                    const { type: _type, ...filters } = request;
                    report = await getAttendanceReportService(
                        workspaceId,
                        {
                            ...filters,
                            page: 1,
                            pageSize: MAX_REPORT_EXPORT_RECORDS,
                        },
                        { session, exportAll: true }
                    );
                    return;
                }

                const { type: _type, ...filters } = request;
                report = await getFinanceReportService(
                    workspaceId,
                    {
                        ...filters,
                        page: 1,
                        pageSize: MAX_REPORT_EXPORT_RECORDS,
                    },
                    { session, exportAll: true }
                );
            },
            {
                readConcern: { level: "snapshot" },
                writeConcern: { w: "majority" },
                readPreference: "primary",
            }
        );

        if (!report) {
            throw new ServiceUnavailableException(
                "A consistent report export is temporarily unavailable"
            );
        }
        return report;
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new ServiceUnavailableException(
            "A consistent report export is temporarily unavailable"
        );
    } finally {
        if (session) await session.endSession();
    }
};
