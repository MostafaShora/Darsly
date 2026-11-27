import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import AttendanceRecordModel from "../src/models/attendance-record.model";
import PaymentModel from "../src/models/payment.model";
import { getDashboardActivityService } from "../src/services/dashboard-activity.service";
import { dashboardActivityQuerySchema } from "../src/validators/report.validation";

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
